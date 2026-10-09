-- 0070 is immutable. Bind claims to canonical producer/route, never require
-- unrelated native authority for MyFactory custody or protected verification.
CREATE OR REPLACE FUNCTION business_execution_fence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; operation text; productive boolean=false; route text; producer text;
BEGIN
 IF TG_TABLE_NAME='engineering_route_runs' THEN
  productive=TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN productive=OLD.dispatch_state='PREPARED' AND NEW.dispatch_state='UNKNOWN'; END IF;
  operation=CASE NEW.route WHEN 'MYFACTORY' THEN 'execute_factory' WHEN 'DEEP_AGENT' THEN 'execute_native' ELSE 'unqualified_route' END;
 ELSIF TG_TABLE_NAME='engineering_work_model_calls' THEN
  productive=TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN productive=OLD.status='RESERVED' AND NEW.status='DISPATCHED'; END IF;
  operation=CASE NEW.purpose WHEN 'NATIVE_EXECUTION' THEN 'execute_native' ELSE 'unqualified_shared_model' END;
 ELSIF TG_TABLE_NAME='engineering_direct_workspaces' THEN
  productive=TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN
   productive=(NEW.route_run_id,NEW.work_version,NEW.work_generation,NEW.source_files,NEW.draft_files,NEW.plan,NEW.candidates,NEW.producer)
    IS DISTINCT FROM (OLD.route_run_id,OLD.work_version,OLD.work_generation,OLD.source_files,OLD.draft_files,OLD.plan,OLD.candidates,OLD.producer)
    OR (NEW.phase='VERIFICATION_REQUESTED' AND NEW.phase IS DISTINCT FROM OLD.phase);
  END IF;
  SELECT r.route INTO route FROM engineering_route_runs r WHERE r.id=NEW.route_run_id AND r.scope_id=NEW.scope_id AND r.scope_kind=NEW.scope_kind AND r.work_id=NEW.work_id;
  producer=NEW.producer;
 ELSE
  productive=TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN productive=NEW.status='RUNNING' AND (NEW.status,NEW.lease_token) IS DISTINCT FROM (OLD.status,OLD.lease_token); END IF;
  SELECT r.route,x.producer INTO route,producer FROM engineering_direct_workspaces x JOIN engineering_route_runs r ON r.id=x.route_run_id
   WHERE x.scope_id=NEW.scope_id AND x.scope_kind=NEW.scope_kind AND x.work_id=NEW.work_id;
 END IF;
 IF TG_TABLE_NAME IN('engineering_direct_workspaces','engineering_direct_verification_jobs') THEN
  operation=CASE WHEN route='MYFACTORY' AND producer='MYFACTORY' THEN 'execute_factory'
   WHEN route='DEEP_AGENT' AND producer='NATIVE_SOFIE' THEN 'execute_native' ELSE 'unqualified_custody' END;
 END IF;
 IF productive THEN
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
  PERFORM business_assert_effect(w.scope_id,w.id,w.version,w.generation,w.scope_id,jsonb_build_object('operation',operation));
 END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
DROP TRIGGER business_verification_execution_fence ON engineering_direct_verification_jobs;
-- statement-breakpoint
CREATE TRIGGER business_verification_execution_fence BEFORE INSERT OR UPDATE ON engineering_direct_verification_jobs FOR EACH ROW EXECUTE FUNCTION business_execution_fence();
