-- Provenance and correlations on the existing Work/writer, not another execution ledger.
-- No enrollment, runtime privilege, account, policy or spending grant is installed.
CREATE TABLE missioncontrol_owner_work_origins (
 owner_id text NOT NULL, installation_id text NOT NULL, work_id uuid NOT NULL,
 work_version integer NOT NULL CHECK(work_version>0),work_generation integer NOT NULL CHECK(work_generation>0),
 scope_kind text NOT NULL DEFAULT 'personal' CHECK(scope_kind='personal'),document jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_id,work_id,work_version,work_generation),
 FOREIGN KEY(owner_id,installation_id) REFERENCES missioncontrol_owner_enrollments(owner_id,installation_id),
 FOREIGN KEY(owner_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id),
 CHECK(document->>'schema' IS NOT DISTINCT FROM 'mc-owner-factory-origin/v1'),
 CHECK(document->>'installationId' IS NOT DISTINCT FROM installation_id),
 CHECK(document->>'tupleSha256' ~ '^[a-f0-9]{64}$' AND document->>'tupleSha256' IS NOT NULL)
);
ALTER TABLE missioncontrol_owner_work_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE missioncontrol_owner_work_origins FORCE ROW LEVEL SECURITY;
CREATE POLICY missioncontrol_owner ON missioncontrol_owner_work_origins
 USING(owner_id=current_setting('myeve.missioncontrol_owner',true)) WITH CHECK(owner_id=current_setting('myeve.missioncontrol_owner',true));
REVOKE ALL ON missioncontrol_owner_work_origins FROM PUBLIC;
ALTER TABLE engineering_route_runs ADD COLUMN missioncontrol_binding jsonb;
-- statement-breakpoint
CREATE FUNCTION missioncontrol_owner_origin_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
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
 THEN RAISE EXCEPTION 'MISSIONCONTROL_ORIGIN_DENIED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER missioncontrol_owner_origin_guard BEFORE INSERT OR UPDATE OR DELETE ON missioncontrol_owner_work_origins
 FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_origin_guard();
-- statement-breakpoint
CREATE FUNCTION missioncontrol_owner_writer_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE o missioncontrol_owner_work_origins%ROWTYPE; d engineering_routing_decisions%ROWTYPE;
 q engineering_factory_requests%ROWTYPE; p missioncontrol_execution_permits%ROWTYPE; r missioncontrol_admission_receipts%ROWTYPE;
 b jsonb; current_policy record; e missioncontrol_owner_enrollments%ROWTYPE;
BEGIN
 -- Shared with origin creation, receiving admission and signed revocation.
 PERFORM 1 FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 PERFORM set_config('myeve.missioncontrol_owner',NEW.scope_id,true);
 IF TG_OP='UPDATE' THEN
  IF NEW.missioncontrol_binding IS DISTINCT FROM OLD.missioncontrol_binding THEN RAISE EXCEPTION 'MISSIONCONTROL_WRITER_BINDING_IMMUTABLE'; END IF;
  IF OLD.missioncontrol_binding IS NOT NULL AND EXISTS(
   SELECT 1 FROM missioncontrol_permit_controls c JOIN missioncontrol_execution_permits prior_permit USING(owner_id,permit_id)
   WHERE prior_permit.owner_id=OLD.scope_id AND prior_permit.work_id=OLD.work_id AND prior_permit.work_version=OLD.work_version AND prior_permit.work_generation=OLD.work_generation AND c.operation='revoke')
   AND ((NEW.dispatch_state IN('UNKNOWN','DISPATCHED') AND NEW.dispatch_state IS DISTINCT FROM OLD.dispatch_state)
    OR NEW.factory_candidate IS DISTINCT FROM OLD.factory_candidate OR NEW.custody_snapshot IS DISTINCT FROM OLD.custody_snapshot)
  THEN RAISE EXCEPTION 'MISSIONCONTROL_WORK_FENCED'; END IF;
  -- Ordinary disable does not cancel admitted authority. Stop/reconcile remain available after revoke.
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM missioncontrol_owner_work_origins WHERE owner_id=NEW.scope_id AND work_id=NEW.work_id) THEN
  IF NEW.missioncontrol_binding IS NOT NULL THEN RAISE EXCEPTION 'MISSIONCONTROL_ORIGIN_REQUIRED'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO o FROM missioncontrol_owner_work_origins WHERE owner_id=NEW.scope_id AND work_id=NEW.work_id
  AND work_version=NEW.work_version AND work_generation=NEW.work_generation;
 IF NOT FOUND OR NEW.scope_kind<>'personal' OR NEW.route<>'MYFACTORY' THEN RAISE EXCEPTION 'MISSIONCONTROL_OWNER_ROUTE_REQUIRED'; END IF;
 SELECT * INTO STRICT d FROM engineering_routing_decisions WHERE id=NEW.decision_id;
 SELECT * INTO STRICT q FROM engineering_factory_requests WHERE id=NEW.factory_request_id;
 b=d.admission_authority_snapshot->'missionControl';
 IF d.status<>'ADMITTED' OR (d.scope_id,d.scope_kind,d.work_id,d.work_version) IS DISTINCT FROM (NEW.scope_id,NEW.scope_kind,NEW.work_id,NEW.work_version)
  OR b IS NULL OR b->>'tupleSha256' IS DISTINCT FROM o.document->>'tupleSha256'
  OR b->>'factoryRequestId' IS DISTINCT FROM q.id::text OR q.agent_id IS DISTINCT FROM o.document#>>'{pins,agentId}'
  OR q.factory_id IS DISTINCT FROM o.document#>>'{pins,factoryId}'
  OR q.binding->>'sourceDigest' IS DISTINCT FROM o.document#>>'{pins,sourceDigest}'
  OR q.binding->>'configurationDigest' IS DISTINCT FROM o.document#>>'{pins,configurationDigest}'
  OR q.binding->>'factoryVersion' IS DISTINCT FROM o.document->>'factoryVersion'
  OR d.factory_preparation->>'configurationHash' IS DISTINCT FROM o.document#>>'{pins,configurationHash}'
  OR d.admission_authority_snapshot#>>'{factory,profileHash}' IS DISTINCT FROM o.document#>>'{pins,profileHash}'
 THEN RAISE EXCEPTION 'MISSIONCONTROL_FACTORY_CORRELATION_REQUIRED'; END IF;
 SELECT * INTO p FROM missioncontrol_execution_permits WHERE owner_id=NEW.scope_id AND permit_id=b->>'permitId'
  AND work_id=NEW.work_id AND work_version=NEW.work_version AND work_generation=NEW.work_generation;
 IF NOT FOUND OR p.envelope#>>'{document,work,tupleSha256}' IS DISTINCT FROM o.document->>'tupleSha256'
  OR p.envelope#>>'{document,workOrderId}' IS DISTINCT FROM o.document->>'workOrderId'
  OR p.envelope#>>'{document,workOrderRevisionId}' IS DISTINCT FROM o.document->>'expectedWorkOrderRevisionId'
  OR p.envelope#>>'{document,planDigest}' IS DISTINCT FROM o.document->>'expectedPlanDigest'
 THEN RAISE EXCEPTION 'MISSIONCONTROL_ORIGIN_PERMIT_REQUIRED'; END IF;
 PERFORM missioncontrol_assert_dispatch(NEW.scope_id,NEW.work_id,NEW.work_version,NEW.work_generation,true,NEW.provider_version);
 SELECT * INTO STRICT e FROM missioncontrol_owner_enrollments WHERE owner_id=NEW.scope_id FOR SHARE;
 IF (p.envelope#>>'{document,enrollmentRevision}')::integer IS DISTINCT FROM e.revision
  OR p.envelope#>>'{document,installationId}' IS DISTINCT FROM e.installation_id
  OR p.envelope#>>'{document,admission,factoryVersion}' IS DISTINCT FROM e.document->>'factoryVersion'
  OR p.envelope#>>'{document,admission,executionContractSha256}' IS DISTINCT FROM e.document->>'executionContractSha256'
  OR p.envelope#>>'{document,admission,capabilityPolicySha256}' IS DISTINCT FROM e.document->>'capabilityPolicySha256'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.document->'permitKeys') k
    WHERE k->>'keyId'=p.envelope->>'keyId' AND k->>'revokedAt' IS NULL
     AND (k->>'activeFrom')::bigint <= (p.envelope#>>'{document,issuedAt}')::bigint
     AND (k->>'notAfter')::bigint >= (p.envelope#>>'{document,expiresAt}')::bigint)
 THEN RAISE EXCEPTION 'MISSIONCONTROL_EXACT_ADMISSION_REQUIRED'; END IF;
 SELECT * INTO r FROM missioncontrol_admission_receipts WHERE owner_id=NEW.scope_id AND command_id=b->>'commandId' AND permit_id=p.permit_id;
 IF NOT FOUND OR r.expires_at<=clock_timestamp() OR r.issued_at>clock_timestamp() OR r.capability_expires_at<=clock_timestamp()
  OR (p.envelope#>>'{document,expiresAt}')::bigint<=extract(epoch FROM clock_timestamp())*1000
 THEN RAISE EXCEPTION 'MISSIONCONTROL_CURRENT_ADMISSION_REQUIRED'; END IF;
 SELECT * INTO current_policy FROM missioncontrol_capability_snapshot(NEW.scope_id,o.installation_id,r.capability_agent,r.capability_backend);
 IF current_policy.snapshot_sha256 IS DISTINCT FROM r.capability_snapshot_sha256 THEN RAISE EXCEPTION 'MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED'; END IF;
 NEW.missioncontrol_binding=jsonb_build_object('schema','mc-owner-factory-admission/v1','origin',o.document,
  'permitId',p.permit_id,'permitSha256',p.permit_sha256,'commandId',r.command_id,'receiptSha256',r.receipt_sha256,
  'factoryRequestId',q.id,'factoryBinding',q.binding,'routeDecisionId',d.id,'routeRunId',NEW.id,
  'writerGeneration',NEW.writer_generation,'dispatchIdentity',NEW.dispatch_identity);
 RETURN NEW;
END $$;
-- Runs after engineering_writer_run_guard has assigned the canonical writer identity.
CREATE TRIGGER missioncontrol_owner_writer_guard BEFORE INSERT OR UPDATE ON engineering_route_runs
 FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_writer_guard();
REVOKE ALL ON FUNCTION missioncontrol_owner_origin_guard(),missioncontrol_owner_writer_guard() FROM PUBLIC;

-- statement-breakpoint
CREATE FUNCTION missioncontrol_owner_effect_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE productive boolean=true; run_id uuid;
BEGIN
 PERFORM 1 FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 PERFORM set_config('myeve.missioncontrol_owner',NEW.scope_id,true);
 IF TG_TABLE_NAME IN('engineering_execution','engineering_model_calls') THEN
  IF EXISTS(SELECT 1 FROM missioncontrol_owner_work_origins WHERE owner_id=NEW.scope_id AND work_id=NEW.work_id)
   THEN RAISE EXCEPTION 'MISSIONCONTROL_OWNER_ROUTE_REQUIRED'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='engineering_native_results' THEN
  SELECT id INTO run_id FROM engineering_route_runs WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND work_id=NEW.work_id
   AND work_version=NEW.work_version AND work_generation=NEW.work_generation AND missioncontrol_binding IS NOT NULL;
 ELSIF TG_TABLE_NAME='engineering_direct_workspaces' THEN
  run_id=NEW.route_run_id;
  IF TG_OP='UPDATE' THEN
   productive=(NEW.route_run_id,NEW.work_version,NEW.work_generation,NEW.source_files,NEW.draft_files,NEW.plan,NEW.candidates,NEW.producer)
    IS DISTINCT FROM (OLD.route_run_id,OLD.work_version,OLD.work_generation,OLD.source_files,OLD.draft_files,OLD.plan,OLD.candidates,OLD.producer)
    OR (NEW.phase IN('VERIFICATION_REQUESTED','VERIFICATION_PASSED','VERIFICATION_FAILED') AND NEW.phase IS DISTINCT FROM OLD.phase);
  END IF;
 ELSE
  SELECT route_run_id INTO run_id FROM engineering_direct_workspaces WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND work_id=NEW.work_id;
  IF TG_OP='UPDATE' THEN productive=NEW.status IN('QUEUED','RUNNING','COMPLETED') AND (NEW.status,NEW.lease_token,NEW.lease_until) IS DISTINCT FROM (OLD.status,OLD.lease_token,OLD.lease_until); END IF;
 END IF;
 IF productive AND EXISTS(SELECT 1 FROM engineering_route_runs r
   JOIN missioncontrol_execution_permits p ON p.owner_id=r.scope_id AND p.work_id=r.work_id AND p.work_version=r.work_version AND p.work_generation=r.work_generation
   JOIN missioncontrol_permit_controls c USING(owner_id,permit_id)
   WHERE r.id=run_id AND r.scope_id=NEW.scope_id AND r.work_id=NEW.work_id AND r.missioncontrol_binding IS NOT NULL AND c.operation='revoke')
 THEN RAISE EXCEPTION 'MISSIONCONTROL_WORK_FENCED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER missioncontrol_legacy_origin_guard BEFORE INSERT ON engineering_execution FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_effect_guard();
CREATE TRIGGER missioncontrol_legacy_call_origin_guard BEFORE INSERT ON engineering_model_calls FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_effect_guard();
CREATE TRIGGER missioncontrol_owner_workspace_guard BEFORE INSERT OR UPDATE ON engineering_direct_workspaces FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_effect_guard();
CREATE TRIGGER missioncontrol_owner_verification_guard BEFORE INSERT OR UPDATE ON engineering_direct_verification_jobs FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_effect_guard();
REVOKE ALL ON FUNCTION missioncontrol_owner_effect_guard() FROM PUBLIC;
-- statement-breakpoint
CREATE FUNCTION missioncontrol_owner_request_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF (NEW.id,NEW.scope_id,NEW.scope_kind,NEW.work_id,NEW.actor_id,NEW.agent_id,NEW.factory_id,NEW.operation_id,NEW.binding)
  IS DISTINCT FROM (OLD.id,OLD.scope_id,OLD.scope_kind,OLD.work_id,OLD.actor_id,OLD.agent_id,OLD.factory_id,OLD.operation_id,OLD.binding)
  AND EXISTS(SELECT 1 FROM engineering_route_runs r WHERE r.factory_request_id=OLD.id AND r.missioncontrol_binding IS NOT NULL)
 THEN RAISE EXCEPTION 'MISSIONCONTROL_FACTORY_REQUEST_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER missioncontrol_owner_request_guard BEFORE UPDATE ON engineering_factory_requests
 FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_request_guard();
REVOKE ALL ON FUNCTION missioncontrol_owner_request_guard() FROM PUBLIC;

CREATE TRIGGER missioncontrol_owner_proof_guard BEFORE INSERT ON engineering_native_results FOR EACH ROW EXECUTE FUNCTION missioncontrol_owner_effect_guard();

-- statement-breakpoint
-- Keep the existing verifier predicate and its grants; current lease checks must see revocation.
CREATE OR REPLACE FUNCTION engineering_candidate_verifiable(s text,k text,w uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM set_config('myeve.missioncontrol_owner',s,true);
 RETURN EXISTS(SELECT 1 FROM engineering_direct_workspaces x JOIN engineering_work work ON work.scope_id=x.scope_id AND work.scope_kind=x.scope_kind AND work.id=x.work_id
 JOIN engineering_route_runs r ON r.id=x.route_run_id JOIN engineering_routing_decisions d ON d.id=x.decision_id
 WHERE x.scope_id=s AND x.scope_kind=k AND x.work_id=w AND work.version=x.work_version AND work.generation=x.work_generation AND work.criteria_version=x.criteria_version AND work.control='agent' AND work.lifecycle='active' AND x.deadline>clock_timestamp()
 AND d.status='ADMITTED' AND r.decision_id=d.id
 AND (r.missioncontrol_binding IS NULL OR NOT EXISTS(SELECT 1 FROM missioncontrol_execution_permits p
   JOIN missioncontrol_permit_controls c USING(owner_id,permit_id)
   WHERE p.owner_id=s AND p.work_id=w AND p.work_version=r.work_version AND p.work_generation=r.work_generation AND c.operation='revoke'))
 AND ((x.producer='NATIVE_SOFIE' AND r.route='DEEP_AGENT' AND r.status='RUNNING')
 OR (x.producer='MYFACTORY' AND r.route='MYFACTORY' AND r.status='COMPLETED' AND r.fenced_at IS NOT NULL AND r.quiescence IS NOT NULL AND r.factory_candidate IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM engineering_route_runs n WHERE n.scope_id=s AND n.scope_kind=k AND n.work_id=w AND n.writer_generation>r.writer_generation))));
END $$;
