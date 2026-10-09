-- 0069 is immutable. Preserve every decision; renewal creates a new receipt.
ALTER TABLE business_effect_decisions ADD COLUMN superseded_at timestamptz;
-- statement-breakpoint
DO $$ DECLARE constraint_name text; BEGIN
 SELECT conname INTO STRICT constraint_name FROM pg_constraint WHERE conrelid='business_effect_decisions'::regclass AND contype='u';
 EXECUTE format('ALTER TABLE business_effect_decisions DROP CONSTRAINT %I',constraint_name);
END $$;
-- statement-breakpoint
CREATE UNIQUE INDEX business_current_effect_decision ON business_effect_decisions(work_owner,work_id,work_version,work_generation,effect_hash) WHERE superseded_at IS NULL;
-- statement-breakpoint
-- Revocation and all effect claims serialize on this one private-alpha pair.
-- Statement-level triggers acquire the lock before any grant/decision row lock.
CREATE FUNCTION business_lock_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM 1 FROM business_partnership FOR UPDATE; RETURN NULL; END $$;
-- statement-breakpoint
CREATE TRIGGER business_grant_authority_lock BEFORE INSERT OR UPDATE OR DELETE ON business_resource_grants FOR EACH STATEMENT EXECUTE FUNCTION business_lock_authority();
-- statement-breakpoint
CREATE TRIGGER business_decision_authority_lock BEFORE INSERT OR UPDATE OR DELETE ON business_effect_decisions FOR EACH STATEMENT EXECUTE FUNCTION business_lock_authority();
-- statement-breakpoint
CREATE FUNCTION business_assert_effect(owner_id text, work_id uuid, work_version integer, work_generation integer, actor_id text, requested_effect jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pair business_partnership%ROWTYPE;
BEGIN
 SELECT * INTO pair FROM business_partnership FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM business_resource_grants g WHERE g.owner_id=$1 AND g.kind='WORK' AND g.resource_id=$2::text AND g.scope='BUSINESS_SHARED') THEN RETURN true; END IF;
 IF pair.accepted_a IS NOT TRUE OR pair.accepted_b IS NOT TRUE OR $5 NOT IN(pair.owner_a,pair.owner_b) THEN RAISE EXCEPTION 'shared_decision_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM business_effect_decisions d JOIN engineering_work w ON w.scope_id=d.work_owner AND w.scope_kind='personal' AND w.id=d.work_id
 WHERE d.work_owner=$1 AND d.work_id=$2 AND d.work_version=$3 AND d.work_generation=$4
 AND w.version=$3 AND w.generation=$4 AND d.effect=$6 AND d.partnership_revision=pair.revision
 AND d.superseded_at IS NULL AND NOT d.denied AND d.expires_at>clock_timestamp()
 AND (w.lifecycle='active' OR (d.effect->>'operation'='reopen' AND w.lifecycle IN('cancelled','accepted','failed')))
 AND EXISTS(SELECT 1 FROM business_resource_grants g JOIN business_resource_revision r ON r.owner_id=g.owner_id AND r.kind=g.kind AND r.id=g.resource_id AND r.revision_hash=g.revision_hash
 WHERE g.owner_id=$1 AND g.kind='WORK' AND g.resource_id=$2::text AND g.scope='BUSINESS_SHARED' AND g.revoked_at IS NULL AND g.partnership_revision=pair.revision)
 AND CASE d.policy WHEN 'OWNER_A' THEN d.approved_a WHEN 'OWNER_B' THEN d.approved_b WHEN 'EITHER_OWNER' THEN d.approved_a OR d.approved_b WHEN 'BOTH_OWNERS' THEN d.approved_a AND d.approved_b ELSE false END)
 THEN RAISE EXCEPTION 'shared_decision_required'; END IF;
 RETURN true;
END $$;
-- statement-breakpoint
CREATE FUNCTION business_request_decision(actor text, new_id uuid, selected_work uuid, hash text, selected_policy text, expiry timestamptz, requested_effect jsonb, expected_version integer, expected_generation integer)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pair business_partnership%ROWTYPE; w engineering_work%ROWTYPE;
BEGIN
 SELECT * INTO pair FROM business_partnership FOR UPDATE;
 SELECT * INTO w FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$3;
 IF pair.accepted_a IS NOT TRUE OR pair.accepted_b IS NOT TRUE OR $1 NOT IN(pair.owner_a,pair.owner_b)
 OR w.id IS NULL OR w.version<>$8 OR w.generation<>$9 OR NOT(w.lifecycle='active' OR ($7->>'operation'='reopen' AND w.lifecycle IN('cancelled','accepted','failed')))
 OR $6<=clock_timestamp() OR $6>clock_timestamp()+interval '24 hours'
 OR NOT EXISTS(SELECT 1 FROM business_resource_grants g JOIN business_resource_revision r ON r.owner_id=g.owner_id AND r.kind=g.kind AND r.id=g.resource_id AND r.revision_hash=g.revision_hash
 WHERE g.owner_id=$1 AND g.kind='WORK' AND g.resource_id=$3::text AND g.scope='BUSINESS_SHARED' AND g.revoked_at IS NULL AND g.partnership_revision=pair.revision)
 THEN RAISE EXCEPTION 'Scope denied'; END IF;
 -- Policy cannot be weakened by expiry, denial, or leaving and rejoining.
 IF EXISTS(SELECT 1 FROM business_effect_decisions d WHERE d.work_owner=$1 AND d.work_id=$3 AND d.work_version=$8 AND d.work_generation=$9 AND d.effect_hash=$4 AND (d.policy<>$5 OR d.effect<>$7)) THEN RAISE EXCEPTION 'Existing effect policy is immutable'; END IF;
 UPDATE business_effect_decisions d SET superseded_at=clock_timestamp() WHERE d.work_owner=$1 AND d.work_id=$3 AND d.work_version=$8 AND d.work_generation=$9 AND d.effect_hash=$4 AND d.superseded_at IS NULL
 AND (d.denied OR d.expires_at<=clock_timestamp() OR d.partnership_revision<>pair.revision);
 INSERT INTO business_effect_decisions(id,work_owner,work_id,work_version,work_generation,partnership_revision,effect_hash,policy,expires_at,created_by,effect)
 VALUES($2,$1,$3,$8,$9,pair.revision,$4,$5,$6,$1,$7);
 RETURN $2;
END $$;
-- statement-breakpoint
-- Durable provider claims hold the same authority lock until commit. Settlement,
-- stop and quiescence remain possible after authority is withdrawn.
CREATE FUNCTION business_execution_fence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; operation text; productive boolean=false;
BEGIN
 IF TG_TABLE_NAME='engineering_route_runs' THEN
  productive=TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN productive=OLD.dispatch_state='PREPARED' AND NEW.dispatch_state='UNKNOWN'; END IF;
  operation=CASE NEW.route WHEN 'MYFACTORY' THEN 'execute_factory' WHEN 'DEEP_AGENT' THEN 'execute_native' ELSE 'unqualified_route' END;
 ELSIF TG_TABLE_NAME='engineering_work_model_calls' THEN
  productive=TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN productive=OLD.status='RESERVED' AND NEW.status='DISPATCHED'; END IF;
  operation=CASE NEW.purpose WHEN 'NATIVE_EXECUTION' THEN 'execute_native' ELSE 'unqualified_shared_model' END;
 ELSE
  productive=true; operation='execute_native';
 END IF;
 IF productive THEN
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
  PERFORM business_assert_effect(w.scope_id,w.id,w.version,w.generation,w.scope_id,jsonb_build_object('operation',operation));
 END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER business_route_execution_fence BEFORE INSERT OR UPDATE ON engineering_route_runs FOR EACH ROW EXECUTE FUNCTION business_execution_fence();
-- statement-breakpoint
CREATE TRIGGER business_model_execution_fence BEFORE INSERT OR UPDATE ON engineering_work_model_calls FOR EACH ROW EXECUTE FUNCTION business_execution_fence();
-- statement-breakpoint
CREATE TRIGGER business_workspace_execution_fence BEFORE INSERT OR UPDATE ON engineering_direct_workspaces FOR EACH ROW EXECUTE FUNCTION business_execution_fence();
-- statement-breakpoint
CREATE TRIGGER business_verification_execution_fence BEFORE INSERT ON engineering_direct_verification_jobs FOR EACH ROW EXECUTE FUNCTION business_execution_fence();
-- statement-breakpoint
REVOKE ALL ON FUNCTION business_assert_effect(text,uuid,integer,integer,text,jsonb),business_request_decision(text,uuid,uuid,text,text,timestamptz,jsonb,integer,integer),business_execution_fence(),business_lock_authority() FROM PUBLIC;
