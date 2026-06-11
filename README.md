# SolanaGuard

SolanaGuard is a hackathon MVP for an on-chain risk enforcement layer protecting AI agents that use Solana wallets.

This phase is an InsForge-powered frontend demo. It does not include Anchor smart contract code, real wallet connection, auth, payments, or storage/reporting.

## Backend

The frontend calls deployed InsForge Edge Functions:

- `seed-demo-data`
- `create-agent`
- `create-policy`
- `evaluate-transaction`
- `get-dashboard-stats`

No API keys are required in the browser. The function runtime keeps server-side InsForge secrets in the backend.

## Environment

Copy the example file and set the function host:

```bash
cp .env.example .env
```

`.env` should contain:

```bash
VITE_INSFORGE_FUNCTIONS_URL=https://mhzv65qi.functions.insforge.app
```

`.env`, `.env.local`, and `.env*.local` are ignored by Git.

## Run

```bash
npm install
npm run dev
```

The Vite dev server defaults to `http://127.0.0.1:5173/`. If that port is busy, Vite will print the next available URL.

## Build

```bash
npm run build
```

## Demo Flow

1. Open the app.
2. Use `Load demo data` to call `seed-demo-data`.
3. Review dashboard metrics from `get-dashboard-stats`.
4. Create an agent from the Agent Registry.
5. Create a policy from the Policy Builder.
6. Run simulator presets for safe, warning, blocked, unknown program, and max amount cases.
7. Inspect the result panel for `decision`, `riskScore`, `reason`, `matchedPolicyRules`, `auditLogId`, and `alertId`.
8. Review recent backend audit activity in the Audit Trail panel.
