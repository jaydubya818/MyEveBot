-- Inert recovery schema. No activation, refund, grant or legacy exposure backfill.
ALTER TABLE external_alpha_operation DROP CONSTRAINT external_alpha_operation_state_check;
-- statement-breakpoint
ALTER TABLE external_alpha_operation ADD CONSTRAINT external_alpha_operation_state_check CHECK(state IN('PREPARED','NOT_DISPATCHED','DISPATCHED','SETTLED','UNKNOWN'));
-- statement-breakpoint
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
 VALUES((p->>'id')::uuid,policy.owner_id,policy.policy_sha256,p->>'kind',p->>'bindingId',p->>'requestSha256',w.id,w.version,w.generation,day,allowance,operations,LEAST(n+span,policy.activated_at+interval '120 hours')) RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
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
 OR EXISTS(SELECT 1 FROM external_alpha_tool_effect WHERE state IN('ACCEPTED','UNKNOWN')) OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('PREPARED','DISPATCHED','UNKNOWN')) THEN RAISE EXCEPTION 'External alpha dispatch fenced'; END IF;
 m=(p->>'microusd')::bigint;
 SELECT count(*) FILTER(WHERE source='SOFIE'),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)) FILTER(WHERE source='SOFIE'),0),count(*),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)),0)
 INTO admitted,exposure,total_ops,total_exposure FROM external_alpha_operation WHERE allowance_id=a.id;
 IF admitted>=2 OR m IS NULL OR m<=0 OR exposure+m>(CASE WHEN a.kind='WORK' THEN 300000 ELSE 100000 END) OR total_ops>=a.max_operations OR total_exposure+m>a.ceiling_microusd THEN RAISE EXCEPTION 'External alpha operation budget exhausted'; END IF;
 INSERT INTO external_alpha_operation(id,allowance_id,step_key,request_sha256,reserved_microusd,state,source) VALUES((p->>'id')::uuid,a.id,p->>'stepKey',p->>'requestSha256',m,'PREPARED','SOFIE') RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
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
 IF au.state<>'ISSUED' OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR n>=policy.activated_at+interval '120 hours' OR n>=au.expires_at OR n>=a.deadline OR a.state<>'OPEN'
 OR w.version<>au.work_version OR w.generation<>au.work_generation OR w.lifecycle<>'active' OR w.control<>'agent'
 OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('PREPARED','DISPATCHED','UNKNOWN'))
 OR EXISTS(SELECT 1 FROM external_alpha_tool_effect e WHERE e.state='UNKNOWN')
 OR EXISTS(SELECT 1 FROM external_alpha_work_authority x WHERE x.state IN('UNKNOWN','DISPATCHING') AND x.id<>au.id)
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_AUTHORITY_NOT_DISPATCHABLE: fenced, expired, revoked or Work changed'; END IF;
 UPDATE external_alpha_work_authority SET state='DISPATCHING',dispatching_at=n WHERE id=au.id RETURNING * INTO au;
 RETURN jsonb_build_object('claimed',true,'authority',to_jsonb(au));
END $$;
-- statement-breakpoint
-- Only the CAS winner may call the provider. Cancellation wins only before
-- that boundary; legacy DISPATCHED and UNKNOWN rows are never reclaimed.
CREATE FUNCTION external_alpha_model_transition(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; op external_alpha_operation%ROWTYPE; claimed boolean=false;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 SELECT * INTO STRICT op FROM external_alpha_operation WHERE id=(p->>'operationId')::uuid AND allowance_id=a.id FOR UPDATE;
 IF a.owner_id IS DISTINCT FROM p->>'ownerId' OR policy.owner_id<>a.owner_id OR a.policy_sha256 IS DISTINCT FROM p->>'policySha256' OR policy.policy_sha256<>a.policy_sha256
 OR op.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR op.source<>'SOFIE' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_OPERATION_BINDING'; END IF;
 IF p->>'state'='DISPATCHED' THEN
  IF policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR clock_timestamp()>=policy.activated_at+interval '120 hours' OR clock_timestamp()>=a.deadline OR a.state<>'OPEN'
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
REVOKE ALL ON FUNCTION external_alpha_model_transition(jsonb) FROM PUBLIC;
