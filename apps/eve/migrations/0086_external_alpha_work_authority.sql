-- Additive, inert. Installs no policy, activation, grant or invitation.
-- Adds (1) a source-aware shared model ledger so Sofie and Factory model use are
-- charged to one allowance and (2) single-use exact Work authority records.
-- A Work allowance can only be created through external_alpha_work_admit.
ALTER TABLE external_alpha_operation ADD COLUMN source text NOT NULL DEFAULT 'SOFIE'
 CHECK(source IN('SOFIE','FACTORY_PRODUCTIVE','FACTORY_COMPLETION'));
-- statement-breakpoint
CREATE TABLE external_alpha_work_authority (
 id uuid PRIMARY KEY,
 idempotency_key text NOT NULL UNIQUE CHECK(idempotency_key ~ '^[a-f0-9]{64}$'),
 owner_id text NOT NULL REFERENCES external_alpha_policy(owner_id),
 policy_sha256 text NOT NULL CHECK(policy_sha256 ~ '^[a-f0-9]{64}$'),
 allowance_id uuid NOT NULL UNIQUE REFERENCES external_alpha_allowance(id),
 work_id uuid NOT NULL, work_version integer NOT NULL CHECK(work_version>0), work_generation integer NOT NULL CHECK(work_generation>0),
 request_id uuid NOT NULL UNIQUE, writer_id uuid NOT NULL UNIQUE,
 document jsonb NOT NULL, document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[a-f0-9]{64}$'),
 signature text NOT NULL CHECK(signature ~ '^[A-Za-z0-9_-]{86}$'), key_id text NOT NULL CHECK(key_id ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'ISSUED' CHECK(state IN('ISSUED','DISPATCHING','CONSUMED','UNKNOWN','REVOKED','EXPIRED','CANCELLED','COMPLETED')),
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '300 seconds'),
 dispatching_at timestamptz, consumed_at timestamptz, terminal_at timestamptz, receipt jsonb, terminal_reason text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,work_id), UNIQUE(owner_id,work_id,work_generation)
);
-- statement-breakpoint
CREATE FUNCTION external_alpha_work_authority_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External alpha authority history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','dispatching_at','consumed_at','terminal_at','receipt','terminal_reason'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','dispatching_at','consumed_at','terminal_at','receipt','terminal_reason'])
 THEN RAISE EXCEPTION 'External alpha authority is immutable'; END IF;
 IF OLD.receipt IS NOT NULL AND NEW.receipt IS DISTINCT FROM OLD.receipt THEN RAISE EXCEPTION 'External alpha authority receipt is immutable'; END IF;
 IF NEW.state IS DISTINCT FROM OLD.state AND NOT((OLD.state,NEW.state) IN (VALUES
  ('ISSUED','DISPATCHING'),('ISSUED','EXPIRED'),('ISSUED','REVOKED'),('ISSUED','CANCELLED'),
  ('DISPATCHING','CONSUMED'),('DISPATCHING','UNKNOWN'),
  ('CONSUMED','COMPLETED'),('CONSUMED','CANCELLED'),('CONSUMED','UNKNOWN')))
 THEN RAISE EXCEPTION 'External alpha authority transition denied: % to %',OLD.state,NEW.state; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_work_authority_guard BEFORE UPDATE OR DELETE ON external_alpha_work_authority FOR EACH ROW EXECUTE FUNCTION external_alpha_work_authority_guard();
-- statement-breakpoint
-- Replaces the 0085 admission function. Differences: a WORK allowance is only
-- creatable inside external_alpha_work_admit (transaction-local marker); Work
-- allowances live 300 s (180 s productive plus intake slack); a caller's own
-- ACCEPTED tool effect does not fence itself.
CREATE OR REPLACE FUNCTION external_alpha_admit(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; prior external_alpha_allowance%ROWTYPE; row external_alpha_allowance%ROWTYPE;
 n timestamptz; day integer; allowance bigint; operations integer; count_day integer; charged_day bigint; charged_total bigint; w engineering_work%ROWTYPE; span interval;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 n=clock_timestamp();
 IF p->>'ownerId' IS DISTINCT FROM policy.owner_id OR p->>'policySha256' IS DISTINCT FROM policy.policy_sha256
 OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR n<policy.activated_at OR n>=policy.activated_at+interval '120 hours'
 THEN RAISE EXCEPTION 'External alpha inactive or wrong owner'; END IF;
 SELECT * INTO prior FROM external_alpha_allowance WHERE owner_id=policy.owner_id AND binding_id=p->>'bindingId';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.kind IS DISTINCT FROM p->>'kind' THEN RAISE EXCEPTION 'External alpha binding changed'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF p->>'kind'='WORK' AND COALESCE(current_setting('myeve.external_alpha_work_admit',true),'')<>'on' THEN RAISE EXCEPTION 'Work allowance requires exact Work authority admission'; END IF;
 IF EXISTS(SELECT 1 FROM external_alpha_tool_effect e WHERE e.state='UNKNOWN' OR (e.state='ACCEPTED' AND NOT(e.session_id IS NOT DISTINCT FROM p->>'effectSessionId' AND e.call_id IS NOT DISTINCT FROM p->>'effectCallId')))
 OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('DISPATCHED','UNKNOWN')) THEN RAISE EXCEPTION 'Unresolved exposure fences further admission'; END IF;
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
 VALUES((p->>'id')::uuid,policy.owner_id,policy.policy_sha256,p->>'kind',p->>'bindingId',p->>'requestSha256',w.id,w.version,w.generation,day,allowance,operations,LEAST(n+span,policy.activated_at+interval '120 hours')) RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
-- Replaces the 0085 reservation function: same fences, plus one combined
-- allowance bound. Sofie keeps its 2-operation share; Factory operations are
-- recorded by external_alpha_factory_record against the same allowance.
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
 IF policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR clock_timestamp()>=policy.activated_at+interval '120 hours' OR clock_timestamp()>=a.deadline OR a.state<>'OPEN'
 OR EXISTS(SELECT 1 FROM external_alpha_tool_effect WHERE state IN('ACCEPTED','UNKNOWN')) OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('DISPATCHED','UNKNOWN')) THEN RAISE EXCEPTION 'External alpha dispatch fenced'; END IF;
 m=(p->>'microusd')::bigint;
 SELECT count(*) FILTER(WHERE source='SOFIE'),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)) FILTER(WHERE source='SOFIE'),0),count(*),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)),0)
 INTO admitted,exposure,total_ops,total_exposure FROM external_alpha_operation WHERE allowance_id=a.id;
 IF admitted>=2 OR m IS NULL OR m<=0 OR exposure+m>(CASE WHEN a.kind='WORK' THEN 300000 ELSE 100000 END) OR total_ops>=a.max_operations OR total_exposure+m>a.ceiling_microusd THEN RAISE EXCEPTION 'External alpha operation budget exhausted'; END IF;
 INSERT INTO external_alpha_operation(id,allowance_id,step_key,request_sha256,reserved_microusd,state,source) VALUES((p->>'id')::uuid,a.id,p->>'stepKey',p->>'requestSha256',m,'DISPATCHED','SOFIE') RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
-- Factory operations are enforced by the Factory itself (3 operations / $1.00).
-- MyEve records what the Factory reports into the same allowance. Settlement is
-- exact-once per (allowance, step); UNKNOWN exposure keeps its full reservation
-- and an over-bound report fences the owner/cohort. Accounting is always
-- recordable, even after revocation or cancellation.
CREATE FUNCTION external_alpha_factory_record(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; au external_alpha_work_authority%ROWTYPE; prior external_alpha_operation%ROWTYPE; row external_alpha_operation%ROWTYPE;
 f_ops integer; f_exposure bigint; t_ops integer; t_exposure bigint; m bigint; reserved bigint; st text; over boolean=false; src text;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 SELECT * INTO STRICT au FROM external_alpha_work_authority WHERE allowance_id=a.id FOR UPDATE;
 src=p->>'source'; st=p->>'state';
 IF a.owner_id IS DISTINCT FROM p->>'ownerId' OR policy.owner_id<>a.owner_id OR a.kind<>'WORK' OR au.id IS DISTINCT FROM (p->>'authorityId')::uuid
 OR au.state NOT IN('CONSUMED','COMPLETED','CANCELLED','UNKNOWN') OR src NOT IN('FACTORY_PRODUCTIVE','FACTORY_COMPLETION') OR st NOT IN('SETTLED','UNKNOWN')
 OR p->>'stepKey' !~ '^factory:.+:\d+$' OR p->>'requestSha256' !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Exact consumed Work authority and Factory operation required'; END IF;
 m=NULLIF(p->>'microusd','')::bigint;
 IF st='SETTLED' AND (m IS NULL OR m<0) THEN RAISE EXCEPTION 'Settled Factory operation requires a measured cost'; END IF;
 SELECT * INTO prior FROM external_alpha_operation WHERE allowance_id=a.id AND step_key=p->>'stepKey';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.source<>src THEN RAISE EXCEPTION 'Factory operation identity changed'; END IF;
  -- exact-once: a replay never changes recorded exposure, and UNKNOWN is never released.
  RETURN to_jsonb(prior);
 END IF;
 SELECT count(*) FILTER(WHERE source LIKE 'FACTORY%'),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)) FILTER(WHERE source LIKE 'FACTORY%'),0),count(*),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)),0)
 INTO f_ops,f_exposure,t_ops,t_exposure FROM external_alpha_operation WHERE allowance_id=a.id;
 reserved=GREATEST(COALESCE(m,1000000-f_exposure),1);
 IF f_ops+1>3 OR f_exposure+reserved>1000000 OR t_ops+1>a.max_operations OR t_exposure+reserved>a.ceiling_microusd THEN over=true; END IF;
 IF over OR st='UNKNOWN' THEN
  INSERT INTO external_alpha_operation(id,allowance_id,step_key,request_sha256,reserved_microusd,state,source,result)
  VALUES((p->>'id')::uuid,a.id,p->>'stepKey',p->>'requestSha256',reserved,'UNKNOWN',src,jsonb_build_object('overBound',over)) RETURNING * INTO row;
  UPDATE external_alpha_allowance SET state='UNKNOWN' WHERE id=a.id;
 ELSE
  INSERT INTO external_alpha_operation(id,allowance_id,step_key,request_sha256,reserved_microusd,spent_microusd,state,source,result)
  VALUES((p->>'id')::uuid,a.id,p->>'stepKey',p->>'requestSha256',reserved,m,'SETTLED',src,COALESCE(p->'result','{}'::jsonb)) RETURNING * INTO row;
 END IF;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
CREATE FUNCTION external_alpha_work_admit(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
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
 OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR n<policy.activated_at OR n>=policy.activated_at+interval '120 hours'
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
-- Exactly one caller wins ISSUED to DISPATCHING; only that caller may send.
CREATE FUNCTION external_alpha_work_claim(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
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
 IF au.state<>'ISSUED' OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR n>=policy.activated_at+interval '120 hours' OR n>=au.expires_at OR n>=a.deadline OR a.state<>'OPEN'
 OR w.version<>au.work_version OR w.generation<>au.work_generation OR w.lifecycle<>'active' OR w.control<>'agent'
 OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('DISPATCHED','UNKNOWN'))
 OR EXISTS(SELECT 1 FROM external_alpha_tool_effect e WHERE e.state='UNKNOWN')
 OR EXISTS(SELECT 1 FROM external_alpha_work_authority x WHERE x.state IN('UNKNOWN','DISPATCHING') AND x.id<>au.id)
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_AUTHORITY_NOT_DISPATCHABLE: fenced, expired, revoked or Work changed'; END IF;
 UPDATE external_alpha_work_authority SET state='DISPATCHING',dispatching_at=n WHERE id=au.id RETURNING * INTO au;
 RETURN jsonb_build_object('claimed',true,'authority',to_jsonb(au));
END $$;
-- statement-breakpoint
CREATE FUNCTION external_alpha_work_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; au external_alpha_work_authority%ROWTYPE; st text; n timestamptz;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT au FROM external_alpha_work_authority WHERE id=(p->>'authorityId')::uuid FOR UPDATE;
 PERFORM 1 FROM external_alpha_allowance WHERE id=au.allowance_id FOR UPDATE;
 st=p->>'state'; n=clock_timestamp();
 IF au.owner_id<>policy.owner_id OR p->>'ownerId' IS DISTINCT FROM policy.owner_id THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_AUTHORITY_NOT_DISPATCHABLE: owner'; END IF;
 IF au.state=st THEN RETURN to_jsonb(au); END IF;
 IF st='CONSUMED' THEN
  IF p->'receipt'->>'authorityId' IS DISTINCT FROM au.id::text OR p->'receipt'->>'requestId' IS DISTINCT FROM au.request_id::text OR p->'receipt'->>'authoritySha256' IS DISTINCT FROM au.document_sha256
  THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_RECEIPT_INVALID'; END IF;
  UPDATE external_alpha_work_authority SET state='CONSUMED',consumed_at=n,receipt=p->'receipt' WHERE id=au.id RETURNING * INTO au;
 ELSIF st='UNKNOWN' THEN
  UPDATE external_alpha_work_authority SET state='UNKNOWN',terminal_at=n,terminal_reason=left(COALESCE(p->>'reason','UNKNOWN'),200) WHERE id=au.id RETURNING * INTO au;
  UPDATE external_alpha_allowance SET state='UNKNOWN' WHERE id=au.allowance_id;
 ELSIF st IN('COMPLETED','CANCELLED','EXPIRED','REVOKED') THEN
  UPDATE external_alpha_work_authority SET state=st,terminal_at=n,terminal_reason=left(COALESCE(p->>'reason',st),200) WHERE id=au.id RETURNING * INTO au;
  UPDATE external_alpha_allowance SET state=(CASE WHEN st='COMPLETED' THEN 'COMPLETED' ELSE 'HALTED' END) WHERE id=au.allowance_id AND state='OPEN';
 ELSE RAISE EXCEPTION 'Unsupported authority state'; END IF;
 RETURN to_jsonb(au);
END $$;
-- statement-breakpoint
-- Expiry and revocation sweep. An authority that may have been sent but never
-- resolved becomes UNKNOWN and fences the owner/cohort; nothing is recycled.
CREATE FUNCTION external_alpha_work_sweep(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; r external_alpha_work_authority%ROWTYPE; n timestamptz=clock_timestamp(); expired integer=0; revoked integer=0; unknown integer=0;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 IF p->>'ownerId' IS DISTINCT FROM policy.owner_id THEN RAISE EXCEPTION 'External alpha owner mismatch'; END IF;
 FOR r IN SELECT * FROM external_alpha_work_authority WHERE owner_id=policy.owner_id AND state IN('ISSUED','DISPATCHING') FOR UPDATE LOOP
  IF r.state='ISSUED' AND policy.revoked_at IS NOT NULL THEN
   UPDATE external_alpha_work_authority SET state='REVOKED',terminal_at=n,terminal_reason='POLICY_REVOKED' WHERE id=r.id;
   UPDATE external_alpha_allowance SET state='HALTED' WHERE id=r.allowance_id AND state='OPEN'; revoked=revoked+1;
  ELSIF r.state='ISSUED' AND n>=r.expires_at THEN
   UPDATE external_alpha_work_authority SET state='EXPIRED',terminal_at=n,terminal_reason='EXPIRED_UNSENT' WHERE id=r.id;
   UPDATE external_alpha_allowance SET state='HALTED' WHERE id=r.allowance_id AND state='OPEN'; expired=expired+1;
  ELSIF r.state='DISPATCHING' AND n>=r.expires_at+interval '60 seconds' THEN
   UPDATE external_alpha_work_authority SET state='UNKNOWN',terminal_at=n,terminal_reason='DISPATCH_UNRESOLVED' WHERE id=r.id;
   UPDATE external_alpha_allowance SET state='UNKNOWN' WHERE id=r.allowance_id; unknown=unknown+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('expired',expired,'revoked',revoked,'unknown',unknown);
END $$;
-- statement-breakpoint
REVOKE ALL ON external_alpha_work_authority FROM PUBLIC;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_admit(jsonb),external_alpha_model_reserve(jsonb),external_alpha_factory_record(jsonb),external_alpha_work_admit(jsonb),external_alpha_work_claim(jsonb),external_alpha_work_finish(jsonb),external_alpha_work_sweep(jsonb) FROM PUBLIC;
