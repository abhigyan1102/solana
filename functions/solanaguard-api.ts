import { createAdminClient } from 'npm:@insforge/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

type JsonRecord = Record<string, unknown>;

type Route = {
  rpc: string;
  args: (body: JsonRecord, url: URL) => JsonRecord;
};

const routes: Record<string, Route> = {
  'seed-demo-data': {
    rpc: 'seed_demo_data',
    args: () => ({})
  },
  'create-agent': {
    rpc: 'create_agent',
    args: (body) => ({
      p_name: body.name,
      p_description: body.description ?? null,
      p_wallet_address: body.walletAddress ?? null
    })
  },
  'create-policy': {
    rpc: 'create_policy',
    args: (body) => ({
      p_agent_id: body.agentId,
      p_policy: body.policy ?? body
    })
  },
  'evaluate-transaction': {
    rpc: 'evaluate_transaction',
    args: (body) => ({
      p_intent: body
    })
  },
  'get-dashboard-stats': {
    rpc: 'get_dashboard_stats',
    args: (body, url) => ({
      p_agent_id: body.agentId ?? url.searchParams.get('agentId'),
      p_wallet_address: body.walletAddress ?? url.searchParams.get('walletAddress')
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
    const admin = createAdminClient({ baseUrl, apiKey });
    const { data, error } = await admin.database.rpc(route.rpc, route.args(body, url));

    if (error) {
      return jsonResponse({ error: error.message ?? String(error) }, 400);
    }

    return jsonResponse({ data });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      400
    );
  }
}
