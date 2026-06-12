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

  PERFORM pg_advisory_xact_lock(hashtext(v_wallet_address));

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE address = v_wallet_address
  LIMIT 1;

  IF v_wallet.id IS NOT NULL THEN
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

  INSERT INTO public.wallets (agent_id, address, label)
  VALUES (v_agent.id, v_wallet_address, 'Primary wallet')
  RETURNING * INTO v_wallet;

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
