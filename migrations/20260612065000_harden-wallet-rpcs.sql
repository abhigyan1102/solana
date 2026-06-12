CREATE OR REPLACE FUNCTION public.create_agent(
  p_name text,
  p_description text DEFAULT NULL::text,
  p_wallet_address text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_agent public.agents%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_wallet_address text := NULLIF(btrim(p_wallet_address), '');
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Agent name is required';
  END IF;

  IF v_wallet_address IS NULL THEN
    RAISE EXCEPTION 'walletAddress is required for wallet-owned demo agents';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE address = v_wallet_address
  LIMIT 1;

  IF v_wallet.id IS NOT NULL AND v_wallet.agent_id IS NOT NULL THEN
    SELECT *
    INTO v_agent
    FROM public.agents
    WHERE id = v_wallet.agent_id
    LIMIT 1;

    IF v_agent.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'id', v_agent.id,
        'agentId', v_agent.id,
        'name', v_agent.name,
        'walletAddress', v_wallet.address,
        'agent', jsonb_build_object(
          'id', v_agent.id,
          'name', v_agent.name,
          'walletAddress', v_wallet.address
        ),
        'wallet', jsonb_build_object(
          'address', v_wallet.address
        ),
        'existing', true
      );
    END IF;
  END IF;

  v_metadata := jsonb_build_object(
    'ownershipModel', 'solana-wallet-demo',
    'walletAddress', v_wallet_address
  );

  INSERT INTO public.agents (name, description, owner_user_id, metadata)
  VALUES (btrim(p_name), p_description, NULL, v_metadata)
  RETURNING * INTO v_agent;

  IF v_wallet.id IS NULL THEN
    INSERT INTO public.wallets (agent_id, address, label)
    VALUES (v_agent.id, v_wallet_address, 'Primary wallet')
    RETURNING * INTO v_wallet;
  ELSE
    UPDATE public.wallets
    SET agent_id = v_agent.id,
        updated_at = NOW()
    WHERE id = v_wallet.id
    RETURNING * INTO v_wallet;
  END IF;

  RETURN jsonb_build_object(
    'id', v_agent.id,
    'agentId', v_agent.id,
    'name', v_agent.name,
    'walletAddress', v_wallet.address,
    'agent', jsonb_build_object(
      'id', v_agent.id,
      'name', v_agent.name,
      'walletAddress', v_wallet.address
    ),
    'wallet', jsonb_build_object(
      'address', v_wallet.address
    ),
    'existing', false
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) TO project_admin;

DROP FUNCTION IF EXISTS public.get_dashboard_stats(UUID);

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_agent_id uuid DEFAULT NULL::uuid,
  p_wallet_address text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_stats jsonb;
  v_wallet_address text := NULLIF(btrim(p_wallet_address), '');
  v_agent_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_agent_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(a.id), ARRAY[]::uuid[])
    INTO v_agent_ids
    FROM public.agents a
    WHERE a.id = p_agent_id
      AND (
        v_wallet_address IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.wallets w
          WHERE w.agent_id = a.id
            AND w.address = v_wallet_address
        )
      );
  ELSIF v_wallet_address IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT w.agent_id), ARRAY[]::uuid[])
    INTO v_agent_ids
    FROM public.wallets w
    WHERE w.address = v_wallet_address;
  END IF;

  SELECT jsonb_build_object(
    'agents', (
      SELECT COUNT(*)
      FROM public.agents
      WHERE id = ANY(v_agent_ids)
    ),
    'protectedWallets', (
      SELECT COUNT(*)
      FROM public.wallets
      WHERE agent_id = ANY(v_agent_ids)
    ),
    'wallets', (
      SELECT COUNT(*)
      FROM public.wallets
      WHERE agent_id = ANY(v_agent_ids)
    ),
    'activePolicies', (
      SELECT COUNT(*)
      FROM public.policies
      WHERE is_active = true
        AND agent_id = ANY(v_agent_ids)
    ),
    'transactionRequests', (
      SELECT COUNT(*)
      FROM public.transaction_requests
      WHERE agent_id = ANY(v_agent_ids)
    ),
    'allowedTransactions', (
      SELECT COUNT(*)
      FROM public.transaction_requests
      WHERE decision = 'allowed'
        AND agent_id = ANY(v_agent_ids)
    ),
    'warningTransactions', (
      SELECT COUNT(*)
      FROM public.transaction_requests
      WHERE decision = 'warning'
        AND agent_id = ANY(v_agent_ids)
    ),
    'blockedTransactions', (
      SELECT COUNT(*)
      FROM public.transaction_requests
      WHERE decision = 'blocked'
        AND agent_id = ANY(v_agent_ids)
    ),
    'openAlerts', (
      SELECT COUNT(*)
      FROM public.alerts
      WHERE status = 'open'
        AND agent_id = ANY(v_agent_ids)
    ),
    'dailySpendSol', (
      SELECT COALESCE(SUM(amount_sol), 0)
      FROM public.transaction_requests
      WHERE created_at >= date_trunc('day', NOW())
        AND status IN ('allowed', 'warning', 'approved', 'executed')
        AND agent_id = ANY(v_agent_ids)
    ),
    'averageRiskScore', (
      SELECT COALESCE(ROUND(AVG(risk_score)::numeric, 2), 0)
      FROM public.transaction_requests
      WHERE risk_score IS NOT NULL
        AND agent_id = ANY(v_agent_ids)
    ),
    'agentsList', (
      SELECT COALESCE(jsonb_agg(to_jsonb(agent_rows) ORDER BY agent_rows.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          a.id,
          a.name,
          a.description,
          a.status,
          a.created_at,
          w.address AS "walletAddress"
        FROM public.agents a
        LEFT JOIN LATERAL (
          SELECT address
          FROM public.wallets
          WHERE agent_id = a.id
          ORDER BY
            CASE WHEN v_wallet_address IS NOT NULL AND address = v_wallet_address THEN 0 ELSE 1 END,
            created_at ASC
          LIMIT 1
        ) w ON true
        WHERE a.id = ANY(v_agent_ids)
        ORDER BY a.created_at DESC
        LIMIT 25
      ) agent_rows
    ),
    'recentAuditLogs', (
      SELECT COALESCE(jsonb_agg(to_jsonb(logs) ORDER BY logs.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, action, decision, risk_score, reason, created_at
        FROM public.audit_logs
        WHERE agent_id = ANY(v_agent_ids)
        ORDER BY created_at DESC
        LIMIT 10
      ) logs
    )
  )
  INTO v_stats;

  RETURN v_stats;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TEXT) TO project_admin;
