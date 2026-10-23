-- Inert narrowing schema. Operator enrollment is separate from installation;
-- neither this table nor its trigger activates a policy or creates allowance.
CREATE TABLE external_alpha_chat_only (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 owner_id text NOT NULL REFERENCES external_alpha_policy(owner_id),
 policy_sha256 text NOT NULL CHECK(policy_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- statement-breakpoint
CREATE FUNCTION external_alpha_chat_only_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'EXTERNAL_ALPHA_CHAT_ONLY_IMMUTABLE';
END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_chat_only_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON external_alpha_chat_only FOR EACH STATEMENT EXECUTE FUNCTION external_alpha_chat_only_immutable();
-- statement-breakpoint
CREATE FUNCTION external_alpha_chat_only_allowance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE grant_row external_alpha_chat_only%ROWTYPE; policy_row external_alpha_policy%ROWTYPE;
 day_charge bigint; total_charge bigint; day_count integer; utc_day integer; n timestamptz;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_CHAT_ONLY_ISOLATION'; END IF;
 SELECT * INTO grant_row FROM external_alpha_chat_only WHERE singleton;
 IF NOT FOUND THEN RETURN NEW; END IF;
 -- The existing admission function takes this same lock. Direct inserts must
 -- serialize here too; caller-supplied day/cost/owner cannot bypass the bound.
 SELECT * INTO STRICT policy_row FROM external_alpha_policy WHERE singleton FOR UPDATE;
 n=clock_timestamp(); utc_day=floor(extract(epoch FROM n)/86400);
 IF NEW.kind IS DISTINCT FROM 'CHAT' OR NEW.owner_id IS DISTINCT FROM grant_row.owner_id
  OR NEW.policy_sha256 IS DISTINCT FROM grant_row.policy_sha256
  OR policy_row.owner_id IS DISTINCT FROM grant_row.owner_id
  OR policy_row.policy_sha256 IS DISTINCT FROM grant_row.policy_sha256
  OR policy_row.activated_at IS NULL OR policy_row.revoked_at IS NOT NULL
  OR n<policy_row.activated_at OR n>=policy_row.activated_at+interval '120 hours'
  OR NEW.day_index IS DISTINCT FROM utc_day OR NEW.ceiling_microusd IS DISTINCT FROM 100000::bigint
  OR NEW.max_operations IS DISTINCT FROM 2 OR NEW.deadline>LEAST(n+interval '180 seconds',policy_row.activated_at+interval '120 hours')
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_CHAT_ONLY_DENIED'; END IF;
 SELECT COALESCE(sum(ceiling_microusd) FILTER(WHERE day_index=utc_day),0),COALESCE(sum(ceiling_microusd),0),count(*) FILTER(WHERE day_index=utc_day)
 INTO day_charge,total_charge,day_count FROM external_alpha_allowance;
 IF day_count>=10 OR day_charge+100000>1000000 OR total_charge+100000>5000000
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_CHAT_ONLY_EXHAUSTED'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_chat_only_allowance_guard BEFORE INSERT ON external_alpha_allowance FOR EACH ROW EXECUTE FUNCTION external_alpha_chat_only_allowance_guard();
-- statement-breakpoint
REVOKE ALL ON external_alpha_chat_only FROM PUBLIC;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_chat_only_immutable(),external_alpha_chat_only_allowance_guard() FROM PUBLIC;
