-- Operational ownership only. Preparation (0057), Factory grants and Proof retain their owners.
-- No historical preparation is enrolled or changed by this migration.
CREATE TABLE engineering_factory_validation_lifecycle (
 decision_id uuid PRIMARY KEY REFERENCES engineering_routing_decisions(id),
 scope_id text NOT NULL, scope_kind text NOT NULL CHECK(scope_kind='personal'), work_id uuid NOT NULL,
 work_version integer NOT NULL, work_generation integer NOT NULL,
 request_id uuid NOT NULL UNIQUE, configuration_hash text NOT NULL,
 factory_version text NOT NULL, environment_binding jsonb NOT NULL,
 deadline timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'IDLE' CHECK(state IN ('IDLE','WAITING_GRANT','IN_FLIGHT','HALTED','COMPLETED')),
 claim_token uuid, claim_epoch bigint NOT NULL DEFAULT 0 CHECK(claim_epoch>=0), lease_until timestamptz,
 failure text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id),
 UNIQUE(scope_id,scope_kind,work_id,work_generation),
 CHECK((state='IN_FLIGHT')=(claim_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK(state='IN_FLIGHT' OR (claim_token IS NULL AND lease_until IS NULL)),
 CHECK((state='HALTED')=(failure IS NOT NULL)),
 CHECK(lease_until IS NULL OR lease_until<=deadline)
);
-- statement-breakpoint
CREATE FUNCTION engineering_factory_validation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d engineering_routing_decisions%ROWTYPE; w engineering_work%ROWTYPE; p jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Validation lifecycle history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['state','claim_token','claim_epoch','lease_until','failure','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','claim_token','claim_epoch','lease_until','failure','updated_at']) THEN RAISE EXCEPTION 'Validation identity is immutable'; END IF;
  IF OLD.state IN ('HALTED','COMPLETED') THEN RAISE EXCEPTION 'Validation terminal state is immutable'; END IF;
  IF NEW.state='HALTED' THEN
   IF NEW.claim_epoch<>OLD.claim_epoch+1 THEN RAISE EXCEPTION 'Validation halt must fence claimant'; END IF;
  ELSIF NEW.state='IN_FLIGHT' THEN
   IF OLD.state NOT IN ('IDLE','WAITING_GRANT') OR NEW.claim_epoch<>OLD.claim_epoch+1 OR NEW.claim_token IS NULL
    OR NEW.lease_until<=clock_timestamp() OR NEW.lease_until>clock_timestamp()+interval '45 seconds' THEN RAISE EXCEPTION 'Validation claim denied'; END IF;
  ELSIF OLD.state<>'IN_FLIGHT' OR NEW.state NOT IN ('IDLE','WAITING_GRANT','COMPLETED') OR NEW.claim_epoch<>OLD.claim_epoch
    OR OLD.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Validation transition denied'; END IF;
 ELSE
  IF NEW.state<>'IDLE' OR NEW.claim_epoch<>0 THEN RAISE EXCEPTION 'Validation initial state denied'; END IF;
 END IF;
 SELECT * INTO STRICT d FROM engineering_routing_decisions WHERE id=NEW.decision_id;
 p=d.factory_preparation;
 IF p->>'validationProtocol' IS DISTINCT FROM '2' OR p ? 'validationState'
  OR (d.scope_id,d.scope_kind,d.work_id,d.work_version) IS DISTINCT FROM (NEW.scope_id,NEW.scope_kind,NEW.work_id,NEW.work_version)
  OR (p#>>'{request,workGeneration}')::integer IS DISTINCT FROM NEW.work_generation
  OR (p#>>'{request,requestId}')::uuid IS DISTINCT FROM NEW.request_id
  OR (p#>>'{request,deadline}')::timestamptz IS DISTINCT FROM NEW.deadline
  OR p->>'configurationHash' IS DISTINCT FROM NEW.configuration_hash
  OR p#>'{environment,binding}' IS DISTINCT FROM NEW.environment_binding
  OR p#>>'{environment,binding,factoryVersion}' IS DISTINCT FROM NEW.factory_version
  THEN RAISE EXCEPTION 'Validation preparation binding denied'; END IF;
 -- Terminal fencing/cleanup is allowed after expiry or a Work revision change.
 IF NEW.state<>'HALTED' THEN
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id;
  IF (w.version,w.generation,w.lifecycle,w.control) IS DISTINCT FROM (NEW.work_version,NEW.work_generation,'active','agent')
   OR NEW.deadline<=clock_timestamp() THEN RAISE EXCEPTION 'Validation authority expired or Work changed'; END IF;
 END IF;
 NEW.updated_at=clock_timestamp(); RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER engineering_factory_validation_guard BEFORE INSERT OR UPDATE OR DELETE ON engineering_factory_validation_lifecycle
 FOR EACH ROW EXECUTE FUNCTION engineering_factory_validation_guard();
