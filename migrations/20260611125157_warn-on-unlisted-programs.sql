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
      v_risk := GREATEST(v_policy.risk_warning_threshold, LEAST(100, v_risk + v_policy.unknown_program_risk_penalty));
      IF v_decision <> 'blocked' THEN
        v_decision := 'warning';
      END IF;
      v_reasons := array_append(v_reasons, 'Program is not on the allowed list.');
      v_rules := v_rules || jsonb_build_array(
        jsonb_build_object('rule', 'allowed_program_ids', 'result', 'warning', 'programId', v_program_id),
        jsonb_build_object('rule', 'unknown_program_risk_penalty', 'result', 'warning', 'penalty', v_policy.unknown_program_risk_penalty)
      );
    END IF;
  ELSE
    v_risk := GREATEST(v_policy.risk_warning_threshold, LEAST(100, v_risk + v_policy.unknown_program_risk_penalty));
    IF v_decision <> 'blocked' THEN
      v_decision := 'warning';
    END IF;
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
