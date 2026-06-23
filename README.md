# SolanaGuard

**Demo: https://solanaguard.vercel.app**

SolanaGuard is a hackathon MVP for a policy firewall that protects AI agents using Solana wallets. The current app lets a wallet owner register an agent, create a risk policy, evaluate transaction intents, inspect real backend history, and use an emergency pause kill switch.

InsForge powers the entire backend: the Postgres database, the SQL RPC policy engine, and the Edge Function router that verifies a signed Solana wallet proof before executing any wallet-scoped RPC.

Architecture: React SPA → InsForge Edge Function router → SQL RPCs with `SECURITY DEFINER` + walletProof.

> The deployable dApp lives in `app/`. The root `src/` app is an earlier landing prototype and is **not** the hackathon demo.

Current demo scope: **InsForge-powered policy engine, plus an Anchor on-chain enforcement program now live on devnet.**

This phase does not include Storage, Payments, Analytics, or Compute.

## On-chain Enforcement (Devnet)

The `programs/solana_guard` Anchor program enforces policy checks on-chain (`register_agent`, `set_policy`, `validate_and_execute`, plus the emergency kill switch). It builds to BPF via `anchor build` and passes 11 Rust tests (10 unit + 1 LiteSVM integration that rejects an over-limit transaction on-chain).

- **Program ID:** `EdskrgG3PmMPxzaNuvp7oJjZ5MU3jkXmY4bHbSYpnsWF`
- **Explorer (devnet):** https://explorer.solana.com/address/EdskrgG3PmMPxzaNuvp7oJjZ5MU3jkXmY4bHbSYpnsWF?cluster=devnet

Devnet only — **not mainnet**, **not audited**, **no users yet**. Today the program enforces the policy checks themselves; moving funds via CPI based on the on-chain decision is a future milestone.

## Backend

The frontend calls deployed InsForge Edge Functions:

- `seed-demo-data`
- `create-agent`
- `create-policy`
- `evaluate-transaction`
- `get-dashboard-stats`
- `list-audit-logs`
- `list-transaction-requests`
- `toggle-emergency-pause`

No API keys are required in the browser. The function runtime keeps server-side InsForge secrets in the backend.

Wallet-scoped calls require a signed wallet proof. Direct RPC execution for wallet-scoped `SECURITY DEFINER` functions is revoked from `PUBLIC`, `anon`, and `authenticated`; Edge Functions call the backend through the `project_admin` route.

## Environment

Create `app/.env` and set the function host:

```bash
cd app
printf 'VITE_INSFORGE_FUNCTIONS_URL=https://mhzv65qi.ap-southeast.insforge.app/functions\n' > .env
```

Required variable:

```bash
VITE_INSFORGE_FUNCTIONS_URL=https://mhzv65qi.ap-southeast.insforge.app/functions
```

`.env`, `.env.local`, `.env*.local`, `.insforge`, `node_modules`, and `dist` are ignored by Git.

## Run

```bash
cd app
npm install
npm run dev
```

The Vite dev server defaults to `http://127.0.0.1:5173/`. If that port is busy, Vite will print the next available URL.

## Build

```bash
cd app
npm run build
```

## Demo Flow

1. Open the app.
2. Connect a Phantom wallet.
3. Sign the wallet proof when prompted.
4. Seed demo data.
5. Create an agent from the Agent Registry.
6. Create a policy from the Policy Builder.
7. Run safe, warning, and blocked transaction presets.
8. Review real transaction history and audit logs from the backend.
9. Enable the kill switch.
10. Run the safe transaction again and verify it returns `blocked` with risk score `100`.
11. Disable the kill switch and run the safe transaction again.

## Security Notes

- Wallet proof is required for wallet-scoped Edge Function calls.
- The signed message binds the wallet address and timestamp.
- Wallet proof timestamps expire after five minutes and allow only small future clock skew.
- Direct RPC access is revoked for wallet-scoped `SECURITY DEFINER` functions.
- Edge Functions verify wallet proof first, then use the server-side `project_admin` route for RPC execution.
