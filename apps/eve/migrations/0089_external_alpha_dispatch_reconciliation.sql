-- Additive and inactive: no policy, credential, authority or activation is created.
-- First prepare bytes are durably bound before the single permitted dispatch.
CREATE TABLE external_alpha_work_dispatch (
 authority_id uuid PRIMARY KEY REFERENCES external_alpha_work_authority(id),
 owner_id text NOT NULL REFERENCES external_alpha_policy(owner_id),
 policy_sha256 text NOT NULL,
 prepare jsonb NOT NULL,
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 admitted_deadline timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- statement-breakpoint
CREATE FUNCTION external_alpha_dispatch_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'External alpha dispatch binding is immutable'; END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_dispatch_immutable BEFORE UPDATE OR DELETE ON external_alpha_work_dispatch FOR EACH ROW EXECUTE FUNCTION external_alpha_dispatch_immutable();
-- statement-breakpoint
CREATE FUNCTION external_alpha_dispatch_bind(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; au external_alpha_work_authority%ROWTYPE; prior external_alpha_work_dispatch%ROWTYPE; row external_alpha_work_dispatch%ROWTYPE; w engineering_work%ROWTYPE; canonical text=p->>'canonical'; deadline timestamptz;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO au FROM external_alpha_work_authority WHERE id=(p->>'authorityId')::uuid FOR UPDATE;
 IF NOT FOUND OR p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256
 OR au.owner_id IS DISTINCT FROM policy.owner_id OR au.policy_sha256 IS DISTINCT FROM policy.policy_sha256
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_DISPATCH_BINDING'; END IF;
 SELECT * INTO prior FROM external_alpha_work_dispatch WHERE authority_id=au.id;
 IF FOUND THEN
  IF prior.prepare IS DISTINCT FROM p->'prepare' OR prior.request_digest IS DISTINCT FROM p->>'requestDigest' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_DISPATCH_CONFLICT'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=au.owner_id AND scope_kind='personal' AND id=au.work_id FOR SHARE;
 IF w.version<>au.work_version OR w.generation<>au.work_generation OR w.lifecycle<>'active' OR w.control<>'agent' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_DISPATCH_WORK_CHANGED'; END IF;
 deadline=(p->'prepare'->>'deadline')::timestamptz;
 IF au.state<>'DISPATCHING' OR canonical::jsonb IS DISTINCT FROM p->'prepare'
 OR encode(sha256(convert_to(canonical,'UTF8')),'hex') IS DISTINCT FROM p->>'requestDigest'
 OR p->'prepare'->>'requestId' IS DISTINCT FROM au.request_id::text
 OR p->'prepare'->>'workId' IS DISTINCT FROM au.work_id::text
 OR p->'prepare'->>'workGeneration' IS DISTINCT FROM au.work_generation::text
 OR deadline>au.expires_at OR deadline<=clock_timestamp()
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_DISPATCH_BINDING'; END IF;
 INSERT INTO external_alpha_work_dispatch(authority_id,owner_id,policy_sha256,prepare,request_digest,admitted_deadline)
 VALUES(au.id,au.owner_id,au.policy_sha256,p->'prepare',p->>'requestDigest',deadline) RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
-- Sweep after readback, so a published terminal Result can be retained first.
-- Unresolved consumed work remains charged and fenced; never redispatched.
CREATE OR REPLACE FUNCTION external_alpha_work_sweep(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; r external_alpha_work_authority%ROWTYPE; n timestamptz=clock_timestamp(); expired integer=0; revoked integer=0; unknown integer=0;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 IF p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256 THEN RAISE EXCEPTION 'External alpha owner mismatch'; END IF;
 FOR r IN SELECT * FROM external_alpha_work_authority WHERE owner_id=policy.owner_id AND state IN('ISSUED','DISPATCHING','CONSUMED') FOR UPDATE LOOP
  IF r.state='ISSUED' AND policy.revoked_at IS NOT NULL THEN
   PERFORM external_alpha_work_finish(jsonb_build_object('ownerId',policy.owner_id,'authorityId',r.id,'state','REVOKED','reason','POLICY_REVOKED')); revoked=revoked+1;
  ELSIF r.state='ISSUED' AND n>=r.expires_at THEN
   PERFORM external_alpha_work_finish(jsonb_build_object('ownerId',policy.owner_id,'authorityId',r.id,'state','EXPIRED','reason','EXPIRED_UNSENT')); expired=expired+1;
  ELSIF r.state IN('DISPATCHING','CONSUMED') AND n>=r.expires_at+interval '60 seconds' THEN
   PERFORM external_alpha_work_finish(jsonb_build_object('ownerId',policy.owner_id,'authorityId',r.id,'state','UNKNOWN','reason','DISPATCH_UNRESOLVED')); unknown=unknown+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('expired',expired,'revoked',revoked,'unknown',unknown);
END $$;
-- statement-breakpoint
REVOKE ALL ON external_alpha_work_dispatch FROM PUBLIC;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_dispatch_bind(jsonb) FROM PUBLIC;
-- statement-breakpoint
-- Retention also checks the durable first prepare and current owner control.
CREATE OR REPLACE FUNCTION external_alpha_result_retain(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
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
 IF NOT EXISTS(SELECT 1 FROM external_alpha_work_dispatch d WHERE d.authority_id=au.id AND d.owner_id=au.owner_id AND d.policy_sha256=au.policy_sha256 AND d.request_digest=p->>'requestDigest') THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_BINDING'; END IF;
 IF au.state<>'CONSUMED' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_AUTHORITY_STATE'; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=au.owner_id AND scope_kind='personal' AND id=au.work_id FOR UPDATE;
 IF w.version<>au.work_version OR w.generation<>au.work_generation OR w.lifecycle<>'active' OR w.control<>'agent' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RESULT_WORK_CHANGED'; END IF;
 rid=(p->>'resultId')::uuid;
 INSERT INTO engineering_native_results(id,scope_id,scope_kind,work_id,candidate_sha,work_version,work_generation,proof,content_hash)
 VALUES(rid,au.owner_id,'personal',au.work_id,p->>'candidateSha',w.version,w.generation,p->'proof',p->>'proofHash');
 INSERT INTO beta_result_provenance(owner_id,result_id,contract,source) VALUES(au.owner_id,rid,p->'contract','CANONICAL');
 INSERT INTO external_alpha_work_result(authority_id,owner_id,work_id,work_version,work_generation,result_id,candidate_sha,verdict,manifest_digest,envelope,ingest_sha256,cleanup_confirmed)
 VALUES(au.id,au.owner_id,au.work_id,w.version,w.generation,rid,p->>'candidateSha',p->>'verdict',p->>'manifestDigest',p->>'envelope',p->>'ingestSha256',(p->>'cleanupConfirmed')::boolean)
 RETURNING * INTO row;
 RETURN to_jsonb(row)||jsonb_build_object('replay',false);
END $$;
