/**
 * TypeScript integration test for the SolanaGuard on-chain program.
 *
 * NOTE: This is a reference test. The primary, in-CI test for this repo is the
 * Rust + LiteSVM test at `programs/solana_guard/tests/policy_flow.rs`, which runs
 * with no validator via `cargo test`. This TS file is provided for teams that
 * prefer a client-side test against a running validator.
 *
 * To run it:
 *   1. npm i -D @coral-xyz/anchor @solana/web3.js chai ts-mocha @types/mocha @types/chai
 *   2. Point Anchor.toml [scripts] test at:
 *        "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
 *      (or run a local validator + ts-mocha directly)
 *   3. anchor test
 *
 * It mirrors the Rust test: register -> set_policy -> over-limit (rejected)
 * -> compliant (approved).
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

const AGENT_SEED = Buffer.from("agent_config");
const POLICY_SEED = Buffer.from("policy");
const NONCE_SEED = Buffer.from("agent_nonce");
const TX_LOG_SEED = Buffer.from("tx_log");

describe("solana_guard", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Loaded from target/idl + target/types after `anchor build`.
  const program = anchor.workspace.SolanaGuard as Program;
  const programId = program.programId;

  const owner = (provider.wallet as anchor.Wallet).payer;
  const agent = Keypair.generate();
  const allowedProtocol = Keypair.generate().publicKey;

  const [agentConfig] = PublicKey.findProgramAddressSync(
    [AGENT_SEED, owner.publicKey.toBuffer(), agent.publicKey.toBuffer()],
    programId
  );
  const [agentNonce] = PublicKey.findProgramAddressSync(
    [NONCE_SEED, owner.publicKey.toBuffer(), agent.publicKey.toBuffer()],
    programId
  );
  const [policy] = PublicKey.findProgramAddressSync(
    [POLICY_SEED, agentConfig.toBuffer()],
    programId
  );
  const nonceBuf = (n: number) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(n));
    return b;
  };
  const [txLog0] = PublicKey.findProgramAddressSync(
    [TX_LOG_SEED, agentConfig.toBuffer(), nonceBuf(0)],
    programId
  );

  it("registers an agent", async () => {
    // fund the agent so it can pay rent for the tx log
    const sig = await provider.connection.requestAirdrop(
      agent.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    await program.methods
      .registerAgent()
      .accounts({
        owner: owner.publicKey,
        agent: agent.publicKey,
        agentConfig,
        agentNonce,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const cfg = await (program.account as any).agentConfig.fetch(agentConfig);
    assert.isTrue(cfg.isActive);
  });

  it("sets a policy", async () => {
    await program.methods
      .setPolicy(
        new anchor.BN(1 * LAMPORTS_PER_SOL),
        new anchor.BN(2 * LAMPORTS_PER_SOL),
        [allowedProtocol]
      )
      .accounts({
        owner: owner.publicKey,
        agentConfig,
        policy,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const p = await (program.account as any).policy.fetch(policy);
    assert.equal(p.maxSpendPerTx.toString(), String(1 * LAMPORTS_PER_SOL));
  });

  it("rejects a transaction over the per-tx limit", async () => {
    let rejected = false;
    try {
      await program.methods
        .validateAndExecute(new anchor.BN(5 * LAMPORTS_PER_SOL), allowedProtocol)
        .accounts({
          agent: agent.publicKey,
          owner: owner.publicKey,
          agentConfig,
          policy,
          agentNonce,
          txLog: txLog0,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([agent])
        .rpc();
    } catch (_e) {
      rejected = true;
    }
    assert.isTrue(rejected, "over-limit transaction should have been rejected");
  });

  it("approves a compliant transaction", async () => {
    await program.methods
      .validateAndExecute(new anchor.BN(0.5 * LAMPORTS_PER_SOL), allowedProtocol)
      .accounts({
        agent: agent.publicKey,
        owner: owner.publicKey,
        agentConfig,
        policy,
        agentNonce,
        txLog: txLog0,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const log = await (program.account as any).transactionLog.fetch(txLog0);
    assert.isTrue(log.wasApproved);
  });
});
