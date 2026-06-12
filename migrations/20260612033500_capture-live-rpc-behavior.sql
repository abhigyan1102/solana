CREATE OR REPLACE FUNCTION public.create_agent(
  p_name text,
  p_description text DEFAULT NULL::text,
  p_wallet_address text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agent public.agents%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_wallet_address text := NULLIF(btrim(p_wallet_address), '');
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Agent name is required';
  END IF;

  IF v_wallet_address IS NOT NULL THEN
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
          'agent', to_jsonb(v_agent),
          'wallet', to_jsonb(v_wallet),
          'existing', true
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.agents (name, description, owner_user_id)
  VALUES (btrim(p_name), p_description, auth.uid())
  RETURNING * INTO v_agent;

  IF v_wallet_address IS NOT NULL THEN
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
  END IF;

  RETURN jsonb_build_object(
    'agent', to_jsonb(v_agent),
    'wallet', CASE WHEN v_wallet.id IS NULL THEN NULL ELSE to_jsonb(v_wallet) END,
    'existing', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_agent_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'agents', (
      SELECT COUNT(*)
      FROM public.agents
      WHERE p_agent_id IS NULL OR id = p_agent_id
    ),
    'wallets', (
      SELECT COUNT(*)
      FROM public.wallets
      WHERE p_agent_id IS NULL OR agent_id = p_agent_id
    ),
    'activePolicies', (
      SELECT COUNT(*)
      FROM public.policies
      WHERE is_active = true
        AND (p_agent_id IS NULL OR agent_id = p_agent_id)
    ),
    'transactionRequests', (
      SELECT COUNT(*)
      FROM public.transaction_requests
      WHERE p_agent_id IS NULL OR agent_id = p_agent_id
    ),
    'allowedTransactions', (
      SELECT COUNT(*)
      FROM public.transaction_requests
      WHERE decision = 'allowed'
        AND (p_agent_id IS NULL OR agent_id = p_agent_id)
    ),
    'warningTransactions', (
      SELECT COUNT(*)
      FROM public.transaction_requests
      WHERE decision = 'warning'
        AND (p_agent_id IS NULL OR agent_id = p_agent_id)
    ),
    'blockedTransactions', (
      SELECT COUNT(*)
      FROM public.transaction_requests
      WHERE decision = 'blocked'
        AND (p_agent_id IS NULL OR agent_id = p_agent_id)
    ),
    'openAlerts', (
      SELECT COUNT(*)
      FROM public.alerts
      WHERE status = 'open'
        AND (p_agent_id IS NULL OR agent_id = p_agent_id)
    ),
    'dailySpendSol', (
      SELECT COALESCE(SUM(amount_sol), 0)
      FROM public.transaction_requests
      WHERE created_at >= date_trunc('day', NOW())
        AND status IN ('allowed', 'warning', 'approved', 'executed')
        AND (p_agent_id IS NULL OR agent_id = p_agent_id)
    ),
    'averageRiskScore', (
      SELECT COALESCE(ROUND(AVG(risk_score)::numeric, 2), 0)
      FROM public.transaction_requests
      WHERE risk_score IS NOT NULL
        AND (p_agent_id IS NULL OR agent_id = p_agent_id)
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
        LEFT JOIN public.wallets w ON w.agent_id = a.id
        WHERE p_agent_id IS NULL OR a.id = p_agent_id
        ORDER BY a.created_at DESC
        LIMIT 25
      ) agent_rows
    ),
    'recentAuditLogs', (
      SELECT COALESCE(jsonb_agg(to_jsonb(logs) ORDER BY logs.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, action, decision, risk_score, reason, created_at
        FROM public.audit_logs
        WHERE p_agent_id IS NULL OR agent_id = p_agent_id
        ORDER BY created_at DESC
        LIMIT 10
      ) logs
    )
  )
  INTO v_stats;

  RETURN v_stats;
END;
$function$;
