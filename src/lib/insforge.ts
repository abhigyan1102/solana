export const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_INSFORGE_FUNCTIONS_URL?.replace(/\/$/, '') ||
  'https://mhzv65qi.functions.insforge.app';

export type Decision = 'allowed' | 'warning' | 'blocked';

export type MatchedPolicyRule = {
  rule: string;
  result: string;
  [key: string]: string | number | boolean | null | undefined;
};

export type AuditLog = {
  id: string;
  action: string;
  reason: string;
  decision: Decision | null;
  risk_score: number | null;
  created_at: string;
};

export type DashboardStats = {
  agents: number;
  wallets: number;
  activePolicies: number;
  transactionRequests: number;
  allowedTransactions: number;
  warningTransactions: number;
  blockedTransactions: number;
  openAlerts: number;
  dailySpendSol: number;
  averageRiskScore: number;
  recentAuditLogs: AuditLog[];
};

export type SeedDemoData = {
  agentId: string;
  walletId: string;
  policyId: string;
  sampleTransactionRequests: Array<{
    id: string;
    decision: Decision;
    reason: string;
    risk_score: number;
    amount_sol: number;
    program_id: string;
  }>;
};

export type AgentResponse = {
  agent: {
    id: string;
    name: string;
    description: string | null;
    status: string;
  };
  wallet: {
    id: string;
    address: string;
    label: string | null;
    network: string;
    status: string;
  } | null;
};

export type PolicyResponse = {
  id: string;
  name: string;
  agent_id: string;
  emergency_pause: boolean;
  max_transaction_amount: number;
  daily_spending_limit: number;
  manual_approval_threshold: number;
  allowed_program_ids: string[];
  blocked_program_ids: string[];
  unknown_program_risk_penalty: number;
  risk_warning_threshold: number;
  risk_block_threshold: number;
};

export type EvaluateTransactionResponse = {
  decision: Decision;
  riskScore: number;
  reason: string;
  matchedPolicyRules: MatchedPolicyRule[];
  auditLogId: string;
  alertId: string | null;
  transactionRequest: {
    id: string;
    amount_sol: number;
    program_id: string;
    destination: string | null;
    status: Decision;
    created_at: string;
  };
};

type FunctionEnvelope<T> = {
  data?: T;
  error?: string;
};

async function callFunction<T>(
  slug: string,
  body?: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${slug}`, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
  });

  const payload = (await response.json()) as FunctionEnvelope<T>;

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `InsForge function ${slug} failed`);
  }

  if (payload.data === undefined) {
    throw new Error(`InsForge function ${slug} returned no data`);
  }

  return payload.data;
}

export const solanaGuardApi = {
  seedDemoData: () => callFunction<SeedDemoData>('seed-demo-data', {}),
  getDashboardStats: () => callFunction<DashboardStats>('get-dashboard-stats', {}, 'GET'),
  createAgent: (input: {
    name: string;
    description: string;
    walletAddress: string;
  }) => callFunction<AgentResponse>('create-agent', input),
  createPolicy: (input: {
    agentId: string;
    policy: Record<string, unknown>;
  }) => callFunction<PolicyResponse>('create-policy', input),
  evaluateTransaction: (input: Record<string, unknown>) =>
    callFunction<EvaluateTransactionResponse>('evaluate-transaction', input)
};
