CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  address TEXT NOT NULL UNIQUE,
  label TEXT,
  network TEXT NOT NULL DEFAULT 'solana-devnet',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  emergency_pause BOOLEAN NOT NULL DEFAULT false,
  max_transaction_amount NUMERIC(20, 9) NOT NULL DEFAULT 10,
  daily_spending_limit NUMERIC(20, 9) NOT NULL DEFAULT 25,
  manual_approval_threshold NUMERIC(20, 9) NOT NULL DEFAULT 5,
  allowed_program_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blocked_program_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  unknown_program_risk_penalty INTEGER NOT NULL DEFAULT 25 CHECK (unknown_program_risk_penalty BETWEEN 0 AND 100),
  risk_warning_threshold INTEGER NOT NULL DEFAULT 50 CHECK (risk_warning_threshold BETWEEN 0 AND 100),
  risk_block_threshold INTEGER NOT NULL DEFAULT 80 CHECK (risk_block_threshold BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.transaction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  program_id TEXT NOT NULL,
  destination TEXT,
  amount_sol NUMERIC(20, 9) NOT NULL DEFAULT 0 CHECK (amount_sol >= 0),
  intent_type TEXT NOT NULL DEFAULT 'transfer',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allowed', 'warning', 'blocked', 'approved', 'rejected', 'executed')),
  decision TEXT CHECK (decision IN ('allowed', 'warning', 'blocked')),
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  reason TEXT,
  matched_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  transaction_request_id UUID REFERENCES public.transaction_requests(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('allowed', 'warning', 'blocked')),
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  reason TEXT,
  matched_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  transaction_request_id UUID REFERENCES public.transaction_requests(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX agents_owner_user_id_idx ON public.agents(owner_user_id);
CREATE INDEX wallets_agent_id_idx ON public.wallets(agent_id);
CREATE INDEX policies_agent_active_idx ON public.policies(agent_id, is_active);
CREATE INDEX transaction_requests_agent_created_idx ON public.transaction_requests(agent_id, created_at DESC);
CREATE INDEX transaction_requests_wallet_created_idx ON public.transaction_requests(wallet_id, created_at DESC);
CREATE INDEX transaction_requests_status_idx ON public.transaction_requests(status);
CREATE INDEX audit_logs_agent_created_idx ON public.audit_logs(agent_id, created_at DESC);
CREATE INDEX alerts_agent_status_idx ON public.alerts(agent_id, status);

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE TRIGGER wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE TRIGGER policies_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY agents_owner_access ON public.agents
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY wallets_owner_access ON public.wallets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = wallets.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = wallets.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  );

CREATE POLICY policies_owner_access ON public.policies
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = policies.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = policies.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  );

CREATE POLICY transaction_requests_owner_access ON public.transaction_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = transaction_requests.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = transaction_requests.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  );

CREATE POLICY audit_logs_owner_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = audit_logs.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  );

CREATE POLICY alerts_owner_access ON public.alerts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = alerts.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = alerts.agent_id
        AND agents.owner_user_id = auth.uid()
    )
  );

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_requests TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;

CREATE OR REPLACE FUNCTION public.create_agent(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_wallet_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Agent name is required';
  END IF;

  INSERT INTO public.agents (name, description, owner_user_id)
  VALUES (btrim(p_name), p_description, auth.uid())
  RETURNING * INTO v_agent;

  IF p_wallet_address IS NOT NULL AND btrim(p_wallet_address) <> '' THEN
    INSERT INTO public.wallets (agent_id, address, label)
    VALUES (v_agent.id, btrim(p_wallet_address), 'Primary wallet')
    RETURNING * INTO v_wallet;
  END IF;

  RETURN jsonb_build_object(
    'agent', to_jsonb(v_agent),
    'wallet', CASE WHEN v_wallet.id IS NULL THEN NULL ELSE to_jsonb(v_wallet) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_policy(
  p_agent_id UUID,
  p_policy JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents%ROWTYPE;
  v_policy public.policies%ROWTYPE;
BEGIN
  SELECT * INTO v_agent FROM public.agents WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  UPDATE public.policies
  SET is_active = false
  WHERE agent_id = p_agent_id
    AND is_active = true;

  INSERT INTO public.policies (
    agent_id,
    name,
    emergency_pause,
    max_transaction_amount,
    daily_spending_limit,
    manual_approval_threshold,
    allowed_program_ids,
    blocked_program_ids,
    unknown_program_risk_penalty,
    risk_warning_threshold,
    risk_block_threshold,
    metadata
  )
  VALUES (
    p_agent_id,
    COALESCE(NULLIF(p_policy->>'name', ''), 'Default SolanaGuard Policy'),
    COALESCE((p_policy->>'emergencyPause')::BOOLEAN, false),
    COALESCE((p_policy->>'maxTransactionAmount')::NUMERIC, 10),
    COALESCE((p_policy->>'dailySpendingLimit')::NUMERIC, 25),
    COALESCE((p_policy->>'manualApprovalThreshold')::NUMERIC, 5),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_policy->'allowedProgramIds')), ARRAY[]::TEXT[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_policy->'blockedProgramIds')), ARRAY[]::TEXT[]),
    COALESCE((p_policy->>'unknownProgramRiskPenalty')::INTEGER, 25),
    COALESCE((p_policy->>'riskWarningThreshold')::INTEGER, 50),
    COALESCE((p_policy->>'riskBlockThreshold')::INTEGER, 80),
    COALESCE(p_policy->'metadata', '{}'::jsonb)
  )
  RETURNING * INTO v_policy;

  RETURN to_jsonb(v_policy);
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
  v_wallet_id UUID;
  v_policy_id UUID;
  v_request_count INTEGER;
BEGIN
  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE name = 'Demo Trading Agent'
  ORDER BY created_at
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    INSERT INTO public.agents (name, description, status, metadata)
    VALUES (
      'Demo Trading Agent',
      'Hackathon demo AI agent that asks SolanaGuard to approve simulated wallet actions.',
      'active',
      '{"demo": true, "model": "solanaguard-mvp"}'::jsonb
    )
    RETURNING id INTO v_agent_id;
  END IF;

  SELECT id INTO v_wallet_id
  FROM public.wallets
  WHERE address = 'DemoWallet1111111111111111111111111111111111'
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (agent_id, address, label, network)
    VALUES (
      v_agent_id,
      'DemoWallet1111111111111111111111111111111111',
      'Demo agent wallet',
      'solana-devnet'
    )
    RETURNING id INTO v_wallet_id;
  END IF;

  SELECT id INTO v_policy_id
  FROM public.policies
  WHERE agent_id = v_agent_id
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_policy_id IS NULL THEN
    INSERT INTO public.policies (
      agent_id,
      name,
      max_transaction_amount,
      daily_spending_limit,
      manual_approval_threshold,
      allowed_program_ids,
      blocked_program_ids,
      unknown_program_risk_penalty,
      risk_warning_threshold,
      risk_block_threshold,
      metadata
    )
    VALUES (
      v_agent_id,
      'Demo Risk Policy',
      10,
      25,
      5,
      ARRAY[
        '11111111111111111111111111111111',
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
      ],
      ARRAY[
        'BadActorProgram111111111111111111111111111111'
      ],
      30,
      50,
      80,
      '{"demo": true}'::jsonb
    )
    RETURNING id INTO v_policy_id;
  END IF;

  SELECT COUNT(*) INTO v_request_count
  FROM public.transaction_requests
  WHERE agent_id = v_agent_id;

  IF v_request_count = 0 THEN
    INSERT INTO public.transaction_requests (
      agent_id,
      wallet_id,
      policy_id,
      program_id,
      destination,
      amount_sol,
      intent_type,
      status,
      decision,
      risk_score,
      reason,
      matched_rules,
      request_payload,
      evaluated_at
    )
    VALUES
      (
        v_agent_id,
        v_wallet_id,
        v_policy_id,
        '11111111111111111111111111111111',
        'Merchant111111111111111111111111111111111',
        1.25,
        'transfer',
        'allowed',
        'allowed',
        10,
        'Known low-value transfer stayed within policy limits.',
        '[{"rule":"allowed_program_ids","result":"matched"}]'::jsonb,
        '{"demo": true, "label": "low_value_transfer"}'::jsonb,
        NOW()
      ),
      (
        v_agent_id,
        v_wallet_id,
        v_policy_id,
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        'Treasury1111111111111111111111111111111111',
        7.5,
        'token_transfer',
        'warning',
        'warning',
        60,
        'Amount exceeds manual approval threshold.',
        '[{"rule":"manual_approval_threshold","result":"warning"}]'::jsonb,
        '{"demo": true, "label": "approval_required"}'::jsonb,
        NOW()
      ),
      (
        v_agent_id,
        v_wallet_id,
        v_policy_id,
        'BadActorProgram111111111111111111111111111111',
        'Unknown11111111111111111111111111111111111',
        2,
        'program_interaction',
        'blocked',
        'blocked',
        95,
        'Program is explicitly blocked.',
        '[{"rule":"blocked_program_ids","result":"blocked"}]'::jsonb,
        '{"demo": true, "label": "blocked_program"}'::jsonb,
        NOW()
      );

    INSERT INTO public.audit_logs (
      agent_id,
      wallet_id,
      policy_id,
      action,
      decision,
      risk_score,
      reason,
      matched_rules,
      metadata
    )
    VALUES (
      v_agent_id,
      v_wallet_id,
      v_policy_id,
      'seed-demo-data',
      'allowed',
      0,
      'Demo data seeded.',
      '[]'::jsonb,
      '{"demo": true}'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'agentId', v_agent_id,
    'walletId', v_wallet_id,
    'policyId', v_policy_id,
    'sampleTransactionRequests',
      (
        SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at)
        FROM public.transaction_requests t
        WHERE t.agent_id = v_agent_id
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_transaction(p_intent JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_policy public.policies%ROWTYPE;
  v_request public.transaction_requests%ROWTYPE;
  v_audit public.audit_logs%ROWTYPE;
  v_alert public.alerts%ROWTYPE;
  v_program_id TEXT := NULLIF(p_intent->>'programId', '');
  v_amount NUMERIC(20, 9) := COALESCE((p_intent->>'amountSol')::NUMERIC, 0);
  v_destination TEXT := NULLIF(p_intent->>'destination', '');
  v_intent_type TEXT := COALESCE(NULLIF(p_intent->>'intentType', ''), 'transfer');
  v_daily_spend NUMERIC(20, 9);
  v_risk INTEGER := 5;
  v_decision TEXT := 'allowed';
  v_reasons TEXT[] := ARRAY[]::TEXT[];
  v_rules JSONB := '[]'::jsonb;
BEGIN
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'programId is required';
  END IF;

  IF v_amount < 0 THEN
    RAISE EXCEPTION 'amountSol must be non-negative';
  END IF;

  IF p_intent ? 'agentId' THEN
    SELECT * INTO v_agent
    FROM public.agents
    WHERE id = (p_intent->>'agentId')::UUID;
  ELSIF p_intent ? 'walletAddress' THEN
    SELECT a.* INTO v_agent
    FROM public.wallets w
    JOIN public.agents a ON a.id = w.agent_id
    WHERE w.address = p_intent->>'walletAddress'
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'agentId or walletAddress is required';
  END IF;

  IF v_agent.id IS NULL THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF v_agent.status <> 'active' THEN
    v_risk := 100;
    v_decision := 'blocked';
    v_reasons := array_append(v_reasons, 'Agent is not active.');
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'agent_status', 'result', 'blocked', 'value', v_agent.status));
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE agent_id = v_agent.id
    AND (
      (p_intent ? 'walletId' AND id = (p_intent->>'walletId')::UUID)
      OR (p_intent ? 'walletAddress' AND address = p_intent->>'walletAddress')
      OR NOT (p_intent ? 'walletId') AND NOT (p_intent ? 'walletAddress')
    )
  ORDER BY created_at
  LIMIT 1;

  SELECT * INTO v_policy
  FROM public.policies
  WHERE agent_id = v_agent.id
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_policy.id IS NULL THEN
    RAISE EXCEPTION 'Active policy not found';
  END IF;

  IF v_policy.emergency_pause THEN
    v_risk := 100;
    v_decision := 'blocked';
    v_reasons := array_append(v_reasons, 'Emergency pause is enabled.');
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'emergency_pause', 'result', 'blocked'));
  END IF;

  IF v_program_id = ANY(v_policy.blocked_program_ids) THEN
    v_risk := GREATEST(v_risk, 95);
    v_decision := 'blocked';
    v_reasons := array_append(v_reasons, 'Program is explicitly blocked.');
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'blocked_program_ids', 'result', 'blocked', 'programId', v_program_id));
  ELSIF array_length(v_policy.allowed_program_ids, 1) IS NOT NULL THEN
    IF v_program_id = ANY(v_policy.allowed_program_ids) THEN
      v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'allowed_program_ids', 'result', 'matched', 'programId', v_program_id));
    ELSE
      v_risk := LEAST(100, v_risk + v_policy.unknown_program_risk_penalty);
      v_reasons := array_append(v_reasons, 'Program is not on the allowed list.');
      v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'allowed_program_ids', 'result', 'warning', 'programId', v_program_id));
    END IF;
  ELSE
    v_risk := LEAST(100, v_risk + v_policy.unknown_program_risk_penalty);
    v_reasons := array_append(v_reasons, 'Program is unknown because no allowed list is configured.');
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'unknown_program_risk_penalty', 'result', 'warning', 'penalty', v_policy.unknown_program_risk_penalty));
  END IF;

  IF v_amount > v_policy.max_transaction_amount THEN
    v_risk := GREATEST(v_risk, 90);
    v_decision := 'blocked';
    v_reasons := array_append(v_reasons, 'Amount exceeds max transaction amount.');
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'max_transaction_amount', 'result', 'blocked', 'limit', v_policy.max_transaction_amount, 'amountSol', v_amount));
  END IF;

  SELECT COALESCE(SUM(amount_sol), 0) INTO v_daily_spend
  FROM public.transaction_requests
  WHERE agent_id = v_agent.id
    AND created_at >= date_trunc('day', NOW())
    AND status IN ('allowed', 'warning', 'approved', 'executed');

  IF v_daily_spend + v_amount > v_policy.daily_spending_limit THEN
    v_risk := GREATEST(v_risk, 85);
    v_decision := 'blocked';
    v_reasons := array_append(v_reasons, 'Daily spending limit would be exceeded.');
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'daily_spending_limit', 'result', 'blocked', 'limit', v_policy.daily_spending_limit, 'dailySpendWithIntent', v_daily_spend + v_amount));
  END IF;

  IF v_amount > v_policy.manual_approval_threshold THEN
    v_risk := GREATEST(v_risk, 60);
    IF v_decision <> 'blocked' THEN
      v_decision := 'warning';
    END IF;
    v_reasons := array_append(v_reasons, 'Manual approval is required above threshold.');
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'manual_approval_threshold', 'result', 'warning', 'threshold', v_policy.manual_approval_threshold, 'amountSol', v_amount));
  END IF;

  v_risk := LEAST(100, GREATEST(0, v_risk));

  IF v_decision <> 'blocked' THEN
    IF v_risk >= v_policy.risk_block_threshold THEN
      v_decision := 'blocked';
      v_reasons := array_append(v_reasons, 'Risk score reached block threshold.');
      v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'risk_block_threshold', 'result', 'blocked', 'threshold', v_policy.risk_block_threshold));
    ELSIF v_risk >= v_policy.risk_warning_threshold THEN
      v_decision := 'warning';
      v_reasons := array_append(v_reasons, 'Risk score reached warning threshold.');
      v_rules := v_rules || jsonb_build_array(jsonb_build_object('rule', 'risk_warning_threshold', 'result', 'warning', 'threshold', v_policy.risk_warning_threshold));
    END IF;
  END IF;

  IF array_length(v_reasons, 1) IS NULL THEN
    v_reasons := ARRAY['Transaction intent is within active policy limits.'];
  END IF;

  INSERT INTO public.transaction_requests (
    agent_id,
    wallet_id,
    policy_id,
    program_id,
    destination,
    amount_sol,
    intent_type,
    status,
    decision,
    risk_score,
    reason,
    matched_rules,
    request_payload,
    evaluated_at
  )
  VALUES (
    v_agent.id,
    v_wallet.id,
    v_policy.id,
    v_program_id,
    v_destination,
    v_amount,
    v_intent_type,
    v_decision,
    v_decision,
    v_risk,
    array_to_string(v_reasons, ' '),
    v_rules,
    p_intent,
    NOW()
  )
  RETURNING * INTO v_request;

  INSERT INTO public.audit_logs (
    agent_id,
    wallet_id,
    policy_id,
    transaction_request_id,
    action,
    decision,
    risk_score,
    reason,
    matched_rules,
    metadata
  )
  VALUES (
    v_agent.id,
    v_wallet.id,
    v_policy.id,
    v_request.id,
    'evaluate-transaction',
    v_decision,
    v_risk,
    v_request.reason,
    v_rules,
    jsonb_build_object('intent', p_intent)
  )
  RETURNING * INTO v_audit;

  IF v_decision IN ('warning', 'blocked') THEN
    INSERT INTO public.alerts (
      agent_id,
      transaction_request_id,
      severity,
      title,
      message
    )
    VALUES (
      v_agent.id,
      v_request.id,
      CASE WHEN v_decision = 'blocked' THEN 'critical' ELSE 'warning' END,
      CASE WHEN v_decision = 'blocked' THEN 'Transaction blocked' ELSE 'Transaction warning' END,
      v_request.reason
    )
    RETURNING * INTO v_alert;
  END IF;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'riskScore', v_risk,
    'reason', v_request.reason,
    'matchedPolicyRules', v_rules,
    'transactionRequest', to_jsonb(v_request),
    'auditLogId', v_audit.id,
    'alertId', v_alert.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_agent_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'agents', (SELECT COUNT(*) FROM public.agents WHERE p_agent_id IS NULL OR id = p_agent_id),
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
      SELECT COALESCE(ROUND(AVG(risk_score)::NUMERIC, 2), 0)
      FROM public.transaction_requests
      WHERE risk_score IS NOT NULL
        AND (p_agent_id IS NULL OR agent_id = p_agent_id)
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
$$;

GRANT EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_policy(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_transaction(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID) TO anon, authenticated;
