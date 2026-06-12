import { createAdminClient } from 'npm:@insforge/sdk';
import { PublicKey } from 'npm:@solana/web3.js';
import nacl from 'npm:tweetnacl';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

type JsonRecord = Record<string, unknown>;

type Route = {
  rpc: string;
  requiresWalletProof?: boolean;
  args: (body: JsonRecord, url: URL) => JsonRecord;
};

type WalletProof = {
  walletAddress: string;
  message: string;
  signature: string;
  timestamp: number;
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const WALLET_PROOF_TTL_MS = 5 * 60 * 1000;
const WALLET_PROOF_MAX_FUTURE_SKEW_MS = 30 * 1000;

const routes: Record<string, Route> = {
  'seed-demo-data': {
    rpc: 'seed_demo_data',
    requiresWalletProof: true,
    args: () => ({})
  },
  'create-agent': {
    rpc: 'create_agent',
    requiresWalletProof: true,
    args: (body) => ({
      p_name: body.name,
      p_description: body.description ?? null,
      p_wallet_address: body.walletAddress ?? null
    })
  },
  'create-policy': {
    rpc: 'create_policy',
    requiresWalletProof: true,
    args: (body) => ({
      p_agent_id: body.agentId,
      p_policy: withoutWalletProof(body.policy && typeof body.policy === 'object' && !Array.isArray(body.policy)
        ? body.policy as JsonRecord
        : body)
    })
  },
  'evaluate-transaction': {
    rpc: 'evaluate_transaction',
    requiresWalletProof: true,
    args: (body) => ({
      p_intent: {
        ...withoutWalletProof(body)
      }
    })
  },
  'list-audit-logs': {
    rpc: 'list_audit_logs',
    requiresWalletProof: true,
    args: (body) => ({
      p_wallet_address: body.walletAddress,
      p_limit: body.limit ?? 25
    })
  },
  'list-transaction-requests': {
    rpc: 'list_transaction_requests',
    requiresWalletProof: true,
    args: (body) => ({
      p_wallet_address: body.walletAddress,
      p_limit: body.limit ?? 25
    })
  },
  'toggle-emergency-pause': {
    rpc: 'toggle_emergency_pause',
    requiresWalletProof: true,
    args: (body) => ({
      p_agent_id: body.agentId,
      p_emergency_pause: body.emergencyPause,
      p_wallet_address: body.walletAddress
    })
  },
  'get-dashboard-stats': {
    rpc: 'get_dashboard_stats',
    requiresWalletProof: true,
    args: (body, url) => ({
      p_agent_id: body.agentId ?? url.searchParams.get('agentId'),
      p_wallet_address: body.walletAddress
    })
  }
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

async function readJson(req: Request): Promise<JsonRecord> {
  if (req.method === 'GET') {
    return {};
  }

  const text = await req.text();
  if (!text.trim()) {
    return {};
  }

  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object.');
  }

  return parsed as JsonRecord;
}

function withoutWalletProof(value: JsonRecord): JsonRecord {
  const { walletProof: _walletProof, ...rest } = value;
  return rest;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function parseWalletProof(value: unknown): WalletProof {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError('walletProof is required for wallet-scoped requests.', 401);
  }

  const proof = value as Record<string, unknown>;
  const timestamp = Number(proof.timestamp);
  const parsed: WalletProof = {
    walletAddress: String(proof.walletAddress ?? ''),
    message: String(proof.message ?? ''),
    signature: String(proof.signature ?? ''),
    timestamp
  };

  if (!parsed.walletAddress || !parsed.message || !parsed.signature || !Number.isFinite(timestamp)) {
    throw new HttpError('walletProof must include walletAddress, message, signature, and timestamp.', 401);
  }

  return parsed;
}

function verifyWalletProof(value: unknown): string {
  const proof = parseWalletProof(value);
  const now = Date.now();

  if (proof.timestamp > now + WALLET_PROOF_MAX_FUTURE_SKEW_MS) {
    throw new HttpError('walletProof timestamp is too far in the future. Please sign a fresh wallet message.', 401);
  }

  const age = now - proof.timestamp;

  if (age > WALLET_PROOF_TTL_MS) {
    throw new HttpError('walletProof has expired. Please sign a fresh wallet message.', 401);
  }

  const expectedMessage = [
    'SolanaGuard wallet access',
    `Wallet: ${proof.walletAddress}`,
    `Timestamp: ${proof.timestamp}`
  ].join('\n');

  if (proof.message !== expectedMessage) {
    throw new HttpError('walletProof message does not match the requested wallet.', 401);
  }

  try {
    const publicKey = new PublicKey(proof.walletAddress);
    const messageBytes = new TextEncoder().encode(proof.message);
    const signatureBytes = base64ToBytes(proof.signature);

    if (!nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes())) {
      throw new HttpError('walletProof signature is invalid.', 401);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError('walletProof could not be verified.', 401);
  }

  return proof.walletAddress;
}

function getRouteSlug(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = getRouteSlug(url);
    const route = routes[slug];

    if (!route) {
      return jsonResponse({ error: `Unknown SolanaGuard function: ${slug}` }, 404);
    }

    const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
    const apiKey = Deno.env.get('API_KEY');

    if (!baseUrl || !apiKey) {
      return jsonResponse({ error: 'InsForge function environment is not configured.' }, 500);
    }

    const body = await readJson(req);
    const verifiedWalletAddress = route.requiresWalletProof
      ? verifyWalletProof(body.walletProof)
      : undefined;
    const rpcBody = verifiedWalletAddress
      ? { ...body, walletAddress: verifiedWalletAddress }
      : body;

    const admin = createAdminClient({ baseUrl, apiKey });

    if (route.requiresWalletProof && rpcBody.agentId) {
      const { data: scopedStats, error: scopeError } = await admin.database.rpc('get_dashboard_stats', {
        p_agent_id: rpcBody.agentId,
        p_wallet_address: verifiedWalletAddress
      });

      if (scopeError) {
        return jsonResponse({ error: scopeError.message ?? String(scopeError) }, 400);
      }

      const scopedAgentCount = Number(scopedStats?.agents ?? scopedStats?.data?.agents ?? 0);
      if (scopedAgentCount < 1) {
        return jsonResponse({ error: 'walletProof does not authorize access to this agent.' }, 401);
      }
    }

    const { data, error } = await admin.database.rpc(route.rpc, route.args(rpcBody, url));

    if (error) {
      return jsonResponse({ error: error.message ?? String(error) }, 400);
    }

    return jsonResponse({ data });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      error instanceof HttpError ? error.status : 400
    );
  }
}
