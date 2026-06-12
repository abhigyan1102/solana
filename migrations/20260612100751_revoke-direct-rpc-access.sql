REVOKE EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent(TEXT, TEXT, TEXT) TO project_admin;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TEXT) TO project_admin;

REVOKE EXECUTE ON FUNCTION public.create_policy(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_policy(UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_policy(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_policy(UUID, JSONB) TO project_admin;

REVOKE EXECUTE ON FUNCTION public.seed_demo_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_demo_data() FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_demo_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO project_admin;

REVOKE EXECUTE ON FUNCTION public.evaluate_transaction(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_transaction(JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_transaction(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_transaction(JSONB) TO project_admin;
