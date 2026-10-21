-- Additive, inert. Installs no policy, activation, grant or invitation.
-- Durable Result/Proof retention for an external-alpha Work, bound to the single
-- consumed authority, plus exactly-once accounting/cleanup settlement.
CREATE TABLE external_alpha_work_result (
 authority_id uuid PRIMARY KEY REFERENCES external_alpha_work_authority(id),
 owner_id text NOT NULL REFERENCES external_alpha_policy(owner_id),
 work_id uuid NOT NULL,
 work_version integer NOT NULL CHECK(work_version>0),
 work_generation integer NOT NULL CHECK(work_generation>0),
 result_id uuid NOT NULL UNIQUE REFERENCES engineering_native_results(id),
 candidate_sha text NOT NULL CHECK(candidate_sha ~ '^[a-f0-9]{40}$'),
 verdict text NOT NULL CHECK(verdict IN('PASS','FAIL','PARTIAL')),
 manifest_digest text NOT NULL CHECK(manifest_digest ~ '^[a-f0-9]{64}$'),
 envelope text NOT NULL CHECK(length(envelope)<=12582912),
 ingest_sha256 text NOT NULL CHECK(ingest_sha256 ~ '^[a-f0-9]{64}$'),
 cleanup_confirmed boolean NOT NULL,
 settlement_state text NOT NULL DEFAULT 'PENDING' CHECK(settlement_state IN('PENDING','SETTLED')),
 settled_at timestamptz,
 exposure_unknown boolean,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((settlement_state='SETTLED')=(settled_at IS NOT NULL))
);
-- statement-breakpoint
CREATE FUNCTION external_alpha_work_result_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External alpha Result history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['settlement_state','settled_at','exposure_unknown']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['settlement_state','settled_at','exposure_unknown'])
 THEN RAISE EXCEPTION 'External alpha Result is immutable'; END IF;
 IF OLD.settlement_state='SETTLED' AND (NEW.settlement_state<>'SETTLED' OR NEW.settled_at IS DISTINCT FROM OLD.settled_at OR NEW.exposure_unknown IS DISTINCT FROM OLD.exposure_unknown)
 THEN RAISE EXCEPTION 'External alpha settlement happens exactly once'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_work_result_guard BEFORE UPDATE OR DELETE ON external_alpha_work_result FOR EACH ROW EXECUTE FUNCTION external_alpha_work_result_guard();
-- statement-breakpoint
-- One transaction: the owner's Proof (immutable native result), its provenance
-- (so every owner readback surface lists it) and the authority-bound record.
-- A replay with the same bytes returns the original; different bytes conflict.
CREATE FUNCTION external_alpha_result_retain(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; au external_alpha_work_authority%ROWTYPE; w engineering_work%ROWTYPE; prior external_alpha_work_result%ROWTYPE; row external_alpha_work_result%ROWTYPE; rid uuid;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 IF p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_OWNER'; END IF;
 SELECT * INTO au FROM external_alpha_work_authority WHERE id=(p->>'authorityId')::uuid FOR UPDATE;
 IF NOT FOUND OR au.owner_id<>policy.owner_id OR au.policy_sha256 IS DISTINCT FROM policy.policy_sha256
 OR au.document_sha256 IS DISTINCT FROM p->>'documentSha256' OR au.request_id IS DISTINCT FROM (p->>'requestId')::uuid
 OR au.work_id IS DISTINCT FROM (p->>'workId')::uuid OR au.work_version IS DISTINCT FROM (p->>'workVersion')::integer
 OR au.work_generation IS DISTINCT FROM (p->>'workGeneration')::integer
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_AUTHORITY'; END IF;
 SELECT * INTO prior FROM external_alpha_work_result WHERE authority_id=au.id;
 IF FOUND THEN
  IF prior.ingest_sha256 IS DISTINCT FROM p->>'ingestSha256' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_CONFLICT'; END IF;
  RETURN to_jsonb(prior)||jsonb_build_object('replay',true);
 END IF;
 IF au.state<>'CONSUMED' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_AUTHORITY_STATE'; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=au.owner_id AND scope_kind='personal' AND id=au.work_id FOR UPDATE;
 IF w.version<>au.work_version OR w.generation<>au.work_generation OR w.lifecycle<>'active' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_WORK_CHANGED'; END IF;
 rid=(p->>'resultId')::uuid;
 INSERT INTO engineering_native_results(id,scope_id,scope_kind,work_id,candidate_sha,work_version,work_generation,proof,content_hash)
 VALUES(rid,au.owner_id,'personal',au.work_id,p->>'candidateSha',w.version,w.generation,p->'proof',p->>'proofHash');
 INSERT INTO beta_result_provenance(owner_id,result_id,contract,source) VALUES(au.owner_id,rid,p->'contract','CANONICAL');
 INSERT INTO external_alpha_work_result(authority_id,owner_id,work_id,work_version,work_generation,result_id,candidate_sha,verdict,manifest_digest,envelope,ingest_sha256,cleanup_confirmed)
 VALUES(au.id,au.owner_id,au.work_id,w.version,w.generation,rid,p->>'candidateSha',p->>'verdict',p->>'manifestDigest',p->>'envelope',p->>'ingestSha256',(p->>'cleanupConfirmed')::boolean)
 RETURNING * INTO row;
 RETURN to_jsonb(row)||jsonb_build_object('replay',false);
END $$;
-- statement-breakpoint
-- Accounting and cleanup settlement for a retained Result: runs in ONE
-- transaction under the authority and Result row locks, so concurrent callers
-- serialize and exactly one observes settled=true. Factory operations are
-- recorded into the shared allowance ledger (exact-once per step); any UNKNOWN
-- exposure fences the owner/cohort and keeps its full reservation.
CREATE FUNCTION external_alpha_result_settle(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; au external_alpha_work_authority%ROWTYPE; rs external_alpha_work_result%ROWTYPE; op jsonb; rec jsonb; unknown boolean=false;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 IF p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_OWNER'; END IF;
 SELECT * INTO au FROM external_alpha_work_authority WHERE id=(p->>'authorityId')::uuid FOR UPDATE;
 IF NOT FOUND OR au.owner_id<>policy.owner_id THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_AUTHORITY'; END IF;
 SELECT * INTO rs FROM external_alpha_work_result WHERE authority_id=au.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_REQUIRED'; END IF;
 IF rs.settlement_state='SETTLED' THEN
  RETURN jsonb_build_object('settled',false,'replay',true,'pending',false,'authorityState',au.state,'exposureUnknown',rs.exposure_unknown);
 END IF;
 -- Settlement needs the Factory's confirmed quiescence. Unconfirmed verifier
 -- cleanup is not waited on forever: it settles as UNKNOWN exposure (fenced).
 IF (p->>'quiescent')::boolean IS NOT TRUE THEN
  RETURN jsonb_build_object('settled',false,'replay',false,'pending',true,'authorityState',au.state,'exposureUnknown',NULL);
 END IF;
 FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p->'operations','[]'::jsonb)) LOOP
  rec=external_alpha_factory_record(op||jsonb_build_object('ownerId',policy.owner_id,'authorityId',au.id,'allowanceId',au.allowance_id));
  IF rec->>'state'='UNKNOWN' THEN unknown=true; END IF;
 END LOOP;
 IF NOT rs.cleanup_confirmed THEN unknown=true; END IF;
 UPDATE external_alpha_work_result SET settlement_state='SETTLED',settled_at=clock_timestamp(),exposure_unknown=unknown WHERE authority_id=au.id;
 IF unknown THEN
  IF au.state IN('CONSUMED') THEN
   PERFORM external_alpha_work_finish(jsonb_build_object('ownerId',policy.owner_id,'authorityId',au.id,'state','UNKNOWN','reason','UNKNOWN_FACTORY_EXPOSURE'));
  END IF;
 ELSIF au.state='CONSUMED' THEN
  PERFORM external_alpha_work_finish(jsonb_build_object('ownerId',policy.owner_id,'authorityId',au.id,'state','COMPLETED','reason','FACTORY_RESULT_RETAINED'));
 END IF;
 SELECT state INTO au.state FROM external_alpha_work_authority WHERE id=au.id;
 RETURN jsonb_build_object('settled',true,'replay',false,'pending',false,'authorityState',au.state,'exposureUnknown',unknown);
END $$;
-- statement-breakpoint
REVOKE ALL ON external_alpha_work_result FROM PUBLIC;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_result_retain(jsonb),external_alpha_result_settle(jsonb) FROM PUBLIC;
