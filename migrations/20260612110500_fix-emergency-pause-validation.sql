UPDATE public.policies
SET emergency_pause = false
WHERE emergency_pause IS NULL;

ALTER TABLE public.policies
  ALTER COLUMN emergency_pause SET DEFAULT false,
  ALTER COLUMN emergency_pause SET NOT NULL;

CREATE OR REPLACE FUNCTION public.toggle_emergency_pause(
  p_agent_id UUID,
  p_emergency_pause BOOLEAN,
  p_wallet_address TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_wallet_address TEXT := NULLIF(btrim(p_wallet_address), '');
  v_policy public.policies%ROWTYPE;
BEGIN
  IF p_agent_id IS NULL THEN
    RAISE EXCEPTION 'agentId is required';
  END IF;

  IF v_wallet_address IS NULL THEN
    RAISE EXCEPTION 'walletAddress is required';
  END IF;

  IF p_emergency_pause IS NULL THEN
    RAISE EXCEPTION 'emergencyPause is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wallets w
    WHERE w.agent_id = p_agent_id
      AND w.address = v_wallet_address
  ) THEN
    RAISE EXCEPTION 'walletProof does not authorize access to this agent';
  END IF;

  SELECT *
  INTO v_policy
  FROM public.policies
  WHERE agent_id = p_agent_id
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_policy.id IS NULL THEN
    RAISE EXCEPTION 'Active policy not found for selected agent';
  END IF;

  UPDATE public.policies
  SET emergency_pause = p_emergency_pause,
      updated_at = NOW()
  WHERE id = v_policy.id
  RETURNING * INTO v_policy;

  INSERT INTO public.audit_logs (
    agent_id,
    policy_id,
    action,
    reason,
    matched_rules,
    metadata,
    actor
  )
  VALUES (
    p_agent_id,
    v_policy.id,
    'toggle-emergency-pause',
    CASE
      WHEN v_policy.emergency_pause THEN 'Emergency pause enabled'
      ELSE 'Emergency pause disabled'
    END,
    jsonb_build_array(jsonb_build_object(
      'rule',
      'emergency_pause',
      'result',
      CASE WHEN v_policy.emergency_pause THEN 'enabled' ELSE 'disabled' END
    )),
    jsonb_build_object(
      'walletAddress',
      v_wallet_address,
      'emergencyPause',
      v_policy.emergency_pause
    ),
    'wallet'
  );

  RETURN jsonb_build_object(
    'agentId', p_agent_id,
    'policyId', v_policy.id,
    'emergencyPause', v_policy.emergency_pause
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_emergency_pause(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_emergency_pause(UUID, BOOLEAN, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_emergency_pause(UUID, BOOLEAN, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_emergency_pause(UUID, BOOLEAN, TEXT) TO project_admin;
