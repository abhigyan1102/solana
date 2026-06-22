# SolanaGuard — Solana Foundation India Grant Application

Copy-paste-ready answers for **Solana Foundation India Grants** (Superteam India, up to $10,000 USDG).
Submit at: https://superteam.fun/earn/grants/solana-foundation-india-grants

Requested amount: **7,500 USDG**

---

## Step 1 — Basics

**Project Title**
> SolanaGuard

**One-Liner Description**
> A policy firewall for AI agents on Solana — owners set spending rules per agent, every transaction intent is checked against them, and a rogue agent can be frozen instantly.

**Total grant amount (USDG)**
> 7500

**Your Telegram username**
> t.me/abhi11_02

**Your Solana Wallet Address**
> ⚠️ FILL THIS IN — paste your USDG-capable Solana address, or click "auto-fill with your Earn embedded wallet address" in the form.

---

## Step 2 — Details

**Project Details (problem + solution)**

> **The problem.** AI agents are increasingly given their own Solana wallets so they can act autonomously — make payments, pay per request via x402, trade, and interact with DeFi. The moment an agent holds a funded wallet, a hallucination, a jailbreak, a prompt injection, or a plain bug becomes an unbounded financial loss. Solana has no native guardrail layer between an agent's *decision* and an *on-chain transaction*. Owners can't cap per-transaction or daily spend, can't allowlist which programs an agent may touch, can't require approval over a threshold, and have no way to freeze a misbehaving agent in real time. As agentic payments go mainstream, this missing safety primitive is the thing standing between "agents with wallets" and "agents you can actually trust with money."
>
> **The solution.** SolanaGuard is a policy firewall that sits in front of an AI agent's Solana wallet. An owner connects their wallet, cryptographically proves ownership, registers an agent, and defines a policy: max spend per transaction, daily limit, allowed/blocked program IDs, manual-approval thresholds, and risk thresholds. Every transaction intent is evaluated and returns **allowed / warning / blocked** with a risk score and the exact rule that fired — all written to an immutable audit trail. An action-bound emergency kill switch freezes the agent instantly.
>
> **What's live today.** A working product at https://solanaguard.vercel.app. The policy engine runs entirely on InsForge: a Postgres database, the policy engine itself implemented as SQL RPC functions (`evaluate_transaction`, `create_policy`, `toggle_emergency_pause`), and an Edge Function router that verifies a real ed25519 Solana wallet proof before executing any wallet-scoped call. The security model is deliberately strict: direct RPC execute on wallet-scoped `SECURITY DEFINER` functions is revoked from `PUBLIC`, `anon`, and `authenticated`; wallet proofs are bound to the address + timestamp, expire after 5 minutes, and the emergency-pause route uses an action-bound proof that also binds the route, agent ID, and pause value. ~2,600 lines of SQL across 9 migrations, a 330-line Edge Function, and a full React dashboard.
>
> **What this grant funds.** Today SolanaGuard *evaluates and records* policy decisions at the application layer. The grant takes it to the layer that makes it un-bypassable: an **Anchor on-chain program** (`register_agent`, `set_policy`, `validate_and_execute`) so policy is enforced at the protocol level — the agent literally *cannot* execute a transaction that violates its policy, instead of the firewall merely logging that it should have been blocked. That is the difference between a dashboard and a real firewall, and it is the next, concrete, fundable step.

**Deadline (Asia/Calcutta)**
> 2026-09-30  *(adjust if you want a tighter/looser window)*

**Proof of Work**
> - Live product: https://solanaguard.vercel.app
> - Source (open-source): https://github.com/abhigyan1102/solana
> - On-chain enforcement (in progress): `programs/solana_guard` Anchor program — `register_agent`, `set_policy`, `update_policy`, `toggle_agent`, `pause_agent`, `unpause_agent`, `validate_and_execute` with on-chain policy checks (per-tx limit, rolling daily limit, protocol allowlist, kill switch). Builds to BPF via `anchor build` and passes 11 Rust tests (10 unit + 1 LiteSVM integration that **rejects an over-limit transaction on-chain**). Not yet deployed to devnet/mainnet — that is milestone M1.
> - Prior grant won: Agentic Engineering Grant — 200 USDG (Superteam Earn) for this same project
> - InsForge hackathon submission for SolanaGuard (policy engine + signed wallet-proof security model)
> - AI-assisted build transcripts: full Claude Code + Codex session logs committed to the repo (`claude-session.jsonl`, `codex-session.jsonl`)
> - X: https://x.com/abhigyan1102 · GitHub: https://github.com/abhigyan1102

**Personal X Profile**
> x.com/abhigyan1102

**Personal GitHub Profile**
> github.com/abhigyan1102

**Loom video pitch** — ⚠️ YOU MUST RECORD THIS (90-sec script below)
> https://www.loom.com/share/...  ← paste your link

**Breakdown of how you would use the funds (7,500 USDG)**
> - **On-chain Anchor program (~$3,000):** Build, test, and deploy the SolanaGuard enforcement program — `register_agent`, `set_policy`, `validate_and_execute` with a CPI guard that rejects policy-violating transfers. Devnet → mainnet-beta.
> - **Security review (~$1,500):** Independent review of the Anchor program and the wallet-proof / RPC security model before mainnet.
> - **Developer SDK + docs (~$1,500):** A TypeScript SDK so any agent framework can wrap its wallet with SolanaGuard in a few lines, plus integration docs.
> - **Infra for ~4 months (~$750):** RPC, hosting, and tooling to run the live service and on-chain testing.
> - **First design partners + user research (~$750):** Outreach and onboarding for 3–5 teams building AI agents, to collect real product feedback and usage.

---

## Step 3 — Milestones

**Goals and Milestones**

> **M1 — On-chain enforcement v1 (by 2026-07-18).** Anchor program live on devnet: `register_agent`, `set_policy`, `validate_and_execute`. A policy-violating transfer fails on-chain. Open-sourced in the repo.
>
> **M2 — End-to-end on-chain firewall (by 2026-08-08).** Existing dashboard wired to the on-chain program so a "blocked" decision actually causes the on-chain transaction to fail on devnet. Public demo + weekly community update.
>
> **M3 — Developer SDK + docs (by 2026-08-29).** TypeScript SDK and integration guide so an AI-agent project can put its wallet behind SolanaGuard with minimal code.
>
> **M4 — Security review + mainnet-beta + first users (by 2026-09-19).** Independent security review, deploy to mainnet-beta, and onboard 3–5 design-partner agents; collect first product feedback.
>
> **M5 — Traction report (by 2026-09-30).** Publish first metrics (agents protected, intents evaluated, transactions blocked) and design-partner testimonials.

**Primary KPI**
> Number of AI agents actively protected on mainnet, with usage. Target for the grant period: **10 design-partner agents protected and 1,000+ transaction intents evaluated** in the first 60 days after mainnet launch.

**Final tranche reminder**
> To receive the final tranche you'll likely need to show the live mainnet program, the open-source repo, and evidence of the milestones above. Keep the weekly community updates going — the grant explicitly rewards consistent progress reporting.

---

## 90-second Loom pitch script (record this — it's a required field)

1. **(0–15s) Hook.** "AI agents are starting to hold real Solana wallets. One hallucination or jailbreak, and a funded agent drains itself. There's no guardrail between an agent's decision and an on-chain transaction. That's what SolanaGuard fixes."
2. **(15–45s) Demo the live product.** Open solanaguard.vercel.app. Connect Phantom, sign the wallet proof ("every request is cryptographically wallet-scoped"). Create a policy. Run the presets: safe → allowed, unlisted program → warning, over-limit → blocked with the risk score and the exact rule that fired.
3. **(45–65s) Kill switch.** Flip the emergency pause → re-run the safe transfer → now blocked, risk 100. "One signed action freezes a rogue agent instantly."
4. **(65–85s) The ask.** "Today this is a cryptographically-secured policy engine on InsForge. This grant funds the on-chain Anchor program so policy is enforced at the protocol level — the agent *can't* break the rules, not just gets logged. Open-source, mainnet-beta, with first design partners, in ~3 months."
5. **(85–90s) Close.** "I already shipped this working MVP and won a prior Solana grant for it. I'm going founder-mode on agent-wallet security. Let's build the safety layer agents need."

---

## Pre-submit checklist to maximize odds (the traction gap is your #1 risk)

Spend 2–3 days on this before hitting Submit — it converts "nice MVP, no users" into "founder with early signal":

- [ ] **Post the live demo on X** as a short thread (problem → 20-sec screen capture → "try it"). The form checks your X — a fresh, on-topic thread with the demo is the cheapest credibility you can buy.
- [ ] **DM 5–10 people building AI agents** (agent-kit / x402 / trading-bot devs). Ask: "would you put your agent's wallet behind a policy firewall?" Even 2–3 "yes, I'd use this" replies become a real line in Proof of Work.
- [ ] **Record the Loom** using the script above.
- [ ] **Confirm your USDG-capable Solana wallet address** for the form.
- [ ] **Re-run the live smoke test** (see `SUBMISSION.md`) so the demo is flawless when a reviewer opens it.
- [ ] Optional but strong: write one short "why agent-wallet security matters now" insight post — the grant explicitly values "unique actionable insights."

You do NOT need to fabricate anything. Honest early signal + a working product + a concrete on-chain milestone is a genuinely competitive $7,500 application.
