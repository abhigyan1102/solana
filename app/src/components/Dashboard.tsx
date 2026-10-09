import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Homepage from './Homepage';
import ConsoleShell, { ConsoleIcon, ConsoleRecordsEmpty, ConsoleGuide } from './ConsoleShell';

type Decision = 'allowed' | 'warning' | 'blocked';
type RequestState = 'idle' | 'loading' | 'success' | 'error';

type DashboardStats = {
  agents: number;
  protectedWallets: number;
  transactionsChecked: number;
  blockedTransactions: number;
  openAlerts: number;
  averageRiskScore: number;
  recentAuditLogs: AuditLog[];
};

type AuditLog = {
  id?: string;
  agentId?: string;
  agent_id?: string;
  transactionRequestId?: string;
  transaction_request_id?: string;
  auditLogId?: string;
  audit_log_id?: string;
  alertId?: string;
  alert_id?: string;
  decision?: string;
  riskScore?: number;
  risk_score?: number;
  reason?: string;
  createdAt?: string;
  created_at?: string;
  timestamp?: string;
  transactionType?: string;
  transaction_type?: string;
  action?: string;
  programId?: string;
  program_id?: string;
  matchedRules?: Array<string | Record<string, unknown>>;
  matched_rules?: Array<string | Record<string, unknown>>;
};

type TransactionRequest = {
  id?: string;
  agentId?: string;
  agent_id?: string;
  walletId?: string;
  wallet_id?: string;
  programId?: string;
  program_id?: string;
  destination?: string;
  amountSol?: number;
  amount_sol?: number;
  intentType?: string;
  intent_type?: string;
  decision?: string;
  riskScore?: number;
  risk_score?: number;
  reason?: string;
  matchedRules?: Array<string | Record<string, unknown>>;
  matched_rules?: Array<string | Record<string, unknown>>;
  createdAt?: string;
  created_at?: string;
  evaluatedAt?: string;
  evaluated_at?: string;
};

type AgentRecord = {
  id: string;
  name: string;
  walletAddress: string;
  source: 'created' | 'demo' | 'stats' | 'backend';
  emergencyPause?: boolean;
};

type PolicyResult = {
  id?: string;
  policyId?: string;
  emergencyPause?: boolean;
  emergency_pause?: boolean;
};

type EvaluationResult = {
  decision?: string;
  riskScore?: number;
  reason?: string;
  matchedPolicyRules?: Array<string | Record<string, unknown>>;
  matchedRules?: Array<string | Record<string, unknown>>;
  auditLogId?: string;
  alertId?: string;
};

type Toast = {
  message: string;
  type: 'success' | 'error' | 'info';
};

type Preset = {
  id: string;
  label: string;
  description: string;
  amount: string;
  programId: string;
  recipient: string;
  transactionType: string;
};

type WalletProof = {
  walletAddress: string;
  message: string;
  signature: string;
  timestamp: number;
};

const FUNCTION_BASE = import.meta.env.VITE_INSFORGE_FUNCTIONS_URL as string | undefined;
const WALLET_SIGNATURE_ERROR = 'Wallet signature was cancelled or could not be completed.';

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const UNKNOWN_PROGRAM_ID = '7VhUFYwLZp8cWYx5GRm8JgGk2WXRhxaWwzHjXwqVx111';

const emptyStats: DashboardStats = {
  agents: 0,
  protectedWallets: 0,
  transactionsChecked: 0,
  blockedTransactions: 0,
  openAlerts: 0,
  averageRiskScore: 0,
  recentAuditLogs: [],
};

const createEmptyStats = (): DashboardStats => ({
  agents: 0,
  protectedWallets: 0,
  transactionsChecked: 0,
  blockedTransactions: 0,
  openAlerts: 0,
  averageRiskScore: 0,
  recentAuditLogs: [],
});

const presets: Preset[] = [
  {
    id: 'safe-transfer',
    label: 'Safe transfer',
    description: 'Small SOL transfer through the system program.',
    amount: '0.05',
    programId: SYSTEM_PROGRAM_ID,
    recipient: 'DemoSafeWallet111111111111111111111111111111',
    transactionType: 'transfer',
  },
  {
    id: 'manual-warning',
    label: 'Approval warning',
    description: 'Illustrative token transfer; the selected policy determines the result.',
    amount: '2.5',
    programId: TOKEN_PROGRAM_ID,
    recipient: 'DemoApprovalWallet1111111111111111111111111',
    transactionType: 'token-transfer',
  },
  {
    id: 'blocked-program',
    label: 'Blocked program',
    description: 'Known disallowed program interaction.',
    amount: '0.2',
    programId: JUPITER_PROGRAM_ID,
    recipient: 'JupiterRoute11111111111111111111111111111',
    transactionType: 'swap',
  },
  {
    id: 'unknown-program',
    label: 'Unknown program',
    description: 'Unrecognized program ID to test policy coverage.',
    amount: '0.4',
    programId: UNKNOWN_PROGRAM_ID,
    recipient: 'UnknownTarget1111111111111111111111111111',
    transactionType: 'program-call',
  },
  {
    id: 'max-amount',
    label: 'Over limit',
    description: 'Large transaction that should exceed policy limits.',
    amount: '25',
    programId: SYSTEM_PROGRAM_ID,
    recipient: 'LargeTransfer11111111111111111111111111111',
    transactionType: 'transfer',
  },
];

// ---------------------------------------------------------------------------
// Guest demo mode — seeded, read-only sample data (no backend, no wallet).
// Lets first-time visitors understand SolanaGuard before connecting a wallet.
// Everything below is illustrative seed data and is clearly labelled in the UI.
// ---------------------------------------------------------------------------

type GuestScenario = {
  id: string;
  label: string;
  sublabel: string;
  amountSol: number;
  programLabel: string;
  programId: string;
  decision: Decision;
  riskScore: number;
  reason: string;
  matchedRules: string[];
};

const GUEST_AGENT = {
  name: 'Demo Trading Agent',
  walletAddress: 'DemoWallet1111111111111111111111111111111111',
};

const GUEST_POLICY = {
  maxTransactionAmount: 1,
  dailySpendingLimit: 5,
  manualApprovalThreshold: 0.75,
  allowedPrograms: 'System Program, Token Program',
  blockedPrograms: 'Jupiter Aggregator',
  emergencyPause: false,
};

const GUEST_SCENARIOS: GuestScenario[] = [
  {
    id: 'safe',
    label: 'Safe transfer',
    sublabel: '0.05 SOL · System Program',
    amountSol: 0.05,
    programLabel: 'System Program',
    programId: SYSTEM_PROGRAM_ID,
    decision: 'allowed',
    riskScore: 10,
    reason: 'Allowed: 0.05 SOL is within the 1 SOL per-transaction limit and uses an allowed program (System Program).',
    matchedRules: ['allowed_program_ids: matched', 'max_transaction_amount: within limit'],
  },
  {
    id: 'manual-approval',
    label: 'Approval warning',
    sublabel: '0.9 SOL · Token Program',
    amountSol: 0.9,
    programLabel: 'Token Program',
    programId: TOKEN_PROGRAM_ID,
    decision: 'warning',
    riskScore: 60,
    reason: 'Warning: 0.9 SOL is above the 0.75 SOL manual-approval threshold, so the request is flagged for owner review. The approval workflow is not implemented.',
    matchedRules: ['manual_approval_threshold: warning'],
  },
  {
    id: 'over-limit',
    label: 'Over the limit',
    sublabel: '5 SOL · System Program',
    amountSol: 5,
    programLabel: 'System Program',
    programId: SYSTEM_PROGRAM_ID,
    decision: 'blocked',
    riskScore: 90,
    reason: 'Blocked: 5 SOL exceeds the 1 SOL per-transaction limit configured for this agent.',
    matchedRules: ['max_transaction_amount: blocked'],
  },
  {
    id: 'paused',
    label: 'Agent paused',
    sublabel: '0.05 SOL · kill switch on',
    amountSol: 0.05,
    programLabel: 'System Program',
    programId: SYSTEM_PROGRAM_ID,
    decision: 'blocked',
    riskScore: 100,
    reason: 'Blocked: this agent is paused by the wallet owner. The emergency kill switch overrides every other rule.',
    matchedRules: ['emergency_pause: blocked'],
  },
];

const getErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (message.includes('wallets_address_key') || message.toLowerCase().includes('duplicate key')) {
    return 'This wallet is already linked to an existing agent. Refresh stats and select that agent.';
  }
  if (message) return message;
  return 'Request failed. Check the InsForge function endpoint and retry.';
};

const joinFunctionUrl = (base: string, slug: string) => {
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}/${slug}`;
};

const unwrapData = (payload: any) => payload?.data ?? payload?.result ?? payload;

const normalizeDecision = (value?: string): Decision => {
  const lowered = String(value || '').toLowerCase();
  if (lowered.includes('block') || lowered.includes('deny') || lowered.includes('reject')) return 'blocked';
  if (lowered.includes('warn') || lowered.includes('manual') || lowered.includes('review')) return 'warning';
  return 'allowed';
};

const normalizeStats = (payload: any): DashboardStats => {
  const data = unwrapData(payload) || {};
  const rawAuditLogs = Array.isArray(data.recentAuditLogs)
    ? data.recentAuditLogs
    : Array.isArray(data.recent_audit_logs)
      ? data.recent_audit_logs
      : Array.isArray(data.auditLogs)
        ? data.auditLogs
        : [];
  const recentAuditLogs = rawAuditLogs.map((log: AuditLog) => ({
    ...log,
    auditLogId: log.auditLogId ?? log.audit_log_id ?? log.id,
    alertId: log.alertId ?? log.alert_id,
    riskScore: Number(log.riskScore ?? log.risk_score ?? 0),
    createdAt: log.createdAt ?? log.created_at ?? log.timestamp,
    transactionType: log.transactionType ?? log.transaction_type ?? log.action,
    programId: log.programId ?? log.program_id,
  }));

  return {
    agents: Number(data.agents ?? data.totalAgents ?? data.agentCount ?? 0),
    protectedWallets: Number(data.protectedWallets ?? data.protected_wallets ?? data.wallets ?? 0),
    transactionsChecked: Number(data.transactionsChecked ?? data.transactions_checked ?? data.transactionRequests ?? data.transaction_requests ?? data.totalTransactions ?? 0),
    blockedTransactions: Number(data.blockedTransactions ?? data.blocked_transactions ?? data.blocked ?? 0),
    openAlerts: Number(data.openAlerts ?? data.open_alerts ?? data.alerts ?? 0),
    averageRiskScore: Number(data.averageRiskScore ?? data.average_risk_score ?? data.avgRiskScore ?? 0),
    recentAuditLogs,
  };
};

const normalizeAuditLogs = (payload: any): AuditLog[] => {
  const data = unwrapData(payload) || {};
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data.auditLogs)
      ? data.auditLogs
      : Array.isArray(data.audit_logs)
        ? data.audit_logs
        : [];

  return rows.map((log: AuditLog) => ({
    ...log,
    agentId: log.agentId ?? log.agent_id,
    transactionRequestId: log.transactionRequestId ?? log.transaction_request_id,
    auditLogId: log.auditLogId ?? log.audit_log_id ?? log.id,
    riskScore: Number(log.riskScore ?? log.risk_score ?? 0),
    matchedRules: log.matchedRules ?? log.matched_rules ?? [],
    createdAt: log.createdAt ?? log.created_at ?? log.timestamp,
  }));
};

const normalizeTransactionRequests = (payload: any): TransactionRequest[] => {
  const data = unwrapData(payload) || {};
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data.transactionRequests)
      ? data.transactionRequests
      : Array.isArray(data.transaction_requests)
        ? data.transaction_requests
        : [];

  return rows.map((request: TransactionRequest) => ({
    ...request,
    agentId: request.agentId ?? request.agent_id,
    walletId: request.walletId ?? request.wallet_id,
    programId: request.programId ?? request.program_id,
    amountSol: Number(request.amountSol ?? request.amount_sol ?? 0),
    intentType: request.intentType ?? request.intent_type,
    riskScore: Number(request.riskScore ?? request.risk_score ?? 0),
    matchedRules: request.matchedRules ?? request.matched_rules ?? [],
    createdAt: request.createdAt ?? request.created_at,
    evaluatedAt: request.evaluatedAt ?? request.evaluated_at,
  }));
};

const extractAgents = (payload: any, source: AgentRecord['source']): AgentRecord[] => {
  const data = unwrapData(payload) || {};
  const rows = Array.isArray(data.agents)
    ? data.agents
    : Array.isArray(data.agentsList)
      ? data.agentsList
      : Array.isArray(data.agents_list)
        ? data.agents_list
        : Array.isArray(data.demoAgents)
          ? data.demoAgents
          : Array.isArray(data.recentAgents)
            ? data.recentAgents
            : [];

  return rows
    .map((row: any, index: number) => {
      const id = String(row.id ?? row.agentId ?? row.agent_id ?? '');
      if (!id) return null;
      return {
        id,
        name: String(row.name ?? row.agentName ?? row.agent_name ?? `Agent ${index + 1}`),
        walletAddress: String(row.walletAddress ?? row.wallet_address ?? row.ownerWallet ?? row.address ?? ''),
        source,
        emergencyPause: typeof row.emergencyPause === 'boolean'
          ? row.emergencyPause
          : typeof row.emergency_pause === 'boolean'
            ? row.emergency_pause
            : undefined,
      };
    })
    .filter(Boolean) as AgentRecord[];
};

const shorten = (value?: string, head = 6, tail = 4) => {
  if (!value) return 'Not set';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const formatNumber = (value: number, digits = 0) => {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
};

const formatRule = (rule: string | Record<string, unknown>) => {
  if (typeof rule === 'string') return rule;
  const name = String(rule.rule ?? rule.name ?? 'policy_rule');
  const result = rule.result ? `: ${String(rule.result)}` : '';
  const programId = rule.programId ? ` (${shorten(String(rule.programId), 8, 6)})` : '';
  return `${name}${result}${programId}`;
};

const parseNonNegativeNumber = (value: string, label: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a finite, non-negative number.`);
  }
  return parsed;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};

const Dashboard: React.FC = () => {
  const wallet = useWallet();
  const walletAddress = wallet.publicKey?.toBase58() || '';
  const functionsReady = Boolean(FUNCTION_BASE);
  const walletProofRef = useRef<WalletProof | null>(null);

  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [statsState, setStatsState] = useState<RequestState>('idle');
  const [statsError, setStatsError] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditState, setAuditState] = useState<RequestState>('idle');
  const [auditError, setAuditError] = useState('');
  const [transactionHistory, setTransactionHistory] = useState<TransactionRequest[]>([]);
  const [historyState, setHistoryState] = useState<RequestState>('idle');
  const [historyError, setHistoryError] = useState('');
  const [knownAgents, setKnownAgents] = useState<AgentRecord[]>([]);
  const [emergencyPauseByAgent, setEmergencyPauseByAgent] = useState<Record<string, boolean>>({});
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [createdAgentId, setCreatedAgentId] = useState('');
  const [createdPolicyId, setCreatedPolicyId] = useState('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [page, setPage] = useState<'home' | 'console' | 'demo'>(() =>
    window.location.hash.startsWith('#console')
      ? 'console'
      : window.location.hash.startsWith('#demo')
        ? 'demo'
        : 'home',
  );
  const navigate = (next: 'home' | 'console' | 'demo') => {
    setPage(next);
    window.location.hash = next === 'home' ? 'top' : `${next}-overview`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    const syncPage = () =>
      setPage(
        window.location.hash.startsWith('#console')
          ? 'console'
          : window.location.hash.startsWith('#demo')
            ? 'demo'
            : 'home',
      );
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);
  useEffect(() => {
    if (wallet.connected) navigate('console');
  }, [wallet.connected]);

  const [agentState, setAgentState] = useState<RequestState>('idle');
  const [policyState, setPolicyState] = useState<RequestState>('idle');
  const [evaluationState, setEvaluationState] = useState<RequestState>('idle');
  const [seedState, setSeedState] = useState<RequestState>('idle');
  const [pauseState, setPauseState] = useState<RequestState>('idle');

  const [agentForm, setAgentForm] = useState({
    name: 'Treasury Ops Agent',
    description: 'Autonomous assistant for controlled Solana transfers.',
  });

  const [policyForm, setPolicyForm] = useState({
    maxTransactionAmount: '1',
    dailySpendingLimit: '5',
    manualApprovalThreshold: '0.75',
    allowedProgramIds: `${SYSTEM_PROGRAM_ID}\n${TOKEN_PROGRAM_ID}`,
    blockedProgramIds: JUPITER_PROGRAM_ID,
    emergencyPaused: false,
  });

  const [transactionForm, setTransactionForm] = useState({
    presetId: 'safe-transfer',
    amount: presets[0].amount,
    programId: presets[0].programId,
    recipient: presets[0].recipient,
    transactionType: presets[0].transactionType,
    memo: 'Demo transaction simulation',
  });

  const showToast = (message: string, type: Toast['type']) => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4200);
  };

  const setAgentEmergencyPause = useCallback((agentId: string, emergencyPause: boolean) => {
    setEmergencyPauseByAgent(prev => ({ ...prev, [agentId]: emergencyPause }));
    setKnownAgents(prev => prev.map(agent => (
      agent.id === agentId ? { ...agent, emergencyPause } : agent
    )));
  }, []);

  const invokeFunction = useCallback(async <T,>(slug: string, body?: Record<string, unknown>, method: 'GET' | 'POST' = 'POST') => {
    if (!FUNCTION_BASE) {
      throw new Error('Missing VITE_INSFORGE_FUNCTIONS_URL. Add it to app/.env and restart Vite.');
    }

    const response = await fetch(joinFunctionUrl(FUNCTION_BASE, slug), {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });

    const text = await response.text();
    let payload: any = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      const message = payload?.error?.message ?? payload?.error ?? payload?.message ?? `${slug} returned ${response.status}: ${text || response.statusText}`;
      throw new Error(String(message));
    }

    return unwrapData(payload) as T;
  }, []);

  const getWalletProof = useCallback(async () => {
    if (!walletAddress) {
      throw new Error('Connect a Solana wallet before accessing wallet-scoped data.');
    }

    if (!wallet.signMessage) {
      throw new Error('This wallet does not support message signing. Use Backpack or Phantom.');
    }

    const cached = walletProofRef.current;
    if (cached?.walletAddress === walletAddress && Date.now() - cached.timestamp < 4 * 60 * 1000) {
      return cached;
    }

    const timestamp = Date.now();
    const message = [
      'SolanaGuard wallet access',
      `Wallet: ${walletAddress}`,
      `Timestamp: ${timestamp}`
    ].join('\n');
    const signature = await wallet.signMessage(new TextEncoder().encode(message));
    const proof = {
      walletAddress,
      message,
      signature: bytesToBase64(signature),
      timestamp
    };

    walletProofRef.current = proof;
    return proof;
  }, [wallet.signMessage, walletAddress]);

  const getToggleEmergencyPauseProof = useCallback(async (agentId: string, emergencyPause: boolean) => {
    if (!walletAddress) {
      throw new Error('Connect a Solana wallet before using the kill switch.');
    }

    if (!wallet.signMessage) {
      throw new Error('This wallet does not support message signing. Use Backpack or Phantom.');
    }

    const timestamp = Date.now();
    const message = [
      'SolanaGuard action authorization',
      `Wallet: ${walletAddress}`,
      `Timestamp: ${timestamp}`,
      'Action: toggle-emergency-pause',
      `Agent ID: ${agentId}`,
      `Emergency Pause: ${emergencyPause ? 'true' : 'false'}`
    ].join('\n');
    const signature = await wallet.signMessage(new TextEncoder().encode(message));

    return {
      walletAddress,
      message,
      signature: bytesToBase64(signature),
      timestamp
    };
  }, [wallet.signMessage, walletAddress]);

  const refreshStats = useCallback(async (proofOverride?: WalletProof) => {
    if (!functionsReady) {
      setStatsState('error');
      setStatsError('Missing VITE_INSFORGE_FUNCTIONS_URL. Backend stats are not connected.');
      return;
    }

    setStatsState('loading');
    setStatsError('');
    try {
      const walletProof = proofOverride ?? await getWalletProof();
      const data = await invokeFunction<any>('get-dashboard-stats', { walletProof });
      const normalized = normalizeStats(data);
      setStats(normalized);
      const statsAgents = extractAgents(data, 'backend');
      if (statsAgents.length > 0) {
        setKnownAgents(prev => mergeAgents(prev, statsAgents));
        setEmergencyPauseByAgent(prev => {
          const next = { ...prev };
          statsAgents.forEach(agent => {
            if (typeof agent.emergencyPause === 'boolean') {
              next[agent.id] = agent.emergencyPause;
            }
          });
          return next;
        });
      }
      setStatsState('success');
    } catch (error) {
      setStatsState('error');
      setStatsError(getErrorMessage(error));
    }
  }, [functionsReady, getWalletProof, invokeFunction]);

  const refreshAuditLogs = useCallback(async (proofOverride?: WalletProof) => {
    if (!functionsReady) {
      return;
    }

    setAuditState('loading');
    setAuditError('');
    try {
      const walletProof = proofOverride ?? await getWalletProof();
      const data = await invokeFunction<any>('list-audit-logs', { walletProof, limit: 25 });
      setAuditLogs(normalizeAuditLogs(data));
      setAuditState('success');
    } catch (error) {
      setAuditState('error');
      setAuditError(getErrorMessage(error));
    }
  }, [functionsReady, getWalletProof, invokeFunction]);

  const refreshTransactionHistory = useCallback(async (proofOverride?: WalletProof) => {
    if (!functionsReady) {
      return;
    }

    setHistoryState('loading');
    setHistoryError('');
    try {
      const walletProof = proofOverride ?? await getWalletProof();
      const data = await invokeFunction<any>('list-transaction-requests', { walletProof, limit: 25 });
      setTransactionHistory(normalizeTransactionRequests(data));
      setHistoryState('success');
    } catch (error) {
      setHistoryState('error');
      setHistoryError(getErrorMessage(error));
    }
  }, [functionsReady, getWalletProof, invokeFunction]);

  const refreshBackendData = useCallback(async (proofOverride?: WalletProof) => {
    if (!functionsReady) {
      setStatsState('error');
      setStatsError('Missing VITE_INSFORGE_FUNCTIONS_URL. Backend stats are not connected.');
      setAuditState('idle');
      setHistoryState('idle');
      return;
    }

    let walletProof: WalletProof;
    try {
      walletProof = proofOverride ?? await getWalletProof();
    } catch {
      setStatsState('error');
      setStatsError(WALLET_SIGNATURE_ERROR);
      setAuditState('error');
      setAuditError(WALLET_SIGNATURE_ERROR);
      setHistoryState('error');
      setHistoryError(WALLET_SIGNATURE_ERROR);
      return;
    }

    try {
      await Promise.all([
        refreshStats(walletProof),
        refreshAuditLogs(walletProof),
        refreshTransactionHistory(walletProof),
      ]);
    } catch (error) {
      const message = getErrorMessage(error);
      setStatsState('error');
      setStatsError(message);
      setAuditState('error');
      setAuditError(message);
      setHistoryState('error');
      setHistoryError(message);
    }
  }, [functionsReady, getWalletProof, refreshAuditLogs, refreshStats, refreshTransactionHistory]);

  const refreshBackendDataSafely = useCallback(() => {
    void refreshBackendData().catch(() => {
      setStatsState('error');
      setStatsError(WALLET_SIGNATURE_ERROR);
      setAuditState('error');
      setAuditError(WALLET_SIGNATURE_ERROR);
      setHistoryState('error');
      setHistoryError(WALLET_SIGNATURE_ERROR);
    });
  }, [refreshBackendData]);

  useEffect(() => {
    walletProofRef.current = null;
    setStats(createEmptyStats());
    setStatsState(walletAddress && FUNCTION_BASE ? 'loading' : 'idle');
    setStatsError('');
    setAuditLogs([]);
    setAuditState('idle');
    setAuditError('');
    setTransactionHistory([]);
    setHistoryState('idle');
    setHistoryError('');
    setEmergencyPauseByAgent({});
    setKnownAgents([]);
    setSelectedAgentId('');
    setCreatedAgentId('');
    setCreatedPolicyId('');
    setEvaluation(null);
    setAgentState('idle');
    setPolicyState('idle');
    setEvaluationState('idle');
    setPauseState('idle');
  }, [walletAddress]);

  useEffect(() => {
    if (wallet.connected) {
      refreshBackendDataSafely();
    }
  }, [refreshBackendDataSafely, wallet.connected]);

  useEffect(() => {
    if (createdAgentId && !selectedAgentId) {
      setSelectedAgentId(createdAgentId);
    }
  }, [createdAgentId, selectedAgentId]);

  const selectedPreset = useMemo(
    () => presets.find(preset => preset.id === transactionForm.presetId),
    [transactionForm.presetId]
  );

  const agentOptions = knownAgents;
  const selectedAgent = agentOptions.find(agent => agent.id === selectedAgentId);
  const selectedEmergencyPause = selectedAgentId
    ? emergencyPauseByAgent[selectedAgentId] ?? selectedAgent?.emergencyPause ?? false
    : false;
  const selectedEmergencyPauseKnown = Boolean(selectedAgentId)
    && (Object.prototype.hasOwnProperty.call(emergencyPauseByAgent, selectedAgentId) || typeof selectedAgent?.emergencyPause === 'boolean');
  const decision = normalizeDecision(evaluation?.decision);
  const matchedRules = evaluation?.matchedPolicyRules ?? evaluation?.matchedRules ?? [];

  const handlePresetChange = (presetId: string) => {
    if (presetId === 'custom') {
      setTransactionForm(prev => ({
        ...prev,
        presetId,
      }));
      return;
    }

    const preset = presets.find(item => item.id === presetId);
    if (!preset) return;
    setTransactionForm(prev => ({
      ...prev,
      presetId,
      amount: preset.amount,
      programId: preset.programId,
      recipient: preset.recipient,
      transactionType: preset.transactionType,
      memo: preset.description,
    }));
  };

  const seedDemoData = async () => {
    if (!wallet.connected) {
      showToast('Connect wallet first.', 'error');
      return;
    }

    setSeedState('loading');
    try {
      const walletProof = await getWalletProof();
      const data = await invokeFunction<any>('seed-demo-data', { walletProof });
      const demoAgents = extractAgents(data, 'demo');
      if (demoAgents.length > 0) {
        setKnownAgents(prev => mergeAgents(prev, demoAgents));
        setSelectedAgentId(current => current || demoAgents[0].id);
      }
      showToast('Demo data seeded from InsForge.', 'success');
      setSeedState('success');
      await refreshBackendData(walletProof);
    } catch (error) {
      setSeedState('error');
      showToast(getErrorMessage(error), 'error');
    }
  };

  const createAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!walletAddress) {
      showToast('Connect a Solana wallet before registering an agent.', 'error');
      return;
    }

    setAgentState('loading');
    try {
      const walletProof = await getWalletProof();
      const data = await invokeFunction<any>('create-agent', {
        name: agentForm.name,
        agentName: agentForm.name,
        description: agentForm.description,
        walletProof,
        cluster: 'devnet',
      });

      const id = String(data?.id ?? data?.agentId ?? data?.agent?.id ?? '');
      if (!id) throw new Error('create-agent did not return an agent ID.');

      const agent: AgentRecord = {
        id,
        name: String(data?.name ?? data?.agent?.name ?? agentForm.name),
        walletAddress,
        source: 'created',
      };

      setCreatedAgentId(id);
      setSelectedAgentId(id);
      setKnownAgents(prev => mergeAgents(prev, [agent]));
      setAgentState('success');
      showToast(data?.existing ? 'Wallet already registered. Existing agent selected.' : 'Agent registered with InsForge.', data?.existing ? 'info' : 'success');
      await refreshBackendData(walletProof);
    } catch (error) {
      setAgentState('error');
      showToast(getErrorMessage(error), 'error');
    }
  };

  const createPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAgentId) {
      showToast('Select an agent before creating a policy.', 'error');
      return;
    }

    try {
      const maxTransactionAmount = parseNonNegativeNumber(policyForm.maxTransactionAmount, 'Max transaction amount');
      const dailySpendingLimit = parseNonNegativeNumber(policyForm.dailySpendingLimit, 'Daily spending limit');
      const manualApprovalThreshold = parseNonNegativeNumber(policyForm.manualApprovalThreshold, 'Manual approval threshold');
      const walletProof = await getWalletProof();

      setPolicyState('loading');
      const data = await invokeFunction<PolicyResult>('create-policy', {
        agentId: selectedAgentId,
        walletProof,
        maxTransactionAmount,
        dailySpendingLimit,
        manualApprovalThreshold,
        allowedProgramIds: splitLines(policyForm.allowedProgramIds),
        blockedProgramIds: splitLines(policyForm.blockedProgramIds),
        emergencyPaused: policyForm.emergencyPaused,
      });

      const id = String(data?.policyId ?? data?.id ?? '');
      setCreatedPolicyId(id || 'created');
      setAgentEmergencyPause(selectedAgentId, Boolean(data?.emergencyPause ?? data?.emergency_pause ?? policyForm.emergencyPaused));
      setPolicyState('success');
      showToast('Policy created through InsForge.', 'success');
      await refreshBackendData(walletProof);
    } catch (error) {
      setPolicyState('error');
      showToast(getErrorMessage(error), 'error');
    }
  };

  const evaluateTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAgentId) {
      showToast('Select or create an agent before running a simulation.', 'error');
      return;
    }

    try {
      const amount = parseNonNegativeNumber(transactionForm.amount, 'Transaction amount');
      const programId = transactionForm.programId.trim();
      const recipient = transactionForm.recipient.trim();
      const transactionType = transactionForm.transactionType.trim();
      const memo = transactionForm.memo.trim();
      const walletProof = await getWalletProof();

      setEvaluationState('loading');
      setEvaluation(null);
      const data = await invokeFunction<EvaluationResult>('evaluate-transaction', {
        agentId: selectedAgentId,
        walletProof,
        amount,
        amountSol: amount,
        programId,
        recipient,
        destination: recipient,
        transactionType,
        intentType: transactionType,
        memo,
        cluster: 'devnet',
        transaction: {
          amount,
          amountSol: amount,
          programId,
          recipient,
          destination: recipient,
          transactionType,
          intentType: transactionType,
          memo,
          cluster: 'devnet',
        },
      });

      setEvaluation(data);
      setEvaluationState('success');
      showToast('Transaction evaluated by InsForge.', 'success');
      await refreshBackendData(walletProof);
    } catch (error) {
      setEvaluationState('error');
      showToast(getErrorMessage(error), 'error');
    }
  };

  const toggleEmergencyPause = async (emergencyPause: boolean) => {
    if (!selectedAgentId) {
      showToast('Select an agent before using the kill switch.', 'error');
      return;
    }

    setPauseState('loading');
    try {
      const walletProof = await getToggleEmergencyPauseProof(selectedAgentId, emergencyPause);
      const data = await invokeFunction<any>('toggle-emergency-pause', {
        agentId: selectedAgentId,
        emergencyPause,
        walletProof,
      });
      const nextPause = Boolean(data?.emergencyPause ?? data?.emergency_pause ?? emergencyPause);
      setAgentEmergencyPause(selectedAgentId, nextPause);
      setPauseState('success');
      showToast(nextPause ? 'Emergency pause enabled.' : 'Emergency pause disabled.', nextPause ? 'info' : 'success');
      await refreshBackendData();
    } catch (error) {
      setPauseState('error');
      showToast(getErrorMessage(error), 'error');
    }
  };

  if (page === 'demo')
    return (
      <GuestDemo
        onExit={() => navigate('home')}
        onConsole={() => navigate('console')}
      />
    );
  if (page === 'home')
    return (
      <Homepage
        onViewDemo={() => navigate('demo')}
        onOpenConsole={() => navigate('console')}
      />
    );

  return (
    <ConsoleShell
      connected={wallet.connected}
      walletAddress={walletAddress}
      onHome={() => navigate('home')}
      onDemo={() => navigate('demo')}
    >
      <section className="workspace" aria-label="SolanaGuard dashboard">
        <section className="stats-section panel" aria-labelledby="stats-title">
          <div className="section-header">
            <div>
              <h2 id="stats-title">Your activity</h2>
            </div>
            <div className="header-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={seedDemoData}
                disabled={
                  !wallet.connected ||
                  !functionsReady ||
                  seedState === 'loading'
                }
              >
                {seedState === 'loading'
                  ? 'Adding examples...'
                  : 'Add example agents'}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={refreshBackendDataSafely}
                disabled={
                  !wallet.connected ||
                  !functionsReady ||
                  statsState === 'loading' ||
                  auditState === 'loading' ||
                  historyState === 'loading'
                }
              >
                {statsState === 'loading'
                  ? 'Refreshing...'
                  : 'Refresh activity'}
              </button>
            </div>
          </div>

          {!wallet.connected ? (
            <>
              <div className="stats-grid">
                {[
                  'Registered agents',
                  'Linked wallets',
                  'Evaluated requests',
                  'Blocked requests',
                  'Open alerts',
                  'Average risk',
                ].map(label => (
                  <StatTile key={label} label={label} value="—" />
                ))}
              </div>
              <p className="stats-note">
                Connect a wallet to load your activity. A wallet signature is
                required to access its records.
              </p>
            </>
          ) : !functionsReady ? (
            <ConfigNotice />
          ) : statsState === 'loading' || statsState === 'idle' ? (
            <StatsSkeleton />
          ) : statsState === 'error' ? (
            <InlineError
              message={statsError}
              actionLabel="Retry stats"
              onAction={refreshBackendDataSafely}
            />
          ) : (
            <div className="stats-grid">
              <StatTile label="Registered agents" value={stats.agents} />
              <StatTile label="Linked wallets" value={stats.protectedWallets} />
              <StatTile
                label="Evaluated requests"
                value={stats.transactionsChecked}
              />
              <StatTile
                label="Blocked requests"
                value={stats.blockedTransactions}
                tone="danger"
              />
              <StatTile
                label="Open alerts"
                value={stats.openAlerts}
                tone="warning"
              />
              <StatTile
                label="Average risk"
                value={formatNumber(stats.averageRiskScore, 1)}
                tone="accent"
              />
            </div>
          )}
        </section>

        <ConsoleGuide />
        <div className="product-grid">
          <section
            className="panel"
            id="console-agents"
            data-console-section
            aria-labelledby="agent-title"
          >
            <div className="section-header">
              <div>
                <h2 id="agent-title">Register an agent</h2>
                <p>Give your agent a name and link it to your wallet.</p>
              </div>
              {createdAgentId ? (
                <span className="id-pill">Agent {shorten(createdAgentId)}</span>
              ) : null}
            </div>

            <form className="form-stack" onSubmit={createAgent}>
              <Field label="Agent name" htmlFor="agent-name" required>
                <input
                  id="agent-name"
                  className="input"
                  type="text"
                  autoComplete="off"
                  value={agentForm.name}
                  onChange={event =>
                    setAgentForm(prev => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <Field label="Description" htmlFor="agent-description" required>
                <textarea
                  id="agent-description"
                  className="input textarea"
                  value={agentForm.description}
                  onChange={event =>
                    setAgentForm(prev => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <Field label="Wallet address" htmlFor="agent-wallet">
                <input
                  id="agent-wallet"
                  className="input mono"
                  type="text"
                  value={walletAddress || 'Connect wallet to auto-fill'}
                  readOnly
                />
              </Field>

              <button
                className="btn btn-primary btn-full"
                type="submit"
                disabled={
                  !wallet.connected ||
                  !functionsReady ||
                  agentState === 'loading'
                }
              >
                {agentState === 'loading'
                  ? 'Creating agent...'
                  : 'Create agent'}
              </button>
            </form>
          </section>

          <section
            className="panel"
            id="console-policy"
            data-console-section
            aria-labelledby="policy-title"
          >
            <div className="section-header">
              <div>
                <h2 id="policy-title">Build a policy</h2>
                <p>Set limits for the agent you select. Amounts are in SOL.</p>
              </div>
              {createdPolicyId ? (
                <span className="id-pill">
                  Policy {shorten(createdPolicyId)}
                </span>
              ) : null}
            </div>

            <form className="form-stack" onSubmit={createPolicy}>
              <AgentSelect
                id="policy-agent-select"
                agents={agentOptions}
                totalAgents={stats.agents}
                value={selectedAgentId}
                onChange={setSelectedAgentId}
              />

              <div className="two-col">
                <Field
                  label="Per-transaction limit"
                  htmlFor="max-transaction-amount"
                  required
                  hint="SOL-equivalent limit."
                >
                  <input
                    id="max-transaction-amount"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={policyForm.maxTransactionAmount}
                    onChange={event =>
                      setPolicyForm(prev => ({
                        ...prev,
                        maxTransactionAmount: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>

                <Field
                  label="Daily spending limit"
                  htmlFor="daily-spending-limit"
                  required
                >
                  <input
                    id="daily-spending-limit"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={policyForm.dailySpendingLimit}
                    onChange={event =>
                      setPolicyForm(prev => ({
                        ...prev,
                        dailySpendingLimit: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
              </div>

              <Field
                label="Manual approval threshold"
                htmlFor="manual-threshold"
                required
                hint="Requests above this SOL amount are flagged with a warning."
              >
                <input
                  id="manual-threshold"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={policyForm.manualApprovalThreshold}
                  onChange={event =>
                    setPolicyForm(prev => ({
                      ...prev,
                      manualApprovalThreshold: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <details className="permissions">
                <summary>Program permissions</summary>
                <div className="two-col">
                  <Field
                    label="Allowed program IDs"
                    htmlFor="allowed-programs"
                    hint="One program ID per line."
                  >
                    <textarea
                      id="allowed-programs"
                      className="input textarea mono"
                      value={policyForm.allowedProgramIds}
                      onChange={event =>
                        setPolicyForm(prev => ({
                          ...prev,
                          allowedProgramIds: event.target.value,
                        }))
                      }
                      spellCheck={false}
                    />
                  </Field>

                  <Field
                    label="Blocked program IDs"
                    htmlFor="blocked-programs"
                    hint="One program ID per line."
                  >
                    <textarea
                      id="blocked-programs"
                      className="input textarea mono"
                      value={policyForm.blockedProgramIds}
                      onChange={event =>
                        setPolicyForm(prev => ({
                          ...prev,
                          blockedProgramIds: event.target.value,
                        }))
                      }
                      spellCheck={false}
                    />
                  </Field>
                </div>
              </details>

              <label className="toggle-row" htmlFor="emergency-paused">
                <input
                  id="emergency-paused"
                  type="checkbox"
                  checked={policyForm.emergencyPaused}
                  onChange={event =>
                    setPolicyForm(prev => ({
                      ...prev,
                      emergencyPaused: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Start this policy paused</strong>
                  <small>
                    The policy engine will block requests while the agent is
                    paused.
                  </small>
                </span>
              </label>

              <div className="toggle-row">
                <input
                  id="active-emergency-pause"
                  type="checkbox"
                  checked={selectedEmergencyPause}
                  onChange={event => toggleEmergencyPause(event.target.checked)}
                  disabled={
                    !wallet.connected ||
                    !functionsReady ||
                    !selectedAgentId ||
                    pauseState === 'loading'
                  }
                />
                <label htmlFor="active-emergency-pause">
                  <strong>Pause active agent</strong>
                  <small>
                    {selectedAgentId
                      ? `Current: ${selectedEmergencyPauseKnown ? (selectedEmergencyPause ? 'enabled' : 'disabled') : 'unknown until policy update'}`
                      : 'Select an agent to toggle emergency pause.'}
                  </small>
                </label>
              </div>

              <button
                className="btn btn-primary btn-full"
                type="submit"
                disabled={
                  !wallet.connected ||
                  !functionsReady ||
                  !selectedAgentId ||
                  policyState === 'loading'
                }
              >
                {policyState === 'loading'
                  ? 'Creating policy...'
                  : 'Create policy'}
              </button>
            </form>
          </section>
        </div>

        <section
          className="panel simulator"
          id="console-simulator"
          data-console-section
          aria-labelledby="simulator-title"
        >
          <div className="section-header">
            <div>
              <h2 id="simulator-title">Check before you act.</h2>
              <p>
                Evaluate an intent against the selected agent’s policy. No funds
                are moved.
              </p>
            </div>
            <span className="id-pill">
              {selectedAgent ? selectedAgent.name : 'No agent selected'}
            </span>
          </div>

          <div
            className="sg-console-presets"
            role="group"
            aria-label="Transaction presets"
          >
            {presets.map(preset => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={transactionForm.presetId === preset.id}
                onClick={() => handlePresetChange(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="simulator-grid">
            <form className="form-stack" onSubmit={evaluateTransaction}>
              <AgentSelect
                id="simulator-agent-select"
                agents={agentOptions}
                totalAgents={stats.agents}
                value={selectedAgentId}
                onChange={setSelectedAgentId}
              />

              <Field label="Preset" htmlFor="transaction-preset">
                <select
                  id="transaction-preset"
                  className="input"
                  value={transactionForm.presetId}
                  onChange={event => handlePresetChange(event.target.value)}
                >
                  {presets.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom">Custom transaction</option>
                </select>
                {selectedPreset ? (
                  <p className="field-hint">{selectedPreset.description}</p>
                ) : null}
              </Field>

              <div className="two-col">
                <Field label="Amount" htmlFor="transaction-amount" required>
                  <input
                    id="transaction-amount"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={transactionForm.amount}
                    onChange={event =>
                      setTransactionForm(prev => ({
                        ...prev,
                        amount: event.target.value,
                        presetId: 'custom',
                      }))
                    }
                    required
                  />
                </Field>

                <Field label="Type" htmlFor="transaction-type" required>
                  <input
                    id="transaction-type"
                    className="input"
                    type="text"
                    autoComplete="off"
                    value={transactionForm.transactionType}
                    onChange={event =>
                      setTransactionForm(prev => ({
                        ...prev,
                        transactionType: event.target.value,
                        presetId: 'custom',
                      }))
                    }
                    required
                  />
                </Field>
              </div>

              <Field label="Program ID" htmlFor="transaction-program" required>
                <input
                  id="transaction-program"
                  className="input mono"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={transactionForm.programId}
                  onChange={event =>
                    setTransactionForm(prev => ({
                      ...prev,
                      programId: event.target.value,
                      presetId: 'custom',
                    }))
                  }
                  required
                />
              </Field>

              <Field label="Recipient" htmlFor="transaction-recipient">
                <input
                  id="transaction-recipient"
                  className="input mono"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={transactionForm.recipient}
                  onChange={event =>
                    setTransactionForm(prev => ({
                      ...prev,
                      recipient: event.target.value,
                      presetId: 'custom',
                    }))
                  }
                />
              </Field>

              <Field label="Memo" htmlFor="transaction-memo">
                <textarea
                  id="transaction-memo"
                  className="input textarea"
                  value={transactionForm.memo}
                  onChange={event =>
                    setTransactionForm(prev => ({
                      ...prev,
                      memo: event.target.value,
                      presetId: 'custom',
                    }))
                  }
                />
              </Field>

              <button
                className="btn btn-primary btn-full"
                type="submit"
                disabled={
                  !wallet.connected ||
                  !functionsReady ||
                  !selectedAgentId ||
                  evaluationState === 'loading'
                }
              >
                {evaluationState === 'loading'
                  ? 'Evaluating...'
                  : 'Evaluate intent'}
              </button>
            </form>

            <EvaluationPanel
              state={evaluationState}
              evaluation={evaluation}
              decision={decision}
              matchedRules={matchedRules}
            />
          </div>
        </section>

        <section
          className="sg-console-activity"
          id="console-activity"
          data-console-section
          aria-labelledby="activity-title"
        >
          <h2 id="activity-title">A record of every decision.</h2>
          <p>Inspect the requests and audit events returned for your wallet.</p>
          <nav aria-label="Activity records">
            <a href="#console-history">Transaction history</a>
            <a href="#console-audit">Audit log</a>
          </nav>
          <section
            className="panel history-panel"
            id="console-history"
            aria-labelledby="history-title"
          >
            <div className="section-header">
              <div>
                <h2 id="history-title">Transaction history</h2>
              </div>
            </div>

            {!wallet.connected ? (
              <ConsoleRecordsEmpty kind="history">
                Connect a wallet to view its records. Evaluated requests will
                appear here.
              </ConsoleRecordsEmpty>
            ) : historyState === 'error' ? (
              <InlineError
                message={historyError}
                actionLabel="Retry history"
                onAction={() => refreshTransactionHistory()}
              />
            ) : historyState === 'loading' ? (
              <LoadingPanel label="Loading transaction history" />
            ) : transactionHistory.length === 0 ? (
              <div className="empty-state">
                <strong>No evaluations yet</strong>
                <p>Evaluate an intent to see its request and decision here.</p>
              </div>
            ) : (
              <div className="table-wrap" tabIndex={0}>
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Decision</th>
                      <th>Amount</th>
                      <th>Type</th>
                      <th>Program</th>
                      <th>Reason</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionHistory.map((request, index) => {
                      const rowDecision = normalizeDecision(request.decision);
                      return (
                        <tr key={request.id ?? index}>
                          <td>
                            <span className={`decision-chip ${rowDecision}`}>
                              {rowDecision}
                            </span>
                          </td>
                          <td>
                            {formatNumber(Number(request.amountSol ?? 0), 3)}{' '}
                            SOL
                          </td>
                          <td>{request.intentType ?? 'Not returned'}</td>
                          <td className="mono">
                            {shorten(request.programId, 8, 6)}
                          </td>
                          <td>{request.reason || 'No reason returned'}</td>
                          <td>
                            {request.evaluatedAt ??
                              request.createdAt ??
                              'Not returned'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            className="panel audit-panel"
            id="console-audit"
            aria-labelledby="audit-title"
          >
            <div className="section-header">
              <div>
                <h2 id="audit-title">Audit log</h2>
              </div>
            </div>

            {!wallet.connected ? (
              <ConsoleRecordsEmpty kind="audit">
                Connect a wallet to view its audit log. Policy decisions and
                pause events will appear here.
              </ConsoleRecordsEmpty>
            ) : auditState === 'error' ? (
              <InlineError
                message={auditError}
                actionLabel="Retry audit logs"
                onAction={() => refreshAuditLogs()}
              />
            ) : auditState === 'loading' ? (
              <LoadingPanel label="Loading audit logs" />
            ) : auditLogs.length === 0 ? (
              <div className="empty-state">
                <strong>No audit events yet</strong>
                <p>
                  Evaluate an intent or update emergency pause to create an
                  audit event.
                </p>
              </div>
            ) : (
              <div className="table-wrap" tabIndex={0}>
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Decision</th>
                      <th>Risk</th>
                      <th>Reason</th>
                      <th>Audit ID</th>
                      <th>Request ID</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, index) => {
                      const rowDecision = normalizeDecision(log.decision);
                      return (
                        <tr key={log.id ?? log.auditLogId ?? index}>
                          <td>
                            <span className={`decision-chip ${rowDecision}`}>
                              {rowDecision}
                            </span>
                          </td>
                          <td>{Number(log.riskScore ?? 0)}</td>
                          <td>
                            {log.reason ||
                              log.transactionType ||
                              'No reason returned'}
                          </td>
                          <td className="mono">
                            {shorten(log.auditLogId ?? log.id)}
                          </td>
                          <td className="mono">
                            {shorten(log.transactionRequestId)}
                          </td>
                          <td>
                            {log.createdAt ?? log.timestamp ?? 'Not returned'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </section>

      {toast ? (
        <div className={`toast ${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
    </ConsoleShell>
  );
};

const mergeAgents = (current: AgentRecord[], next: AgentRecord[]) => {
  const byId = new Map<string, AgentRecord>();
  current.forEach(agent => byId.set(agent.id, agent));
  next.forEach(agent => {
    const existing = byId.get(agent.id);
    byId.set(agent.id, {
      ...existing,
      ...agent,
      emergencyPause: agent.emergencyPause ?? existing?.emergencyPause,
    });
  });
  return Array.from(byId.values());
};

const splitLines = (value: string) => value
  .split(/[\n,]/)
  .map(item => item.trim())
  .filter(Boolean);

const GuestDemo: React.FC<{ onExit: () => void; onConsole: () => void }> = ({
  onExit,
  onConsole,
}) => {
  const [scenarioId, setScenarioId] = useState(GUEST_SCENARIOS[0].id);
  const scenario =
    GUEST_SCENARIOS.find(item => item.id === scenarioId) ?? GUEST_SCENARIOS[0];

  return (
    <ConsoleShell demo onHome={onExit} onConsole={onConsole}>
      <section className="guest-workspace" aria-label="SolanaGuard demo">
        <div className="guest-row">
          <section
            className="panel"
            id="demo-agents"
            data-console-section
            aria-labelledby="guest-agent-title"
          >
            <div className="section-header">
              <div>
                <h2 id="guest-agent-title">Example agent</h2>
                <p>
                  A sample wallet and agent. This is not a registered account.
                </p>
              </div>
            </div>
            <div className="wallet-details">
              <span className="connection-dot connected" aria-hidden="true" />
              <div>
                <strong>{GUEST_AGENT.name}</strong>
                <p className="mono">
                  {shorten(GUEST_AGENT.walletAddress, 8, 8)}
                </p>
              </div>
            </div>
          </section>

          <section
            className="panel"
            id="demo-policy"
            data-console-section
            aria-labelledby="guest-policy-title"
          >
            <div className="section-header">
              <div>
                <h2 id="guest-policy-title">Example policy</h2>
                <p>
                  Scenarios below use these limits, with a separate paused-agent
                  example.
                </p>
              </div>
              <span
                className={`decision-chip ${GUEST_POLICY.emergencyPause ? 'blocked' : 'allowed'}`}
              >
                {GUEST_POLICY.emergencyPause ? 'Paused' : 'Active'}
              </span>
            </div>
            <dl className="result-list guest-policy-list">
              <div>
                <dt>Per-transaction limit</dt>
                <dd>{GUEST_POLICY.maxTransactionAmount} SOL</dd>
              </div>
              <div>
                <dt>Daily spending limit</dt>
                <dd>{GUEST_POLICY.dailySpendingLimit} SOL</dd>
              </div>
              <div>
                <dt>Manual approval threshold</dt>
                <dd>{GUEST_POLICY.manualApprovalThreshold} SOL</dd>
              </div>
              <div>
                <dt>Allowed programs</dt>
                <dd>{GUEST_POLICY.allowedPrograms}</dd>
              </div>
              <div>
                <dt>Blocked programs</dt>
                <dd>{GUEST_POLICY.blockedPrograms}</dd>
              </div>
              <div>
                <dt>Emergency pause</dt>
                <dd>{GUEST_POLICY.emergencyPause ? 'Enabled' : 'Disabled'}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section
          className="panel"
          id="demo-simulator"
          data-console-section
          aria-labelledby="guest-sim-title"
        >
          <div className="section-header">
            <div>
              <h2 id="guest-sim-title">Check before you act.</h2>
              <p>
                Select a scenario to inspect an illustrative policy decision.
              </p>
            </div>
            <span className="id-pill">{scenario.label}</span>
          </div>

          <div className="simulator-grid">
            <div className="form-stack">
              <div className="field">
                <label id="guest-scenario-label">Example scenarios</label>
                <div
                  className="agent-picker"
                  role="group"
                  aria-labelledby="guest-scenario-label"
                >
                  {GUEST_SCENARIOS.map(item => {
                    const active = item.id === scenario.id;
                    return (
                      <button
                        key={item.id}
                        className={`agent-option ${active ? 'active' : ''}`}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setScenarioId(item.id)}
                      >
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.sublabel}</small>
                        </span>
                        <span className={`decision-chip ${item.decision}`}>
                          {item.decision}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="field-hint">
                  Examples are predefined, not a live backend evaluation.
                </p>
              </div>
              <div className="sg-console-scenario-controls">
                <span>
                  Example{' '}
                  {GUEST_SCENARIOS.findIndex(item => item.id === scenario.id) +
                    1}{' '}
                  of {GUEST_SCENARIOS.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setScenarioId(
                      GUEST_SCENARIOS[
                        (GUEST_SCENARIOS.findIndex(
                          item => item.id === scenario.id,
                        ) +
                          1) %
                          GUEST_SCENARIOS.length
                      ].id,
                    )
                  }
                >
                  Next example →
                </button>
              </div>
            </div>

            <aside
              className={`result-panel ${scenario.decision}`}
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="decision-header">
                <span>Decision</span>
                <strong>{scenario.decision}</strong>
              </div>
              <dl className="result-list">
                <div>
                  <dt>Amount</dt>
                  <dd>{formatNumber(scenario.amountSol, 2)} SOL</dd>
                </div>
                <div>
                  <dt>Program</dt>
                  <dd>
                    {scenario.programLabel}{' '}
                    <span className="mono">
                      ({shorten(scenario.programId, 6, 4)})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Risk score</dt>
                  <dd>{scenario.riskScore}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{scenario.reason}</dd>
                </div>
                <div>
                  <dt>Matched rules</dt>
                  <dd>{scenario.matchedRules.join(', ')}</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section
          className="panel"
          id="demo-activity"
          data-console-section
          aria-labelledby="guest-audit-title"
        >
          <div className="section-header">
            <div>
              <h2 id="guest-audit-title">Example audit log</h2>
              <p>
                Predefined records for these four scenarios. No real
                transactions or timestamps.
              </p>
            </div>
          </div>
          <div className="table-wrap" tabIndex={0}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Decision</th>
                  <th>Amount</th>
                  <th>Program</th>
                  <th>Risk</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {GUEST_SCENARIOS.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className={`decision-chip ${item.decision}`}>
                        {item.decision}
                      </span>
                    </td>
                    <td>{formatNumber(item.amountSol, 2)} SOL</td>
                    <td>{item.programLabel}</td>
                    <td>{item.riskScore}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel guest-cta" aria-labelledby="guest-cta-title">
          <div>
            <h2 id="guest-cta-title">Make the rules for your own agent.</h2>
            <p className="muted">
              Open the console and connect a wallet to register an agent and
              create a policy on devnet.{' '}
            </p>
          </div>
          <button className="btn btn-primary" type="button" onClick={onConsole}>
            Open console <ConsoleIcon name="arrow" />
          </button>
        </section>
      </section>
    </ConsoleShell>
  );
};

const StatTile: React.FC<{
  label: string;
  value: number | string;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger';
}> = ({ label, value, tone = 'neutral' }) => (
  <article className={`stat-tile ${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </article>
);

const StatsSkeleton: React.FC = () => (
  <div className="stats-grid" aria-label="Loading dashboard stats">
    {Array.from({ length: 6 }).map((_, index) => (
      <div className="stat-tile skeleton" key={index} />
    ))}
  </div>
);

const ConfigNotice: React.FC = () => (
  <div className="config-notice" role="status">
    <strong>Policy service is unavailable</strong>
    <p>
      This instance is not connected to its policy service. You can explore the
      read-only demo while setup is completed.
    </p>
  </div>
);

const InlineError: React.FC<{
  message: string;
  actionLabel: string;
  onAction: () => void;
}> = ({ message, actionLabel, onAction }) => (
  <div className="inline-error" role="alert">
    <strong>Backend request failed</strong>
    <p>{message}</p>
    <button className="btn btn-secondary" type="button" onClick={onAction}>
      {actionLabel}
    </button>
  </div>
);

const LoadingPanel: React.FC<{ label: string }> = ({ label }) => (
  <div className="empty-state" aria-busy="true">
    <strong>{label}</strong>
    <p>Waiting for the InsForge backend.</p>
  </div>
);

const Field: React.FC<{
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, required, hint, children }) => (
  <div className="field">
    <label htmlFor={htmlFor}>
      {label}
      {required ? ' *' : ''}
    </label>
    {children}
    {hint ? <p className="field-hint">{hint}</p> : null}
  </div>
);

const AgentSelect: React.FC<{
  id: string;
  agents: AgentRecord[];
  totalAgents: number;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, agents, totalAgents, value, onChange }) => {
  const hint = agents.length
    ? `${agents.length} selectable agent${agents.length === 1 ? '' : 's'}${totalAgents > agents.length ? ` of ${totalAgents} registered agents` : ''}.`
    : 'Connect a wallet and register an agent to continue.';
  return (
    <Field label="Agent" htmlFor={id} required hint={hint}>
      <select
        id={id}
        className="input"
        value={value}
        onChange={event => onChange(event.target.value)}
        required
        disabled={agents.length === 0}
      >
        <option value="" disabled>
          {agents.length ? 'Select an agent' : 'No agents yet'}
        </option>
        {agents.map(agent => (
          <option key={agent.id} value={agent.id}>
            {agent.name} — {shorten(agent.id, 8, 6)}
          </option>
        ))}
      </select>
    </Field>
  );
};

const EvaluationPanel: React.FC<{
  state: RequestState;
  evaluation: EvaluationResult | null;
  decision: Decision;
  matchedRules: Array<string | Record<string, unknown>>;
}> = ({ state, evaluation, decision, matchedRules }) => {
  if (state === 'loading') {
    return (
      <aside className="result-panel" aria-busy="true">
        <div className="result-empty">
          <strong>Evaluating transaction...</strong>
          <p>Waiting for the InsForge policy engine.</p>
        </div>
      </aside>
    );
  }

  if (!evaluation) {
    return (
      <aside className="result-panel">
        <div className="result-empty">
          <ConsoleIcon name="shield" />
          <strong>A decision starts here.</strong>
          <p>
            Choose an agent and evaluate a request to see the risk score,
            matched rules, and reason.
          </p>
          <small>Policy evaluation only. No funds are moved.</small>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`result-panel ${decision}`} aria-live="polite">
      <div className="decision-header">
        <span>Decision</span>
        <strong>{decision}</strong>
      </div>
      <dl className="result-list">
        <div>
          <dt>Risk score</dt>
          <dd>{Number(evaluation.riskScore ?? 0)}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{evaluation.reason || 'No reason returned'}</dd>
        </div>
        <div>
          <dt>Matched rules</dt>
          <dd>
            {matchedRules.length
              ? matchedRules.map(formatRule).join(', ')
              : 'None returned'}
          </dd>
        </div>
        <div>
          <dt>Audit log ID</dt>
          <dd className="mono">{evaluation.auditLogId || 'Not returned'}</dd>
        </div>
        <div>
          <dt>Alert ID</dt>
          <dd className="mono">{evaluation.alertId || 'Not returned'}</dd>
        </div>
      </dl>
    </aside>
  );
};

export default Dashboard;
