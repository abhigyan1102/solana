//! End-to-end integration test that runs the *compiled* SolanaGuard program
//! bytecode in-process with LiteSVM (no local validator required).
//!
//! Prerequisite: the program must be built first so the `.so` exists:
//!     anchor build --ignore-keys     (or: cargo build-sbf)
//! Then run:
//!     cargo test --test policy_flow
//!
//! Flow exercised on-chain:
//!   register_agent -> set_policy -> validate (over per-tx limit -> REJECTED)
//!                                -> validate (compliant -> APPROVED)

use {
    anchor_lang::{
        prelude::Pubkey, solana_program::instruction::Instruction, InstructionData,
        ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const SOL: u64 = 1_000_000_000;

fn pda(seeds: &[&[u8]], program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(seeds, program_id).0
}

#[test]
fn policy_is_enforced_on_chain() {
    let program_id = solana_guard::id();

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/solana_guard.so");
    svm.add_program(program_id, bytes).unwrap();

    let owner = Keypair::new();
    let agent = Keypair::new();
    let owner_pk = owner.pubkey();
    let agent_pk = agent.pubkey();
    svm.airdrop(&owner_pk, 10 * SOL).unwrap();
    svm.airdrop(&agent_pk, 10 * SOL).unwrap();

    // Derive every PDA the program expects.
    let agent_config = pda(
        &[solana_guard::AGENT_SEED, owner_pk.as_ref(), agent_pk.as_ref()],
        &program_id,
    );
    let agent_nonce = pda(
        &[solana_guard::NONCE_SEED, owner_pk.as_ref(), agent_pk.as_ref()],
        &program_id,
    );
    let policy = pda(&[solana_guard::POLICY_SEED, agent_config.as_ref()], &program_id);
    // tx_log for nonce 0 (the first executed transaction).
    let nonce0 = 0u64.to_le_bytes();
    let tx_log = pda(
        &[solana_guard::TX_LOG_SEED, agent_config.as_ref(), nonce0.as_ref()],
        &program_id,
    );

    // An allowlisted target protocol, and one that is NOT allowlisted.
    let allowed_protocol = Pubkey::new_unique();

    // 1) register_agent
    send(
        &mut svm,
        &[Instruction::new_with_bytes(
            program_id,
            &solana_guard::instruction::RegisterAgent {}.data(),
            solana_guard::accounts::RegisterAgent {
                owner: owner_pk,
                agent: agent_pk,
                agent_config,
                agent_nonce,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        )],
        &owner_pk,
        &[&owner],
    )
    .expect("register_agent should succeed");

    // 2) set_policy: max 1 SOL per tx, 2 SOL daily, only `allowed_protocol`.
    send(
        &mut svm,
        &[Instruction::new_with_bytes(
            program_id,
            &solana_guard::instruction::SetPolicy {
                max_spend_per_tx: 1 * SOL,
                daily_limit: 2 * SOL,
                allowed_protocols: vec![allowed_protocol],
            }
            .data(),
            solana_guard::accounts::SetPolicy {
                owner: owner_pk,
                agent_config,
                policy,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        )],
        &owner_pk,
        &[&owner],
    )
    .expect("set_policy should succeed");

    // 3) validate_and_execute over the per-tx limit -> MUST be rejected on-chain.
    let blocked = send(
        &mut svm,
        &[validate_ix(
            program_id, agent_pk, owner_pk, agent_config, policy, agent_nonce, tx_log,
            5 * SOL, allowed_protocol,
        )],
        &agent_pk,
        &[&agent],
    );
    assert!(
        blocked.is_err(),
        "over-limit transaction must be rejected by the on-chain policy"
    );

    // 4) validate_and_execute within policy -> approved (uses tx_log nonce 0,
    //    since the rejected tx in step 3 reverted and did not consume a nonce).
    send(
        &mut svm,
        &[validate_ix(
            program_id, agent_pk, owner_pk, agent_config, policy, agent_nonce, tx_log,
            500_000_000, allowed_protocol,
        )],
        &agent_pk,
        &[&agent],
    )
    .expect("compliant transaction should be approved");
}

#[allow(clippy::too_many_arguments)]
fn validate_ix(
    program_id: Pubkey,
    agent: Pubkey,
    owner: Pubkey,
    agent_config: Pubkey,
    policy: Pubkey,
    agent_nonce: Pubkey,
    tx_log: Pubkey,
    amount: u64,
    target_protocol: Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id,
        &solana_guard::instruction::ValidateAndExecute {
            amount,
            target_protocol,
        }
        .data(),
        solana_guard::accounts::ValidateAndExecute {
            agent,
            owner,
            agent_config,
            policy,
            agent_nonce,
            tx_log,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn send(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    payer: &Pubkey,
    signers: &[&Keypair],
) -> Result<(), litesvm::types::FailedTransactionMetadata> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(payer), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ())
}
