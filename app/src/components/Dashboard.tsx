import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

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
    label: 'Manual approval warning',
    description: 'Medium spend that should cross the approval threshold.',
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
    label: 'Max amount block',
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
    label: 'Needs approval',
    sublabel: '0.9 SOL · Token Program',
    amountSol: 0.9,
    programLabel: 'Token Program',
    programId: TOKEN_PROGRAM_ID,
    decision: 'warning',
    riskScore: 60,
    reason: 'Warning: 0.9 SOL is above the 0.75 SOL manual-approval threshold, so the owner must approve it before it can execute.',
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
  const [guestMode, setGuestMode] = useState(false);

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

  if (!wallet.connected) {
    if (guestMode) {
      return <GuestDemo onExit={() => setGuestMode(false)} />;
    }
    return (
      <AccessGate functionsReady={functionsReady} onViewDemo={() => setGuestMode(true)} />
    );
  }

  return (
    <main className="app-shell console-shell">
      <header className="console-header" id="top">
        <nav className="console-nav" aria-label="Primary">
          <a className="brand" href="#top" aria-label="SolanaGuard console">
            <span className="brand-mark" aria-hidden="true">SG</span>
            <span>SolanaGuard</span>
          </a>
          <div className="topbar-actions">
            <span className="network-pill">Devnet</span>
            <WalletMultiButton />
          </div>
        </nav>

        <section className="console-hero">
          <div>
            <p className="eyebrow">Operator console</p>
            <h1>Policy firewall</h1>
            <p>
              InsForge-powered policy engine now. Anchor enforcement next.
            </p>
          </div>
          <div className="wallet-chip">
            <span className="connection-dot connected" aria-hidden="true" />
            <span className="mono">{shorten(walletAddress, 10, 8)}</span>
          </div>
        </section>
      </header>

      <section className="workspace" id="dashboard" aria-label="SolanaGuard dashboard">
        <WalletPanel walletAddress={walletAddress} connected={wallet.connected} />

        <section className="stats-section panel" aria-labelledby="stats-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Dashboard</p>
              <h2 id="stats-title">Backend activity</h2>
            </div>
            <div className="header-actions">
              <button className="btn btn-secondary" type="button" onClick={seedDemoData} disabled={!wallet.connected || !functionsReady || seedState === 'loading'}>
                {!wallet.connected ? 'Connect wallet first' : seedState === 'loading' ? 'Seeding...' : 'Seed demo data'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={refreshBackendDataSafely} disabled={!functionsReady || statsState === 'loading' || auditState === 'loading' || historyState === 'loading'}>
                {statsState === 'loading' ? 'Refreshing...' : 'Refresh stats'}
              </button>
            </div>
          </div>

          {!functionsReady ? (
            <ConfigNotice />
          ) : statsState === 'loading' ? (
            <StatsSkeleton />
          ) : statsState === 'error' ? (
            <InlineError message={statsError} actionLabel="Retry stats" onAction={refreshBackendDataSafely} />
          ) : (
            <div className="stats-grid">
              <StatTile label="Backend agents" value={stats.agents} />
              <StatTile label="Protected wallets" value={stats.protectedWallets} />
              <StatTile label="Transactions checked" value={stats.transactionsChecked} />
              <StatTile label="Blocked transactions" value={stats.blockedTransactions} tone="danger" />
              <StatTile label="Open alerts" value={stats.openAlerts} tone="warning" />
              <StatTile label="Average risk score" value={formatNumber(stats.averageRiskScore, 1)} tone="accent" />
            </div>
          )}
        </section>

        <div className="product-grid">
          <section className="panel" aria-labelledby="agent-title">
            <div className="section-header">
              <div>
                <p className="eyebrow">Agent registry</p>
                <h2 id="agent-title">Register wallet-linked agent</h2>
              </div>
              {createdAgentId ? <span className="id-pill">Agent {shorten(createdAgentId)}</span> : null}
            </div>

            <form className="form-stack" onSubmit={createAgent}>
              <Field label="Agent name" htmlFor="agent-name" required>
                <input
                  id="agent-name"
                  className="input"
                  type="text"
                  autoComplete="off"
                  value={agentForm.name}
                  onChange={event => setAgentForm(prev => ({ ...prev, name: event.target.value }))}
                  required
                />
              </Field>

              <Field label="Description" htmlFor="agent-description" required>
                <textarea
                  id="agent-description"
                  className="input textarea"
                  value={agentForm.description}
                  onChange={event => setAgentForm(prev => ({ ...prev, description: event.target.value }))}
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

              <button className="btn btn-primary btn-full" type="submit" disabled={!wallet.connected || !functionsReady || agentState === 'loading'}>
                {agentState === 'loading' ? 'Creating agent...' : 'Create agent'}
              </button>
            </form>
          </section>

          <section className="panel" aria-labelledby="policy-title">
            <div className="section-header">
              <div>
                <p className="eyebrow">Policy builder</p>
                <h2 id="policy-title">Create risk policy</h2>
              </div>
              {createdPolicyId ? <span className="id-pill">Policy {shorten(createdPolicyId)}</span> : null}
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
                <Field label="Max tx amount" htmlFor="max-transaction-amount" required hint="SOL-equivalent limit.">
                  <input
                    id="max-transaction-amount"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={policyForm.maxTransactionAmount}
                    onChange={event => setPolicyForm(prev => ({ ...prev, maxTransactionAmount: event.target.value }))}
                    required
                  />
                </Field>

                <Field label="Daily spending limit" htmlFor="daily-spending-limit" required>
                  <input
                    id="daily-spending-limit"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={policyForm.dailySpendingLimit}
                    onChange={event => setPolicyForm(prev => ({ ...prev, dailySpendingLimit: event.target.value }))}
                    required
                  />
                </Field>
              </div>

              <Field label="Manual approval threshold" htmlFor="manual-threshold" required hint="SOL amount above which manual approval is required.">
                <input
                  id="manual-threshold"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={policyForm.manualApprovalThreshold}
                  onChange={event => setPolicyForm(prev => ({ ...prev, manualApprovalThreshold: event.target.value }))}
                  required
                />
              </Field>

              <Field label="Allowed program IDs" htmlFor="allowed-programs" hint="One program ID per line.">
                <textarea
                  id="allowed-programs"
                  className="input textarea mono"
                  value={policyForm.allowedProgramIds}
                  onChange={event => setPolicyForm(prev => ({ ...prev, allowedProgramIds: event.target.value }))}
                  spellCheck={false}
                />
              </Field>

              <Field label="Blocked program IDs" htmlFor="blocked-programs" hint="One program ID per line.">
                <textarea
                  id="blocked-programs"
                  className="input textarea mono"
                  value={policyForm.blockedProgramIds}
                  onChange={event => setPolicyForm(prev => ({ ...prev, blockedProgramIds: event.target.value }))}
                  spellCheck={false}
                />
              </Field>

              <label className="toggle-row" htmlFor="emergency-paused">
                <input
                  id="emergency-paused"
                  type="checkbox"
                  checked={policyForm.emergencyPaused}
                  onChange={event => setPolicyForm(prev => ({ ...prev, emergencyPaused: event.target.checked }))}
                />
                <span>
                  <strong>Emergency pause</strong>
                  <small>Initial kill switch value for the policy you create.</small>
                </span>
              </label>

              <div className="toggle-row">
                <input
                  id="active-emergency-pause"
                  type="checkbox"
                  checked={selectedEmergencyPause}
                  onChange={event => toggleEmergencyPause(event.target.checked)}
                  disabled={!functionsReady || !selectedAgentId || pauseState === 'loading'}
                />
                <label htmlFor="active-emergency-pause">
                  <strong>Active policy kill switch</strong>
                  <small>
                    {selectedAgentId
                      ? `Current: ${selectedEmergencyPauseKnown ? (selectedEmergencyPause ? 'enabled' : 'disabled') : 'unknown until policy update'}`
                      : 'Select an agent to toggle emergency pause.'}
                  </small>
                </label>
              </div>

              <button className="btn btn-primary btn-full" type="submit" disabled={!functionsReady || !selectedAgentId || policyState === 'loading'}>
                {policyState === 'loading' ? 'Creating policy...' : 'Create policy'}
              </button>
            </form>
          </section>
        </div>

        <section className="panel simulator" aria-labelledby="simulator-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Transaction simulator</p>
              <h2 id="simulator-title">Evaluate transaction intent</h2>
            </div>
            <span className="id-pill">{selectedAgent ? selectedAgent.name : 'No agent selected'}</span>
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
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                  <option value="custom">Custom transaction</option>
                </select>
                {selectedPreset ? <p className="field-hint">{selectedPreset.description}</p> : null}
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
                    onChange={event => setTransactionForm(prev => ({ ...prev, amount: event.target.value, presetId: 'custom' }))}
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
                    onChange={event => setTransactionForm(prev => ({ ...prev, transactionType: event.target.value, presetId: 'custom' }))}
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
                  onChange={event => setTransactionForm(prev => ({ ...prev, programId: event.target.value, presetId: 'custom' }))}
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
                  onChange={event => setTransactionForm(prev => ({ ...prev, recipient: event.target.value, presetId: 'custom' }))}
                />
              </Field>

              <Field label="Memo" htmlFor="transaction-memo">
                <textarea
                  id="transaction-memo"
                  className="input textarea"
                  value={transactionForm.memo}
                  onChange={event => setTransactionForm(prev => ({ ...prev, memo: event.target.value, presetId: 'custom' }))}
                />
              </Field>

              <button className="btn btn-primary btn-full" type="submit" disabled={!functionsReady || !selectedAgentId || evaluationState === 'loading'}>
                {evaluationState === 'loading' ? 'Evaluating...' : 'Run simulation'}
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

        <section className="panel history-panel" aria-labelledby="history-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Transaction history</p>
              <h2 id="history-title">Recent evaluations</h2>
            </div>
            <span className="id-pill">From list-transaction-requests</span>
          </div>

          {historyState === 'error' ? (
            <InlineError message={historyError} actionLabel="Retry history" onAction={() => refreshTransactionHistory()} />
          ) : historyState === 'loading' ? (
            <LoadingPanel label="Loading transaction history" />
          ) : transactionHistory.length === 0 ? (
            <div className="empty-state">
              <strong>No transaction history returned</strong>
              <p>Run a transaction simulation to create backend transaction request rows for this wallet.</p>
            </div>
          ) : (
            <div className="table-wrap">
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
                        <td><span className={`decision-chip ${rowDecision}`}>{rowDecision}</span></td>
                        <td>{formatNumber(Number(request.amountSol ?? 0), 3)} SOL</td>
                        <td>{request.intentType ?? 'Not returned'}</td>
                        <td className="mono">{shorten(request.programId, 8, 6)}</td>
                        <td>{request.reason || 'No reason returned'}</td>
                        <td>{request.evaluatedAt ?? request.createdAt ?? 'Not returned'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="audit-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Audit panel</p>
              <h2 id="audit-title">Recent backend audit activity</h2>
            </div>
            <span className="id-pill">From list-audit-logs</span>
          </div>

          {auditState === 'error' ? (
            <InlineError message={auditError} actionLabel="Retry audit logs" onAction={() => refreshAuditLogs()} />
          ) : auditState === 'loading' ? (
            <LoadingPanel label="Loading audit logs" />
          ) : auditLogs.length === 0 ? (
            <div className="empty-state">
              <strong>No audit logs returned</strong>
              <p>Run a transaction simulation or use the kill switch to create backend audit rows for this wallet.</p>
            </div>
          ) : (
            <div className="table-wrap">
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
                        <td><span className={`decision-chip ${rowDecision}`}>{rowDecision}</span></td>
                        <td>{Number(log.riskScore ?? 0)}</td>
                        <td>{log.reason || log.transactionType || 'No reason returned'}</td>
                        <td className="mono">{shorten(log.auditLogId ?? log.id)}</td>
                        <td className="mono">{shorten(log.transactionRequestId)}</td>
                        <td>{log.createdAt ?? log.timestamp ?? 'Not returned'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      {toast ? (
        <div className={`toast ${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
    </main>
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

const AccessGate: React.FC<{ functionsReady: boolean; onViewDemo: () => void }> = ({ functionsReady, onViewDemo }) => (
  <main className="gate-shell">
    <nav className="gate-nav" aria-label="Primary">
      <a className="brand" href="#top" aria-label="SolanaGuard home">
        <span className="brand-mark" aria-hidden="true">SG</span>
        <span>SolanaGuard</span>
      </a>
      <div className="topbar-actions">
        <span className="network-pill">Devnet</span>
        <WalletMultiButton />
      </div>
    </nav>

    <section className="gate-stage" id="top">
      <div className="gate-copy">
        <p className="eyebrow">InsForge-powered policy engine now, Anchor enforcement next.</p>
        <h1>Policy firewall for AI-agent Solana wallets</h1>
        <p>
          SolanaGuard checks every transaction an AI agent proposes against an owner-defined
          policy before it runs. Explore a seeded demo instantly, or connect a wallet to
          register real agents and policies.
        </p>
        <div className="gate-actions">
          <button className="btn btn-primary" type="button" onClick={onViewDemo}>
            View demo without wallet
          </button>
          <WalletMultiButton />
          <span className="gate-note">Demo is read-only · wallet unlocks real usage</span>
        </div>
      </div>

      <aside className="gate-visual" aria-label="SolanaGuard access status">
        <div className="aperture" aria-hidden="true">
          <span className="aperture-core" />
          <span className="aperture-ring ring-a" />
          <span className="aperture-ring ring-b" />
          <span className="aperture-line line-a" />
          <span className="aperture-line line-b" />
        </div>
        <div className="gate-ledger">
          <div>
            <span>Cluster</span>
            <strong>devnet</strong>
          </div>
          <div>
            <span>Demo</span>
            <strong>no wallet needed</strong>
          </div>
          <div>
            <span>Function base</span>
            <strong>{functionsReady ? 'configured' : 'missing env'}</strong>
          </div>
        </div>
      </aside>
    </section>
  </main>
);

const GuestDemo: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [scenarioId, setScenarioId] = useState(GUEST_SCENARIOS[0].id);
  const scenario = GUEST_SCENARIOS.find(item => item.id === scenarioId) ?? GUEST_SCENARIOS[0];

  return (
    <main className="app-shell console-shell">
      <header className="console-header" id="top">
        <nav className="console-nav" aria-label="Primary">
          <a className="brand" href="#top" aria-label="SolanaGuard console">
            <span className="brand-mark" aria-hidden="true">SG</span>
            <span>SolanaGuard</span>
          </a>
          <div className="topbar-actions">
            <span className="network-pill">Devnet</span>
            <button className="btn btn-secondary" type="button" onClick={onExit}>
              Back
            </button>
            <WalletMultiButton />
          </div>
        </nav>

        <section className="console-hero">
          <div>
            <p className="eyebrow">Guest demo mode</p>
            <h1>Policy firewall</h1>
            <p>See how SolanaGuard evaluates agent transactions — no wallet required.</p>
          </div>
        </section>
      </header>

      <div className="guest-banner" role="note">
        <span>
          <strong>Guest demo mode — seeded, read-only data.</strong> These values are illustrative
          examples, not real activity. Connect a wallet to manage real policies.
        </span>
        <WalletMultiButton />
      </div>

      <section className="guest-workspace" aria-label="SolanaGuard demo">
        <div className="guest-row">
        <section className="panel" aria-labelledby="guest-agent-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Agent registry</p>
              <h2 id="guest-agent-title">Seeded agent</h2>
            </div>
            <span className="id-pill">Demo</span>
          </div>
          <div className="wallet-details">
            <span className="connection-dot connected" aria-hidden="true" />
            <div>
              <strong>{GUEST_AGENT.name}</strong>
              <p className="mono">{shorten(GUEST_AGENT.walletAddress, 8, 8)}</p>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="guest-policy-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Policy builder</p>
              <h2 id="guest-policy-title">Active risk policy</h2>
            </div>
            <span className={`decision-chip ${GUEST_POLICY.emergencyPause ? 'blocked' : 'allowed'}`}>
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

        <section className="panel" aria-labelledby="guest-sim-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Transaction simulator</p>
              <h2 id="guest-sim-title">Try an example decision</h2>
            </div>
            <span className="id-pill">{scenario.label}</span>
          </div>

          <div className="simulator-grid">
            <div className="form-stack">
              <div className="field">
                <label id="guest-scenario-label">Example scenarios</label>
                <div className="agent-picker" role="radiogroup" aria-labelledby="guest-scenario-label">
                  {GUEST_SCENARIOS.map(item => {
                    const active = item.id === scenario.id;
                    return (
                      <button
                        key={item.id}
                        className={`agent-option ${active ? 'active' : ''}`}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setScenarioId(item.id)}
                      >
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.sublabel}</small>
                        </span>
                        <span className={`decision-chip ${item.decision}`}>{item.decision}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="field-hint">Pick a scenario to see how the policy engine would decide.</p>
              </div>
            </div>

            <aside className={`result-panel ${scenario.decision}`}>
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
                  <dd>{scenario.programLabel} <span className="mono">({shorten(scenario.programId, 6, 4)})</span></dd>
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

        <section className="panel" aria-labelledby="guest-audit-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Audit panel</p>
              <h2 id="guest-audit-title">Sample audit log</h2>
            </div>
            <span className="id-pill">Seeded</span>
          </div>
          <div className="table-wrap">
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
                    <td><span className={`decision-chip ${item.decision}`}>{item.decision}</span></td>
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
            <p className="eyebrow">Ready to use it for real?</p>
            <h2 id="guest-cta-title">Connect wallet to create real agents and policies</h2>
            <p className="muted">
              Devnet only · not audited · no mainnet · no real users yet · on-chain fund movement
              (CPI) is still future work. Connecting a wallet opens the live InsForge-backed console.
            </p>
          </div>
          <WalletMultiButton />
        </section>
      </section>
    </main>
  );
};

const WalletPanel: React.FC<{ walletAddress: string; connected: boolean }> = ({ walletAddress, connected }) => (
  <section className="panel wallet-panel" aria-labelledby="wallet-title">
    <div>
      <p className="eyebrow">Wallet panel</p>
      <h2 id="wallet-title">Solana wallet</h2>
      <p className="muted">
        {connected
          ? 'This devnet wallet is linked to agent registration, policy creation, and transaction evaluation.'
          : 'Connect a real devnet wallet before creating agents or evaluating policy.'}
      </p>
    </div>
    <div className="wallet-details">
      <span className={`connection-dot ${connected ? 'connected' : ''}`} aria-hidden="true" />
      <div>
        <strong>{connected ? 'Connected' : 'Disconnected'}</strong>
        <p className="mono">{connected ? walletAddress : 'Backpack or Phantom wallet required'}</p>
      </div>
    </div>
    <WalletMultiButton />
  </section>
);

const StatTile: React.FC<{ label: string; value: number | string; tone?: 'neutral' | 'accent' | 'warning' | 'danger' }> = ({
  label,
  value,
  tone = 'neutral',
}) => (
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
    <div>
      <strong>Function endpoint not configured</strong>
      <p>Add `VITE_INSFORGE_FUNCTIONS_URL` to `app/.env` and restart Vite to enable backend stats, agent creation, policy creation, and transaction simulations.</p>
    </div>
    <code>VITE_INSFORGE_FUNCTIONS_URL=https://.../functions</code>
  </div>
);

const InlineError: React.FC<{ message: string; actionLabel: string; onAction: () => void }> = ({ message, actionLabel, onAction }) => (
  <div className="inline-error" role="alert">
    <strong>Backend request failed</strong>
    <p>{message}</p>
    <button className="btn btn-secondary" type="button" onClick={onAction}>{actionLabel}</button>
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
      {label}{required ? ' *' : ''}
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
  const selected = agents.find(agent => agent.id === value);
  const hint = agents.length
    ? `Showing ${agents.length} selectable agent${agents.length === 1 ? '' : 's'} from backend stats${totalAgents > agents.length ? `; ${totalAgents} total backend agents.` : '.'}`
    : 'Create an agent, refresh stats, or seed demo data first.';

  return (
    <Field label="Agent" htmlFor={id} required hint={hint}>
      <input id={id} type="hidden" value={value} required readOnly />
      <div className="agent-picker" role="radiogroup" aria-label="Agent">
        {agents.length === 0 ? (
          <div className="agent-empty">No selectable agents returned yet</div>
        ) : (
          agents.map(agent => {
            const active = agent.id === value;
            return (
              <button
                key={agent.id}
                className={`agent-option ${active ? 'active' : ''}`}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(agent.id)}
              >
                <span>
                  <strong>{agent.name}</strong>
                  <small>{agent.walletAddress ? shorten(agent.walletAddress, 8, 8) : `${agent.source} agent`}</small>
                </span>
                <code>{shorten(agent.id, 8, 6)}</code>
              </button>
            );
          })
        )}
      </div>
      {selected ? <p className="selected-agent-note">Selected: {selected.name} - {shorten(selected.id, 8, 6)}</p> : null}
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
          <strong>No decision yet</strong>
          <p>Run a preset or custom transaction to see decision, risk score, policy match, audit log ID, and alert ID.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`result-panel ${decision}`}>
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
          <dd>{matchedRules.length ? matchedRules.map(formatRule).join(', ') : 'None returned'}</dd>
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
