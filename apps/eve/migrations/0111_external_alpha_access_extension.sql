-- Owner-approved external alpha access extension (default off).
-- Additive and inert: extended_until stays NULL until an operator calls
-- external_alpha_approve_access_extension(), which records an append-only audit
-- row (who, when, reason) in the same transaction. activated_at stays immutable;
-- allowance/operation/effect rows and every daily/lifetime charge are untouched.
-- Effective expiry = GREATEST(activated_at+120h, COALESCE(extended_until, activated_at+120h)).
-- Cap: extended_until <= first recorded approval time (server clock) + 14 days, so a tester
-- who expired long ago gets at most 14 days of access from Jay's approval, never more in total.
ALTER TABLE external_alpha_policy ADD COLUMN extended_until timestamptz DEFAULT NULL;
-- statement-breakpoint
ALTER TABLE external_alpha_policy ADD CONSTRAINT external_alpha_policy_extension_after_expiry CHECK(extended_until IS NULL OR (activated_at IS NOT NULL
 AND extended_until>activated_at+interval '120 hours'));
-- statement-breakpoint
CREATE FUNCTION external_alpha_access_until(activated timestamptz, extended timestamptz) RETURNS timestamptz LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT GREATEST(activated+interval '120 hours',COALESCE(extended,activated+interval '120 hours'))
$$;
-- statement-breakpoint
CREATE TABLE external_alpha_access_extension (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL REFERENCES external_alpha_policy(owner_id),
 policy_sha256 text NOT NULL CHECK(policy_sha256 ~ '^[a-f0-9]{64}$'),
 activated_at timestamptz NOT NULL,
 previous_extended_until timestamptz,
 extended_until timestamptz NOT NULL CHECK(extended_until>activated_at+interval '120 hours'),
 approved_by text NOT NULL CHECK(length(btrim(approved_by)) BETWEEN 1 AND 200),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 window_started_at timestamptz NOT NULL,
 approval_txid bigint NOT NULL DEFAULT txid_current(),
 CHECK(window_started_at<=approved_at AND extended_until>approved_at AND extended_until<=window_started_at+interval '14 days'),
 CHECK(previous_extended_until IS NULL OR previous_extended_until<extended_until)
);
-- statement-breakpoint
-- Server-stamped: callers cannot supply approval time, txid or window start. The window
-- starts at the first approval for this owner/policy and never moves.
CREATE FUNCTION external_alpha_access_extension_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 NEW.approved_at=clock_timestamp(); NEW.approval_txid=txid_current();
 NEW.window_started_at=COALESCE((SELECT min(approved_at) FROM external_alpha_access_extension WHERE owner_id=NEW.owner_id AND policy_sha256=NEW.policy_sha256),NEW.approved_at);
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_access_extension_stamp BEFORE INSERT ON external_alpha_access_extension FOR EACH ROW EXECUTE FUNCTION external_alpha_access_extension_stamp();
-- statement-breakpoint
CREATE FUNCTION external_alpha_access_extension_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'EXTERNAL_ALPHA_ACCESS_EXTENSION_IMMUTABLE';
END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_access_extension_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON external_alpha_access_extension FOR EACH STATEMENT EXECUTE FUNCTION external_alpha_access_extension_immutable();
-- statement-breakpoint
-- Same rules as 0085 plus: extended_until may only move forward, only on an
-- activated, unrevoked policy, and only with an audit row written in this transaction.
CREATE OR REPLACE FUNCTION external_alpha_policy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External alpha policy history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['activated_at','revoked_at','extended_until']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['activated_at','revoked_at','extended_until'])
 OR OLD.revoked_at IS NOT NULL OR (OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at)
 THEN RAISE EXCEPTION 'External alpha allocation cannot be replaced or reset'; END IF;
 IF NEW.activated_at IS DISTINCT FROM OLD.activated_at AND (NEW.activated_at IS NULL OR abs(extract(epoch FROM NEW.activated_at-clock_timestamp()))>5) THEN RAISE EXCEPTION 'Activation requires current operator approval'; END IF;
 IF NEW.extended_until IS DISTINCT FROM OLD.extended_until AND (NEW.extended_until IS NULL OR OLD.activated_at IS NULL OR NEW.revoked_at IS NOT NULL
  OR (OLD.extended_until IS NOT NULL AND NEW.extended_until<=OLD.extended_until)
  OR NOT EXISTS(SELECT 1 FROM external_alpha_access_extension x WHERE x.owner_id=NEW.owner_id AND x.policy_sha256=NEW.policy_sha256
   AND x.activated_at=NEW.activated_at AND x.extended_until=NEW.extended_until AND x.previous_extended_until IS NOT DISTINCT FROM OLD.extended_until
   AND x.approval_txid=txid_current()))
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_REQUIRES_OWNER_APPROVAL'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
-- The only supported way to set extended_until. Operator-run (no PUBLIC grant).
-- Exact replay of the same approvalId is a no-op that returns the recorded row.
CREATE FUNCTION external_alpha_approve_access_extension(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; prior external_alpha_access_extension%ROWTYPE; until timestamptz; n timestamptz; window_start timestamptz;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 until=(p->>'extendedUntil')::timestamptz;
 SELECT * INTO prior FROM external_alpha_access_extension WHERE id=(p->>'approvalId')::uuid;
 IF FOUND THEN
  IF prior.owner_id IS DISTINCT FROM p->>'ownerId' OR prior.policy_sha256 IS DISTINCT FROM p->>'policySha256' OR prior.extended_until IS DISTINCT FROM until
   OR prior.approved_by IS DISTINCT FROM p->>'approvedBy' OR prior.reason IS DISTINCT FROM p->>'reason'
  THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_APPROVAL_REUSED'; END IF;
  RETURN to_jsonb(prior)||jsonb_build_object('replayed',true,'accessUntil',external_alpha_access_until(policy.activated_at,policy.extended_until));
 END IF;
 IF p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_WRONG_OWNER'; END IF;
 IF policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_NOT_ACTIVE'; END IF;
 n=clock_timestamp();
 window_start=COALESCE((SELECT min(approved_at) FROM external_alpha_access_extension WHERE owner_id=policy.owner_id AND policy_sha256=policy.policy_sha256),n);
 IF until IS NULL OR until<=policy.activated_at+interval '120 hours' OR until<=n OR until>window_start+interval '14 days'
  OR (policy.extended_until IS NOT NULL AND until<=policy.extended_until)
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_OUT_OF_BOUNDS'; END IF;
 INSERT INTO external_alpha_access_extension(id,owner_id,policy_sha256,activated_at,previous_extended_until,extended_until,approved_by,reason)
 VALUES((p->>'approvalId')::uuid,policy.owner_id,policy.policy_sha256,policy.activated_at,policy.extended_until,until,p->>'approvedBy',p->>'reason') RETURNING * INTO prior;
 UPDATE external_alpha_policy SET extended_until=until WHERE singleton;
 RETURN to_jsonb(prior)||jsonb_build_object('replayed',false,'accessUntil',external_alpha_access_until(policy.activated_at,until));
END $$;
-- statement-breakpoint
REVOKE ALL ON external_alpha_access_extension FROM PUBLIC;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_approve_access_extension(jsonb),external_alpha_access_extension_immutable(),external_alpha_access_extension_stamp() FROM PUBLIC;
-- statement-breakpoint
-- Every function that enforced activated_at+120h now uses external_alpha_access_until().
-- Body copied verbatim from 0091_external_alpha_chat_recovery.sql; only the 120-hour expiry expression is replaced.
CREATE OR REPLACE FUNCTION external_alpha_admit(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; prior external_alpha_allowance%ROWTYPE; row external_alpha_allowance%ROWTYPE;
 n timestamptz; day integer; allowance bigint; operations integer; count_day integer; charged_day bigint; charged_total bigint; w engineering_work%ROWTYPE; span interval;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 n=clock_timestamp();
 IF p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256
 OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR n<policy.activated_at OR n>=external_alpha_access_until(policy.activated_at,policy.extended_until)
 THEN RAISE EXCEPTION 'External alpha inactive or wrong owner'; END IF;
 SELECT * INTO prior FROM external_alpha_allowance WHERE owner_id=policy.owner_id AND binding_id=p->>'bindingId';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.kind IS DISTINCT FROM p->>'kind' THEN RAISE EXCEPTION 'External alpha binding changed'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF p->>'kind'='WORK' AND COALESCE(current_setting('myeve.external_alpha_work_admit',true),'')<>'on' THEN RAISE EXCEPTION 'Work allowance requires exact Work authority admission'; END IF;
 IF EXISTS(SELECT 1 FROM external_alpha_tool_effect e WHERE e.state='UNKNOWN' OR (e.state='ACCEPTED' AND NOT(e.session_id IS NOT DISTINCT FROM p->>'effectSessionId' AND e.call_id IS NOT DISTINCT FROM p->>'effectCallId')))
 OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('PREPARED','DISPATCHED','UNKNOWN')) THEN RAISE EXCEPTION 'Unresolved exposure fences further admission'; END IF;
 day=floor(extract(epoch FROM n)/86400);
 IF p->>'kind'='CHAT' THEN allowance=100000;operations=2;span=interval '180 seconds';
 ELSIF p->>'kind'='WORK' THEN
  allowance=1300000;operations=5;span=interval '300 seconds';
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=policy.owner_id AND scope_kind='personal' AND id=(p->>'workId')::uuid FOR UPDATE;
  IF w.version IS DISTINCT FROM (p->>'workVersion')::integer OR w.generation IS DISTINCT FROM (p->>'workGeneration')::integer OR w.lifecycle<>'active' OR w.repository IS DISTINCT FROM policy.policy->>'repository' OR w.max_cost_usd<>1.30 OR w.max_duration_seconds<>180 THEN RAISE EXCEPTION 'Exact current owner Work required'; END IF;
  IF EXISTS(SELECT 1 FROM external_alpha_allowance WHERE kind='WORK' AND state='OPEN') THEN RAISE EXCEPTION 'One active Work per owner'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported allowance kind'; END IF;
 SELECT count(*) FILTER(WHERE day_index=day AND kind=p->>'kind'),COALESCE(sum(ceiling_microusd) FILTER(WHERE day_index=day),0),COALESCE(sum(ceiling_microusd),0)
 INTO count_day,charged_day,charged_total FROM external_alpha_allowance WHERE owner_id=policy.owner_id;
 IF count_day>=(CASE WHEN p->>'kind'='CHAT' THEN 10 ELSE 1 END) OR charged_day+allowance>2300000 OR charged_total+allowance>11500000 THEN RAISE EXCEPTION 'External alpha allowance exhausted'; END IF;
 INSERT INTO external_alpha_allowance(id,owner_id,policy_sha256,kind,binding_id,request_sha256,work_id,work_version,work_generation,day_index,ceiling_microusd,max_operations,deadline)
 VALUES((p->>'id')::uuid,policy.owner_id,policy.policy_sha256,p->>'kind',p->>'bindingId',p->>'requestSha256',w.id,w.version,w.generation,day,allowance,operations,LEAST(n+span,external_alpha_access_until(policy.activated_at,policy.extended_until))) RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
-- Body copied verbatim from 0091_external_alpha_chat_recovery.sql; only the 120-hour expiry expression is replaced.
CREATE OR REPLACE FUNCTION external_alpha_model_reserve(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; prior external_alpha_operation%ROWTYPE; row external_alpha_operation%ROWTYPE; exposure bigint; admitted integer; total_ops integer; total_exposure bigint; m bigint;
BEGIN
 IF COALESCE(p->>'source','SOFIE')<>'SOFIE' THEN RAISE EXCEPTION 'Only Sofie operations reserve before dispatch'; END IF;
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 IF a.owner_id IS DISTINCT FROM p->>'ownerId' OR policy.owner_id<>a.owner_id OR a.policy_sha256 IS DISTINCT FROM p->>'policySha256' THEN RAISE EXCEPTION 'External alpha operation owner mismatch'; END IF;
 SELECT * INTO prior FROM external_alpha_operation WHERE allowance_id=a.id AND step_key=p->>'stepKey';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.state<>'SETTLED' OR prior.source<>'SOFIE' THEN RAISE EXCEPTION 'No replay of ambiguous or changed model request'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR clock_timestamp()>=external_alpha_access_until(policy.activated_at,policy.extended_until) OR clock_timestamp()>=a.deadline OR a.state<>'OPEN'
 OR EXISTS(SELECT 1 FROM external_alpha_tool_effect WHERE state IN('ACCEPTED','UNKNOWN')) OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('PREPARED','DISPATCHED','UNKNOWN')) THEN RAISE EXCEPTION 'External alpha dispatch fenced'; END IF;
 m=(p->>'microusd')::bigint;
 SELECT count(*) FILTER(WHERE source='SOFIE'),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)) FILTER(WHERE source='SOFIE'),0),count(*),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)),0)
 INTO admitted,exposure,total_ops,total_exposure FROM external_alpha_operation WHERE allowance_id=a.id;
 IF admitted>=2 OR m IS NULL OR m<=0 OR exposure+m>(CASE WHEN a.kind='WORK' THEN 300000 ELSE 100000 END) OR total_ops>=a.max_operations OR total_exposure+m>a.ceiling_microusd THEN RAISE EXCEPTION 'External alpha operation budget exhausted'; END IF;
 INSERT INTO external_alpha_operation(id,allowance_id,step_key,request_sha256,reserved_microusd,state,source) VALUES((p->>'id')::uuid,a.id,p->>'stepKey',p->>'requestSha256',m,'PREPARED','SOFIE') RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
-- Body copied verbatim from 0091_external_alpha_chat_recovery.sql; only the 120-hour expiry expression is replaced.
CREATE OR REPLACE FUNCTION external_alpha_work_claim(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; au external_alpha_work_authority%ROWTYPE; a external_alpha_allowance%ROWTYPE; w engineering_work%ROWTYPE; n timestamptz;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO au FROM external_alpha_work_authority WHERE id=(p->>'authorityId')::uuid FOR UPDATE;
 IF NOT FOUND OR au.owner_id<>policy.owner_id OR p->>'ownerId' IS DISTINCT FROM policy.owner_id OR au.policy_sha256 IS DISTINCT FROM policy.policy_sha256 OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256
 OR au.request_id IS DISTINCT FROM (p->>'requestId')::uuid OR au.document_sha256 IS DISTINCT FROM p->>'documentSha256'
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_AUTHORITY_NOT_DISPATCHABLE: binding'; END IF;
 IF au.state IN('DISPATCHING','CONSUMED') THEN RETURN jsonb_build_object('claimed',false,'authority',to_jsonb(au)); END IF;
 n=clock_timestamp();
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=au.allowance_id FOR UPDATE;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=au.owner_id AND scope_kind='personal' AND id=au.work_id FOR SHARE;
 IF au.state<>'ISSUED' OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR n>=external_alpha_access_until(policy.activated_at,policy.extended_until) OR n>=au.expires_at OR n>=a.deadline OR a.state<>'OPEN'
 OR w.version<>au.work_version OR w.generation<>au.work_generation OR w.lifecycle<>'active' OR w.control<>'agent'
 OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('PREPARED','DISPATCHED','UNKNOWN'))
 OR EXISTS(SELECT 1 FROM external_alpha_tool_effect e WHERE e.state='UNKNOWN')
 OR EXISTS(SELECT 1 FROM external_alpha_work_authority x WHERE x.state IN('UNKNOWN','DISPATCHING') AND x.id<>au.id)
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_AUTHORITY_NOT_DISPATCHABLE: fenced, expired, revoked or Work changed'; END IF;
 UPDATE external_alpha_work_authority SET state='DISPATCHING',dispatching_at=n WHERE id=au.id RETURNING * INTO au;
 RETURN jsonb_build_object('claimed',true,'authority',to_jsonb(au));
END $$;
-- statement-breakpoint
-- Body copied verbatim from 0091_external_alpha_chat_recovery.sql; only the 120-hour expiry expression is replaced.
CREATE OR REPLACE FUNCTION external_alpha_model_transition(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; op external_alpha_operation%ROWTYPE; claimed boolean=false;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 SELECT * INTO STRICT op FROM external_alpha_operation WHERE id=(p->>'operationId')::uuid AND allowance_id=a.id FOR UPDATE;
 IF a.owner_id IS DISTINCT FROM p->>'ownerId' OR policy.owner_id<>a.owner_id OR a.policy_sha256 IS DISTINCT FROM p->>'policySha256' OR policy.policy_sha256<>a.policy_sha256
 OR op.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR op.source<>'SOFIE' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_OPERATION_BINDING'; END IF;
 IF p->>'state'='DISPATCHED' THEN
  IF policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR clock_timestamp()>=external_alpha_access_until(policy.activated_at,policy.extended_until) OR clock_timestamp()>=a.deadline OR a.state<>'OPEN'
  OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_AUTHORITY_REVOKED'; END IF;
  IF op.state='PREPARED' THEN
   UPDATE external_alpha_operation SET state='DISPATCHED' WHERE id=op.id RETURNING * INTO op; claimed=true;
  END IF;
 ELSIF p->>'state'='NOT_DISPATCHED' THEN
  IF op.state='PREPARED' THEN
   UPDATE external_alpha_operation SET state='NOT_DISPATCHED',spent_microusd=0 WHERE id=op.id RETURNING * INTO op; claimed=true;
  END IF;
 ELSE RAISE EXCEPTION 'EXTERNAL_ALPHA_OPERATION_TRANSITION'; END IF;
 RETURN to_jsonb(op)||jsonb_build_object('claimed',claimed);
END $$;
-- statement-breakpoint
-- Body copied verbatim from 0086_external_alpha_work_authority.sql; only the 120-hour expiry expression is replaced.
CREATE OR REPLACE FUNCTION external_alpha_work_admit(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; pol jsonb; d jsonb; w engineering_work%ROWTYPE; prior external_alpha_work_authority%ROWTYPE; row external_alpha_work_authority%ROWTYPE;
 items jsonb; statements jsonb; allowance jsonb; files_text text; sorted_files jsonb; n timestamptz; aid text; h text; issued timestamptz; expires timestamptz;
 task constant text='add a Priority field (exactly Low|Medium|High) shown on the task list';
 criteria constant jsonb='["Existing tasks still display and function","Creating or editing a task supports exactly Low, Medium and High","Priority persists after reload","The task list displays each task''s priority","An invalid priority is rejected","Existing tests pass","Focused tests cover creation, editing, persistence, display and invalid input","No unrelated product or UI changes","No production deployment or external publication","An independent verifier checks the exact resulting source and artifact against these criteria rather than trusting the producer"]';
 criteria_sha constant text='266874e4e72dcce0f02ff58bedf56801d6e9906080ed6e7b987dc6537a20b466';
 tuple_sha constant text='22768f0af6d9aa49f6f0c6553bf1a44ee7599377c1b1935904b998167bf70577';
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 pol=policy.policy; d=p->'document'; n=clock_timestamp();
 IF p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256
 OR d->>'ownerId' IS DISTINCT FROM policy.owner_id OR d->>'policySha256' IS DISTINCT FROM policy.policy_sha256
 OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR n<policy.activated_at OR n>=external_alpha_access_until(policy.activated_at,policy.extended_until)
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_ADMISSION_DENIED: policy inactive or wrong owner'; END IF;
 -- The stored digest must be the digest of exactly the document that is stored.
 IF jsonb_typeof(d)<>'object' OR (p->>'canonical')::jsonb IS DISTINCT FROM d OR encode(sha256(convert_to(p->>'canonical','UTF8')),'hex') IS DISTINCT FROM p->>'documentSha256'
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_ADMISSION_DENIED: document digest'; END IF;
 -- Browser refresh, reconnect or duplicate controller delivery resolves to the same record.
 SELECT * INTO prior FROM external_alpha_work_authority WHERE idempotency_key=d->>'idempotencyKey';
 IF FOUND THEN
  IF prior.owner_id<>policy.owner_id THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_ADMISSION_DENIED: owner'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 h=substr(d->>'idempotencyKey',1,32);
 aid=substr(h,1,8)||'-'||substr(h,9,4)||'-8'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12);
 IF d->>'schema'<>'MYEVE_EXTERNAL_ALPHA_WORK_AUTHORITY_V1' OR d->>'authorityId' IS DISTINCT FROM aid OR (d->>'singleUse')::boolean IS DISTINCT FROM true
 OR d->>'cohortId' IS DISTINCT FROM pol->>'cohortId' OR d->>'slot' IS DISTINCT FROM pol->>'slot'
 OR d->'application' IS DISTINCT FROM jsonb_build_object('clientId',pol->>'clientId','projectId',pol->>'projectId')
 OR d->'model' IS DISTINCT FROM jsonb_build_object('provider',pol->>'provider','id',pol->>'model')
 OR d->>'factoryVersion' IS DISTINCT FROM pol->>'factoryVersion'
 OR d->>'environment'<>'CLOUD_PRODUCTION' OR d->>'executionProvider'<>'MYFACTORY_CLOUD_EXECUTION_V2'
 OR d->'harness' IS DISTINCT FROM '{"id":"myfactory-cloud-harness","version":"1"}'::jsonb
 OR d->'limits' IS DISTINCT FROM '{"work":{"operations":5,"microusd":1300000},"factory":{"operations":3,"microusd":1000000},"productiveSeconds":180,"candidates":1,"writers":1}'::jsonb
 OR d->'allowedEffects' IS DISTINCT FROM '["candidate.create","repository.read","sandbox.write","verification.request"]'::jsonb
 OR d->'forbiddenEffects' IS DISTINCT FROM '["deploy","merge","production","publication","repository.admin","secrets.mutate","workflows.mutate"]'::jsonb
 OR d->'verifier' IS DISTINCT FROM jsonb_build_object('id','independent-exact-artifact-verifier','verifiesExactArtifact',true,'trustProducer',false,'criteriaSha256',criteria_sha)
 OR d->'project' IS DISTINCT FROM jsonb_build_object('name','Alpha Tasks','task',task,'criteriaSha256',criteria_sha,'tupleSha256',tuple_sha)
 OR d->'source'->>'repository' IS DISTINCT FROM pol->>'repository' OR d->'source'->>'baseSha' IS DISTINCT FROM pol->>'baseSha'
 OR d->'source'->>'treeSha' IS DISTINCT FROM pol->>'treeSha' OR d->'source'->>'sourceDigest' IS DISTINCT FROM pol->>'sourceDigest'
 OR jsonb_typeof(d->'source'->'allowedFiles')<>'array' OR jsonb_array_length(d->'source'->'allowedFiles') NOT BETWEEN 1 AND 30
 OR d->'candidateWriter'->>'candidateSlot' IS DISTINCT FROM '1'
 OR d->'candidateWriter'->>'requestId' IS DISTINCT FROM (SELECT substr(x,1,8)||'-'||substr(x,9,4)||'-8'||substr(x,14,3)||'-a'||substr(x,18,3)||'-'||substr(x,21,12) FROM (SELECT encode(sha256(convert_to('EXTERNAL_ALPHA_REQUEST_V1:'||aid,'UTF8')),'hex') x) q)
 OR d->'candidateWriter'->>'writerId' IS DISTINCT FROM (SELECT substr(x,1,8)||'-'||substr(x,9,4)||'-8'||substr(x,14,3)||'-a'||substr(x,18,3)||'-'||substr(x,21,12) FROM (SELECT encode(sha256(convert_to('EXTERNAL_ALPHA_WRITER_V1:'||aid,'UTF8')),'hex') x) q)
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_ADMISSION_DENIED: authority does not match installed policy'; END IF;
 -- Allowed files: sorted, unique, plain relative paths, and bound by digest (digest({version:1,files}) in canonical form).
 SELECT string_agg(to_json(f)::text,',' ORDER BY ord),jsonb_agg(f ORDER BY f COLLATE "C") INTO files_text,sorted_files FROM jsonb_array_elements_text(d->'source'->'allowedFiles') WITH ORDINALITY t(f,ord);
 IF sorted_files IS DISTINCT FROM d->'source'->'allowedFiles' OR (SELECT count(DISTINCT f)<>count(*) FROM jsonb_array_elements_text(d->'source'->'allowedFiles') f)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(d->'source'->'allowedFiles') f WHERE f !~ '^[A-Za-z0-9_][A-Za-z0-9_./-]*$' OR f ~ '(^|/)\.' OR f ~ '//' OR f ~ '(^|/)(node_modules|vendor|credentials|secrets)(/|$)')
 OR encode(sha256(convert_to('{"files":['||files_text||'],"version":1}','UTF8')),'hex') IS DISTINCT FROM d->'source'->>'allowedFilesSha256'
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_ADMISSION_DENIED: allowed files'; END IF;
 issued=(d->>'issuedAt')::timestamptz; expires=(d->>'expiresAt')::timestamptz;
 IF d->>'notBefore' IS DISTINCT FROM d->>'issuedAt' OR abs(extract(epoch FROM issued-n))>10 OR expires<=n OR expires>issued+interval '300 seconds'
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_ADMISSION_DENIED: authority window'; END IF;
 SELECT * INTO w FROM engineering_work WHERE scope_id=policy.owner_id AND scope_kind='personal' AND id=(d->'work'->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE: owner Work not found'; END IF;
 SELECT c.items INTO items FROM engineering_work_criteria c WHERE c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id AND c.version=w.criteria_version;
 SELECT jsonb_agg(e->>'statement' ORDER BY ord) INTO statements FROM jsonb_array_elements(items) WITH ORDINALITY t(e,ord);
 IF w.lifecycle<>'active' OR w.control<>'agent' OR w.version IS DISTINCT FROM (d->'work'->>'version')::integer OR w.generation IS DISTINCT FROM (d->'work'->>'generation')::integer
 OR w.repository IS DISTINCT FROM pol->>'repository' OR w.title IS DISTINCT FROM d->'work'->>'title'
 OR encode(sha256(convert_to(w.objective,'UTF8')),'hex') IS DISTINCT FROM d->'work'->>'objectiveSha256'
 OR w.max_cost_usd<>1.30 OR w.max_duration_seconds<>180 OR statements IS DISTINCT FROM criteria
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) e WHERE e->>'method'<>'test')
 OR d->'work'->>'criteriaSha256' IS DISTINCT FROM criteria_sha OR (d->'work'->>'criteriaCount')::integer IS DISTINCT FROM 10
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE: exact canonical Work required'; END IF;
 PERFORM set_config('myeve.external_alpha_work_admit','on',true);
 allowance=external_alpha_admit(jsonb_build_object('id',p->>'allowanceId','ownerId',policy.owner_id,'policySha256',policy.policy_sha256,'kind','WORK',
  'bindingId','work:'||w.id||':'||w.version||':'||w.generation,'requestSha256',d->>'idempotencyKey','workId',w.id,'workVersion',w.version,'workGeneration',w.generation,
  'effectSessionId',p->>'effectSessionId','effectCallId',p->>'effectCallId'));
 PERFORM set_config('myeve.external_alpha_work_admit','off',true);
 IF (allowance->>'deadline')::timestamptz<expires THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_ADMISSION_DENIED: allowance deadline'; END IF;
 INSERT INTO external_alpha_work_authority(id,idempotency_key,owner_id,policy_sha256,allowance_id,work_id,work_version,work_generation,request_id,writer_id,document,document_sha256,signature,key_id,issued_at,expires_at)
 VALUES(aid::uuid,d->>'idempotencyKey',policy.owner_id,policy.policy_sha256,(allowance->>'id')::uuid,w.id,w.version,w.generation,(d->'candidateWriter'->>'requestId')::uuid,(d->'candidateWriter'->>'writerId')::uuid,
  d,p->>'documentSha256',p->>'signature',p->>'keyId',issued,expires) RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
-- Body copied verbatim from 0085_external_alpha_allowance.sql; only the 120-hour expiry expression is replaced.
CREATE OR REPLACE FUNCTION external_alpha_tool_claim(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; prior external_alpha_tool_effect%ROWTYPE;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 IF policy.owner_id IS DISTINCT FROM p->>'ownerId' OR a.owner_id<>policy.owner_id
 OR policy.policy_sha256 IS DISTINCT FROM p->>'policySha256' OR a.policy_sha256<>policy.policy_sha256
 OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL
 OR clock_timestamp()>=external_alpha_access_until(policy.activated_at,policy.extended_until) OR clock_timestamp()>=a.deadline OR a.state<>'OPEN'
 OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN')
 THEN RAISE EXCEPTION 'External alpha effect authority revoked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM agents WHERE owner_id=policy.owner_id AND id=p->>'agentId' AND status='active' FOR SHARE)
 THEN RAISE EXCEPTION 'External alpha effect Agent inactive'; END IF;
 IF a.binding_id IS DISTINCT FROM (p->>'sessionId')||':'||(p->>'turnId')
 OR NOT EXISTS(SELECT 1 FROM external_alpha_operation o, jsonb_array_elements(o.result->'content') c
  WHERE o.allowance_id=a.id AND o.state='SETTLED' AND c->>'type'='tool-call'
   AND c->>'toolCallId'=p->>'callId' AND c->>'toolName'=p->>'toolName')
 THEN RAISE EXCEPTION 'External alpha effect proposal missing'; END IF;
 SELECT * INTO prior FROM external_alpha_tool_effect WHERE owner_id=policy.owner_id AND session_id=p->>'sessionId' AND call_id=p->>'callId';
 IF FOUND THEN
  IF prior.state<>'COMPLETED' OR prior.input_sha256 IS DISTINCT FROM p->>'inputSha256' OR prior.tool_name IS DISTINCT FROM p->>'toolName' OR prior.allowance_id<>a.id OR prior.agent_id IS DISTINCT FROM p->>'agentId'
  THEN RAISE EXCEPTION 'External alpha effect cannot be retried'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 INSERT INTO external_alpha_tool_effect(owner_id,session_id,call_id,allowance_id,agent_id,tool_name,input_sha256,state)
 VALUES(policy.owner_id,p->>'sessionId',p->>'callId',a.id,p->>'agentId',p->>'toolName',p->>'inputSha256','ACCEPTED') RETURNING * INTO prior;
 RETURN to_jsonb(prior);
END $$;
-- statement-breakpoint
-- Body copied verbatim from 0109_external_alpha_chat_only.sql; only the 120-hour expiry expression is replaced.
CREATE OR REPLACE FUNCTION external_alpha_chat_only_allowance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE grant_row external_alpha_chat_only%ROWTYPE; policy_row external_alpha_policy%ROWTYPE;
 day_charge bigint; total_charge bigint; day_count integer; utc_day integer; n timestamptz;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_CHAT_ONLY_ISOLATION'; END IF;
 SELECT * INTO grant_row FROM external_alpha_chat_only WHERE singleton;
 IF NOT FOUND THEN RETURN NEW; END IF;
 -- The existing admission function takes this same lock. Direct inserts must
 -- serialize here too; caller-supplied day/cost/owner cannot bypass the bound.
 SELECT * INTO STRICT policy_row FROM external_alpha_policy WHERE singleton FOR UPDATE;
 n=clock_timestamp(); utc_day=floor(extract(epoch FROM n)/86400);
 IF NEW.kind IS DISTINCT FROM 'CHAT' OR NEW.owner_id IS DISTINCT FROM grant_row.owner_id
  OR NEW.policy_sha256 IS DISTINCT FROM grant_row.policy_sha256
  OR policy_row.owner_id IS DISTINCT FROM grant_row.owner_id
  OR policy_row.policy_sha256 IS DISTINCT FROM grant_row.policy_sha256
  OR policy_row.activated_at IS NULL OR policy_row.revoked_at IS NOT NULL
  OR n<policy_row.activated_at OR n>=external_alpha_access_until(policy_row.activated_at,policy_row.extended_until)
  OR NEW.day_index IS DISTINCT FROM utc_day OR NEW.ceiling_microusd IS DISTINCT FROM 100000::bigint
  OR NEW.max_operations IS DISTINCT FROM 2 OR NEW.deadline>LEAST(n+interval '180 seconds',external_alpha_access_until(policy_row.activated_at,policy_row.extended_until))
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_CHAT_ONLY_DENIED'; END IF;
 SELECT COALESCE(sum(ceiling_microusd) FILTER(WHERE day_index=utc_day),0),COALESCE(sum(ceiling_microusd),0),count(*) FILTER(WHERE day_index=utc_day)
 INTO day_charge,total_charge,day_count FROM external_alpha_allowance;
 IF day_count>=10 OR day_charge+100000>1000000 OR total_charge+100000>5000000
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_CHAT_ONLY_EXHAUSTED'; END IF;
 RETURN NEW;
END $$;
