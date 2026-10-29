-- Read-only PRE-ENROLLMENT observation for a newly provisioned qualification DB.
-- Run with a dedicated auditor. This neither authorizes nor activates a cohort.
-- Never point this at a tester/historical database or remove chat-only controls.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $$
DECLARE relation_name text; function_id oid; has_rows boolean;
BEGIN
 IF current_database() !~ '^myeve_qdev_[a-z0-9_]+$'
 THEN RAISE EXCEPTION 'QDEV_DEDICATED_DATABASE_REQUIRED'; END IF;
 IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
 THEN RAISE EXCEPTION 'QDEV_POSTGRES17_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
   AND c.relkind IN ('r','p','f','m')
   AND NOT(n.nspname='public' AND c.relname=ANY(ARRAY['external_alpha_cohort',
     'external_alpha_cohort_member','external_alpha_cohort_admission','external_alpha_cohort_dispatch'])))
 THEN RAISE EXCEPTION 'QDEV_STANDALONE_ACCOUNTING_DATABASE_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM pg_database d,
   LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
   WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type='CONNECT')
 THEN RAISE EXCEPTION 'QDEV_PUBLIC_CONNECT_FORBIDDEN'; END IF;
 IF EXISTS (SELECT 1 FROM pg_namespace n,
   LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
   WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE')
 THEN RAISE EXCEPTION 'QDEV_PUBLIC_SCHEMA_CREATE_FORBIDDEN'; END IF;
 FOREACH relation_name IN ARRAY ARRAY['external_alpha_cohort','external_alpha_cohort_member',
   'external_alpha_cohort_admission','external_alpha_cohort_dispatch'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=relation_name AND c.relkind='r')
  THEN RAISE EXCEPTION 'QDEV_ACCOUNTING_SCHEMA_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
    LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
    WHERE n.nspname='public' AND c.relname=relation_name AND a.grantee=0)
  THEN RAISE EXCEPTION 'QDEV_PUBLIC_TABLE_ACCESS_FORBIDDEN'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',relation_name) INTO STRICT has_rows;
  IF has_rows THEN RAISE EXCEPTION 'QDEV_PRE_ENROLLMENT_DATABASE_NOT_EMPTY'; END IF;
 END LOOP;
 function_id:=to_regprocedure('public.external_alpha_cohort_call(jsonb)');
 IF function_id IS NULL OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=function_id AND prosecdef
   AND 'search_path=pg_catalog, public, pg_temp'=ANY(proconfig))
 THEN RAISE EXCEPTION 'QDEV_ACCOUNTING_FUNCTION_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p,
   LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=function_id AND a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'QDEV_PUBLIC_FUNCTION_EXECUTE_FORBIDDEN'; END IF;
END $$;
SELECT 'PREPARATION_OBSERVATION_ONLY_EXECUTION_NOT_AUTHORIZED' AS status,
 current_database() AS database_name,
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS accounting_function_body_sha256
 FROM pg_proc p WHERE p.oid='public.external_alpha_cohort_call(jsonb)'::regprocedure;
COMMIT;
