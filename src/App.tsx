import { useEffect, useMemo, useRef, useState } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Gauge,
  ListChecks,
  LockKeyhole,
  PauseCircle,
  Radar,
  RefreshCw,
  Shield,
  Sparkles,
  Terminal,
  Wallet,
  XCircle
} from 'lucide-react';
import { AnimatedNumber } from './components/AnimatedNumber';
import { ParticleField } from './components/ParticleField';
import { Field, GlassCard, PrimaryButton, SecondaryButton, SectionHeader, StatusPill } from './components/ui';
import {
  DashboardStats,
  EvaluateTransactionResponse,
  FUNCTIONS_BASE_URL,
  PolicyResponse,
  SeedDemoData,
  solanaGuardApi
} from './lib/insforge';
import { formatDateTime, formatNumber, truncateAddress } from './lib/format';

gsap.registerPlugin(ScrollTrigger, useGSAP);
gsap.defaults({ duration: 0.7, ease: 'power3.out' });

type AgentRecord = {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  walletId?: string;
  policyId?: string;
};

type LoadingKey = 'boot' | 'stats' | 'seed' | 'agent' | 'policy' | 'simulator';

const initialStats: DashboardStats = {
  agents: 0,
  wallets: 0,
  activePolicies: 0,
  transactionRequests: 0,
  allowedTransactions: 0,
  warningTransactions: 0,
  blockedTransactions: 0,
  openAlerts: 0,
  dailySpendSol: 0,
  averageRiskScore: 0,
  recentAuditLogs: []
};

const programIds = {
  system: '11111111111111111111111111111111',
  token: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  blocked: 'BadActorProgram111111111111111111111111111111',
  unknown: 'UnknownProgram111111111111111111111111111111'
};

const scenarioButtons = [
  {
    key: 'safe',
    label: 'Safe transaction',
    description: 'Known system transfer under every policy limit.',
    intent: {
      programId: programIds.system,
      destination: 'Merchant222222222222222222222222222222222',
      amountSol: '0.5',
      intentType: 'transfer'
    }
  },
  {
    key: 'warning',
    label: 'Manual approval warning',
    description: 'Known token program above the approval threshold.',
    intent: {
      programId: programIds.token,
      destination: 'Treasury2222222222222222222222222222222222',
      amountSol: '6',
      intentType: 'token_transfer'
    }
  },
  {
    key: 'blocked-program',
    label: 'Blocked program',
    description: 'Explicitly blocked program ID.',
    intent: {
      programId: programIds.blocked,
      destination: 'Unknown22222222222222222222222222222222222',
      amountSol: '1',
      intentType: 'program_interaction'
    }
  },
  {
    key: 'unknown',
    label: 'Unknown program',
    description: 'Outside the allowlist, warning penalty applies.',
    intent: {
      programId: programIds.unknown,
      destination: 'Unknown33333333333333333333333333333333333',
      amountSol: '1',
      intentType: 'program_interaction'
    }
  },
  {
    key: 'max',
    label: 'Max amount block',
    description: 'Known program but amount exceeds the demo max.',
    intent: {
      programId: programIds.system,
      destination: 'HighValue1111111111111111111111111111111',
      amountSol: '12',
      intentType: 'transfer'
    }
  }
];

function App() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [policies, setPolicies] = useState<PolicyResponse[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [lastSeed, setLastSeed] = useState<SeedDemoData | null>(null);
  const [lastResult, setLastResult] = useState<EvaluateTransactionResponse | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState<Record<LoadingKey, boolean>>({
    boot: true,
    stats: false,
    seed: false,
    agent: false,
    policy: false,
    simulator: false
  });

  const [agentForm, setAgentForm] = useState({
    name: 'Research Agent Sentinel',
    description: 'AI agent allowed to rebalance and pay vendors under SolanaGuard policy.',
    walletAddress: 'SentinelWallet111111111111111111111111111'
  });

  const [policyForm, setPolicyForm] = useState({
    name: 'Guardian Policy Alpha',
    maxTransactionAmount: '10',
    dailySpendingLimit: '25',
    manualApprovalThreshold: '5',
    allowedProgramIds: `${programIds.system}, ${programIds.token}`,
    blockedProgramIds: programIds.blocked,
    unknownProgramRiskPenalty: '30',
    emergencyPause: false
  });

  const [intentForm, setIntentForm] = useState({
    walletAddress: 'DemoWallet1111111111111111111111111111111111',
    programId: programIds.system,
    destination: 'Merchant222222222222222222222222222222222',
    amountSol: '0.5',
    intentType: 'transfer'
  });

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId]
  );

  const setLoadingKey = (key: LoadingKey, value: boolean) => {
    setLoading((current) => ({ ...current, [key]: value }));
  };

  const showError = (message: string) => {
    setError(message);
    setSuccess('');
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError('');
  };

  const refreshStats = async () => {
    setLoadingKey('stats', true);
    try {
      const nextStats = await solanaGuardApi.getDashboardStats();
      setStats(nextStats);
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Could not load dashboard stats.');
    } finally {
      setLoadingKey('stats', false);
    }
  };

  const seedDemo = async (silent = false) => {
    setLoadingKey('seed', true);
    try {
      const seed = await solanaGuardApi.seedDemoData();
      const demoAgent: AgentRecord = {
        id: seed.agentId,
        name: 'Demo Trading Agent',
        description: 'Hackathon demo AI agent protected by SolanaGuard.',
        walletAddress: 'DemoWallet1111111111111111111111111111111111',
        walletId: seed.walletId,
        policyId: seed.policyId
      };

      setLastSeed(seed);
      setAgents((current) => {
        const withoutDuplicate = current.filter((agent) => agent.id !== demoAgent.id);
        return [demoAgent, ...withoutDuplicate];
      });
      setSelectedAgentId(seed.agentId);
      setIntentForm((current) => ({
        ...current,
        walletAddress: demoAgent.walletAddress
      }));
      await refreshStats();
      if (!silent) {
        showSuccess('Demo data loaded from InsForge.');
      }
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Could not seed demo data.');
    } finally {
      setLoadingKey('seed', false);
      setLoadingKey('boot', false);
    }
  };

  useEffect(() => {
    seedDemo(true);
  }, []);

  useEffect(() => {
    if (!prefersReducedMotion) {
      const lenis = new Lenis({
        duration: 1.05,
        smoothWheel: true,
        wheelMultiplier: 0.86
      });
      let frame = 0;
      const raf = (time: number) => {
        lenis.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
      lenis.on('scroll', ScrollTrigger.update);

      return () => {
        cancelAnimationFrame(frame);
        lenis.destroy();
      };
    }

    return undefined;
  }, [prefersReducedMotion]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          desktop: '(min-width: 900px)',
          reduceMotion: '(prefers-reduced-motion: reduce)'
        },
        (context) => {
          const reduceMotion = context.conditions?.reduceMotion;
          if (reduceMotion) {
            gsap.set('.story-panel, .dashboard-zone', { autoAlpha: 1, y: 0 });
            return undefined;
          }

          gsap.from('.hero-word', {
            y: 28,
            autoAlpha: 0,
            stagger: 0.08,
            duration: 0.9,
            ease: 'power3.out'
          });

          gsap.utils.toArray<HTMLElement>('.story-panel').forEach((panel, index) => {
            gsap.from(panel.querySelectorAll('.story-reveal'), {
              y: 48,
              autoAlpha: 0,
              stagger: 0.12,
              scrollTrigger: {
                trigger: panel,
                start: 'top 70%',
                end: 'bottom 30%',
                toggleActions: 'play reverse play reverse',
                refreshPriority: index
              }
            });
          });

          gsap.to('.guardian-orb', {
            y: -18,
            scale: 1.04,
            repeat: -1,
            yoyo: true,
            duration: 3.2,
            ease: 'sine.inOut'
          });

          gsap.to('.shield-ring', {
            rotation: 360,
            repeat: -1,
            duration: 20,
            ease: 'none'
          });

          gsap.to('.threat-particle', {
            x: () => gsap.utils.random(-80, 80),
            y: () => gsap.utils.random(-60, 60),
            scale: () => gsap.utils.random(0.65, 1.25),
            stagger: 0.08,
            repeat: -1,
            yoyo: true,
            duration: 2.8,
            ease: 'sine.inOut'
          });

          return undefined;
        }
      );
      return () => mm.revert();
    },
    { scope: rootRef }
  );

  const handleAgentSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingKey('agent', true);
    try {
      const response = await solanaGuardApi.createAgent(agentForm);
      const nextAgent: AgentRecord = {
        id: response.agent.id,
        name: response.agent.name,
        description: response.agent.description ?? '',
        walletAddress: response.wallet?.address ?? agentForm.walletAddress,
        walletId: response.wallet?.id
      };
      setAgents((current) => [nextAgent, ...current.filter((agent) => agent.id !== nextAgent.id)]);
      setSelectedAgentId(nextAgent.id);
      setIntentForm((current) => ({ ...current, walletAddress: nextAgent.walletAddress }));
      await refreshStats();
      showSuccess('Agent created through InsForge.');
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Could not create agent.');
    } finally {
      setLoadingKey('agent', false);
    }
  };

  const handlePolicySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAgent) {
      showError('Load or create an agent before creating a policy.');
      return;
    }

    setLoadingKey('policy', true);
    try {
      const policy = await solanaGuardApi.createPolicy({
        agentId: selectedAgent.id,
        policy: {
          name: policyForm.name,
          maxTransactionAmount: Number(policyForm.maxTransactionAmount),
          dailySpendingLimit: Number(policyForm.dailySpendingLimit),
          manualApprovalThreshold: Number(policyForm.manualApprovalThreshold),
          allowedProgramIds: parseProgramList(policyForm.allowedProgramIds),
          blockedProgramIds: parseProgramList(policyForm.blockedProgramIds),
          unknownProgramRiskPenalty: Number(policyForm.unknownProgramRiskPenalty),
          riskWarningThreshold: 50,
          riskBlockThreshold: 80,
          emergencyPause: policyForm.emergencyPause
        }
      });

      setPolicies((current) => [policy, ...current.filter((item) => item.id !== policy.id)]);
      setAgents((current) =>
        current.map((agent) => (agent.id === selectedAgent.id ? { ...agent, policyId: policy.id } : agent))
      );
      await refreshStats();
      showSuccess('Policy created and activated through InsForge.');
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Could not create policy.');
    } finally {
      setLoadingKey('policy', false);
    }
  };

  const runSimulation = async () => {
    if (!selectedAgent) {
      showError('Load or create an agent before evaluating a transaction.');
      return;
    }

    setLoadingKey('simulator', true);
    try {
      const response = await solanaGuardApi.evaluateTransaction({
        agentId: selectedAgent.id,
        walletAddress: intentForm.walletAddress || selectedAgent.walletAddress,
        programId: intentForm.programId,
        destination: intentForm.destination,
        amountSol: Number(intentForm.amountSol),
        intentType: intentForm.intentType
      });
      setLastResult(response);
      await refreshStats();
      showSuccess('Transaction evaluated by the InsForge policy engine.');
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Could not evaluate transaction.');
    } finally {
      setLoadingKey('simulator', false);
    }
  };

  const applyScenario = (scenario: (typeof scenarioButtons)[number]) => {
    setIntentForm((current) => ({
      ...current,
      ...scenario.intent,
      walletAddress: selectedAgent?.walletAddress || current.walletAddress
    }));
  };

  const statsCards = [
    { label: 'Agents protected', value: stats.agents, icon: Bot, suffix: '' },
    { label: 'Wallets protected', value: stats.wallets, icon: Wallet, suffix: '' },
    { label: 'Transactions checked', value: stats.transactionRequests, icon: Activity, suffix: '' },
    { label: 'Blocked transactions', value: stats.blockedTransactions, icon: XCircle, suffix: '' },
    { label: 'Average risk score', value: Number(stats.averageRiskScore), icon: Gauge, suffix: '', digits: 1 },
    { label: 'Open alerts', value: stats.openAlerts, icon: AlertTriangle, suffix: '' }
  ];

  return (
    <div ref={rootRef} className="min-h-screen overflow-hidden bg-void text-guardian-text">
      <ParticleField />
      <nav className="liquid-nav" aria-label="Primary navigation">
        <a href="#landing" className="brand-mark" aria-label="SolanaGuard home">
          <Shield className="h-5 w-5" aria-hidden="true" />
          SolanaGuard
        </a>
        <div className="nav-links">
          <a href="#dashboard">Dashboard</a>
          <a href="#agents">Agents</a>
          <a href="#policy">Policy</a>
          <a href="#simulator">Simulator</a>
          <a href="#audit">Audit</a>
        </div>
        <span className="network-pill">InsForge live</span>
      </nav>

      <main>
        <Landing stats={stats} onEnter={() => document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' })} />

        <section id="dashboard" className="dashboard-zone">
          <SectionHeader
            eyebrow="Guardian command"
            title="InsForge control plane, wired live."
            body={`Function host: ${FUNCTIONS_BASE_URL}`}
          />

          <div className="action-strip">
            <PrimaryButton type="button" onClick={() => seedDemo()} isLoading={loading.seed}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Load demo data
            </PrimaryButton>
            <SecondaryButton type="button" onClick={refreshStats} disabled={loading.stats}>
              <RefreshCw className={`h-4 w-4 ${loading.stats ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh stats
            </SecondaryButton>
          </div>

          <StatusMessages error={error} success={success} onRetry={refreshStats} />

          <div className="stats-grid">
            {statsCards.map((card) => (
              <GlassCard key={card.label} className="stat-card">
                <div className="stat-icon">
                  <card.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p>{card.label}</p>
                <strong>
                  <AnimatedNumber value={card.value} digits={card.digits ?? 0} suffix={card.suffix} />
                </strong>
              </GlassCard>
            ))}
          </div>
        </section>

        <section id="agents" className="dashboard-zone split-zone">
          <div>
            <SectionHeader
              eyebrow="Agent registry"
              title="Register autonomous actors before they touch a wallet."
              body="Every create action below calls the deployed create-agent function."
            />
            <form className="control-form" onSubmit={handleAgentSubmit}>
              <Field id="agent-name" label="Agent name">
                <input
                  id="agent-name"
                  value={agentForm.name}
                  onChange={(event) => setAgentForm((current) => ({ ...current, name: event.target.value }))}
                  autoComplete="name"
                  required
                />
              </Field>
              <Field id="agent-description" label="Mission profile">
                <textarea
                  id="agent-description"
                  value={agentForm.description}
                  onChange={(event) => setAgentForm((current) => ({ ...current, description: event.target.value }))}
                  rows={3}
                />
              </Field>
              <Field id="agent-wallet" label="Primary wallet address" hint="Demo-safe text value; real wallet connection comes later.">
                <input
                  id="agent-wallet"
                  value={agentForm.walletAddress}
                  onChange={(event) => setAgentForm((current) => ({ ...current, walletAddress: event.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </Field>
              <PrimaryButton type="submit" isLoading={loading.agent}>
                <Bot className="h-4 w-4" aria-hidden="true" />
                Create agent
              </PrimaryButton>
            </form>
          </div>

          <GlassCard className="registry-card">
            <div className="panel-title">
              <Cpu className="h-5 w-5" aria-hidden="true" />
              Active registry
            </div>
            {loading.boot ? <SkeletonList /> : null}
            {!loading.boot && agents.length === 0 ? (
              <EmptyState title="No agents loaded" body="Seed demo data or create the first Guardian-controlled agent." />
            ) : null}
            <div className="agent-list">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`agent-row ${selectedAgent?.id === agent.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setIntentForm((current) => ({ ...current, walletAddress: agent.walletAddress }));
                  }}
                >
                  <span className="agent-avatar">
                    <Bot className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{agent.name}</strong>
                    <small>{truncateAddress(agent.walletAddress, 6)}</small>
                  </span>
                  <StatusPill tone="neutral">{agent.policyId ? 'Policy linked' : 'Needs policy'}</StatusPill>
                </button>
              ))}
            </div>
          </GlassCard>
        </section>

        <section id="policy" className="dashboard-zone split-zone">
          <div>
            <SectionHeader
              eyebrow="Policy builder"
              title="Rules of the realm, enforced before signing."
              body="Policy creation calls create-policy and activates the latest policy for the selected agent."
            />
            <form className="control-form" onSubmit={handlePolicySubmit}>
              <Field id="policy-agent" label="Protected agent">
                <select
                  id="policy-agent"
                  value={selectedAgent?.id ?? ''}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  required
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="policy-name" label="Policy name">
                <input
                  id="policy-name"
                  value={policyForm.name}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, name: event.target.value }))}
                  autoComplete="off"
                  required
                />
              </Field>
              <div className="form-grid">
                <Field id="max-transaction" label="Max transaction amount">
                  <input
                    id="max-transaction"
                    inputMode="decimal"
                    value={policyForm.maxTransactionAmount}
                    onChange={(event) =>
                      setPolicyForm((current) => ({ ...current, maxTransactionAmount: event.target.value }))
                    }
                    required
                  />
                </Field>
                <Field id="daily-limit" label="Daily spending limit">
                  <input
                    id="daily-limit"
                    inputMode="decimal"
                    value={policyForm.dailySpendingLimit}
                    onChange={(event) =>
                      setPolicyForm((current) => ({ ...current, dailySpendingLimit: event.target.value }))
                    }
                    required
                  />
                </Field>
                <Field id="manual-threshold" label="Manual approval threshold">
                  <input
                    id="manual-threshold"
                    inputMode="decimal"
                    value={policyForm.manualApprovalThreshold}
                    onChange={(event) =>
                      setPolicyForm((current) => ({ ...current, manualApprovalThreshold: event.target.value }))
                    }
                    required
                  />
                </Field>
                <Field id="unknown-penalty" label="Unknown program penalty">
                  <input
                    id="unknown-penalty"
                    inputMode="numeric"
                    value={policyForm.unknownProgramRiskPenalty}
                    onChange={(event) =>
                      setPolicyForm((current) => ({ ...current, unknownProgramRiskPenalty: event.target.value }))
                    }
                    required
                  />
                </Field>
              </div>
              <Field id="allowed-programs" label="Allowed program IDs">
                <textarea
                  id="allowed-programs"
                  value={policyForm.allowedProgramIds}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, allowedProgramIds: event.target.value }))}
                  rows={3}
                  spellCheck={false}
                />
              </Field>
              <Field id="blocked-programs" label="Blocked program IDs">
                <textarea
                  id="blocked-programs"
                  value={policyForm.blockedProgramIds}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, blockedProgramIds: event.target.value }))}
                  rows={2}
                  spellCheck={false}
                />
              </Field>
              <label className="kill-switch">
                <input
                  type="checkbox"
                  checked={policyForm.emergencyPause}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, emergencyPause: event.target.checked }))}
                />
                <span className="switch-track">
                  <span className="switch-handle" />
                </span>
                <span>
                  <strong>Emergency pause</strong>
                  <small>Hard-block every evaluated transaction for this agent.</small>
                </span>
              </label>
              <PrimaryButton type="submit" isLoading={loading.policy}>
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                Create policy
              </PrimaryButton>
            </form>
          </div>

          <GlassCard className="policy-preview">
            <div className="panel-title">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              Active rules
            </div>
            <PolicyDial value={Number(policyForm.maxTransactionAmount)} />
            <div className="rule-stack">
              <Rule label="Max transaction" value={`${policyForm.maxTransactionAmount} SOL`} />
              <Rule label="Daily limit" value={`${policyForm.dailySpendingLimit} SOL`} />
              <Rule label="Manual approval" value={`Above ${policyForm.manualApprovalThreshold} SOL`} />
              <Rule label="Unknown program" value={`+${policyForm.unknownProgramRiskPenalty} risk`} />
              <Rule label="Emergency pause" value={policyForm.emergencyPause ? 'Armed' : 'Standby'} danger={policyForm.emergencyPause} />
            </div>
            {policies[0] ? (
              <p className="backend-note">Latest backend policy: {policies[0].name}</p>
            ) : (
              <p className="backend-note">No policy created in this browser session yet.</p>
            )}
          </GlassCard>
        </section>

        <section id="simulator" className="dashboard-zone split-zone">
          <div>
            <SectionHeader
              eyebrow="Live transaction simulator"
              title="Watch the policy engine intercept a simulated intent."
              body="Every run calls evaluate-transaction and writes a transaction request plus audit log in InsForge."
            />
            <div className="scenario-grid">
              {scenarioButtons.map((scenario) => (
                <button key={scenario.key} type="button" className="scenario-button" onClick={() => applyScenario(scenario)}>
                  <strong>{scenario.label}</strong>
                  <small>{scenario.description}</small>
                </button>
              ))}
            </div>
            <form
              className="control-form"
              onSubmit={(event) => {
                event.preventDefault();
                runSimulation();
              }}
            >
              <Field id="intent-wallet" label="Wallet address">
                <input
                  id="intent-wallet"
                  value={intentForm.walletAddress}
                  onChange={(event) => setIntentForm((current) => ({ ...current, walletAddress: event.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </Field>
              <Field id="intent-program" label="Program ID">
                <input
                  id="intent-program"
                  value={intentForm.programId}
                  onChange={(event) => setIntentForm((current) => ({ ...current, programId: event.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </Field>
              <div className="form-grid">
                <Field id="intent-amount" label="Amount">
                  <input
                    id="intent-amount"
                    inputMode="decimal"
                    value={intentForm.amountSol}
                    onChange={(event) => setIntentForm((current) => ({ ...current, amountSol: event.target.value }))}
                    required
                  />
                </Field>
                <Field id="intent-type" label="Intent type">
                  <input
                    id="intent-type"
                    value={intentForm.intentType}
                    onChange={(event) => setIntentForm((current) => ({ ...current, intentType: event.target.value }))}
                    autoComplete="off"
                    required
                  />
                </Field>
              </div>
              <Field id="intent-destination" label="Destination">
                <input
                  id="intent-destination"
                  value={intentForm.destination}
                  onChange={(event) => setIntentForm((current) => ({ ...current, destination: event.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </Field>
              <PrimaryButton type="submit" isLoading={loading.simulator}>
                <Radar className="h-4 w-4" aria-hidden="true" />
                Evaluate transaction
              </PrimaryButton>
            </form>
          </div>

          <ResultPanel result={lastResult} />
        </section>

        <section id="audit" className="dashboard-zone">
          <SectionHeader
            eyebrow="Audit trail"
            title="A holographic ledger of decisions and alerts."
            body="This panel renders recentAuditLogs from get-dashboard-stats and the alert IDs returned by evaluate-transaction."
          />
          <div className="audit-layout">
            <GlassCard className="audit-card">
              <div className="panel-title">
                <Terminal className="h-5 w-5" aria-hidden="true" />
                Recent audit logs
              </div>
              {loading.stats ? <SkeletonList /> : null}
              {!loading.stats && stats.recentAuditLogs.length === 0 ? (
                <EmptyState title="No audit logs yet" body="Run the simulator to create a live backend audit entry." />
              ) : null}
              <div className="timeline">
                {stats.recentAuditLogs.map((log) => (
                  <div className={`timeline-row ${log.decision ?? 'neutral'}`} key={log.id}>
                    <span className="timeline-node" />
                    <div>
                      <div className="timeline-head">
                        <strong>{log.action}</strong>
                        <StatusPill tone={log.decision ?? 'neutral'}>{log.decision ?? 'system'}</StatusPill>
                      </div>
                      <p>{log.reason}</p>
                      <small>
                        {formatDateTime(log.created_at)} - risk {log.risk_score ?? 0} - {truncateAddress(log.id, 6)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="alerts-card">
              <div className="panel-title">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                Alerts
              </div>
              <div className="alert-meter">
                <span>Open alerts</span>
                <strong>
                  <AnimatedNumber value={stats.openAlerts} />
                </strong>
              </div>
              <AnimatePresence mode="popLayout">
                {lastResult?.alertId ? (
                  <motion.div
                    key={lastResult.alertId}
                    className="live-alert"
                    initial={{ y: 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                  >
                    <StatusPill tone={lastResult.decision}>{lastResult.decision}</StatusPill>
                    <strong>{truncateAddress(lastResult.alertId, 8)}</strong>
                    <p>{lastResult.reason}</p>
                    <small>Status: open in InsForge alerts table</small>
                  </motion.div>
                ) : (
                  <EmptyState title="No live alert selected" body="Warning and blocked simulations return alert IDs here." />
                )}
              </AnimatePresence>
            </GlassCard>
          </div>
        </section>
      </main>
    </div>
  );
}

function Landing({ stats, onEnter }: { stats: DashboardStats; onEnter: () => void }) {
  return (
    <section id="landing" className="landing-stage">
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow hero-word">AI wallet firewall</p>
          <h1>
            <span className="hero-word">Become</span> <span className="hero-word gradient-text">the Guardian</span>{' '}
            <span className="hero-word">of autonomous Solana agents.</span>
          </h1>
          <p className="hero-word hero-body">
            SolanaGuard gives users an off-chain command plane for agent wallets: spending limits, protocol allowlists,
            blocked programs, emergency pause controls, and auditable decisions.
          </p>
          <div className="hero-actions hero-word">
            <PrimaryButton type="button" onClick={onEnter}>
              <Shield className="h-4 w-4" aria-hidden="true" />
              Become a Guardian
            </PrimaryButton>
            <a className="secondary-link" href="#simulator">
              Run a live transaction check
            </a>
          </div>
        </div>
        <div className="orb-stage" aria-hidden="true">
          <div className="shield-ring" />
          <div className="guardian-orb">
            <Shield className="h-16 w-16" />
          </div>
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} className="threat-particle" />
          ))}
        </div>
      </div>

      <div className="story-strip">
        <StoryPanel
          chapter="Chapter 1 - The Threat"
          title="AI agents move money before humans can blink."
          body="Rogue transaction particles search for signing authority, program access, and loose daily caps."
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
        />
        <StoryPanel
          chapter="Chapter 2 - The Shield"
          title="SolanaGuard intercepts risky actions."
          body="The policy engine turns a simulated intent into allowed, warning, or blocked before execution."
          icon={<Shield className="h-5 w-5" aria-hidden="true" />}
        />
        <StoryPanel
          chapter="Chapter 3 - Rules of the Realm"
          title="Limits, allowlists, blocklists, thresholds."
          body="Policy cards become enforceable InsForge control-plane records for every protected agent."
          icon={<ListChecks className="h-5 w-5" aria-hidden="true" />}
        />
        <StoryPanel
          chapter="Chapter 4 - The Kill Switch"
          title="Emergency pause turns autonomy into stillness."
          body="Use the tactile switch in the policy builder to create an emergency-pause policy for an agent."
          icon={<PauseCircle className="h-5 w-5" aria-hidden="true" />}
        />
        <StoryPanel
          chapter="Chapter 5 - Audit Trail"
          title={`${formatNumber(stats.transactionRequests)} checks, ${formatNumber(stats.blockedTransactions)} blocked.`}
          body="Every evaluated intent leaves a transaction request, an audit log, and when needed, an alert."
          icon={<Terminal className="h-5 w-5" aria-hidden="true" />}
        />
      </div>
    </section>
  );
}

function StoryPanel({
  chapter,
  title,
  body,
  icon
}: {
  chapter: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <GlassCard className="story-panel">
      <div className="story-reveal story-icon">{icon}</div>
      <p className="story-reveal eyebrow">{chapter}</p>
      <h3 className="story-reveal">{title}</h3>
      <p className="story-reveal">{body}</p>
    </GlassCard>
  );
}

function StatusMessages({
  error,
  success,
  onRetry
}: {
  error: string;
  success: string;
  onRetry: () => void;
}) {
  if (!error && !success) {
    return null;
  }

  return (
    <div className={`status-message ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
      {error ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
      <span>{error || success}</span>
      {error ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function PolicyDial({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(25, value || 0));
  const degrees = -130 + (clamped / 25) * 260;

  return (
    <div className="policy-dial" aria-label={`Max transaction amount ${value} SOL`}>
      <div className="dial-face">
        <span className="dial-needle" style={{ transform: `translate(-50%, -100%) rotate(${degrees}deg)` }} />
        <span className="dial-hub" />
      </div>
      <div className="dial-readout">{formatNumber(value || 0, 1)} SOL</div>
    </div>
  );
}

function Rule({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rule ${danger ? 'danger' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResultPanel({ result }: { result: EvaluateTransactionResponse | null }) {
  if (!result) {
    return (
      <GlassCard className="result-panel empty-result">
        <Radar className="h-9 w-9" aria-hidden="true" />
        <h3>No transaction evaluated yet</h3>
        <p>Choose a scenario and run the simulator to call the live InsForge policy engine.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`result-panel decision-${result.decision}`}>
      <div className="result-topline">
        <StatusPill tone={result.decision}>{result.decision}</StatusPill>
        <span>Risk score</span>
      </div>
      <div className="risk-orbit">
        <strong>{result.riskScore}</strong>
        <span>/100</span>
      </div>
      <p className="result-reason">{result.reason}</p>
      <div className="result-ids">
        <span>Audit log</span>
        <strong>{truncateAddress(result.auditLogId, 8)}</strong>
        <span>Alert</span>
        <strong>{result.alertId ? truncateAddress(result.alertId, 8) : 'none'}</strong>
      </div>
      <div className="matched-rules">
        <h4>Matched policy rules</h4>
        {result.matchedPolicyRules.map((rule, index) => (
          <div key={`${rule.rule}-${index}`} className="matched-rule">
            <span>{rule.rule}</span>
            <StatusPill tone={rule.result === 'blocked' ? 'blocked' : rule.result === 'warning' ? 'warning' : 'allowed'}>
              {rule.result}
            </StatusPill>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function SkeletonList() {
  return (
    <div className="skeleton-list" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <LockKeyhole className="h-8 w-8" aria-hidden="true" />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function parseProgramList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default App;
