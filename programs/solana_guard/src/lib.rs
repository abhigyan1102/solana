//! SolanaGuard — on-chain policy enforcement for AI-agent Solana wallets.
//!
//! This program is the on-chain enforcement layer for SolanaGuard. An owner
//! registers an agent (a delegate keypair the AI agent uses), attaches a spending
//! policy, and every transaction the agent wants to make is checked **on-chain**
//! against that policy. A violating transaction reverts — the agent literally
//! cannot execute it — instead of merely being recorded by an off-chain service.
//!
//! Scope of this first on-chain phase:
//! - register / configure / pause agents and policies on-chain (PDAs)
//! - enforce per-tx limit, rolling daily limit, protocol allowlist, and pause
//! - immutable on-chain transaction log for approved actions + events
//!
//! TODO (next phase): move the agent's funds into a program-owned vault PDA and
//! perform the actual SOL/SPL transfer via CPI *inside* `validate_and_execute`,
//! after the checks pass. The enforcement skeleton below is already structured so
//! the transfer slots in right after `evaluate_policy` returns `Reason::Allowed`.

use anchor_lang::prelude::*;

declare_id!("FRuK1VzhqjybBMhp8UGVipJ9jkyuT9Dy7YJHAREwSApw");

/// Maximum number of program IDs an owner can allowlist per policy.
pub const MAX_ALLOWED_PROTOCOLS: usize = 10;
/// Length of the rolling spend window, in seconds.
pub const SECONDS_PER_DAY: i64 = 86_400;

// PDA seed prefixes.
pub const AGENT_SEED: &[u8] = b"agent_config";
pub const POLICY_SEED: &[u8] = b"policy";
pub const NONCE_SEED: &[u8] = b"agent_nonce";
pub const TX_LOG_SEED: &[u8] = b"tx_log";

#[program]
pub mod solana_guard {
    use super::*;

    /// Register an agent under an owner. Creates the agent config + nonce PDAs.
    pub fn register_agent(ctx: Context<RegisterAgent>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let agent_key = ctx.accounts.agent.key();
        let owner_key = ctx.accounts.owner.key();

        let config = &mut ctx.accounts.agent_config;
        config.owner = owner_key;
        config.agent = agent_key;
        config.is_active = true;
        config.registered_at = now;
        config.bump = ctx.bumps.agent_config;

        let nonce = &mut ctx.accounts.agent_nonce;
        nonce.owner = owner_key;
        nonce.agent = agent_key;
        nonce.nonce = 0;
        nonce.bump = ctx.bumps.agent_nonce;

        emit!(AgentRegistered {
            owner: owner_key,
            agent: agent_key,
            registered_at: now,
        });
        Ok(())
    }

    /// Attach a spending policy to a registered agent.
    pub fn set_policy(
        ctx: Context<SetPolicy>,
        max_spend_per_tx: u64,
        daily_limit: u64,
        allowed_protocols: Vec<Pubkey>,
    ) -> Result<()> {
        require!(max_spend_per_tx > 0, GuardError::InvalidSpendingLimit);
        require!(daily_limit >= max_spend_per_tx, GuardError::InvalidDailyLimit);
        require!(
            allowed_protocols.len() <= MAX_ALLOWED_PROTOCOLS,
            GuardError::TooManyProtocols
        );

        let now = Clock::get()?.unix_timestamp;
        let config = &ctx.accounts.agent_config;

        let policy = &mut ctx.accounts.policy;
        policy.owner = config.owner;
        policy.agent = config.agent;
        policy.max_spend_per_tx = max_spend_per_tx;
        policy.daily_limit = daily_limit;
        policy.daily_spent = 0;
        policy.day_start = now;
        policy.is_active = true;
        policy.allowed_protocols = allowed_protocols;
        policy.bump = ctx.bumps.policy;

        emit!(PolicyUpdated {
            owner: policy.owner,
            agent: policy.agent,
            max_spend_per_tx,
            daily_limit,
            is_active: true,
        });
        Ok(())
    }

    /// Update individual policy fields. `None` leaves a field unchanged.
    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        max_spend_per_tx: Option<u64>,
        daily_limit: Option<u64>,
        allowed_protocols: Option<Vec<Pubkey>>,
        is_active: Option<bool>,
    ) -> Result<()> {
        let policy = &mut ctx.accounts.policy;

        if let Some(v) = max_spend_per_tx {
            require!(v > 0, GuardError::InvalidSpendingLimit);
            policy.max_spend_per_tx = v;
        }
        if let Some(v) = daily_limit {
            policy.daily_limit = v;
        }
        if let Some(v) = allowed_protocols {
            require!(
                v.len() <= MAX_ALLOWED_PROTOCOLS,
                GuardError::TooManyProtocols
            );
            policy.allowed_protocols = v;
        }
        if let Some(v) = is_active {
            policy.is_active = v;
        }
        require!(
            policy.daily_limit >= policy.max_spend_per_tx,
            GuardError::InvalidDailyLimit
        );

        emit!(PolicyUpdated {
            owner: policy.owner,
            agent: policy.agent,
            max_spend_per_tx: policy.max_spend_per_tx,
            daily_limit: policy.daily_limit,
            is_active: policy.is_active,
        });
        Ok(())
    }

    /// Generic active/inactive toggle for an agent (matches the existing IDL).
    pub fn toggle_agent(ctx: Context<ToggleAgent>, is_active: bool) -> Result<()> {
        set_agent_active(&mut ctx.accounts.agent_config, is_active)
    }

    /// Convenience wrapper: freeze an agent (kill switch).
    pub fn pause_agent(ctx: Context<ToggleAgent>) -> Result<()> {
        set_agent_active(&mut ctx.accounts.agent_config, false)
    }

    /// Convenience wrapper: unfreeze a previously paused agent.
    pub fn unpause_agent(ctx: Context<ToggleAgent>) -> Result<()> {
        set_agent_active(&mut ctx.accounts.agent_config, true)
    }

    /// The agent requests to execute a transaction. The policy is enforced
    /// on-chain: a violation returns an error and the whole transaction reverts.
    pub fn validate_and_execute(
        ctx: Context<ValidateAndExecute>,
        amount: u64,
        target_protocol: Pubkey,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let policy = &mut ctx.accounts.policy;
        let config = &ctx.accounts.agent_config;

        // Roll the daily window forward if a full day has elapsed.
        if now.saturating_sub(policy.day_start) >= SECONDS_PER_DAY {
            policy.daily_spent = 0;
            policy.day_start = now;
        }

        let protocol_allowed = policy.allowed_protocols.contains(&target_protocol);
        let decision = evaluate_policy(
            amount,
            policy.max_spend_per_tx,
            policy.daily_spent,
            policy.daily_limit,
            config.is_active,
            policy.is_active,
            protocol_allowed,
        );

        if decision != Reason::Allowed {
            emit!(TransactionBlocked {
                agent: config.agent,
                owner: config.owner,
                amount,
                target_protocol,
                daily_spent: policy.daily_spent,
                daily_limit: policy.daily_limit,
                reason_code: decision.code(),
                rejected_at: now,
            });
            return Err(decision.into_error());
        }

        // --- Approved path ---
        // TODO(next phase): perform the real CPI fund transfer from the agent's
        // vault PDA here, now that the policy checks have passed.
        policy.daily_spent = policy
            .daily_spent
            .checked_add(amount)
            .ok_or(GuardError::ExceedsDailyLimit)?;

        let nonce_account = &mut ctx.accounts.agent_nonce;
        let current_nonce = nonce_account.nonce;
        nonce_account.nonce = current_nonce.checked_add(1).unwrap_or(current_nonce);

        let tx_log = &mut ctx.accounts.tx_log;
        tx_log.agent = config.agent;
        tx_log.owner = config.owner;
        tx_log.amount = amount;
        tx_log.target_protocol = target_protocol;
        tx_log.executed_at = now;
        tx_log.was_approved = true;
        tx_log.nonce = current_nonce;
        tx_log.bump = ctx.bumps.tx_log;

        emit!(TransactionValidated {
            agent: config.agent,
            owner: config.owner,
            amount,
            target_protocol,
            nonce: current_nonce,
            executed_at: now,
        });
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Pure enforcement logic (host-unit-testable, no runtime dependencies)
// ---------------------------------------------------------------------------

/// Why a transaction was allowed or blocked. Kept separate from `GuardError`
/// so the decision logic can be unit-tested on the host without the Anchor
/// runtime.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Reason {
    Allowed,
    AgentPaused,
    PolicyInactive,
    PerTxExceeded,
    DailyExceeded,
    ProtocolNotAllowed,
}

impl Reason {
    /// Stable numeric code emitted in the `TransactionBlocked` event.
    pub fn code(self) -> u8 {
        match self {
            Reason::Allowed => 0,
            Reason::AgentPaused => 1,
            Reason::PolicyInactive => 2,
            Reason::PerTxExceeded => 3,
            Reason::DailyExceeded => 4,
            Reason::ProtocolNotAllowed => 5,
        }
    }

    fn into_error(self) -> Error {
        match self {
            Reason::Allowed => GuardError::AgentNotActive.into(), // unreachable
            Reason::AgentPaused => GuardError::AgentNotActive.into(),
            Reason::PolicyInactive => GuardError::PolicyNotActive.into(),
            Reason::PerTxExceeded => GuardError::ExceedsPerTxLimit.into(),
            Reason::DailyExceeded => GuardError::ExceedsDailyLimit.into(),
            Reason::ProtocolNotAllowed => GuardError::ProtocolNotAllowed.into(),
        }
    }
}

/// Evaluate a transaction intent against a policy. Pure function: the same
/// inputs always produce the same decision, with no on-chain state access.
pub fn evaluate_policy(
    amount: u64,
    max_spend_per_tx: u64,
    daily_spent: u64,
    daily_limit: u64,
    agent_active: bool,
    policy_active: bool,
    protocol_allowed: bool,
) -> Reason {
    if !agent_active {
        return Reason::AgentPaused;
    }
    if !policy_active {
        return Reason::PolicyInactive;
    }
    if amount > max_spend_per_tx {
        return Reason::PerTxExceeded;
    }
    match daily_spent.checked_add(amount) {
        Some(total) if total > daily_limit => return Reason::DailyExceeded,
        None => return Reason::DailyExceeded,
        _ => {}
    }
    if !protocol_allowed {
        return Reason::ProtocolNotAllowed;
    }
    Reason::Allowed
}

/// Shared helper for the toggle/pause/unpause instructions.
fn set_agent_active(config: &mut Account<'_, AgentConfig>, is_active: bool) -> Result<()> {
    config.is_active = is_active;
    emit!(AgentPaused {
        owner: config.owner,
        agent: config.agent,
        paused: !is_active,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct AgentConfig {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub is_active: bool,
    pub registered_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub max_spend_per_tx: u64,
    pub daily_limit: u64,
    pub daily_spent: u64,
    pub day_start: i64,
    pub is_active: bool,
    #[max_len(10)]
    pub allowed_protocols: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TransactionLog {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub target_protocol: Pubkey,
    pub executed_at: i64,
    pub was_approved: bool,
    pub nonce: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AgentNonce {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub nonce: u64,
    pub bump: u8,
}

// ---------------------------------------------------------------------------
// Instruction account contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: The agent delegate is identified by its public key only; it does
    /// not need to sign at registration time.
    pub agent: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + AgentConfig::INIT_SPACE,
        seeds = [AGENT_SEED, owner.key().as_ref(), agent.key().as_ref()],
        bump
    )]
    pub agent_config: Account<'info, AgentConfig>,

    #[account(
        init,
        payer = owner,
        space = 8 + AgentNonce::INIT_SPACE,
        seeds = [NONCE_SEED, owner.key().as_ref(), agent.key().as_ref()],
        bump
    )]
    pub agent_nonce: Account<'info, AgentNonce>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(has_one = owner @ GuardError::UnauthorizedOwner)]
    pub agent_config: Account<'info, AgentConfig>,

    #[account(
        init,
        payer = owner,
        space = 8 + Policy::INIT_SPACE,
        seeds = [POLICY_SEED, agent_config.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, Policy>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    pub owner: Signer<'info>,

    #[account(has_one = owner @ GuardError::UnauthorizedOwner)]
    pub agent_config: Account<'info, AgentConfig>,

    #[account(
        mut,
        seeds = [POLICY_SEED, agent_config.key().as_ref()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,
}

#[derive(Accounts)]
pub struct ToggleAgent<'info> {
    pub owner: Signer<'info>,

    #[account(mut, has_one = owner @ GuardError::UnauthorizedOwner)]
    pub agent_config: Account<'info, AgentConfig>,
}

#[derive(Accounts)]
#[instruction(amount: u64, target_protocol: Pubkey)]
pub struct ValidateAndExecute<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    /// CHECK: Owner is used only for PDA derivation and the `has_one` check.
    pub owner: UncheckedAccount<'info>,

    #[account(
        has_one = owner @ GuardError::UnauthorizedOwner,
        has_one = agent @ GuardError::UnauthorizedAgent,
        seeds = [AGENT_SEED, owner.key().as_ref(), agent.key().as_ref()],
        bump = agent_config.bump
    )]
    pub agent_config: Account<'info, AgentConfig>,

    #[account(
        mut,
        seeds = [POLICY_SEED, agent_config.key().as_ref()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(
        mut,
        seeds = [NONCE_SEED, owner.key().as_ref(), agent.key().as_ref()],
        bump = agent_nonce.bump
    )]
    pub agent_nonce: Account<'info, AgentNonce>,

    #[account(
        init,
        payer = agent,
        space = 8 + TransactionLog::INIT_SPACE,
        seeds = [TX_LOG_SEED, agent_config.key().as_ref(), agent_nonce.nonce.to_le_bytes().as_ref()],
        bump
    )]
    pub tx_log: Account<'info, TransactionLog>,

    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct AgentRegistered {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub registered_at: i64,
}

#[event]
pub struct PolicyUpdated {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub max_spend_per_tx: u64,
    pub daily_limit: u64,
    pub is_active: bool,
}

#[event]
pub struct AgentPaused {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub paused: bool,
}

#[event]
pub struct TransactionValidated {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub target_protocol: Pubkey,
    pub nonce: u64,
    pub executed_at: i64,
}

#[event]
pub struct TransactionBlocked {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub target_protocol: Pubkey,
    pub daily_spent: u64,
    pub daily_limit: u64,
    pub reason_code: u8,
    pub rejected_at: i64,
}

// ---------------------------------------------------------------------------
// Errors (mirrors app/src/idl/solana_guard.json)
// ---------------------------------------------------------------------------

#[error_code]
pub enum GuardError {
    #[msg("Agent is not active")]
    AgentNotActive,
    #[msg("Policy is not active")]
    PolicyNotActive,
    #[msg("Transaction amount exceeds per-transaction spending limit")]
    ExceedsPerTxLimit,
    #[msg("Transaction would exceed daily spending limit")]
    ExceedsDailyLimit,
    #[msg("Target protocol is not in the allowed list")]
    ProtocolNotAllowed,
    #[msg("Only the owner can perform this action")]
    UnauthorizedOwner,
    #[msg("Only the registered agent can execute transactions")]
    UnauthorizedAgent,
    #[msg("Allowed protocols list exceeds maximum capacity")]
    TooManyProtocols,
    #[msg("Agent is already registered")]
    AgentAlreadyRegistered,
    #[msg("Invalid spending limit: must be greater than zero")]
    InvalidSpendingLimit,
    #[msg("Daily limit must be greater than or equal to per-transaction limit")]
    InvalidDailyLimit,
}

// ---------------------------------------------------------------------------
// Host unit tests for the pure enforcement logic (run with `cargo test --lib`)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Convenience: a fully-permissive baseline that returns Allowed.
    fn allowed_case() -> Reason {
        evaluate_policy(100, 1_000, 0, 5_000, true, true, true)
    }

    #[test]
    fn allows_compliant_transaction() {
        assert_eq!(allowed_case(), Reason::Allowed);
    }

    #[test]
    fn blocks_when_agent_paused() {
        let r = evaluate_policy(100, 1_000, 0, 5_000, false, true, true);
        assert_eq!(r, Reason::AgentPaused);
    }

    #[test]
    fn blocks_when_policy_inactive() {
        let r = evaluate_policy(100, 1_000, 0, 5_000, true, false, true);
        assert_eq!(r, Reason::PolicyInactive);
    }

    #[test]
    fn blocks_over_per_tx_limit() {
        let r = evaluate_policy(2_000, 1_000, 0, 5_000, true, true, true);
        assert_eq!(r, Reason::PerTxExceeded);
    }

    #[test]
    fn blocks_over_daily_limit() {
        // 4_900 already spent + 200 would exceed the 5_000 daily cap.
        let r = evaluate_policy(200, 1_000, 4_900, 5_000, true, true, true);
        assert_eq!(r, Reason::DailyExceeded);
    }

    #[test]
    fn blocks_daily_limit_on_overflow() {
        let r = evaluate_policy(1, 1_000, u64::MAX, 5_000, true, true, true);
        assert_eq!(r, Reason::DailyExceeded);
    }

    #[test]
    fn blocks_unlisted_protocol() {
        let r = evaluate_policy(100, 1_000, 0, 5_000, true, true, false);
        assert_eq!(r, Reason::ProtocolNotAllowed);
    }

    #[test]
    fn pause_takes_priority_over_other_violations() {
        // Even an over-limit amount reports the pause first.
        let r = evaluate_policy(10_000, 1_000, 0, 5_000, false, true, false);
        assert_eq!(r, Reason::AgentPaused);
    }

    #[test]
    fn reason_codes_are_stable() {
        assert_eq!(Reason::Allowed.code(), 0);
        assert_eq!(Reason::AgentPaused.code(), 1);
        assert_eq!(Reason::PolicyInactive.code(), 2);
        assert_eq!(Reason::PerTxExceeded.code(), 3);
        assert_eq!(Reason::DailyExceeded.code(), 4);
        assert_eq!(Reason::ProtocolNotAllowed.code(), 5);
    }
}
