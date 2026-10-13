-- Source-only extension. Applies no installed migration or accounting release.
-- Allow exactly one additive terminal seal; all preparation identity stays immutable.
CREATE OR REPLACE FUNCTION engineering_factory_prepare_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; p jsonb; terminal jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.factory_preparation IS NOT NULL THEN RAISE EXCEPTION 'Factory preparation history cannot be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.factory_preparation IS NOT NULL THEN
  IF NEW.factory_preparation IS NOT DISTINCT FROM OLD.factory_preparation THEN RETURN NEW; END IF;
  terminal=NEW.factory_preparation->'terminal';
  IF OLD.factory_preparation ? 'terminal' OR terminal IS NULL OR jsonb_typeof(terminal)<>'object'
    OR (NEW.factory_preparation-'terminal') IS DISTINCT FROM OLD.factory_preparation
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(terminal) k)
      IS DISTINCT FROM ARRAY['accounting','envelope','receipt']::text[]
    OR terminal->>'accounting' IS DISTINCT FROM 'HOLD'
    OR terminal#>>'{receipt,schema}' IS DISTINCT FROM 'factory-capability-preparation-terminal/v1'
    OR COALESCE(terminal#>>'{receipt,outcome}' NOT IN ('DEFINITELY_NOT_ADMITTED','ADMISSION_UNCERTAIN'),true)
    OR terminal#>>'{receipt,requestId}' IS DISTINCT FROM OLD.factory_preparation#>>'{request,requestId}'
    OR OLD.scope_kind IS DISTINCT FROM 'personal'
    OR terminal#>>'{receipt,ownerId}' IS DISTINCT FROM OLD.scope_id
    OR terminal#>>'{receipt,factoryVersion}' IS DISTINCT FROM OLD.factory_preparation#>>'{environment,binding,factoryVersion}'
    OR terminal#>>'{receipt,workId}' IS DISTINCT FROM OLD.work_id::text
    OR terminal#>>'{receipt,generation}' IS DISTINCT FROM OLD.factory_preparation#>>'{request,workGeneration}'
    OR jsonb_typeof(terminal->'envelope') IS DISTINCT FROM 'object'
    THEN RAISE EXCEPTION 'Factory preparation identity is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.factory_preparation IS NULL THEN RETURN NEW; END IF;
 IF NEW.factory_preparation ? 'terminal' THEN RAISE EXCEPTION 'Factory terminal requires retained preparation'; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 p=NEW.factory_preparation->'request';
 IF NEW.selected_route<>'MYFACTORY' OR NEW.status<>'PROPOSED' OR NEW.work_version<>w.version OR w.control<>'agent' OR w.lifecycle<>'active'
  OR p->>'workId' IS DISTINCT FROM w.id::text OR p->>'workGeneration' IS DISTINCT FROM w.generation::text
  OR p->>'repository' IS DISTINCT FROM w.repository OR p->>'requestId' IS NULL
  OR p->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR p->>'deadline' IS NULL OR (p->>'deadline')::timestamptz<=clock_timestamp()
  OR EXISTS(SELECT 1 FROM engineering_route_runs r WHERE r.scope_id=w.scope_id AND r.scope_kind=w.scope_kind AND r.work_id=w.id AND r.status NOT IN ('COMPLETED','FAILED','CANCELLED'))
  THEN RAISE EXCEPTION 'Factory preparation must bind current writer-free Work intent'; END IF;
 RETURN NEW;
END $$;
