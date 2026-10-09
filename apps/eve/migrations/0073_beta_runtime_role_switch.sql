-- PostgreSQL 16+ role creators can hold ADMIN membership without SET.
-- Canonical transactions deliberately SET LOCAL ROLE to these restricted roles.
-- Permit that switch for this migration principal only; retain all role attributes,
-- object grants, owner policies and row-level security.
DO $$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['myeve_beta_goals','myeve_beta_inbox'] LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolcanlogin AND NOT rolinherit) THEN
   RAISE EXCEPTION 'Restricted beta runtime role is missing or unsafe';
  END IF;
  IF NOT pg_has_role(current_user,role_name,'SET') THEN
   EXECUTE format('GRANT %I TO %I WITH SET TRUE',role_name,current_user);
  END IF;
 END LOOP;
END $$;
