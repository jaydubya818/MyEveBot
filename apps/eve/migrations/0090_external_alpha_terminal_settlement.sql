-- Additive, inactive. A terminal label cannot establish cleanup or accounting.
-- Authenticated no-candidate readback is retained as a separate immutable fact.
CREATE TABLE external_alpha_work_terminal_settlement (
 authority_id uuid PRIMARY KEY REFERENCES external_alpha_work_authority(id),
 owner_id text NOT NULL REFERENCES external_alpha_policy(owner_id), policy_sha256 text NOT NULL,
 request_id uuid NOT NULL, work_id uuid NOT NULL, work_version integer NOT NULL, work_generation integer NOT NULL,
 observed_work_version integer NOT NULL, observed_work_generation integer NOT NULL,
 run_id text NOT NULL, request_digest text NOT NULL, authority_sha256 text NOT NULL,
 receipt_digest text NOT NULL, spend_digest text NOT NULL,
 readback jsonb NOT NULL, readback_sha256 text NOT NULL,
 cleanup_confirmed boolean NOT NULL CHECK(cleanup_confirmed), result_verdict text NOT NULL CHECK(result_verdict='NONE'),
 settlement_state text NOT NULL CHECK(settlement_state='SETTLED'), exposure_unknown boolean NOT NULL CHECK(NOT exposure_unknown),
 settled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- statement-breakpoint
CREATE FUNCTION external_alpha_terminal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'External alpha terminal settlement is immutable'; END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_terminal_immutable BEFORE UPDATE OR DELETE ON external_alpha_work_terminal_settlement FOR EACH ROW EXECUTE FUNCTION external_alpha_terminal_immutable();
-- statement-breakpoint
CREATE FUNCTION external_alpha_terminal_settle(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; au external_alpha_work_authority%ROWTYPE; d external_alpha_work_dispatch%ROWTYPE;
 w engineering_work%ROWTYPE; prior external_alpha_work_terminal_settlement%ROWTYPE; t external_alpha_work_terminal_settlement%ROWTYPE;
 a jsonb=p->'readback'->'readbackAttestation'; spend jsonb=a->'spend'; op jsonb; rec jsonb; target text;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO au FROM external_alpha_work_authority WHERE id=(p->>'authorityId')::uuid FOR UPDATE;
 IF NOT FOUND OR p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256
 OR au.owner_id IS DISTINCT FROM policy.owner_id OR au.policy_sha256 IS DISTINCT FROM policy.policy_sha256
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_TERMINAL_OWNER'; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=au.owner_id AND scope_kind='personal' AND id=au.work_id FOR UPDATE;
 SELECT * INTO d FROM external_alpha_work_dispatch WHERE authority_id=au.id;
 IF NOT FOUND OR d.owner_id IS DISTINCT FROM au.owner_id OR d.policy_sha256 IS DISTINCT FROM au.policy_sha256
 OR a->>'schema' IS DISTINCT FROM 'MYFACTORY_EXTERNAL_ALPHA_READBACK_V1'
 OR a->>'authorityId' IS DISTINCT FROM au.id::text OR a->>'authoritySha256' IS DISTINCT FROM au.document_sha256
 OR a->>'requestId' IS DISTINCT FROM au.request_id::text OR a->>'requestDigest' IS DISTINCT FROM d.request_digest
 OR (a->>'admittedDeadline')::timestamptz IS DISTINCT FROM d.admitted_deadline
 OR a->>'workOrderId' IS DISTINCT FROM au.receipt->>'workOrderId'
 OR p->>'receiptCanonical' IS NULL OR (p->>'receiptCanonical')::jsonb IS DISTINCT FROM au.receipt
 OR a->>'receiptDigest' IS DISTINCT FROM encode(sha256(convert_to(p->>'receiptCanonical','UTF8')),'hex')
 OR p->>'spendCanonical' IS NULL OR (p->>'spendCanonical')::jsonb IS DISTINCT FROM spend
 OR a->>'spendDigest' IS DISTINCT FROM encode(sha256(convert_to(p->>'spendCanonical','UTF8')),'hex')
 OR p->>'canonical' IS NULL OR (p->>'canonical')::jsonb IS DISTINCT FROM p->'readback'
 OR p->>'readbackSha256' IS DISTINCT FROM encode(sha256(convert_to(p->>'canonical','UTF8')),'hex')
 OR p->'readback'->>'readbackSignature' !~ '^[A-Za-z0-9_-]{86}$'
 OR p->'readback'->'authorityReceipt' IS DISTINCT FROM au.receipt
 OR a->>'runId' IS NULL OR a->>'attemptNumber' IS DISTINCT FROM '1'
 OR a->>'quiescent' IS DISTINCT FROM 'true' OR a->>'verdict' IS DISTINCT FROM 'NONE'
 OR COALESCE(a->>'state','') NOT IN('FAILED','CANCELLED','NOT_DISPATCHED')
 OR spend->>'contractVersion' IS DISTINCT FROM 'WORK_LEDGER_V2'
 OR spend->>'workId' IS DISTINCT FROM au.work_id::text OR spend->>'workGeneration' IS DISTINCT FROM au.work_generation::text
 OR spend->>'requestId' IS DISTINCT FROM au.request_id::text OR spend->>'workOrderId' IS DISTINCT FROM au.receipt->>'workOrderId'
 OR (spend->>'deadline')::timestamptz IS DISTINCT FROM d.admitted_deadline
 OR spend->>'status' IS DISTINCT FROM 'KNOWN' OR spend->>'accountingComplete' IS DISTINCT FROM 'true'
 OR spend->>'unknownExposureMicrousd' IS DISTINCT FROM '0' OR spend->>'retainedMicrousd' IS DISTINCT FROM '0'
 OR jsonb_typeof(spend->'operations') IS DISTINCT FROM 'array'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(spend->'operations') x WHERE COALESCE(x->>'state','') NOT IN('settled','released')
   OR x->>'workId' IS DISTINCT FROM au.work_id::text OR x->>'workGeneration' IS DISTINCT FROM au.work_generation::text
   OR x->>'requestId' IS DISTINCT FROM au.request_id::text OR x->>'workOrderId' IS DISTINCT FROM au.receipt->>'workOrderId'
   OR x->>'runId' IS DISTINCT FROM a->>'runId' OR x->>'factoryVersion' IS DISTINCT FROM au.document->>'factoryVersion')
 OR EXISTS(SELECT 1 FROM external_alpha_work_result WHERE authority_id=au.id)
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_TERMINAL_BINDING'; END IF;
 SELECT * INTO prior FROM external_alpha_work_terminal_settlement WHERE authority_id=au.id;
 IF FOUND THEN
  IF prior.request_digest IS DISTINCT FROM a->>'requestDigest' OR prior.spend_digest IS DISTINCT FROM a->>'spendDigest'
   OR prior.receipt_digest IS DISTINCT FROM a->>'receiptDigest' OR prior.run_id IS DISTINCT FROM a->>'runId'
   THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_TERMINAL_CONFLICT'; END IF;
  RETURN to_jsonb(prior)||jsonb_build_object('replay',true,'authorityState',au.state);
 END IF;
 IF jsonb_typeof(p->'operations') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'operations') IS DISTINCT FROM (SELECT count(*)::integer FROM jsonb_array_elements(spend->'operations') x WHERE x->>'state'='settled')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(spend->'operations') x WHERE x->>'state'='settled' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'operations') y
  WHERE y->>'stepKey'='factory:'||(x->>'operationId')||':0' AND y->>'state'='SETTLED' AND y->>'microusd'=x->>'actualMicrousd'
   AND y->>'source'=CASE WHEN x->>'phase'='completion' THEN 'FACTORY_COMPLETION' ELSE 'FACTORY_PRODUCTIVE' END
   AND y->'result'->>'phase'=x->>'phase' AND y->'result'->>'model'=x->>'model' AND y->'result'->>'pricingRevision'=x->>'pricingRevision'))
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_TERMINAL_ACCOUNTING'; END IF;
 IF au.state<>'CONSUMED' OR au.receipt IS NULL THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_TERMINAL_AUTHORITY'; END IF;
 FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p->'operations','[]'::jsonb)) LOOP
  rec=external_alpha_factory_record(op||jsonb_build_object('ownerId',au.owner_id,'authorityId',au.id,'allowanceId',au.allowance_id));
  IF rec->>'state'='UNKNOWN' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_TERMINAL_UNKNOWN'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM external_alpha_operation WHERE allowance_id=au.allowance_id AND state IN('DISPATCHED','UNKNOWN'))
 OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE id=au.allowance_id AND state='UNKNOWN')
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_TERMINAL_UNKNOWN'; END IF;
 INSERT INTO external_alpha_work_terminal_settlement(authority_id,owner_id,policy_sha256,request_id,work_id,work_version,work_generation,
  observed_work_version,observed_work_generation,run_id,request_digest,authority_sha256,receipt_digest,spend_digest,readback,readback_sha256,
  cleanup_confirmed,result_verdict,settlement_state,exposure_unknown)
 VALUES(au.id,au.owner_id,au.policy_sha256,au.request_id,au.work_id,au.work_version,au.work_generation,w.version,w.generation,
  a->>'runId',a->>'requestDigest',au.document_sha256,a->>'receiptDigest',a->>'spendDigest',p->'readback',p->>'readbackSha256',true,'NONE','SETTLED',false)
 RETURNING * INTO t;
 target=CASE WHEN a->>'state'='FAILED' THEN 'COMPLETED' ELSE 'CANCELLED' END;
 PERFORM external_alpha_work_finish(jsonb_build_object('ownerId',au.owner_id,'authorityId',au.id,'state',target,'reason','AUTHENTICATED_TERMINAL_NONE'));
 RETURN to_jsonb(t)||jsonb_build_object('replay',false,'authorityState',target);
END $$;
-- statement-breakpoint
REVOKE ALL ON external_alpha_work_terminal_settlement FROM PUBLIC;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_terminal_settle(jsonb) FROM PUBLIC;
