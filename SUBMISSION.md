# SolanaGuard — InsForge Hackathon Submission

Copy-paste-ready answers for the submission form, plus the demo script, smoke-test checklist, and honest scope.

---

## Form answers

**Team name**

```
SolanaGuard
```

**One-line tagline**

```
A policy firewall for AI-agent Solana wallets — wallet-scoped, audited, and instantly pausable, powered by InsForge.
```

**What it does and how it uses InsForge**

```
SolanaGuard is a policy firewall that sits in front of an AI agent's Solana wallet. A wallet owner connects Phantom, signs a cryptographic wallet proof, registers an agent, and defines spending and protocol policies (max transaction amount, daily spending limit, manual-approval threshold, allowed/blocked program IDs, and risk thresholds). Every transaction intent is evaluated against the active policy and returns an allowed / warning / blocked decision with a risk score and the exact rule that fired. An emergency "kill switch" can freeze an agent instantly.

InsForge is the entire backend. It provides:
- The Postgres database (agents, wallets, policies, transaction requests, audit logs, alerts).
- The policy engine itself, implemented as SQL RPC functions (evaluate_transaction, create_policy, toggle_emergency_pause, and more).
- An Edge Function router (functions/solanaguard-api.ts) that verifies a signed Solana wallet proof before forwarding any wallet-scoped call.

Security model: direct RPC EXECUTE on wallet-scoped SECURITY DEFINER functions is revoked from PUBLIC, anon, and authenticated; the Edge Function calls the database through the project_admin route only after verifying the wallet proof. Wallet proofs are real ed25519 signatures bound to the wallet address and a timestamp, expire after 5 minutes, and allow only ~30s of future clock skew. The emergency-pause write route uses an action-bound proof that also binds the route/action, agent ID, and pause value.

Current scope is policy simulation and enforcement decisions plus real backend history; on-chain Anchor enforcement is the next phase.
```

**Live demo URL**

```
<LIVE_URL_PENDING>
```

**GitHub repo URL**

```
https://github.com/abhigyan1102/solana
```

**Team member emails**

```
abhigyansingh11007@gmail.com
```

---

## Demo script (~2 minutes)

1. **Hook (15s):** "AI agents are starting to hold wallets. SolanaGuard is a policy firewall in front of an agent's Solana wallet — and the entire backend is InsForge."
2. **Connect** Phantom and **sign the wallet proof.** Call out: "every request is cryptographically wallet-scoped and verified server-side."
3. **Seed demo data**, then **create an agent** in the Agent Registry.
4. **Create a policy** in the Policy Builder: set a max transaction amount, a daily spending limit, and allowed/blocked program IDs.
5. **Run the presets** in the Transaction Simulator:
   - Safe transfer → `allowed`.
   - Unlisted-program call → `warning`.
   - Over-limit / blocked-program → `blocked`, with the risk score and matched rule shown.
6. **Show real backend state:** Transaction History and Audit Panel — "this is live data from InsForge, not mocked."
7. **Emergency kill switch:** enable it → re-run the safe transfer → now `blocked` with risk score `100`. Disable it → safe transfer is `allowed` again. "One signed action freezes the agent instantly."
8. **Close (10s):** "Policy engine is live on InsForge today; on-chain Anchor enforcement is next."

---

## Manual smoke-test checklist (run against the LIVE deploy before submitting)

- [ ] Live URL loads over HTTPS with no console errors.
- [ ] `VITE_INSFORGE_FUNCTIONS_URL` is set on the host (no "Missing VITE_INSFORGE_FUNCTIONS_URL" banner).
- [ ] Phantom connects and the wallet-proof signature prompt appears.
- [ ] Seed demo data succeeds and dashboard stats populate.
- [ ] Create agent succeeds and the agent appears in the selector.
- [ ] Create policy succeeds.
- [ ] Safe preset → `allowed`.
- [ ] Warning preset → `warning`.
- [ ] Blocked preset → `blocked` with a non-zero risk score.
- [ ] Transaction History and Audit Panel show real rows for the connected wallet.
- [ ] Kill switch ON → safe preset returns `blocked` (risk `100`); kill switch OFF → safe preset `allowed` again.
- [ ] All 9 SQL migrations are applied on the live InsForge project and the deployed Edge Function matches `main`.

---

## Honest scope / limitations

- **What works today:** wallet-proof authentication, agent + policy registration, transaction-intent evaluation (allowed / warning / blocked + risk score), real audit and transaction history, and an action-bound emergency pause — all enforced server-side in InsForge.
- **What is simulation, not on-chain:** SolanaGuard evaluates and records policy decisions. It does **not** yet submit, sign, or block real Solana transactions on-chain, and it does not custody or move SOL.
- **Next phase:** Anchor program for on-chain enforcement so policy decisions are enforced at the protocol level rather than at the application/decision layer.
- **Framing we keep everywhere:** "InsForge-powered policy engine now. Anchor/on-chain enforcement next."

---

## Deployment reference

- **Deploy target:** `app/` only. The root `src/` app is an earlier landing prototype and must not be deployed.
- **Build command:** `npm run build`  ·  **Output dir:** `dist`  ·  **Root/base directory:** `app`
- **Required env var:** `VITE_INSFORGE_FUNCTIONS_URL=https://mhzv65qi.ap-southeast.insforge.app/functions`
