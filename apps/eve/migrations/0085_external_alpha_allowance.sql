-- An inert, fixed two-owner cohort partition. No policy, activation, grant or
-- invitation is installed by this migration. Whole allowance is charged at
-- admission and is never recycled, including unused and UNKNOWN exposure.
CREATE TABLE external_alpha_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 owner_id text NOT NULL UNIQUE, policy_sha256 text NOT NULL CHECK(policy_sha256 ~ '^[a-f0-9]{64}$'),
 policy jsonb NOT NULL, activated_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(policy->>'ownerId'=owner_id AND policy->>'kind'='TWO_EXTERNAL_OWNERS_V1'),
 CHECK(activated_at IS NULL OR activated_at>=created_at)
);
-- statement-breakpoint
CREATE TABLE external_alpha_allowance (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES external_alpha_policy(owner_id),
 policy_sha256 text NOT NULL, kind text NOT NULL CHECK(kind IN('CHAT','WORK')),
 binding_id text NOT NULL CHECK(length(binding_id) BETWEEN 1 AND 300),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 work_id uuid, work_version integer, work_generation integer,
 day_index integer NOT NULL CHECK(day_index>=0),
 ceiling_microusd bigint NOT NULL, max_operations integer NOT NULL,
 state text NOT NULL DEFAULT 'OPEN' CHECK(state IN('OPEN','COMPLETED','HALTED','UNKNOWN')),
 deadline timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((kind='CHAT' AND ceiling_microusd=100000 AND max_operations=2 AND work_id IS NULL AND work_version IS NULL AND work_generation IS NULL)
 OR(kind='WORK' AND ceiling_microusd=1300000 AND max_operations=5 AND work_id IS NOT NULL AND work_version>0 AND work_generation>0)),
 UNIQUE(owner_id,binding_id), UNIQUE(owner_id,work_id)
);
-- statement-breakpoint
CREATE TABLE external_alpha_operation (
 id uuid PRIMARY KEY, allowance_id uuid NOT NULL REFERENCES external_alpha_allowance(id),
 step_key text NOT NULL, request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0),
 spent_microusd bigint CHECK(spent_microusd>=0 AND spent_microusd<=reserved_microusd),
 state text NOT NULL CHECK(state IN('DISPATCHED','SETTLED','UNKNOWN')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(allowance_id,step_key)
);
-- statement-breakpoint
CREATE FUNCTION external_alpha_policy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External alpha policy history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['activated_at','revoked_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['activated_at','revoked_at'])
 OR OLD.revoked_at IS NOT NULL OR (OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at)
 THEN RAISE EXCEPTION 'External alpha allocation cannot be replaced or reset'; END IF;
 IF NEW.activated_at IS DISTINCT FROM OLD.activated_at AND (NEW.activated_at IS NULL OR abs(extract(epoch FROM NEW.activated_at-clock_timestamp()))>5) THEN RAISE EXCEPTION 'Activation requires current operator approval'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_policy_guard BEFORE UPDATE OR DELETE ON external_alpha_policy FOR EACH ROW EXECUTE FUNCTION external_alpha_policy_guard();
-- statement-breakpoint
CREATE FUNCTION external_alpha_admit(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; prior external_alpha_allowance%ROWTYPE; row external_alpha_allowance%ROWTYPE;
 n timestamptz; day integer; allowance bigint; operations integer; count_day integer; charged_day bigint; charged_total bigint; w engineering_work%ROWTYPE;
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
 IF EXISTS(SELECT 1 FROM external_alpha_tool_effect WHERE state IN('ACCEPTED','UNKNOWN')) OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('DISPATCHED','UNKNOWN')) THEN RAISE EXCEPTION 'Unresolved exposure fences further admission'; END IF;
 -- Shared UTC calendar days prevent staggered owner activations from multiplying the global daily cap.
 day=floor(extract(epoch FROM n)/86400);
 IF p->>'kind'='CHAT' THEN allowance=100000;operations=2;
 ELSIF p->>'kind'='WORK' THEN
  allowance=1300000;operations=5;
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=policy.owner_id AND scope_kind='personal' AND id=(p->>'workId')::uuid FOR UPDATE;
  IF w.version IS DISTINCT FROM (p->>'workVersion')::integer OR w.generation IS DISTINCT FROM (p->>'workGeneration')::integer OR w.lifecycle<>'active' OR w.repository IS DISTINCT FROM policy.policy->>'repository' OR w.max_cost_usd<>1.30 OR w.max_duration_seconds<>180 THEN RAISE EXCEPTION 'Exact current owner Work required'; END IF;
  IF EXISTS(SELECT 1 FROM external_alpha_allowance WHERE kind='WORK' AND state='OPEN') THEN RAISE EXCEPTION 'One active Work per owner'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported allowance kind'; END IF;
 SELECT count(*) FILTER(WHERE day_index=day AND kind=p->>'kind'),COALESCE(sum(ceiling_microusd) FILTER(WHERE day_index=day),0),COALESCE(sum(ceiling_microusd),0)
 INTO count_day,charged_day,charged_total FROM external_alpha_allowance WHERE owner_id=policy.owner_id;
 IF count_day>=(CASE WHEN p->>'kind'='CHAT' THEN 10 ELSE 1 END) OR charged_day+allowance>2300000 OR charged_total+allowance>11500000 THEN RAISE EXCEPTION 'External alpha allowance exhausted'; END IF;
 INSERT INTO external_alpha_allowance(id,owner_id,policy_sha256,kind,binding_id,request_sha256,work_id,work_version,work_generation,day_index,ceiling_microusd,max_operations,deadline)
 VALUES((p->>'id')::uuid,policy.owner_id,policy.policy_sha256,p->>'kind',p->>'bindingId',p->>'requestSha256',w.id,w.version,w.generation,day,allowance,operations,LEAST(n+interval '180 seconds',policy.activated_at+interval '120 hours')) RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
CREATE FUNCTION external_alpha_model_reserve(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; prior external_alpha_operation%ROWTYPE; row external_alpha_operation%ROWTYPE; exposure bigint; admitted integer;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 IF a.owner_id IS DISTINCT FROM p->>'ownerId' OR policy.owner_id<>a.owner_id OR a.policy_sha256 IS DISTINCT FROM p->>'policySha256' THEN RAISE EXCEPTION 'External alpha operation owner mismatch'; END IF;
 SELECT * INTO prior FROM external_alpha_operation WHERE allowance_id=a.id AND step_key=p->>'stepKey';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.state<>'SETTLED' THEN RAISE EXCEPTION 'No replay of ambiguous or changed model request'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL OR clock_timestamp()>=policy.activated_at+interval '120 hours' OR clock_timestamp()>=a.deadline OR a.state<>'OPEN'
 OR EXISTS(SELECT 1 FROM external_alpha_tool_effect WHERE state IN('ACCEPTED','UNKNOWN')) OR EXISTS(SELECT 1 FROM external_alpha_allowance WHERE state='UNKNOWN') OR EXISTS(SELECT 1 FROM external_alpha_operation WHERE state IN('DISPATCHED','UNKNOWN')) THEN RAISE EXCEPTION 'External alpha dispatch fenced'; END IF;
 SELECT count(*),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)),0) INTO admitted,exposure FROM external_alpha_operation WHERE allowance_id=a.id;
 IF admitted>=2 OR (p->>'microusd')::bigint<=0 OR exposure+(p->>'microusd')::bigint>(CASE WHEN a.kind='WORK' THEN 300000 ELSE 100000 END) THEN RAISE EXCEPTION 'External alpha operation budget exhausted'; END IF;
 INSERT INTO external_alpha_operation(id,allowance_id,step_key,request_sha256,reserved_microusd,state) VALUES((p->>'id')::uuid,a.id,p->>'stepKey',p->>'requestSha256',(p->>'microusd')::bigint,'DISPATCHED') RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
-- statement-breakpoint
REVOKE ALL ON external_alpha_policy,external_alpha_allowance,external_alpha_operation FROM PUBLIC;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_admit(jsonb),external_alpha_model_reserve(jsonb) FROM PUBLIC;
-- statement-breakpoint
CREATE FUNCTION external_alpha_model_finish(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; op external_alpha_operation%ROWTYPE;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 SELECT * INTO STRICT op FROM external_alpha_operation WHERE id=(p->>'operationId')::uuid AND allowance_id=a.id FOR UPDATE;
 IF a.owner_id IS DISTINCT FROM p->>'ownerId' OR policy.owner_id<>a.owner_id OR op.request_sha256 IS DISTINCT FROM p->>'requestSha256' THEN RAISE EXCEPTION 'Exact owned model operation required'; END IF;
 IF p->>'state'='UNKNOWN' THEN
  IF op.state='DISPATCHED' THEN
   UPDATE external_alpha_operation SET state='UNKNOWN' WHERE id=op.id RETURNING * INTO op;
   UPDATE external_alpha_allowance SET state='UNKNOWN' WHERE id=a.id;
  END IF;
 ELSIF p->>'state'='SETTLED' THEN
  IF op.state<>'DISPATCHED' OR (p->>'microusd')::bigint IS NULL OR (p->>'microusd')::bigint<0 OR (p->>'microusd')::bigint>op.reserved_microusd OR NOT(p ? 'result') THEN RAISE EXCEPTION 'Bounded incremental settlement required'; END IF;
  UPDATE external_alpha_operation SET state='SETTLED',spent_microusd=(p->>'microusd')::bigint,result=p->'result' WHERE id=op.id RETURNING * INTO op;
 ELSE RAISE EXCEPTION 'Unsupported model terminal state'; END IF;
 RETURN to_jsonb(op);
END $$;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_model_finish(jsonb) FROM PUBLIC;
-- statement-breakpoint
-- An accepted effect is linearized against revocation before its service begins.
-- It may finish recording its outcome after revocation, but cannot dispatch a
-- model/Factory operation without that subsystem's independent live authority.
CREATE TABLE external_alpha_tool_effect (
 owner_id text NOT NULL, session_id text NOT NULL, call_id text NOT NULL,
 allowance_id uuid NOT NULL REFERENCES external_alpha_allowance(id),
 agent_id text NOT NULL, tool_name text NOT NULL, input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN('ACCEPTED','COMPLETED','UNKNOWN')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,session_id,call_id)
);
-- statement-breakpoint
CREATE FUNCTION external_alpha_tool_claim(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; prior external_alpha_tool_effect%ROWTYPE;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 IF policy.owner_id IS DISTINCT FROM p->>'ownerId' OR a.owner_id<>policy.owner_id
 OR policy.policy_sha256 IS DISTINCT FROM p->>'policySha256' OR a.policy_sha256<>policy.policy_sha256
 OR policy.activated_at IS NULL OR policy.revoked_at IS NOT NULL
 OR clock_timestamp()>=policy.activated_at+interval '120 hours' OR clock_timestamp()>=a.deadline OR a.state<>'OPEN'
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
CREATE FUNCTION external_alpha_tool_finish(p jsonb) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; effect external_alpha_tool_effect%ROWTYPE;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT effect FROM external_alpha_tool_effect WHERE owner_id=p->>'ownerId' AND session_id=p->>'sessionId' AND call_id=p->>'callId' FOR UPDATE;
 IF policy.owner_id<>effect.owner_id OR effect.state<>'ACCEPTED' OR effect.input_sha256 IS DISTINCT FROM p->>'inputSha256' THEN RAISE EXCEPTION 'Exact accepted effect required'; END IF;
 IF p->>'state'='COMPLETED' AND p ? 'result' AND octet_length((p->'result')::text)<=256000 THEN
  UPDATE external_alpha_tool_effect SET state='COMPLETED',result=p->'result' WHERE owner_id=effect.owner_id AND session_id=effect.session_id AND call_id=effect.call_id;
  RETURN 'COMPLETED';
 ELSE
  UPDATE external_alpha_tool_effect SET state='UNKNOWN' WHERE owner_id=effect.owner_id AND session_id=effect.session_id AND call_id=effect.call_id;
  UPDATE external_alpha_allowance SET state='UNKNOWN' WHERE id=effect.allowance_id;
  RETURN 'UNKNOWN';
 END IF;
END $$;
-- statement-breakpoint
REVOKE ALL ON external_alpha_tool_effect FROM PUBLIC;
-- statement-breakpoint
REVOKE ALL ON FUNCTION external_alpha_tool_claim(jsonb),external_alpha_tool_finish(jsonb) FROM PUBLIC;
