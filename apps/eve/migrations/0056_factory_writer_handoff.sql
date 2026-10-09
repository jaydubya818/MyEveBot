-- Owner: Gate B on codex/digital-worker-integration. One existing route Run is
-- the writer slot. These additions grant no authority to a Gate C receipt.
ALTER TABLE engineering_route_runs
 ADD COLUMN writer_generation bigint,
 ADD COLUMN factory_request_id uuid UNIQUE REFERENCES engineering_factory_requests(id),
 ADD COLUMN dispatch_state text CHECK(dispatch_state IN ('PREPARED','UNKNOWN','DISPATCHED','STOPPING','TERMINAL')),
 ADD COLUMN dispatch_identity uuid UNIQUE,
 ADD COLUMN dispatch_claimed_at timestamptz,
 ADD COLUMN stop_reason text,
 ADD COLUMN quiescence jsonb CHECK(quiescence IS NULL OR jsonb_typeof(quiescence)='object'),
 ADD COLUMN fenced_at timestamptz,
 ADD COLUMN completion_retired_at timestamptz,
 ADD COLUMN custody_snapshot jsonb CHECK(custody_snapshot IS NULL OR jsonb_typeof(custody_snapshot)='object'),
 ADD COLUMN factory_candidate jsonb CHECK(factory_candidate IS NULL OR jsonb_typeof(factory_candidate)='object');
WITH numbered AS (SELECT id,row_number() OVER(PARTITION BY scope_id,scope_kind,work_id ORDER BY updated_at,id) n FROM engineering_route_runs)
 UPDATE engineering_route_runs r SET writer_generation=n.n FROM numbered n WHERE n.id=r.id;
ALTER TABLE engineering_route_runs ALTER COLUMN writer_generation SET NOT NULL;
ALTER TABLE engineering_route_runs ADD CONSTRAINT engineering_writer_generation_positive CHECK(writer_generation>0);
CREATE UNIQUE INDEX engineering_writer_generation ON engineering_route_runs(scope_id,scope_kind,work_id,writer_generation);
-- statement-breakpoint
ALTER TABLE engineering_direct_workspaces
 ADD COLUMN producer text NOT NULL DEFAULT 'NATIVE_SOFIE' CHECK(producer IN ('NATIVE_SOFIE','MYFACTORY')),
 ADD COLUMN factory_receipt_id uuid REFERENCES engineering_factory_receipts(id);
ALTER TABLE engineering_direct_workspaces ADD CONSTRAINT engineering_workspace_producer CHECK((producer='MYFACTORY')=(factory_receipt_id IS NOT NULL));
ALTER TABLE engineering_direct_verification_jobs ADD COLUMN route_run_id uuid REFERENCES engineering_route_runs(id);
-- statement-breakpoint
-- All productive paths and control transitions use the existing Work lock.
-- UNKNOWN is deliberately an open writer, including after its Work is fenced.
CREATE FUNCTION engineering_writer_run_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; d engineering_routing_decisions%ROWTYPE; q engineering_factory_requests%ROWTYPE; f jsonb;
BEGIN
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  NEW.writer_generation=COALESCE((SELECT max(writer_generation) FROM engineering_route_runs WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id),0)+1;
  IF NEW.route='MYFACTORY' THEN
   SELECT * INTO STRICT d FROM engineering_routing_decisions WHERE id=NEW.decision_id;
   f=d.admission_authority_snapshot->'factory';
   IF f IS NULL OR f->>'requestId' IS NULL THEN RAISE EXCEPTION 'Factory writer requires bounded trusted admission'; END IF;
   SELECT * INTO STRICT q FROM engineering_factory_requests WHERE id=(f->>'requestId')::uuid;
   IF q.scope_id<>w.scope_id OR q.scope_kind<>w.scope_kind OR q.work_id<>w.id OR NOT q.current OR q.cancelled
    OR (q.binding->>'workVersion')::integer<>w.version OR (q.binding->>'workGeneration')::integer<>w.generation
    OR (q.binding->>'criteriaVersion')::integer<>w.criteria_version OR w.lifecycle<>'active' OR w.control<>'agent'
    OR NEW.work_version<>w.version OR NEW.work_generation<>w.generation
    OR q.factory_id IS DISTINCT FROM NEW.provider_id OR q.binding->>'factoryVersion' IS DISTINCT FROM NEW.provider_version
    OR f->>'repository' IS DISTINCT FROM w.repository OR f->>'baseSha' IS DISTINCT FROM q.binding->>'inputCommit'
    OR f->>'profileHash' !~ '^[a-f0-9]{64}$' OR f->>'profileHash' IS NULL
    OR f->>'deadline' IS DISTINCT FROM d.admission_authority_snapshot#>>'{contract,deadline}'
    OR (f->>'deadline')::timestamptz<=clock_timestamp()
    OR jsonb_typeof(f->'allowedPaths') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'allowedPaths')=0
    OR EXISTS(SELECT 1 FROM engineering_native_runtime n WHERE n.scope_id=w.scope_id AND n.scope_kind=w.scope_kind AND n.work_id=w.id AND (n.inflight OR n.usage_unknown))
    OR EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id AND c.status IN ('RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN'))
    THEN RAISE EXCEPTION 'Factory writer binding or native quiescence denied'; END IF;
   NEW.factory_request_id=q.id; NEW.dispatch_identity=q.id; NEW.dispatch_state='PREPARED';
  END IF;
 ELSE
  IF (NEW.id,NEW.scope_id,NEW.scope_kind,NEW.work_id,NEW.route,NEW.provider_id,NEW.provider_version,NEW.decision_id,NEW.work_version,NEW.work_generation,NEW.writer_generation,NEW.factory_request_id,NEW.dispatch_identity)
   IS DISTINCT FROM (OLD.id,OLD.scope_id,OLD.scope_kind,OLD.work_id,OLD.route,OLD.provider_id,OLD.provider_version,OLD.decision_id,OLD.work_version,OLD.work_generation,OLD.writer_generation,OLD.factory_request_id,OLD.dispatch_identity)
   THEN RAISE EXCEPTION 'Writer identity is immutable'; END IF;
  IF OLD.custody_snapshot IS NOT NULL AND NEW.custody_snapshot IS DISTINCT FROM OLD.custody_snapshot THEN RAISE EXCEPTION 'Historical custody is immutable'; END IF;
  IF OLD.factory_candidate IS NOT NULL AND NEW.factory_candidate IS DISTINCT FROM OLD.factory_candidate THEN RAISE EXCEPTION 'Factory candidate custody is immutable'; END IF;
  IF OLD.fenced_at IS NOT NULL AND (NEW.fenced_at IS DISTINCT FROM OLD.fenced_at OR NEW.status NOT IN ('COMPLETED','FAILED','CANCELLED')) THEN RAISE EXCEPTION 'Fenced writer cannot reactivate'; END IF;
  IF OLD.quiescence IS NOT NULL AND NEW.quiescence IS DISTINCT FROM OLD.quiescence THEN RAISE EXCEPTION 'Quiescence observation is immutable'; END IF;
  IF OLD.dispatch_claimed_at IS NOT NULL AND NEW.dispatch_claimed_at IS DISTINCT FROM OLD.dispatch_claimed_at THEN RAISE EXCEPTION 'Dispatch cannot be repeated'; END IF;
  IF NEW.factory_request_id IS NOT NULL THEN
   IF NEW.status IN ('COMPLETED','FAILED','CANCELLED') AND (NEW.dispatch_state IS DISTINCT FROM 'TERMINAL' OR NEW.quiescence IS NULL OR NEW.fenced_at IS NULL) THEN RAISE EXCEPTION 'Factory release requires proven quiescence'; END IF;
   IF OLD.dispatch_state='TERMINAL' AND NEW.dispatch_state IS DISTINCT FROM 'TERMINAL' THEN RAISE EXCEPTION 'Terminal dispatch is immutable'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER engineering_writer_run_guard BEFORE INSERT OR UPDATE ON engineering_route_runs FOR EACH ROW EXECUTE FUNCTION engineering_writer_run_guard();
-- statement-breakpoint
CREATE FUNCTION engineering_writer_control_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF (NEW.control,NEW.lifecycle,NEW.version,NEW.generation) IS DISTINCT FROM (OLD.control,OLD.lifecycle,OLD.version,OLD.generation)
 AND EXISTS(SELECT 1 FROM engineering_route_runs r WHERE r.scope_id=OLD.scope_id AND r.scope_kind=OLD.scope_kind AND r.work_id=OLD.id AND r.factory_request_id IS NOT NULL AND r.status NOT IN ('COMPLETED','FAILED','CANCELLED'))
 THEN RAISE EXCEPTION 'Factory must stop and prove quiescence before Work control changes'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER engineering_writer_control_guard BEFORE UPDATE ON engineering_work FOR EACH ROW EXECUTE FUNCTION engineering_writer_control_guard();
-- statement-breakpoint
-- Current native projections can be rebound only after their exact old bytes
-- have been sealed onto their historical route Run. No rows/history are deleted.
CREATE FUNCTION engineering_writer_custody_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; r engineering_route_runs%ROWTYPE; oldrun engineering_route_runs%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Writer custody cannot be deleted'; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 SELECT * INTO STRICT r FROM engineering_route_runs WHERE id=NEW.route_run_id FOR UPDATE;
 IF TG_OP='UPDATE' AND NEW.route_run_id<>OLD.route_run_id THEN
  SELECT * INTO STRICT oldrun FROM engineering_route_runs WHERE id=OLD.route_run_id;
  IF oldrun.fenced_at IS NULL OR oldrun.quiescence IS NULL OR oldrun.status NOT IN ('COMPLETED','FAILED','CANCELLED') THEN RAISE EXCEPTION 'Old writer custody is not quiescent'; END IF;
  IF oldrun.custody_snapshot IS NULL THEN
   UPDATE engineering_route_runs SET custody_snapshot=jsonb_build_object(
    'runtime',(SELECT to_jsonb(n) FROM engineering_native_runtime n WHERE n.route_run_id=oldrun.id),
    'workspace',(SELECT to_jsonb(d) FROM engineering_direct_workspaces d WHERE d.route_run_id=oldrun.id)) WHERE id=oldrun.id;
  ELSE
   IF oldrun.custody_snapshot->(CASE WHEN TG_TABLE_NAME='engineering_native_runtime' THEN 'runtime' ELSE 'workspace' END) IS DISTINCT FROM to_jsonb(OLD)
   THEN RAISE EXCEPTION 'Historical custody snapshot mismatch'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='engineering_native_runtime' THEN
  IF TG_OP='INSERT' OR NEW.route_run_id<>OLD.route_run_id THEN
   IF r.route<>'DEEP_AGENT' OR r.status NOT IN ('QUEUED','RUNNING') OR r.work_generation<>w.generation THEN RAISE EXCEPTION 'Native runtime needs current normal admission'; END IF;
  END IF;
 ELSE
  IF NEW.producer='MYFACTORY' THEN
   IF r.route<>'MYFACTORY' OR r.fenced_at IS NULL OR r.quiescence IS NULL OR r.factory_candidate IS NULL
    OR NEW.factory_receipt_id::text IS DISTINCT FROM r.factory_candidate->>'receiptId'
    OR NEW.candidates IS DISTINCT FROM r.factory_candidate->'candidates'
    OR NEW.source_files IS DISTINCT FROM r.factory_candidate->'sourceFiles'
    OR NEW.draft_files IS DISTINCT FROM r.factory_candidate->'files'
    OR NEW.profile_hash IS DISTINCT FROM r.factory_candidate->>'profileHash'
    THEN RAISE EXCEPTION 'Factory workspace requires exact immutable terminal custody'; END IF;
  ELSIF r.status NOT IN ('QUEUED','RUNNING') OR r.route<>'DEEP_AGENT' OR r.work_generation<>w.generation OR w.lifecycle<>'active' OR w.control<>'agent'
   THEN RAISE EXCEPTION 'Native workspace writer was fenced';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER engineering_native_custody_guard BEFORE INSERT OR UPDATE OR DELETE ON engineering_native_runtime FOR EACH ROW EXECUTE FUNCTION engineering_writer_custody_guard();
CREATE TRIGGER engineering_workspace_custody_guard BEFORE INSERT OR UPDATE OR DELETE ON engineering_direct_workspaces FOR EACH ROW EXECUTE FUNCTION engineering_writer_custody_guard();
-- statement-breakpoint
CREATE FUNCTION engineering_writer_handoff(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; r engineering_route_runs%ROWTYPE; d engineering_routing_decisions%ROWTYPE; q engineering_factory_requests%ROWTYPE; receipt engineering_factory_receipts%ROWTYPE; op text=p->>'action'; obs jsonb=p->'observation'; data jsonb=p->'custody'; won boolean=false;
BEGIN
 IF p->>'scopeKind' IS DISTINCT FROM 'personal' OR p->>'actorId' IS DISTINCT FROM p->>'scopeId' THEN RAISE EXCEPTION 'Owner scope required'; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=p->>'scopeId' AND scope_kind='personal' AND id=(p->>'workId')::uuid FOR UPDATE;
 SELECT * INTO STRICT r FROM engineering_route_runs WHERE id=(p->>'runId')::uuid AND scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id FOR UPDATE;
 IF r.writer_generation IS DISTINCT FROM (p->>'writerGeneration')::bigint THEN RAISE EXCEPTION 'Stale writer fence'; END IF;
 SELECT * INTO STRICT d FROM engineering_routing_decisions WHERE id=r.decision_id;
 IF op='fence-native' THEN
  IF r.route<>'DEEP_AGENT' THEN RAISE EXCEPTION 'Native writer required'; END IF;
  IF r.fenced_at IS NULL THEN
   -- All productive draft mutations take this same Work lock through the guard.
   PERFORM 1 FROM engineering_direct_workspaces WHERE route_run_id=r.id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM engineering_native_runtime WHERE route_run_id=r.id AND (inflight OR usage_unknown))
    OR EXISTS(SELECT 1 FROM engineering_work_model_calls WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND status IN ('RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN'))
    OR EXISTS(SELECT 1 FROM engineering_direct_verification_jobs WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND status IN ('RUNNING','RECOVERY_REQUIRED'))
    THEN RAISE EXCEPTION 'Native mutation or verification is unresolved'; END IF;
   UPDATE engineering_route_runs SET status=CASE WHEN status IN ('COMPLETED','FAILED','CANCELLED') THEN status ELSE 'CANCELLED' END,fenced_at=clock_timestamp(),completion_retired_at=clock_timestamp(),
    quiescence=jsonb_build_object('kind','NATIVE_DB_QUIESCENT','runId',r.id,'writerGeneration',r.writer_generation,'at',clock_timestamp()),updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  END IF;
 ELSIF op='advance' THEN
  IF r.fenced_at IS NULL OR r.quiescence IS NULL OR r.status NOT IN ('COMPLETED','FAILED','CANCELLED')
   OR EXISTS(SELECT 1 FROM engineering_route_runs WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND status NOT IN ('COMPLETED','FAILED','CANCELLED'))
   OR EXISTS(SELECT 1 FROM engineering_route_runs WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND writer_generation>r.writer_generation)
   THEN RAISE EXCEPTION 'Current writer must be proven terminal before succession'; END IF;
  IF w.version IS DISTINCT FROM (p->>'expectedVersion')::integer OR w.generation<>r.work_generation THEN RAISE EXCEPTION 'Stale Work succession'; END IF;
  UPDATE engineering_work SET version=version+1,generation=generation+1,control=CASE WHEN p->>'target'='HUMAN' THEN 'human' ELSE 'agent' END,updated_at=clock_timestamp() WHERE id=w.id RETURNING * INTO w;
  INSERT INTO engineering_work_events(id,scope_id,scope_kind,work_id,version,actor_id,kind) VALUES((p->>'eventId')::uuid,w.scope_id,w.scope_kind,w.id,w.version,p->>'actorId','writer_handoff');
  RETURN to_jsonb(w);
 ELSE
  IF r.factory_request_id IS NULL THEN RAISE EXCEPTION 'Factory writer required'; END IF;
  SELECT * INTO STRICT q FROM engineering_factory_requests WHERE id=r.factory_request_id;
  IF op='claim-dispatch' THEN
   IF r.dispatch_state='PREPARED' THEN
    IF w.version<>r.work_version OR w.generation<>r.work_generation OR w.control<>'agent' OR w.lifecycle<>'active' OR q.cancelled OR NOT q.current OR (d.admission_authority_snapshot#>>'{factory,deadline}')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'Factory dispatch authority expired or fenced'; END IF;
    UPDATE engineering_route_runs SET dispatch_state='UNKNOWN',status='UNKNOWN',dispatch_claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;won=true;
   END IF;
  ELSIF op='ack-dispatch' THEN
   IF r.dispatch_state='UNKNOWN' AND r.stop_reason IS NULL THEN UPDATE engineering_route_runs SET dispatch_state='DISPATCHED',status='RUNNING',updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r; END IF;
  ELSIF op='stop' THEN
   IF r.dispatch_state<>'TERMINAL' THEN UPDATE engineering_route_runs SET dispatch_state='STOPPING',status='BLOCKED',stop_reason=COALESCE(stop_reason,p->>'reason','cancel'),updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r; END IF;
  ELSIF op='reconcile' THEN
   -- EXECUTE is granted only to the trusted reconciler, never a model/user role.
   -- The adapter must establish this exact remote attempt is terminal with no
   -- productive process. A signed result or elapsed deadline is insufficient.
   IF obs IS NULL OR obs->>'runId' IS DISTINCT FROM r.id::text OR obs->>'writerGeneration' IS DISTINCT FROM r.writer_generation::text
    OR obs->>'dispatchIdentity' IS DISTINCT FROM r.dispatch_identity::text OR obs->>'factoryId' IS DISTINCT FROM q.factory_id
    OR obs->>'factoryVersion' IS DISTINCT FROM q.binding->>'factoryVersion' OR obs->>'requestId' IS DISTINCT FROM q.binding->>'requestId'
    OR obs->>'remoteRunId' IS DISTINCT FROM q.binding->>'runId' OR obs->>'workOrderId' IS DISTINCT FROM q.binding->>'workOrderId'
    OR obs->>'state' NOT IN ('COMPLETED','FAILED','CANCELLED','NOT_DISPATCHED') OR obs->>'state' IS NULL
    OR obs->>'quiescent' IS DISTINCT FROM 'true' OR length(COALESCE(obs->>'evidenceRef',''))=0
    THEN RAISE EXCEPTION 'Exact trusted remote quiescence evidence required'; END IF;
   IF r.dispatch_state<>'TERMINAL' THEN UPDATE engineering_route_runs SET dispatch_state='TERMINAL',status=CASE WHEN obs->>'state'='COMPLETED' THEN 'COMPLETED' WHEN obs->>'state'='FAILED' THEN 'FAILED' ELSE 'CANCELLED' END,
    quiescence=obs,fenced_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r; END IF;
  ELSIF op='custody' THEN
   IF r.factory_candidate IS NOT NULL THEN
    IF r.factory_candidate<>data THEN RAISE EXCEPTION 'Factory custody replay conflict'; END IF;
    RETURN to_jsonb(r);
   END IF;
   SELECT x.* INTO STRICT receipt FROM engineering_factory_receipts x JOIN engineering_factory_admissions a ON a.receipt_id=x.id AND a.request_id=x.request_id WHERE x.id=(data->>'receiptId')::uuid AND x.request_id=q.id AND x.state='ADMITTED';
   IF r.status<>'COMPLETED' OR r.fenced_at IS NULL OR r.quiescence IS NULL OR r.stop_reason IS NOT NULL
    OR w.version<>r.work_version OR w.generation<>r.work_generation OR w.control<>'agent' OR w.lifecycle<>'active'
    OR NOT q.current OR q.cancelled OR EXISTS(SELECT 1 FROM engineering_route_runs WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND writer_generation>r.writer_generation)
    THEN RETURN jsonb_build_object('historical',true,'runId',r.id); END IF;
   IF data#>>'{candidates,0,sha}' IS DISTINCT FROM receipt.provenance#>>'{manifest,candidate,commit}'
    OR data#>>'{candidates,0,tree}' IS DISTINCT FROM receipt.provenance#>>'{manifest,candidate,tree}'
    OR data->>'profileHash' IS DISTINCT FROM d.admission_authority_snapshot#>>'{factory,profileHash}'
    OR data->>'baseSha' IS DISTINCT FROM q.binding->>'inputCommit'
    OR jsonb_array_length(data->'candidates')<>1 OR data->>'repository' IS DISTINCT FROM w.repository
    THEN RAISE EXCEPTION 'Candidate custody binding denied'; END IF;
   UPDATE engineering_route_runs SET factory_candidate=data WHERE id=r.id RETURNING * INTO r;
   INSERT INTO engineering_direct_workspaces(scope_id,scope_kind,work_id,decision_id,route_run_id,work_version,work_generation,criteria_version,repository,base_sha,profile_hash,deadline,source_files,draft_files,plan,phase,candidates,producer,factory_receipt_id)
    VALUES(w.scope_id,w.scope_kind,w.id,d.id,r.id,w.version,w.generation,w.criteria_version,w.repository,data->>'baseSha',data->>'profileHash',(d.admission_authority_snapshot#>>'{factory,deadline}')::timestamptz,data->'sourceFiles',data->'files','Factory candidate in MyEve custody','VERIFICATION_REQUESTED',data->'candidates','MYFACTORY',receipt.id)
    ON CONFLICT(scope_id,scope_kind,work_id) DO UPDATE SET decision_id=EXCLUDED.decision_id,route_run_id=EXCLUDED.route_run_id,work_version=EXCLUDED.work_version,work_generation=EXCLUDED.work_generation,criteria_version=EXCLUDED.criteria_version,repository=EXCLUDED.repository,base_sha=EXCLUDED.base_sha,profile_hash=EXCLUDED.profile_hash,deadline=EXCLUDED.deadline,source_files=EXCLUDED.source_files,draft_files=EXCLUDED.draft_files,plan=EXCLUDED.plan,phase=EXCLUDED.phase,revision=engineering_direct_workspaces.revision+1,candidates=EXCLUDED.candidates,evidence='[]',producer=EXCLUDED.producer,factory_receipt_id=EXCLUDED.factory_receipt_id,updated_at=clock_timestamp();
  ELSE RAISE EXCEPTION 'Unknown handoff operation'; END IF;
 END IF;
 RETURN to_jsonb(r)||jsonb_build_object('dispatchWon',won);
END $$;
REVOKE ALL ON FUNCTION engineering_writer_handoff(jsonb) FROM PUBLIC;
-- statement-breakpoint
-- The protected verifier reuses its existing job/lease; this predicate admits
-- terminal Factory custody, never an active native writer manufactured for it.
CREATE FUNCTION engineering_candidate_verifiable(s text,k text,w uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM engineering_direct_workspaces x JOIN engineering_work work ON work.scope_id=x.scope_id AND work.scope_kind=x.scope_kind AND work.id=x.work_id
 JOIN engineering_route_runs r ON r.id=x.route_run_id JOIN engineering_routing_decisions d ON d.id=x.decision_id
 WHERE x.scope_id=s AND x.scope_kind=k AND x.work_id=w AND work.version=x.work_version AND work.generation=x.work_generation AND work.criteria_version=x.criteria_version AND work.control='agent' AND work.lifecycle='active' AND x.deadline>clock_timestamp()
 AND d.status='ADMITTED' AND r.decision_id=d.id
 AND ((x.producer='NATIVE_SOFIE' AND r.route='DEEP_AGENT' AND r.status='RUNNING')
 OR (x.producer='MYFACTORY' AND r.route='MYFACTORY' AND r.status='COMPLETED' AND r.fenced_at IS NOT NULL AND r.quiescence IS NOT NULL AND r.factory_candidate IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM engineering_route_runs n WHERE n.scope_id=s AND n.scope_kind=k AND n.work_id=w AND n.writer_generation>r.writer_generation))))
$$;

-- statement-breakpoint
CREATE OR REPLACE FUNCTION engineering_completion_capacity(s text, w uuid) RETURNS TABLE(micro_usd bigint, call_slots bigint)
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT COALESCE(sum(capacity.unused*(stage->>'microUsd')::bigint),0)::bigint,
   COALESCE(sum(capacity.unused),0)::bigint
 FROM engineering_routing_decisions d
 LEFT JOIN engineering_direct_workspaces n ON n.scope_id=d.scope_id AND n.scope_kind=d.scope_kind
   AND n.work_id=d.work_id AND n.route_run_id::text=d.admission_authority_snapshot#>>'{completion,runId}'
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.admission_authority_snapshot#>'{completion,stages}','[]'::jsonb)) stage
 CROSS JOIN LATERAL (SELECT CASE
   WHEN EXISTS(SELECT 1 FROM engineering_work_events e WHERE e.scope_id=s AND e.scope_kind='personal'
     AND e.work_id=w AND e.kind='cancel' AND e.version>(d.admission_authority_snapshot#>>'{completion,workVersion}')::integer) THEN 0
   WHEN stage->>'id'='IMPLEMENT' AND jsonb_array_length(COALESCE(n.candidates,'[]'::jsonb))>0 THEN 0
   WHEN stage->>'id'='REPAIR' AND EXISTS(SELECT 1 FROM engineering_native_results p
     WHERE p.scope_id=s AND p.scope_kind='personal' AND p.work_id=w
       AND p.candidate_sha=n.candidates->-1->>'sha'
       AND p.work_generation=(d.admission_authority_snapshot#>>'{completion,workGeneration}')::integer
       AND (p.proof->>'outcome'='PARTIAL' OR (p.proof->>'outcome'='FAILED' AND jsonb_array_length(n.candidates)>=2))) THEN 0
   ELSE GREATEST(0,(stage->>'calls')::integer-(
     SELECT count(*) FROM engineering_work_model_calls c
     WHERE c.scope_id=s AND c.scope_kind='personal' AND c.work_id=w
       AND c.bounds#>>'{completion,id}'=d.admission_authority_snapshot#>>'{completion,id}'
       AND c.bounds#>>'{completion,stage}'=stage->>'id'
   )) END AS unused) capacity
 WHERE d.scope_id=s AND d.scope_kind='personal' AND d.work_id=w
 AND NOT EXISTS(SELECT 1 FROM engineering_route_runs retired WHERE retired.decision_id=d.id AND retired.completion_retired_at IS NOT NULL AND retired.fenced_at IS NOT NULL AND retired.quiescence IS NOT NULL)
 -- Expiry/idleness never releases unfinished obligations; UNKNOWN provider
 -- exposure remains in the common ledger even after proven branch release.
$$;

-- statement-breakpoint
CREATE FUNCTION engineering_writer_history_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical writer records cannot be deleted'; END $$;
CREATE TRIGGER engineering_writer_history_no_delete BEFORE DELETE ON engineering_route_runs FOR EACH ROW EXECUTE FUNCTION engineering_writer_history_no_delete();
