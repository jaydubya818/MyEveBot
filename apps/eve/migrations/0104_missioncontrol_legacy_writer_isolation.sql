-- Legacy writers and productive effects must not read an owner origin or revocation
-- from a stale transaction snapshot. Preserve the original guards and grants.
CREATE OR REPLACE FUNCTION missioncontrol_owner_writer_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE o missioncontrol_owner_work_origins%ROWTYPE; d engineering_routing_decisions%ROWTYPE;
 q engineering_factory_requests%ROWTYPE; p missioncontrol_execution_permits%ROWTYPE; r missioncontrol_admission_receipts%ROWTYPE;
 b jsonb; current_policy record; e missioncontrol_owner_enrollments%ROWTYPE;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'MISSIONCONTROL_ADMISSION_ISOLATION_REQUIRED';
 END IF;
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
-- statement-breakpoint
CREATE OR REPLACE FUNCTION missioncontrol_owner_effect_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE productive boolean=true; run_id uuid;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'MISSIONCONTROL_ADMISSION_ISOLATION_REQUIRED';
 END IF;
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
