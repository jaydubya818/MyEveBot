-- Owner: Digital Worker / MyFactory beta integration.
-- Preparation is intent on the existing routing decision, never writer authority.
ALTER TABLE engineering_routing_decisions
 ADD COLUMN factory_preparation jsonb CHECK(factory_preparation IS NULL OR jsonb_typeof(factory_preparation)='object'),
 ADD COLUMN factory_observation jsonb CHECK(factory_observation IS NULL OR jsonb_typeof(factory_observation)='object');
CREATE UNIQUE INDEX engineering_factory_prepare_request ON engineering_routing_decisions((factory_preparation#>>'{request,requestId}')) WHERE factory_preparation IS NOT NULL;
-- statement-breakpoint
CREATE FUNCTION engineering_factory_prepare_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; p jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.factory_preparation IS NOT NULL THEN RAISE EXCEPTION 'Factory preparation history cannot be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.factory_preparation IS NOT NULL THEN
  IF NEW.factory_preparation IS DISTINCT FROM OLD.factory_preparation THEN RAISE EXCEPTION 'Factory preparation identity is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.factory_preparation IS NULL THEN RETURN NEW; END IF;
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
CREATE TRIGGER engineering_factory_prepare_guard BEFORE INSERT OR UPDATE OR DELETE ON engineering_routing_decisions FOR EACH ROW EXECUTE FUNCTION engineering_factory_prepare_guard();
