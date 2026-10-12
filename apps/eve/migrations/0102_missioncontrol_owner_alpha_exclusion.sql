-- Additive successor to the original published 0099 (SHA-256 52478de2...).
-- Preserve historical migration bytes, caller identity, admitted Work and UNKNOWN exposure.
-- No accounts, enrollment, grants, authority backfill or accounting changes.
-- Both admission directions lock the existing Work row before checking the other origin.
CREATE OR REPLACE FUNCTION missioncontrol_owner_origin_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; e jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'MISSIONCONTROL_ORIGIN_IMMUTABLE'; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND id=NEW.work_id FOR UPDATE;
 SELECT document INTO STRICT e FROM missioncontrol_owner_enrollments WHERE owner_id=NEW.owner_id;
 IF w.version<>NEW.work_version OR w.generation<>NEW.work_generation OR w.lifecycle<>'active' OR w.control<>'agent'
  OR e->'ownerFactoryAdapter' IS NULL OR NEW.document->'pins' IS DISTINCT FROM e->'ownerFactoryAdapter'
  OR NEW.document->>'connectionId' IS DISTINCT FROM e->>'connectionId'
  OR NEW.document->>'factoryVersion' IS DISTINCT FROM e->>'factoryVersion'
  OR NEW.document#>>'{pins,repository}' IS DISTINCT FROM w.repository
  OR EXISTS(SELECT 1 FROM engineering_route_runs r WHERE r.scope_id=w.scope_id AND r.scope_kind=w.scope_kind AND r.work_id=w.id
    AND ((r.work_version=w.version AND r.work_generation=w.generation) OR r.status NOT IN('COMPLETED','FAILED','CANCELLED')))
  OR EXISTS(SELECT 1 FROM engineering_execution x WHERE x.scope_id=w.scope_id AND x.scope_kind=w.scope_kind AND x.work_id=w.id)
  OR EXISTS(SELECT 1 FROM external_alpha_work_authority a WHERE a.owner_id=w.scope_id AND a.work_id=w.id
    AND a.state IN('ISSUED','DISPATCHING','CONSUMED','UNKNOWN'))
 THEN RAISE EXCEPTION 'MISSIONCONTROL_ORIGIN_DENIED'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE FUNCTION missioncontrol_owner_alpha_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF current_setting('myeve.missioncontrol_owner',true) IS DISTINCT FROM NEW.owner_id THEN
  RAISE EXCEPTION 'MISSIONCONTROL_OWNER_CONTEXT_REQUIRED';
 END IF;
 PERFORM 1 FROM engineering_work WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND id=NEW.work_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM missioncontrol_owner_work_origins WHERE owner_id=NEW.owner_id AND work_id=NEW.work_id)
 THEN RAISE EXCEPTION 'MISSIONCONTROL_OWNER_ROUTE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER missioncontrol_owner_alpha_guard BEFORE INSERT ON external_alpha_work_authority
 FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_alpha_guard();
-- statement-breakpoint
