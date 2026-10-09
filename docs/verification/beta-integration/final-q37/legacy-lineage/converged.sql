--
-- PostgreSQL database dump
--


-- Dumped from database version 17.9 (Homebrew)
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: account_owner_qualification_model_call(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.account_owner_qualification_model_call() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'inflight' OR NEW.spent_microusd IS NOT NULL THEN
   RAISE EXCEPTION 'New model calls require an inflight reservation';
  END IF;
  UPDATE owner_qualification_budget
   SET reserved_microusd=reserved_microusd+NEW.reserved_microusd
   WHERE singleton AND reserved_microusd+spent_microusd+NEW.reserved_microusd<=5000000;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Qualification aggregate model budget exhausted or unavailable';
  END IF;
 ELSE
  IF ROW(NEW.owner_id,NEW.run_id,NEW.step_key,NEW.request_hash,NEW.model_id,NEW.reserved_microusd,NEW.reserved_tokens)
     IS DISTINCT FROM ROW(OLD.owner_id,OLD.run_id,OLD.step_key,OLD.request_hash,OLD.model_id,OLD.reserved_microusd,OLD.reserved_tokens)
     OR OLD.status<>'inflight' OR NEW.status NOT IN ('completed','unknown') THEN
   RAISE EXCEPTION 'Model reservation is immutable or already reconciled';
  END IF;
  IF NEW.status='completed' THEN
   IF NEW.spent_microusd IS NULL OR NEW.spent_microusd<0 OR NEW.spent_microusd>OLD.reserved_microusd THEN
    RAISE EXCEPTION 'Model usage outside reservation';
   END IF;
   UPDATE owner_qualification_budget
    SET reserved_microusd=reserved_microusd-OLD.reserved_microusd,
        spent_microusd=spent_microusd+NEW.spent_microusd
    WHERE singleton AND reserved_microusd>=OLD.reserved_microusd;
   IF NOT FOUND THEN RAISE EXCEPTION 'Qualification model accounting unavailable'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;


--
-- Name: beta_goal_result_fence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.beta_goal_result_fence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE w engineering_work%ROWTYPE; r engineering_native_results%ROWTYPE; latest uuid;
BEGIN
 IF NEW.state='result' AND NEW.result->>'current'='true' AND NEW.result->>'verified'='true' THEN
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND id=NEW.work_id::uuid FOR SHARE;
  SELECT * INTO STRICT r FROM engineering_native_results WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND work_id=w.id AND id=NEW.result_id::uuid;
  SELECT id INTO latest FROM engineering_native_results WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND work_id=w.id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF r.work_version<>w.version OR r.work_generation<>w.generation OR (r.proof->>'criteriaVersion')::integer<>w.criteria_version
    OR latest<>r.id OR w.lifecycle IN ('cancelled','failed','superseded') THEN
    RAISE EXCEPTION 'Current canonical Work Result required';
  END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: beta_new_result_invalidation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.beta_new_result_invalidation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE link record;
BEGIN
 PERFORM 1 FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 FOR link IN SELECT * FROM goal_work_links WHERE owner_id=NEW.scope_id AND work_id=NEW.work_id::text
  AND state='result' AND result_id<>NEW.id::text AND result->>'current'='true' ORDER BY goal_id LOOP
  UPDATE goals SET status=CASE WHEN status IN ('active','completed') THEN 'paused' ELSE status END,
   generation=generation+1,revision=revision+1,updated_at=now() WHERE owner_id=NEW.scope_id AND id=link.goal_id;
  UPDATE goal_work_links SET result=jsonb_set(result,'{current}','false'::jsonb),updated_at=now() WHERE correlation_key=link.correlation_key;
  UPDATE goal_tasks SET status='verification',paused=true,blocker='A newer canonical Result requires review',
   next_action='Review the new Result and revise the Task before resuming',updated_at=now() WHERE goal_id=link.goal_id AND id=link.task_id AND status='completed';
  INSERT INTO eve_events(id,owner_id,type,source_type,goal_id,goal_task_id,summary,payload,idempotency_key)
   VALUES('result-supersession:'||NEW.id||':'||link.task_id,NEW.scope_id,'WORK_EVIDENCE_INVALIDATED','system',link.goal_id,link.task_id,
   'A newer Result was retained; prior completion remains historical',jsonb_build_object('workId',NEW.work_id,'resultId',NEW.id,'priorResultId',link.result_id),
   'result-supersession:'||NEW.id||':'||link.task_id) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;


--
-- Name: beta_work_evidence_invalidation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.beta_work_evidence_invalidation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE link record;
BEGIN
 IF (NEW.version,NEW.generation,NEW.criteria_version) IS NOT DISTINCT FROM (OLD.version,OLD.generation,OLD.criteria_version) THEN RETURN NEW; END IF;
 FOR link IN SELECT * FROM goal_work_links WHERE owner_id=NEW.scope_id AND work_id=NEW.id::text AND state='result' ORDER BY goal_id LOOP
  UPDATE goals SET status=CASE WHEN status IN ('active','completed') THEN 'paused' ELSE status END,
   generation=generation+1,revision=revision+1,updated_at=now() WHERE owner_id=NEW.scope_id AND id=link.goal_id;
  UPDATE goal_work_links SET result=jsonb_set(result,'{current}','false'::jsonb),updated_at=now() WHERE correlation_key=link.correlation_key;
  UPDATE goal_tasks SET status='verification',paused=true,blocker='Canonical Work changed after this Result',
   next_action='Review the changed Work and revise the Task before resuming',updated_at=now() WHERE goal_id=link.goal_id AND id=link.task_id AND status='completed';
  INSERT INTO eve_events(id,owner_id,type,source_type,goal_id,goal_task_id,summary,payload,idempotency_key)
   VALUES('work-invalidation:'||NEW.id||':'||NEW.version,NEW.scope_id,'WORK_EVIDENCE_INVALIDATED','system',link.goal_id,link.task_id,
   'Canonical Work changed; prior Result remains historical',jsonb_build_object('workId',NEW.id,'oldVersion',OLD.version,'version',NEW.version,'resultId',link.result_id),
   'work-invalidation:'||NEW.id||':'||NEW.version) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;


--
-- Name: engineering_candidate_verifiable(text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_candidate_verifiable(s text, k text, w uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
 SELECT EXISTS(SELECT 1 FROM engineering_direct_workspaces x JOIN engineering_work work ON work.scope_id=x.scope_id AND work.scope_kind=x.scope_kind AND work.id=x.work_id
 JOIN engineering_route_runs r ON r.id=x.route_run_id JOIN engineering_routing_decisions d ON d.id=x.decision_id
 WHERE x.scope_id=s AND x.scope_kind=k AND x.work_id=w AND work.version=x.work_version AND work.generation=x.work_generation AND work.criteria_version=x.criteria_version AND work.control='agent' AND work.lifecycle='active' AND x.deadline>clock_timestamp()
 AND d.status='ADMITTED' AND r.decision_id=d.id
 AND ((x.producer='NATIVE_SOFIE' AND r.route='DEEP_AGENT' AND r.status='RUNNING')
 OR (x.producer='MYFACTORY' AND r.route='MYFACTORY' AND r.status='COMPLETED' AND r.fenced_at IS NOT NULL AND r.quiescence IS NOT NULL AND r.factory_candidate IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM engineering_route_runs n WHERE n.scope_id=s AND n.scope_kind=k AND n.work_id=w AND n.writer_generation>r.writer_generation))))
$$;


--
-- Name: engineering_completion_admission(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_completion_admission() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
DECLARE d engineering_routing_decisions%ROWTYPE; w engineering_work%ROWTYPE;
 a agents%ROWTYPE; b engineering_work_model_budget%ROWTYPE; k jsonb; st jsonb;
 total bigint=0; slots integer=0; input_rate numeric; output_rate numeric; unit bigint;
BEGIN
 IF NEW.provider_id<>'myeve-native-sofie' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 SELECT * INTO STRICT d FROM engineering_routing_decisions WHERE id=NEW.decision_id;
 k=d.admission_authority_snapshot->'completion';
 IF k IS NULL OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','version','state','workId','workVersion','workGeneration','agentId','agentRevision','policyHash','policyVersion','budgetVersion','runId','sessionId','workflow','modelId','maxExposureMicrousd','repairIterations','createdAt','expiresAt','pricing','inputBytes','maxOutputTokens','stages','qualification']) key WHERE k->>key IS NULL)
 THEN RAISE EXCEPTION 'A complete native completion contract is required'; END IF;
 SELECT * INTO STRICT a FROM agents WHERE id=k->>'agentId' AND owner_id=w.scope_id FOR UPDATE;
 SELECT * INTO STRICT b FROM engineering_work_model_budget WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id FOR UPDATE;
 IF k->>'workId'<>w.id::text OR (k->>'workVersion')::integer<>w.version OR (k->>'workGeneration')::integer<>w.generation
 OR k->>'runId'<>NEW.id::text OR k->>'id'<>NEW.id::text OR k->>'state'<>'ACTIVE' OR (k->>'version')::integer<>1
 OR k->>'workflow'<>'native-engineering-v1' OR (k->>'repairIterations')::integer<>1 OR length(k->>'sessionId')=0
 OR NOT a.is_primary OR a.status<>'active' OR a.updated_at::text<>k->>'agentRevision'
 OR k->>'agentId'<>b.agent_id OR k->>'agentRevision'<>b.agent_revision OR b.status<>'ACTIVE'
 OR k->>'policyHash'<>b.policy_hash OR (k->>'policyVersion')::integer<>b.policy_version OR (k->>'budgetVersion')::integer<>b.budget_version
 OR k->>'policyHash'<>d.admission_authority_snapshot#>>'{binding,configurationHash}'
 OR (k->>'createdAt')::timestamptz NOT BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds'
 OR (k->>'expiresAt')::timestamptz<=clock_timestamp() OR (k->>'expiresAt')::timestamptz>b.deadline
 OR (k->>'expiresAt')::timestamptz>(d.admission_authority_snapshot#>>'{contract,deadline}')::timestamptz
 OR (k->>'expiresAt')::timestamptz>(k#>>'{qualification,expiresAt}')::timestamptz
 OR k#>>'{qualification,modelId}' IS DISTINCT FROM k->>'modelId'
 OR k#>>'{qualification,scopeId}' IS DISTINCT FROM w.scope_id
 THEN RAISE EXCEPTION 'Stale or invalid completion contract'; END IF;
 IF jsonb_typeof(k->'qualification') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM unnest(ARRAY['provider','modelId','scopeId','profileHash','evidenceRef','qualifiedAt','expiresAt']) key WHERE k->'qualification'->>key IS NULL)
 OR k#>>'{qualification,provider,id}' IS DISTINCT FROM NEW.provider_id
 OR k#>>'{qualification,provider,version}' IS DISTINCT FROM NEW.provider_version
 OR k#>>'{qualification,expiresAt}' IS DISTINCT FROM d.admission_authority_snapshot#>>'{facts,qualifications,DEEP_AGENT,expiresAt}'
 OR k#>>'{qualification,evidenceRef}' IS DISTINCT FROM d.admission_authority_snapshot#>>'{facts,qualifications,DEEP_AGENT,evidenceRef}'
 OR (k#>>'{qualification,qualifiedAt}')::timestamptz>clock_timestamp()
 OR NOT (d.admission_authority_snapshot#>'{contract,resourceRefs}' ? ('engineering-profile:sha256:'||(k#>>'{qualification,profileHash}')))
 THEN RAISE EXCEPTION 'Exact current provider qualification required'; END IF;
 IF jsonb_typeof(k->'stages') IS DISTINCT FROM 'array' OR jsonb_typeof(k->'pricing') IS DISTINCT FROM 'object'
 OR k#>>'{pricing,input}' IS NULL OR k#>>'{pricing,output}' IS NULL
 OR k#>>'{pricing,cachedInputTokens}' IS NULL OR k#>>'{pricing,cacheCreationInputTokens}' IS NULL
 THEN RAISE EXCEPTION 'Complete typed completion pricing and stages required'; END IF;
 IF (k->>'inputBytes')::integer NOT BETWEEN 1024 AND 180000 OR (k->>'maxOutputTokens')::integer NOT BETWEEN 1 AND 2048
 OR jsonb_array_length(k->'stages')<>3 THEN RAISE EXCEPTION 'Invalid completion bounds'; END IF;
 input_rate=GREATEST((k#>>'{pricing,input}')::numeric,(k#>>'{pricing,cachedInputTokens}')::numeric,(k#>>'{pricing,cacheCreationInputTokens}')::numeric);
 output_rate=(k#>>'{pricing,output}')::numeric;
 IF input_rate IS NULL OR output_rate IS NULL OR input_rate<=0 OR output_rate<=0 THEN RAISE EXCEPTION 'Complete pricing required'; END IF;
 unit=ceil(2*((k->>'inputBytes')::integer*input_rate+(k->>'maxOutputTokens')::integer*output_rate)*1000000);
 FOR st IN SELECT value FROM jsonb_array_elements(k->'stages') LOOP
  IF jsonb_typeof(st) IS DISTINCT FROM 'object' OR st->>'id' IS NULL OR st->>'calls' IS NULL OR st->>'microUsd' IS NULL OR jsonb_typeof(st->'calls') IS DISTINCT FROM 'number' OR jsonb_typeof(st->'microUsd') IS DISTINCT FROM 'number' OR st->>'calls' !~ '^[0-9]+$' OR st->>'microUsd' !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Typed non-null completion stage required'; END IF;
  IF (st->>'id'='IMPLEMENT' AND (st->>'calls')::integer<5) OR (st->>'id'='REPAIR' AND (st->>'calls')::integer<3) OR (st->>'id'='EXPLAIN' AND (st->>'calls')::integer<>1) OR st->>'id' NOT IN ('IMPLEMENT','REPAIR','EXPLAIN') OR (st->>'calls')::integer NOT BETWEEN 1 AND 12 OR (st->>'microUsd')::bigint NOT BETWEEN unit AND unit+1 THEN RAISE EXCEPTION 'Invalid completion stage'; END IF;
  slots=slots+(st->>'calls')::integer;total=total+(st->>'calls')::bigint*(st->>'microUsd')::bigint;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(k->'stages'))<>3 OR total<>(k->>'maxExposureMicrousd')::bigint THEN RAISE EXCEPTION 'Invalid completion total'; END IF;
 -- The new snapshot is already visible in this transaction. Its full capacity
 -- is included in remaining(), alongside any older still-committed contract.
 IF b.spent_microusd+b.reserved_microusd+engineering_completion_remaining(w.scope_id,w.id)>LEAST(b.ceiling_microusd,floor(w.max_cost_usd*1000000)::bigint,floor(a.max_estimated_cost_usd*1000000)::bigint)
 OR b.calls_admitted+slots>LEAST(b.max_calls,a.max_steps)
 OR EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.scope_id=w.scope_id AND c.work_id=w.id AND c.status IN ('RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN'))
 THEN RAISE EXCEPTION 'INSUFFICIENT_COMPLETION_BUDGET: Minimum completion contract cannot fit current Work budget or unresolved exposure'; END IF;
 RETURN NEW;
END $_$;


--
-- Name: engineering_completion_call(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_completion_call() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE b engineering_work_model_budget%ROWTYPE; k jsonb; st jsonb; hold bigint; used integer;
 ws engineering_direct_workspaces%ROWTYPE; stage text; current_candidate text; stage_ok boolean=false; minimum bigint; current_ceiling bigint; held_slots bigint; call_limit integer;
BEGIN
 -- engineering_model_reserve already owns Work -> Agent -> budget locks.
 SELECT * INTO STRICT b FROM engineering_work_model_budget WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND work_id=NEW.work_id FOR UPDATE;
 SELECT LEAST(b.ceiling_microusd,floor(w.max_cost_usd*1000000)::bigint,floor(a.max_estimated_cost_usd*1000000)::bigint) INTO STRICT current_ceiling
 FROM engineering_work w JOIN agents a ON a.owner_id=w.scope_id AND a.id=NEW.agent_id WHERE w.scope_id=NEW.scope_id AND w.scope_kind=NEW.scope_kind AND w.id=NEW.work_id;
 IF NEW.pricing->>'input' IS NULL OR NEW.pricing->>'output' IS NULL OR (NEW.pricing->>'input')::numeric<=0 OR (NEW.pricing->>'output')::numeric<=0
 OR NEW.bounds->>'inputBytes' IS NULL OR NEW.bounds->>'maxOutputTokens' IS NULL OR (NEW.bounds->>'inputBytes')::integer<=0 OR (NEW.bounds->>'maxOutputTokens')::integer<=0 THEN RAISE EXCEPTION 'Complete positive request bounds required'; END IF;
 minimum=ceil(2*((NEW.bounds->>'inputBytes')::integer*GREATEST((NEW.pricing->>'input')::numeric,COALESCE((NEW.pricing->>'cachedInputTokens')::numeric,(NEW.pricing->>'input')::numeric),COALESCE((NEW.pricing->>'cacheCreationInputTokens')::numeric,(NEW.pricing->>'input')::numeric))+(NEW.bounds->>'maxOutputTokens')::integer*(NEW.pricing->>'output')::numeric)*1000000);
 IF minimum IS NULL OR minimum<=0 OR NEW.reserved_microusd<minimum THEN RAISE EXCEPTION 'Conservative provider exposure required'; END IF;
 hold=engineering_completion_remaining(NEW.scope_id,NEW.work_id);
 held_slots=engineering_completion_slots(NEW.scope_id,NEW.work_id);
 SELECT LEAST(b.max_calls,a.max_steps) INTO STRICT call_limit FROM agents a WHERE a.id=NEW.agent_id AND a.owner_id=NEW.scope_id;
 IF NEW.purpose='NATIVE_EXECUTION' OR NEW.bounds ? 'completion' THEN
  SELECT d.admission_authority_snapshot->'completion' INTO k FROM engineering_routing_decisions d JOIN engineering_route_runs r ON r.decision_id=d.id WHERE r.id::text=NEW.bounds#>>'{completion,id}' AND r.work_id=NEW.work_id AND r.scope_id=NEW.scope_id AND r.scope_kind=NEW.scope_kind;
  stage=NEW.bounds#>>'{completion,stage}';
  IF k IS NULL OR NEW.bounds#>>'{completion,id}' IS DISTINCT FROM k->>'id' OR (NEW.purpose='NATIVE_EXECUTION' AND (NEW.session_id<>k->>'sessionId' OR NEW.route_run_id::text IS DISTINCT FROM k->>'runId'))
   OR NEW.work_version<>(k->>'workVersion')::integer OR NEW.work_generation<>(k->>'workGeneration')::integer
   OR NEW.agent_revision<>k->>'agentRevision' OR NEW.policy_hash<>k->>'policyHash'
   OR NEW.model_id<>k->>'modelId' OR NEW.provider<>'vercel-gateway/anthropic'
   OR (k->>'expiresAt')::timestamptz<=clock_timestamp()
   OR (NEW.bounds->>'inputBytes')::integer>(k->>'inputBytes')::integer
   OR (NEW.bounds->>'maxOutputTokens')::integer>(k->>'maxOutputTokens')::integer
   OR NEW.bounds->>'inputBytes' IS NULL OR NEW.bounds->>'maxOutputTokens' IS NULL
  THEN RAISE EXCEPTION 'Completion identity, deadline or input bound denied'; END IF;
  IF (NEW.purpose='NATIVE_EXECUTION' AND stage='EXPLAIN') OR (NEW.purpose<>'NATIVE_EXECUTION' AND (NEW.purpose<>'CONVERSATION_REASONING' OR stage IS DISTINCT FROM 'EXPLAIN')) THEN RAISE EXCEPTION 'Final explanation capacity is read-only conversation; productive slots require native custody'; END IF;
  SELECT value INTO st FROM jsonb_array_elements(k->'stages') WHERE value->>'id'=stage;
  SELECT count(*) INTO used FROM engineering_work_model_calls c WHERE c.scope_id=NEW.scope_id AND c.work_id=NEW.work_id AND c.bounds#>>'{completion,id}'=k->>'id' AND c.bounds#>>'{completion,stage}'=stage;
  IF st IS NULL OR used>=(st->>'calls')::integer OR NEW.reserved_microusd>(st->>'microUsd')::bigint THEN RAISE EXCEPTION 'Completion stage allowance exhausted'; END IF;
  SELECT * INTO ws FROM engineering_direct_workspaces WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND work_id=NEW.work_id;
  current_candidate=ws.candidates->-1->>'sha';
  stage_ok=CASE stage WHEN 'IMPLEMENT' THEN ws.work_id IS NULL OR jsonb_array_length(ws.candidates)=0
   WHEN 'REPAIR' THEN jsonb_array_length(ws.candidates)=1 AND ws.phase IN ('VERIFICATION_FAILED','DRAFT') AND EXISTS(SELECT 1 FROM jsonb_array_elements(ws.evidence) e WHERE e->>'candidate'=current_candidate AND e->>'result'='FAIL')
   WHEN 'EXPLAIN' THEN EXISTS(SELECT 1 FROM engineering_native_results p WHERE p.scope_id=NEW.scope_id AND p.scope_kind=NEW.scope_kind AND p.work_id=NEW.work_id AND p.candidate_sha=current_candidate AND p.work_generation=NEW.work_generation AND (p.proof->>'outcome'='PARTIAL' OR (p.proof->>'outcome'='FAILED' AND jsonb_array_length(ws.candidates)=2)))
   ELSE false END;
  IF NOT COALESCE(stage_ok,false) THEN RAISE EXCEPTION 'Completion stage does not match durable candidate verification'; END IF;
  hold=hold-(st->>'microUsd')::bigint; held_slots=held_slots-1;

 END IF;
 IF b.calls_admitted+1+held_slots>call_limit THEN RAISE EXCEPTION 'Protected completion call slots prevent this reservation'; END IF;
 IF b.spent_microusd+b.reserved_microusd+NEW.reserved_microusd+hold>current_ceiling THEN RAISE EXCEPTION 'Protected completion capacity prevents this model reservation'; END IF;
 RETURN NEW;
END $$;


--
-- Name: engineering_completion_capacity(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_completion_capacity(s text, w uuid) RETURNS TABLE(micro_usd bigint, call_slots bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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


--
-- Name: engineering_completion_dispatch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_completion_dispatch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE b engineering_work_model_budget%ROWTYPE; ceiling bigint; call_limit integer;
BEGIN
 IF OLD.status='RESERVED' AND NEW.status='DISPATCHED' THEN
  IF NEW.bounds ? 'completion' AND NOT EXISTS(SELECT 1 FROM engineering_routing_decisions d WHERE d.scope_id=NEW.scope_id AND d.scope_kind=NEW.scope_kind AND d.work_id=NEW.work_id AND d.admission_authority_snapshot#>>'{completion,id}'=NEW.bounds#>>'{completion,id}' AND (d.admission_authority_snapshot#>>'{completion,expiresAt}')::timestamptz>clock_timestamp()) THEN RAISE EXCEPTION 'Completion contract expired before dispatch'; END IF;
  SELECT * INTO STRICT b FROM engineering_work_model_budget WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND work_id=NEW.work_id;
  SELECT LEAST(b.ceiling_microusd,floor(w.max_cost_usd*1000000)::bigint,floor(a.max_estimated_cost_usd*1000000)::bigint) INTO ceiling
   FROM engineering_work w JOIN agents a ON a.owner_id=w.scope_id AND a.id=NEW.agent_id WHERE w.scope_id=NEW.scope_id AND w.scope_kind=NEW.scope_kind AND w.id=NEW.work_id;
  SELECT LEAST(b.max_calls,a.max_steps) INTO STRICT call_limit FROM agents a WHERE a.id=NEW.agent_id AND a.owner_id=NEW.scope_id;
  IF b.calls_admitted+engineering_completion_slots(NEW.scope_id,NEW.work_id)>call_limit THEN RAISE EXCEPTION 'Current call limit cannot support committed completion'; END IF;
  IF b.spent_microusd+b.reserved_microusd+engineering_completion_remaining(NEW.scope_id,NEW.work_id)>ceiling THEN RAISE EXCEPTION 'Current ceiling cannot support committed completion'; END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: engineering_completion_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_completion_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
 IF OLD.admission_authority_snapshot ? 'completion' AND NEW.admission_authority_snapshot IS DISTINCT FROM OLD.admission_authority_snapshot THEN RAISE EXCEPTION 'Completion admission history is immutable'; END IF;
 RETURN NEW;
END $$;


--
-- Name: engineering_completion_remaining(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_completion_remaining(s text, w uuid) RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
 SELECT micro_usd FROM engineering_completion_capacity(s,w)
$$;


--
-- Name: engineering_completion_slots(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_completion_slots(s text, w uuid) RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
 SELECT call_slots FROM engineering_completion_capacity(s,w)
$$;


--
-- Name: engineering_factory_advance(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_factory_advance(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE r engineering_factory_results%ROWTYPE; w engineering_work%ROWTYPE;
 target text=p->>'target'; expected text=p->>'expected';
BEGIN
  SELECT * INTO w FROM engineering_work WHERE scope_id=p->>'scopeId'
    AND scope_kind=p->>'scopeKind' AND id=(p->>'workId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factory result Work scope denied'; END IF;
  SELECT * INTO r FROM engineering_factory_results WHERE id=(p->>'receiptId')::uuid
    AND scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factory result Work scope denied'; END IF;
  IF r.admission_state=target THEN RETURN jsonb_build_object('state',target,'replay',true); END IF;
  IF r.admission_state<>expected THEN RAISE EXCEPTION 'Factory result admission transition conflict'; END IF;
  IF NOT ((expected='RECEIVED' AND target IN ('AUTHENTICATED','REJECTED'))
    OR (expected='AUTHENTICATED' AND target IN ('ATTESTED','REJECTED'))
    OR (expected='ATTESTED' AND target IN ('INTEGRITY_VERIFIED','REJECTED'))
    OR (expected='INTEGRITY_VERIFIED' AND target IN ('ADMITTED','STALE','REJECTED')))
    THEN RAISE EXCEPTION 'Factory result admission transition denied'; END IF;
  IF target IN ('AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED')
    AND COALESCE(p->>'proofDigest','')<>r.signed_envelope_digest
    THEN RAISE EXCEPTION 'Factory result signed envelope proof mismatch'; END IF;
  IF target IN ('ATTESTED','INTEGRITY_VERIFIED','ADMITTED') AND NOT r.cryptographically_valid
    THEN RAISE EXCEPTION 'Unauthenticated Factory result cannot advance'; END IF;
  IF target='ADMITTED' AND (w.version<>r.work_version OR w.generation<>r.work_generation
    OR w.criteria_version<>r.criteria_version OR w.lifecycle<>'active' OR w.control<>'agent'
    OR EXISTS(SELECT 1 FROM engineering_factory_results newer
      WHERE newer.scope_id=w.scope_id AND newer.scope_kind=w.scope_kind AND newer.work_id=w.id
        AND ((newer.factory_request_id=r.factory_request_id AND newer.attempt_number>r.attempt_number)
          OR (newer.producer_issued_at>r.producer_issued_at AND newer.admission_state IN ('AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED')))))
    THEN target='STALE'; END IF;
  UPDATE engineering_factory_results SET admission_state=target,
    reason=CASE WHEN target IN ('REJECTED','STALE','CONFLICT') THEN COALESCE(p->>'reason','Work binding changed or newer attempt exists') ELSE NULL END,
    trust_status=CASE WHEN target='AUTHENTICATED' THEN p->>'trustStatus' ELSE trust_status END,
    cryptographically_valid=CASE WHEN target='AUTHENTICATED' THEN true ELSE cryptographically_valid END,
    updated_at=clock_timestamp() WHERE id=r.id;
  RETURN jsonb_build_object('state',target,'receiptId',r.id,'replay',false);
END $$;


--
-- Name: engineering_factory_prepare_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_factory_prepare_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
DECLARE w engineering_work%ROWTYPE; p jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.factory_preparation IS NOT NULL THEN RAISE EXCEPTION 'Factory preparation history cannot be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.factory_preparation IS NOT NULL THEN
  IF NEW.factory_preparation IS DISTINCT FROM OLD.factory_preparation THEN RAISE EXCEPTION 'Factory preparation identity is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.factory_preparation IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 p=NEW.factory_preparation->'request';
 IF NEW.selected_route<>'MYFACTORY' OR NEW.status<>'PROPOSED' OR NEW.work_version<>w.version OR w.control<>'agent' OR w.lifecycle<>'active'
  OR p->>'workId' IS DISTINCT FROM w.id::text OR p->>'workGeneration' IS DISTINCT FROM w.generation::text
  OR p->>'repository' IS DISTINCT FROM w.repository OR p->>'requestId' IS NULL
  OR p->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR p->>'deadline' IS NULL OR (p->>'deadline')::timestamptz<=clock_timestamp()
  OR EXISTS(SELECT 1 FROM engineering_route_runs r WHERE r.scope_id=w.scope_id AND r.scope_kind=w.scope_kind AND r.work_id=w.id AND r.status NOT IN ('COMPLETED','FAILED','CANCELLED'))
  THEN RAISE EXCEPTION 'Factory preparation must bind current writer-free Work intent'; END IF;
 RETURN NEW;
END $_$;


--
-- Name: engineering_factory_receipt(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_factory_receipt(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE q engineering_factory_requests%ROWTYPE; r engineering_factory_receipts%ROWTYPE;
 w engineering_work%ROWTYPE; a engineering_factory_admissions%ROWTYPE;
 b jsonb:=p->'binding'; op text:=p->>'action'; target text; why text;
BEGIN
 IF op='register' THEN
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=p->>'scopeId' AND scope_kind=p->>'scopeKind' AND id=(b->>'workId')::uuid FOR UPDATE;
  IF w.version<>(b->>'workVersion')::integer OR w.generation<>(b->>'workGeneration')::integer OR w.criteria_version<>(b->>'criteriaVersion')::integer
    OR w.lifecycle<>'active' OR w.control<>'agent' THEN RAISE EXCEPTION 'Factory request Work changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM agents WHERE id=b->>'agentId' AND owner_id=w.scope_id AND status='active') THEN RAISE EXCEPTION 'Factory request Agent mismatch'; END IF;
  SELECT * INTO q FROM engineering_factory_requests WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND factory_id=b->>'factoryId' AND operation_id=b->>'operationId';
  IF FOUND THEN
   IF q.binding<>b OR q.actor_id<>p->>'actorId' THEN RAISE EXCEPTION 'Factory request binding conflict'; END IF;
   RETURN to_jsonb(q);
  END IF;
  UPDATE engineering_factory_requests SET current=false WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND current;
  INSERT INTO engineering_factory_requests(id,scope_id,scope_kind,work_id,actor_id,agent_id,factory_id,operation_id,binding)
   VALUES((p->>'id')::uuid,w.scope_id,w.scope_kind,w.id,p->>'actorId',b->>'agentId',b->>'factoryId',b->>'operationId',b) RETURNING * INTO q;
  RETURN to_jsonb(q);
 END IF;
 -- All operations lock Work then request, matching registration and owner Work
 -- changes. Current generation cannot change between policy check and admission.
 SELECT * INTO STRICT q FROM engineering_factory_requests WHERE id=(p->>'requestId')::uuid AND scope_id=p->>'scopeId' AND scope_kind=p->>'scopeKind' AND actor_id=p->>'actorId';
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=q.scope_id AND scope_kind=q.scope_kind AND id=q.work_id FOR UPDATE;
 SELECT * INTO STRICT q FROM engineering_factory_requests WHERE id=q.id FOR UPDATE;
 IF op='cancel' THEN
  UPDATE engineering_factory_requests SET cancelled=true WHERE id=q.id RETURNING * INTO q; RETURN to_jsonb(q);
 END IF;
 IF op='receive' THEN
  INSERT INTO engineering_factory_receipts(id,request_id,envelope_digest,envelope)
   VALUES((p->>'id')::uuid,q.id,p->>'envelopeDigest',p->>'envelope') ON CONFLICT(request_id,envelope_digest) DO NOTHING;
  SELECT * INTO STRICT r FROM engineering_factory_receipts WHERE request_id=q.id AND envelope_digest=p->>'envelopeDigest';
  IF r.envelope<>p->>'envelope' THEN RAISE EXCEPTION 'Envelope digest collision'; END IF;
  RETURN to_jsonb(r);
 END IF;
 IF op<>'transition' THEN RAISE EXCEPTION 'Unknown Factory receipt operation'; END IF;
 SELECT * INTO STRICT r FROM engineering_factory_receipts WHERE id=(p->>'receiptId')::uuid AND request_id=q.id FOR UPDATE;
 IF r.state IN ('ADMITTED','STALE','REJECTED','CONFLICT') THEN RETURN to_jsonb(r); END IF;
 target:=p->>'state'; why:=p->>'reason';
 IF target='REJECTED' THEN NULL;
 ELSIF target='AUTHENTICATED' AND r.state='RECEIVED' THEN NULL;
 ELSIF target='ATTESTED' AND r.state='AUTHENTICATED' THEN NULL;
 ELSIF target='INTEGRITY_VERIFIED' AND r.state='ATTESTED' THEN
  IF q.verified_manifest_digest IS NOT NULL AND q.verified_manifest_digest<>r.provenance->>'manifestDigest' THEN
   target:='CONFLICT'; why:='OPERATION_MANIFEST_CONFLICT';
  ELSE UPDATE engineering_factory_requests SET verified_manifest_digest=r.provenance->>'manifestDigest' WHERE id=q.id; END IF;
 ELSIF target='ADMITTED' AND r.state='INTEGRITY_VERIFIED' THEN
  SELECT * INTO a FROM engineering_factory_admissions WHERE request_id=q.id;
  IF FOUND AND a.manifest_digest<>r.provenance->>'manifestDigest' THEN target:='CONFLICT'; why:='OPERATION_MANIFEST_CONFLICT';
  ELSIF NOT q.current OR q.cancelled OR w.lifecycle<>'active' OR w.control<>'agent'
   OR w.version<>(q.binding->>'workVersion')::integer OR w.generation<>(q.binding->>'workGeneration')::integer
   OR w.criteria_version<>(q.binding->>'criteriaVersion')::integer
   OR NOT EXISTS(SELECT 1 FROM agents WHERE id=q.agent_id AND owner_id=q.scope_id AND status='active')
   OR COALESCE((p->>'keyCurrent')::boolean,false)=false
   OR COALESCE((p#>>'{key,notAfter}')::timestamptz>clock_timestamp(),false)=false
   OR p->'key' ? 'retiredAt' OR p->'key' ? 'revokedAt'
   OR r.provenance#>>'{manifest,status}' IS DISTINCT FROM 'COMPLETED' THEN target:='STALE'; why:='HISTORICAL_NOT_CURRENT';
  ELSE
   INSERT INTO engineering_factory_admissions(request_id,receipt_id,manifest_digest,key_policy)
    VALUES(q.id,r.id,r.provenance->>'manifestDigest',p->'key') ON CONFLICT(request_id) DO NOTHING;
  END IF;
 ELSE
  -- A concurrent worker may already have committed this stage. Never regress.
  IF array_position(ARRAY['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED'],r.state)>=array_position(ARRAY['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED'],target) THEN RETURN to_jsonb(r); END IF;
  RAISE EXCEPTION 'Invalid Factory receipt transition';
 END IF;
 UPDATE engineering_factory_receipts SET state=target,reason=why,
  provenance=COALESCE(provenance,p->'provenance'),
  history=history||jsonb_build_array(jsonb_build_object('state',target,'at',clock_timestamp(),'reason',why))
  WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;


--
-- Name: engineering_factory_receive(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_factory_receive(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE r engineering_factory_results%ROWTYPE; w engineering_work%ROWTYPE;
BEGIN
  IF p->>'scopeId' IS NULL OR p->>'scopeKind' IS NULL OR p->>'workId' IS NULL
    OR p->>'operationId' IS NULL OR p->>'manifestDigest' IS NULL
    OR p->>'signedEnvelopeDigest' IS NULL THEN RAISE EXCEPTION 'Incomplete Factory result receipt'; END IF;
  SELECT * INTO w FROM engineering_work WHERE scope_id=p->>'scopeId'
    AND scope_kind=p->>'scopeKind' AND id=(p->>'workId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factory result Work scope denied'; END IF;
  SELECT * INTO r FROM engineering_factory_results WHERE operation_id=p->>'operationId' FOR UPDATE;
  IF FOUND THEN
    IF r.scope_id<>w.scope_id OR r.scope_kind<>w.scope_kind OR r.work_id<>w.id
      THEN RAISE EXCEPTION 'Factory result Work scope denied'; END IF;
    IF r.manifest_digest<>p->>'manifestDigest' OR r.signed_envelope_digest<>p->>'signedEnvelopeDigest'
      OR r.factory_request_id<>(p->>'factoryRequestId')::uuid OR r.run_id<>(p->>'runId')::uuid
      OR r.attempt_number<>(p->>'attemptNumber')::integer THEN
      INSERT INTO engineering_factory_result_conflicts(id,scope_id,scope_kind,work_id,receipt_id,
        observed_envelope_digest,observed_manifest_digest,reason)
      VALUES ((p->>'receiptId')::uuid,w.scope_id,w.scope_kind,w.id,r.id,
        p->>'signedEnvelopeDigest',p->>'manifestDigest','same operation identity, different result')
      ON CONFLICT(receipt_id,observed_envelope_digest) DO NOTHING;
      RETURN jsonb_build_object('state','CONFLICT','receiptId',r.id,'reason','same operation identity, different result');
    END IF;
    RETURN jsonb_build_object('state',r.admission_state,'receiptId',r.id,'replay',true);
  END IF;
  INSERT INTO engineering_factory_results(id,scope_id,scope_kind,work_id,work_version,
    work_generation,criteria_version,agent_id,factory_request_id,factory_id,
    factory_source_commit,factory_source_tree,factory_configuration_digest,
    work_order_id,run_id,attempt_number,producer_status,protocol_version,
    signing_key_id,signing_key_version,operation_id,manifest_digest,
    candidate_commit,candidate_tree,evidence_manifest_digest,artifact_manifest_digest,
    signed_envelope,signed_envelope_digest,producer_issued_at,producer_completed_at)
  VALUES ((p->>'receiptId')::uuid,w.scope_id,w.scope_kind,w.id,(p->>'workVersion')::integer,
    (p->>'workGeneration')::integer,(p->>'criteriaVersion')::integer,p->>'agentId',
    (p->>'factoryRequestId')::uuid,p->>'factoryId',p->>'factorySourceCommit',
    p->>'factorySourceTree',p->>'factoryConfigurationDigest',(p->>'workOrderId')::uuid,
    (p->>'runId')::uuid,(p->>'attemptNumber')::integer,p->>'producerStatus',
    (p->>'protocolVersion')::integer,p->>'signingKeyId',p->>'signingKeyVersion',
    p->>'operationId',p->>'manifestDigest',p->>'candidateCommit',p->>'candidateTree',
    p->>'evidenceManifestDigest',p->>'artifactManifestDigest',p->>'signedEnvelope',
    p->>'signedEnvelopeDigest',nullif(p->>'producerIssuedAt','')::timestamptz,
    nullif(p->>'producerCompletedAt','')::timestamptz) RETURNING * INTO r;
  RETURN jsonb_build_object('state','RECEIVED','receiptId',r.id,'replay',false);
END $$;


--
-- Name: engineering_legacy_budget_frozen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_legacy_budget_frozen() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Legacy accounting is immutable after 0052; use common Work ledger'; END $$;


--
-- Name: engineering_legacy_executor_common_fence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_legacy_executor_common_fence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 PERFORM 1 FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM engineering_work_model_budget WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND work_id=NEW.work_id) THEN
  RAISE EXCEPTION 'This Work requires common-ledger model admission';
 END IF;
 RETURN NEW;
END $$;


--
-- Name: engineering_model_receipt_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_model_receipt_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accounting receipts cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','spent_microusd','result','result_hash','usage_receipt','usage_semantics','dispatch_at','result_at','reconciled_at','reconciliation_note'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','spent_microusd','result','result_hash','usage_receipt','usage_semantics','dispatch_at','result_at','reconciled_at','reconciliation_note']) THEN RAISE EXCEPTION 'Receipt identity is immutable'; END IF;
 IF OLD.status IN ('RECONCILED','FAILED_BEFORE_DISPATCH') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Terminal receipt is immutable'; END IF;
 RETURN NEW;
END $$;


--
-- Name: engineering_model_reserve(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_model_reserve(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE w engineering_work%ROWTYPE; a agents%ROWTYPE; b engineering_work_model_budget%ROWTYPE;
 c engineering_work_model_calls%ROWTYPE; n engineering_native_runtime%ROWTYPE;
 h jsonb; ceiling bigint; native_run uuid;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','token','scope','actor','work','version','generation','agent','agentRevision','policyHash','policyVersion','budgetVersion','ceiling','deadline','maxCalls','session','step','request','purpose','provider','model','exposure','pricing','bounds']) AS k WHERE p->>k IS NULL) THEN RAISE EXCEPTION 'Complete reservation provenance required'; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=p->>'scope' AND scope_kind='personal' AND id=(p->>'work')::uuid FOR UPDATE;
 IF p->>'actor'<>w.scope_id OR w.version<>(p->>'version')::integer OR w.generation<>(p->>'generation')::integer THEN RAISE EXCEPTION 'Stale Work or actor'; END IF;
 SELECT * INTO STRICT a FROM agents WHERE id=p->>'agent' AND owner_id=w.scope_id FOR UPDATE;
 IF NOT a.is_primary OR a.status<>'active' OR a.updated_at::text<>p->>'agentRevision' THEN RAISE EXCEPTION 'Stale Agent'; END IF;
 IF (p->>'exposure')::bigint<=0 OR (p->>'deadline')::timestamptz<=clock_timestamp() OR (p->>'maxCalls')::integer<=0 THEN RAISE EXCEPTION 'Invalid spend bound'; END IF;
 ceiling=LEAST((p->>'ceiling')::bigint,floor(w.max_cost_usd*1000000)::bigint,floor(a.max_estimated_cost_usd*1000000)::bigint);
 -- Preserve provenance as actually recorded. Never manufacture historical actor/policy identity.
 h=jsonb_build_object('conversation',(SELECT to_jsonb(x) FROM engineering_conversation_budget x WHERE x.scope_id=w.scope_id AND x.scope_kind=w.scope_kind AND x.work_id=w.id),
 'native',(SELECT to_jsonb(x) FROM engineering_native_runtime x WHERE x.scope_id=w.scope_id AND x.scope_kind=w.scope_kind AND x.work_id=w.id),
 'executor',(SELECT to_jsonb(x) FROM engineering_execution x WHERE x.scope_id=w.scope_id AND x.scope_kind=w.scope_kind AND x.work_id=w.id));
 INSERT INTO engineering_work_model_budget(scope_id,scope_kind,work_id,actor_id,agent_id,agent_revision,policy_hash,policy_version,ceiling_microusd,max_calls,deadline,status,historical)
 VALUES(w.scope_id,w.scope_kind,w.id,p->>'actor',a.id,p->>'agentRevision',p->>'policyHash',(p->>'policyVersion')::integer,ceiling,LEAST((p->>'maxCalls')::integer,a.max_steps),(p->>'deadline')::timestamptz,
 CASE WHEN COALESCE((h#>>'{conversation,spent_microusd}')::bigint,0)+COALESCE((h#>>'{conversation,reserved_microusd}')::bigint,0)+COALESCE((h#>>'{native,spent_microusd}')::bigint,0)+COALESCE((h#>>'{native,reserved_microusd}')::bigint,0)>0 OR COALESCE((h#>>'{conversation,calls_started}')::integer,0)+COALESCE((h#>>'{native,calls_started}')::integer,0)>0 OR COALESCE((h#>>'{conversation,usage_unknown}')::boolean,false) OR COALESCE((h#>>'{native,usage_unknown}')::boolean,false) OR COALESCE((h#>>'{conversation,inflight}')::boolean,false) OR COALESCE((h#>>'{native,inflight}')::boolean,false) OR h->'executor'<>'null'::jsonb THEN 'HISTORICAL_RECONCILIATION' ELSE 'ACTIVE' END,h)
 ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT b FROM engineering_work_model_budget WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id FOR UPDATE;
 IF b.actor_id<>p->>'actor' OR b.agent_id<>a.id OR b.agent_revision<>p->>'agentRevision' OR b.policy_hash IS DISTINCT FROM p->>'policyHash' OR b.policy_version<>(p->>'policyVersion')::integer OR b.budget_version<>(p->>'budgetVersion')::integer THEN RAISE EXCEPTION 'Stale spending policy'; END IF;
 SELECT * INTO c FROM engineering_work_model_calls WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND session_id=p->>'session' AND step_key=p->>'step';
 IF FOUND THEN
  IF c.work_version<>w.version OR c.work_generation<>w.generation OR c.agent_revision<>a.updated_at::text OR c.request_hash<>p->>'request' OR c.model_id<>p->>'model' OR c.purpose<>p->>'purpose' THEN RAISE EXCEPTION 'Replay identity conflict'; END IF;
  RETURN to_jsonb(c); -- No repeat dispatch claim. Completed response may be read, never executed as a grant.
 END IF;
 IF b.status<>'ACTIVE' OR b.deadline<=clock_timestamp() OR b.spent_microusd+b.reserved_microusd+(p->>'exposure')::bigint>LEAST(b.ceiling_microusd,ceiling) OR b.calls_admitted>=LEAST(b.max_calls,a.max_steps) THEN RAISE EXCEPTION 'Common Work budget denied'; END IF;
 IF p->>'purpose'='NATIVE_EXECUTION' THEN
  IF w.control<>'agent' OR w.lifecycle<>'active' THEN RAISE EXCEPTION 'Productive Work unavailable'; END IF;
  SELECT r.id INTO native_run FROM engineering_route_runs r JOIN engineering_routing_decisions d ON d.id=r.decision_id
   WHERE r.id=(p->>'run')::uuid AND r.scope_id=w.scope_id AND r.scope_kind=w.scope_kind AND r.work_id=w.id AND r.work_generation=w.generation AND r.status IN ('QUEUED','RUNNING')
    AND d.status='ADMITTED' AND d.work_version=w.version AND d.admission_authority_snapshot#>>'{binding,configurationHash}'=p->>'policyHash' AND d.admission_authority_snapshot#>>'{binding,agentRevision}'=p->>'agentRevision' AND b.spent_microusd+b.reserved_microusd+(p->>'exposure')::bigint<=floor((d.admission_authority_snapshot#>>'{contract,budgetUsd}')::numeric*1000000)::bigint AND (d.admission_authority_snapshot#>>'{contract,deadline}')::timestamptz>clock_timestamp() FOR UPDATE OF r,d;
  IF native_run IS NULL THEN RAISE EXCEPTION 'Productive route unavailable'; END IF;
  INSERT INTO engineering_native_runtime(scope_id,scope_kind,work_id,route_run_id,session_id) VALUES(w.scope_id,w.scope_kind,w.id,native_run,p->>'session') ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT n FROM engineering_native_runtime WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id FOR UPDATE;
  IF n.route_run_id<>native_run OR n.session_id<>p->>'session' OR n.inflight OR n.usage_unknown OR EXISTS(SELECT 1 FROM engineering_work_model_calls WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND purpose='NATIVE_EXECUTION' AND status IN ('RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN')) THEN RAISE EXCEPTION 'Native writer session or uncertain call'; END IF;
 END IF;
 INSERT INTO engineering_work_model_calls(id,scope_id,scope_kind,work_id,actor_id,agent_id,agent_revision,work_version,work_generation,session_id,step_key,request_hash,purpose,route_run_id,provider,model_id,policy_hash,policy_version,budget_version,reserved_microusd,pricing,bounds,status,dispatch_token)
 VALUES((p->>'id')::uuid,w.scope_id,w.scope_kind,w.id,p->>'actor',a.id,p->>'agentRevision',w.version,w.generation,p->>'session',p->>'step',p->>'request',p->>'purpose',native_run,p->>'provider',p->>'model',b.policy_hash,b.policy_version,b.budget_version,(p->>'exposure')::bigint,p->'pricing',p->'bounds','RESERVED',(p->>'token')::uuid) RETURNING * INTO c;
 UPDATE engineering_work_model_budget SET reserved_microusd=reserved_microusd+c.reserved_microusd,calls_admitted=calls_admitted+1 WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id;
 RETURN to_jsonb(c);
END $$;


--
-- Name: engineering_model_transition(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_model_transition(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE c engineering_work_model_calls%ROWTYPE; b engineering_work_model_budget%ROWTYPE; w engineering_work%ROWTYPE; a agents%ROWTYPE; op text=p->>'operation';
BEGIN
 -- Read identity first, then lock in the same order as reservation.
 SELECT * INTO STRICT c FROM engineering_work_model_calls WHERE id=(p->>'id')::uuid AND scope_id=p->>'scope' AND actor_id=p->>'actor';
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=c.scope_id AND scope_kind=c.scope_kind AND id=c.work_id FOR UPDATE;
 SELECT * INTO STRICT a FROM agents WHERE id=c.agent_id AND owner_id=c.scope_id FOR UPDATE;
 SELECT * INTO STRICT b FROM engineering_work_model_budget WHERE scope_id=c.scope_id AND scope_kind=c.scope_kind AND work_id=c.work_id FOR UPDATE;
 SELECT * INTO STRICT c FROM engineering_work_model_calls WHERE id=c.id FOR UPDATE;
 IF c.dispatch_token::text IS DISTINCT FROM p->>'token' OR c.request_hash IS DISTINCT FROM p->>'request' THEN RAISE EXCEPTION 'Receipt identity mismatch'; END IF;
 IF op='dispatch' THEN
  IF c.status<>'RESERVED' OR b.status<>'ACTIVE' OR b.deadline<=clock_timestamp() OR b.spent_microusd+b.reserved_microusd>LEAST(b.ceiling_microusd,floor(w.max_cost_usd*1000000)::bigint,floor(a.max_estimated_cost_usd*1000000)::bigint) OR c.work_version<>w.version OR c.work_generation<>w.generation OR a.status<>'active' OR NOT a.is_primary OR a.updated_at::text<>c.agent_revision OR b.policy_hash IS DISTINCT FROM p->>'policyHash' OR b.policy_hash<>c.policy_hash OR b.policy_version<>c.policy_version THEN RAISE EXCEPTION 'Dispatch fence denied'; END IF;
  IF c.purpose='NATIVE_EXECUTION' AND (w.control<>'agent' OR w.lifecycle<>'active' OR NOT EXISTS(SELECT 1 FROM engineering_native_runtime n JOIN engineering_route_runs r ON r.id=n.route_run_id JOIN engineering_routing_decisions d ON d.id=r.decision_id WHERE n.scope_id=c.scope_id AND n.scope_kind=c.scope_kind AND n.work_id=c.work_id AND n.session_id=c.session_id AND n.route_run_id=c.route_run_id AND NOT n.inflight AND NOT n.usage_unknown AND r.status IN ('QUEUED','RUNNING') AND r.work_generation=w.generation AND d.status='ADMITTED' AND d.work_version=w.version AND d.admission_authority_snapshot#>>'{binding,configurationHash}'=c.policy_hash AND d.admission_authority_snapshot#>>'{binding,agentRevision}'=c.agent_revision AND b.spent_microusd+b.reserved_microusd<=floor((d.admission_authority_snapshot#>>'{contract,budgetUsd}')::numeric*1000000)::bigint AND (d.admission_authority_snapshot#>>'{contract,deadline}')::timestamptz>clock_timestamp())) THEN RAISE EXCEPTION 'Native dispatch authority denied'; END IF;
  UPDATE engineering_work_model_calls SET status='DISPATCHED',dispatch_at=clock_timestamp() WHERE id=c.id;
 ELSIF op='release' THEN
  IF c.status<>'RESERVED' THEN RAISE EXCEPTION 'Only provably undispatched exposure can be released'; END IF;
  UPDATE engineering_work_model_calls SET status='FAILED_BEFORE_DISPATCH',reconciliation_note=p->>'note' WHERE id=c.id;
  UPDATE engineering_work_model_budget SET reserved_microusd=reserved_microusd-c.reserved_microusd WHERE scope_id=c.scope_id AND scope_kind=c.scope_kind AND work_id=c.work_id;
 ELSIF op='retain' THEN
  IF c.status NOT IN ('DISPATCHED','USAGE_UNKNOWN') OR p->'result' IS NULL OR octet_length((p->'result')::text)>2000000 OR p->>'resultHash' IS NULL THEN RAISE EXCEPTION 'Result custody denied'; END IF;
  UPDATE engineering_work_model_calls SET status='RESULT_RETAINED',result=p->'result',result_hash=p->>'resultHash',result_at=clock_timestamp(),usage_receipt=p->'receipt',usage_semantics=p->>'semantics' WHERE id=c.id;
 ELSIF op='unknown' THEN
  IF c.status='DISPATCHED' THEN UPDATE engineering_work_model_calls SET status='USAGE_UNKNOWN',reconciliation_note=p->>'note' WHERE id=c.id; END IF;
 ELSIF op='reconcile' THEN
  IF c.status='RECONCILED' THEN RETURN to_jsonb(c); END IF;
  IF c.status<>'RESULT_RETAINED' OR c.usage_semantics<>'INCREMENTAL' OR c.usage_receipt IS NULL OR (p->>'actual')::bigint<0 OR p->>'actual' IS NULL OR (c.usage_receipt->>'microUsd')::bigint IS DISTINCT FROM (p->>'actual')::bigint THEN RAISE EXCEPTION 'Known exact-call usage receipt required'; END IF;
  UPDATE engineering_work_model_calls SET status='RECONCILED',spent_microusd=(p->>'actual')::bigint,reconciled_at=clock_timestamp(),reconciliation_note=p->>'note' WHERE id=c.id;
  UPDATE engineering_work_model_budget SET reserved_microusd=reserved_microusd-c.reserved_microusd,spent_microusd=spent_microusd+(p->>'actual')::bigint,
    status=CASE WHEN spent_microusd+(p->>'actual')::bigint+reserved_microusd-c.reserved_microusd>ceiling_microusd THEN 'OVERAGE' ELSE status END
    WHERE scope_id=c.scope_id AND scope_kind=c.scope_kind AND work_id=c.work_id;
 ELSE RAISE EXCEPTION 'Unknown accounting operation'; END IF;
 SELECT * INTO c FROM engineering_work_model_calls WHERE id=c.id;
 RETURN to_jsonb(c);
END $$;


--
-- Name: engineering_native_economics_frozen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_native_economics_frozen() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF (NEW.spent_microusd,NEW.reserved_microusd,NEW.calls_started,NEW.inflight,NEW.usage_unknown)
 IS DISTINCT FROM (OLD.spent_microusd,OLD.reserved_microusd,OLD.calls_started,OLD.inflight,OLD.usage_unknown)
 THEN RAISE EXCEPTION 'Native economic authority moved to common Work ledger'; END IF;
 RETURN NEW;
END $$;


--
-- Name: engineering_native_result_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_native_result_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Native result records are immutable'; END;
$$;


--
-- Name: engineering_writer_control_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_writer_control_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
 IF (NEW.control,NEW.lifecycle,NEW.version,NEW.generation) IS DISTINCT FROM (OLD.control,OLD.lifecycle,OLD.version,OLD.generation)
 AND EXISTS(SELECT 1 FROM engineering_route_runs r WHERE r.scope_id=OLD.scope_id AND r.scope_kind=OLD.scope_kind AND r.work_id=OLD.id AND r.factory_request_id IS NOT NULL AND r.status NOT IN ('COMPLETED','FAILED','CANCELLED'))
 THEN RAISE EXCEPTION 'Factory must stop and prove quiescence before Work control changes'; END IF;
 RETURN NEW;
END $$;


--
-- Name: engineering_writer_custody_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_writer_custody_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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


--
-- Name: engineering_writer_handoff(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_writer_handoff(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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


--
-- Name: engineering_writer_history_no_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_writer_history_no_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Historical writer records cannot be deleted'; END $$;


--
-- Name: engineering_writer_run_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engineering_writer_run_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
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
END $_$;


--
-- Name: goal_work_dependency_fence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.goal_work_dependency_fence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE goal_tasks SET generation=generation+1,updated_at=now() WHERE id=COALESCE(NEW.task_id,OLD.task_id);
  RETURN COALESCE(NEW,OLD);
END $$;


--
-- Name: goal_work_goal_fence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.goal_work_goal_fence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (NEW.title,NEW.description,NEW.success_criteria,NEW.requires_owner_confirmation) IS DISTINCT FROM
     (OLD.title,OLD.description,OLD.success_criteria,OLD.requires_owner_confirmation) THEN
    NEW.generation := OLD.generation + 1;
    IF OLD.status='completed' THEN NEW.status:='active'; END IF;
  END IF;
  IF NEW.status='completed' AND OLD.status<>'completed' THEN
    IF NEW.requires_owner_confirmation AND NEW.confirmed_generation IS DISTINCT FROM NEW.generation THEN
      RAISE EXCEPTION 'Current owner confirmation required';
    END IF;
    IF jsonb_array_length(NEW.success_criteria)=0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(NEW.success_criteria) c
      WHERE NOT EXISTS (SELECT 1 FROM goal_outcome_evidence e WHERE e.owner_id=NEW.owner_id
        AND e.goal_id=NEW.id AND e.generation=NEW.generation AND e.criterion=c)) THEN
      RAISE EXCEPTION 'Goal outcome evidence required';
    END IF;
    IF EXISTS(SELECT 1 FROM goal_work_links WHERE goal_id=NEW.id AND state IN ('prepared','linked')) THEN
      RAISE EXCEPTION 'Unresolved Work remains';
    END IF;
    IF EXISTS(SELECT 1 FROM goal_tasks WHERE goal_id=NEW.id AND status NOT IN ('completed','cancelled')) THEN
      RAISE EXCEPTION 'Unfinished tasks remain';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: goal_work_plan_fence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.goal_work_plan_fence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE goals SET generation=generation+1,updated_at=now() WHERE id=NEW.goal_id;
  RETURN NEW;
END $$;


--
-- Name: goal_work_task_fence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.goal_work_task_fence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE g goals;
BEGIN
  SELECT * INTO g FROM goals WHERE id=COALESCE(NEW.goal_id,OLD.goal_id) FOR UPDATE;
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM goal_work_links WHERE task_id=OLD.id) THEN RAISE EXCEPTION 'Work history must be retained'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' AND g.status IN ('completed','archived','abandoned') THEN RAISE EXCEPTION 'Goal is terminal'; END IF;
  IF TG_OP='UPDATE' AND (NEW.title,NEW.description,NEW.success_criteria,NEW.required_capabilities,NEW.assigned_to)
    IS DISTINCT FROM (OLD.title,OLD.description,OLD.success_criteria,OLD.required_capabilities,OLD.assigned_to) THEN
    NEW.generation:=OLD.generation+1;
  END IF;
  IF TG_OP='UPDATE' AND NEW.generation<>OLD.generation AND OLD.status='completed' THEN
    NEW.status:='todo'; NEW.completed_at:=NULL;
  END IF;
  IF NEW.status='completed' AND (TG_OP='INSERT' OR OLD.status<>'completed') THEN
    IF NOT EXISTS (SELECT 1 FROM goal_work_links l WHERE l.task_id=NEW.id
      AND l.task_generation=NEW.generation AND l.goal_generation=g.generation AND l.state='result'
      AND l.result->>'outcome'='SUCCEEDED' AND l.result->>'verified'='true'
      AND l.result->>'current'='true' AND jsonb_array_length(l.result->'evidence')>0
      AND NEW.success_criteria <@ (l.result->'satisfiedCriteria')) THEN
      RAISE EXCEPTION 'Current verified Work Result required';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: inbox_guard_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inbox_guard_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_TABLE_NAME='inbox_attention_evidence' THEN
    IF OLD.data-'deliveries' IS DISTINCT FROM NEW.data-'deliveries' OR (NEW.data->>'deliveries')::bigint<(OLD.data->>'deliveries')::bigint THEN
      RAISE EXCEPTION 'Immutable source evidence'; END IF;
  ELSIF TG_TABLE_NAME='inbox_attention_responses' THEN
    IF OLD.data-ARRAY['status','receipt'] IS DISTINCT FROM NEW.data-ARRAY['status','receipt'] OR
      (OLD.status<>'PENDING' AND OLD.data IS DISTINCT FROM NEW.data) THEN RAISE EXCEPTION 'Immutable owner response'; END IF;
  ELSE
    IF OLD.data->>'correlationId' IS DISTINCT FROM NEW.data->>'correlationId' OR OLD.data->>'episode' IS DISTINCT FROM NEW.data->>'episode' OR
      (OLD.status IN ('RESOLVED','DISMISSED','SUPERSEDED') AND OLD.status<>NEW.data->>'status') OR
      (OLD.data->>'workId' IS NOT NULL AND OLD.data->>'workId' IS DISTINCT FROM NEW.data->>'workId') OR
      (OLD.data->>'workGeneration' IS NOT NULL AND (OLD.data->'workGeneration' IS DISTINCT FROM NEW.data->'workGeneration' OR OLD.data->'workVersion' IS DISTINCT FROM NEW.data->'workVersion')) OR
      (OLD.data IS DISTINCT FROM NEW.data AND (NEW.data->>'revision')::bigint <= (OLD.data->>'revision')::bigint)
      THEN RAISE EXCEPTION 'Stale or redirected attention state'; END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: invalidate_reminder_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invalidate_reminder_authority() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF ROW(NEW.prompt,NEW.cron,NEW.timezone,NEW.chat_id,NEW.approval_boundary)
     IS DISTINCT FROM ROW(OLD.prompt,OLD.cron,OLD.timezone,OLD.chat_id,OLD.approval_boundary) THEN
    NEW.configuration_version := OLD.configuration_version+1;
    NEW.reviewed_version := NULL;
    NEW.reviewed_at := NULL;
    IF OLD.execution_routine_id IS NOT NULL THEN
      UPDATE execution_routines SET status='paused',paused_at=now(),updated_at=now()
      WHERE id=OLD.execution_routine_id;
    END IF;
  END IF;
  IF NEW.status IN ('paused','cancelled') AND OLD.execution_routine_id IS NOT NULL THEN
    UPDATE execution_routines SET status='paused',paused_at=now(),updated_at=now()
    WHERE id=OLD.execution_routine_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: owner_chat_run(text, text, text, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.owner_chat_run(p_owner text, p_session text, p_agent text, p_new_id text, p_recover boolean, p_initialize boolean) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE previous task_runs%ROWTYPE; agent agents%ROWTYPE; count_current integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-chat-run:' || p_session,0));
  SELECT count(*) INTO count_current FROM task_run_sessions WHERE session_id=p_session AND is_current;
  IF count_current>1 THEN RAISE EXCEPTION 'RUN_BINDING_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM task_run_sessions s JOIN task_runs r ON r.id=s.task_id
    WHERE s.session_id=p_session AND (r.owner_id<>p_owner OR r.agent_id IS DISTINCT FROM p_agent))
    THEN RAISE EXCEPTION 'RUN_BINDING_INVALID'; END IF;
  SELECT r.* INTO previous FROM task_runs r JOIN task_run_sessions s ON s.task_id=r.id
    WHERE s.session_id=p_session AND s.is_current FOR UPDATE OF r;
  IF FOUND THEN
    IF previous.status IN ('running','awaiting_approval') AND
      (previous.deadline_at IS NULL OR previous.deadline_at>clock_timestamp()) THEN RETURN previous.id; END IF;
    IF NOT p_recover THEN
      IF previous.deadline_at<=clock_timestamp() THEN RAISE EXCEPTION 'RUN_EXPIRED';
      ELSE RAISE EXCEPTION 'RUN_NOT_EXECUTABLE'; END IF;
    END IF;
    -- Never renew a delegated, scheduled, role, or goal budget through chat.
    IF previous.id NOT LIKE 'action_run_%' OR previous.parent_task_id IS NOT NULL
      OR previous.goal_id IS NOT NULL OR previous.role_id IS NOT NULL
      OR EXISTS(SELECT 1 FROM execution_occurrences WHERE run_id=previous.id)
      OR previous.model_steps>=previous.max_model_steps
      OR previous.estimated_cost_usd>=previous.max_estimated_cost_usd
      THEN RAISE EXCEPTION 'RUN_RECOVERY_REQUIRES_OWNER_REVIEW'; END IF;
  ELSIF NOT p_initialize THEN RETURN NULL;
  END IF;
  IF previous.id IS NULL AND EXISTS(SELECT 1 FROM task_run_sessions s JOIN task_runs r ON r.id=s.task_id
    WHERE s.session_id=p_session AND (r.id NOT LIKE 'action_run_%' OR r.goal_id IS NOT NULL OR r.parent_task_id IS NOT NULL OR r.role_id IS NOT NULL))
    THEN RAISE EXCEPTION 'RUN_RECOVERY_REQUIRES_OWNER_REVIEW'; END IF;
  SELECT * INTO agent FROM agents WHERE owner_id=p_owner AND id=p_agent AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RUN_BINDING_INVALID'; END IF;
  INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,
    max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,started_at,deadline_at)
    VALUES(p_new_id,p_owner,'delegated_work','Owner-requested actions',p_agent,'running',agent.max_runtime_seconds,0,
      agent.max_steps,0,agent.max_estimated_cost_usd,clock_timestamp(),clock_timestamp()+agent.max_runtime_seconds*interval '1 second');
  UPDATE task_run_sessions SET is_current=false WHERE session_id=p_session AND is_current;
  INSERT INTO task_run_sessions(task_id,session_id,role,is_current) VALUES(p_new_id,p_session,'orchestrator',true);
  INSERT INTO task_transitions(task_id,from_status,to_status,actor,reason)
    VALUES(p_new_id,NULL,'running','system','Fresh owner-chat execution context; historical authority not inherited');
  RETURN p_new_id;
END $$;


--
-- Name: preserve_computer_resource_binding(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_computer_resource_binding() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF ROW(NEW.id,NEW.owner_id,NEW.agent_id,NEW.run_id,NEW.computer_session_id,NEW.runtime_session_id,
    NEW.provider,NEW.environment,NEW.resource_name,NEW.generation,NEW.provision_id,NEW.preparation_id,NEW.source_snapshot_id,NEW.provision_until)
    IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.agent_id,OLD.run_id,OLD.computer_session_id,OLD.runtime_session_id,
    OLD.provider,OLD.environment,OLD.resource_name,OLD.generation,OLD.provision_id,OLD.preparation_id,OLD.source_snapshot_id,OLD.provision_until)
  THEN RAISE EXCEPTION 'Computer resource ownership is immutable'; END IF;
  RETURN NEW;
END $$;


--
-- Name: recall_claim_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recall_claim_events() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE e jsonb; claimed text;
BEGIN
  FOR e IN SELECT value FROM jsonb_array_elements(NEW.document->'events') LOOP
    IF e->>'actorId' IS DISTINCT FROM NEW.owner_id THEN RAISE EXCEPTION 'event owner mismatch'; END IF;
    INSERT INTO recall_learning_events(owner_id,event_id,family_id) VALUES(NEW.owner_id,(e->>'id')::uuid,NEW.id) ON CONFLICT DO NOTHING;
    SELECT family_id INTO claimed FROM recall_learning_events WHERE owner_id=NEW.owner_id AND event_id=(e->>'id')::uuid;
    IF claimed IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'event identity already belongs to another scope'; END IF;
  END LOOP;
  RETURN NEW;
END $$;


--
-- Name: recall_validate_family(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recall_validate_family() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE v jsonb; e jsonb; previous jsonb; n integer:=0; active_count integer:=0; evidence_count integer:=0;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.owner_id<>OLD.owner_id OR NEW.id<>OLD.id OR NEW.repository<>OLD.repository OR NEW.work_type<>OLD.work_type
       OR NEW.work_id IS DISTINCT FROM OLD.work_id OR NEW.revision<>OLD.revision+1
       OR jsonb_array_length(NEW.document->'versions')<jsonb_array_length(OLD.document->'versions')
       OR jsonb_array_length(NEW.document->'events')<=jsonb_array_length(OLD.document->'events') THEN
      RAISE EXCEPTION 'learning scope, version history and revision are immutable';
    END IF;
    FOR n IN 0..jsonb_array_length(OLD.document->'events')-1 LOOP
      IF NEW.document->'events'->n IS DISTINCT FROM OLD.document->'events'->n THEN RAISE EXCEPTION 'event history changed'; END IF;
    END LOOP;
  END IF;
  n:=0;
  FOR v IN SELECT value FROM jsonb_array_elements(NEW.document->'versions') LOOP
    n:=n+1;
    IF NOT (v ?& ARRAY['version','behavior','status','hash','evidence','evaluation','reason','correctionOf','createdAt'])
       OR (v->>'version')::integer IS DISTINCT FROM n OR coalesce(v->>'hash','') !~ '^[a-f0-9]{64}$'
       OR coalesce(v->>'behavior','') NOT IN ('cite_sources','state_uncertainty')
       OR coalesce(v->>'status','') NOT IN ('CANDIDATE','EVALUATING','PROMOTED','REJECTED','SUPERSEDED','ROLLED_BACK')
       OR jsonb_typeof(v->'evidence')<>'array' OR jsonb_array_length(v->'evidence')=0 THEN RAISE EXCEPTION 'invalid learning version'; END IF;
    IF TG_OP='UPDATE' AND n<=jsonb_array_length(OLD.document->'versions') THEN
      previous:=OLD.document->'versions'->(n-1);
      IF (v-'status'-'reason'-'evaluation'-'evidence') IS DISTINCT FROM (previous-'status'-'reason'-'evaluation'-'evidence') THEN RAISE EXCEPTION 'version identity changed'; END IF;
      IF previous->'evaluation'<>'null'::jsonb AND (v->'evaluation' IS DISTINCT FROM previous->'evaluation' OR v->'evidence' IS DISTINCT FROM previous->'evidence') THEN RAISE EXCEPTION 'qualified evidence changed'; END IF;
      IF jsonb_array_length(v->'evidence')<jsonb_array_length(previous->'evidence') THEN RAISE EXCEPTION 'evidence removed'; END IF;
      IF NOT ((v->'evidence') @> (previous->'evidence')) THEN RAISE EXCEPTION 'evidence changed'; END IF;
    END IF;
    IF v->>'status'='PROMOTED' THEN
      active_count:=active_count+1;
      IF v->'evaluation'->>'result' IS DISTINCT FROM 'PASS' OR v->'evaluation'->>'candidateHash' IS DISTINCT FROM v->>'hash' THEN RAISE EXCEPTION 'promotion lacks exact evaluation'; END IF;
    END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(v->'evidence') LOOP
      evidence_count:=evidence_count+1;
      IF e->>'actorId' IS DISTINCT FROM NEW.owner_id OR e->>'provenance' IS DISTINCT FROM 'authenticated_owner_feedback' OR
        NOT EXISTS(SELECT 1 FROM engineering_work w WHERE w.scope_id=NEW.owner_id AND w.scope_kind='personal'
          AND w.id=(e->>'workId')::uuid AND w.repository=NEW.repository AND w.version >= (e->>'workVersion')::integer
          AND (NEW.work_id IS NULL OR NEW.work_id=w.id)) THEN RAISE EXCEPTION 'feedback provenance scope mismatch'; END IF;
    END LOOP;
  END LOOP;
  IF active_count>1 OR evidence_count>100 THEN RAISE EXCEPTION 'learning active/evidence limit'; END IF;
  RETURN NEW;
END $_$;


--
-- Name: recall_validate_use(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recall_validate_use() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM recall_learning l JOIN engineering_work w ON w.scope_id=l.owner_id AND w.scope_kind='personal' AND w.id=NEW.work_id,
    jsonb_array_elements(l.document->'versions') v
    WHERE l.owner_id=NEW.owner_id AND l.id=NEW.family_id AND w.repository=l.repository AND (l.work_id IS NULL OR l.work_id=w.id)
      AND (v->>'version')::integer=NEW.version AND v->>'hash'=NEW.candidate_hash AND v->>'status'='PROMOTED')
    THEN RAISE EXCEPTION 'usage scope or active version mismatch'; END IF;
  RETURN NEW;
END $$;


--
-- Name: revoke_changed_routine_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_changed_routine_authority() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF ROW(NEW.configuration,NEW.agent_id) IS DISTINCT FROM ROW(OLD.configuration,OLD.agent_id)
     AND NEW.version=OLD.version THEN
    NEW.status := 'paused';
    NEW.paused_at := now();
  END IF;
  RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_receipts (
    id bigint NOT NULL,
    owner_id text NOT NULL,
    action_id text NOT NULL,
    attempt_number integer NOT NULL,
    event text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: action_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.action_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: action_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.action_receipts_id_seq OWNED BY public.action_receipts.id;


--
-- Name: action_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_requests (
    id text NOT NULL,
    owner_id text NOT NULL,
    run_id text NOT NULL,
    occurrence_id text,
    action_key text NOT NULL,
    executor jsonb NOT NULL,
    trigger jsonb NOT NULL,
    capability_id text NOT NULL,
    action_class text NOT NULL,
    target jsonb NOT NULL,
    parameter_hash text NOT NULL,
    safe_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    decision text NOT NULL,
    authority_source text NOT NULL,
    approval_id text,
    status text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    computer_session_id text,
    control_version bigint,
    provider_receipt jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reason_code text DEFAULT 'legacy_decision'::text NOT NULL,
    policy_version text DEFAULT 'local-v1'::text NOT NULL,
    recovery_token text,
    recovery_expires_at timestamp with time zone,
    recovery_result jsonb,
    approval_generation integer DEFAULT 0 NOT NULL,
    CONSTRAINT action_requests_decision_check CHECK ((decision = ANY (ARRAY['ALLOW'::text, 'REQUIRE_APPROVAL'::text, 'DENY'::text]))),
    CONSTRAINT action_requests_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'awaiting_approval'::text, 'authorized'::text, 'executing'::text, 'verifying'::text, 'completed'::text, 'failed'::text, 'result_unknown'::text, 'cancelled'::text, 'denied'::text, 'recovering'::text, 'needs_you'::text, 'retryable'::text])))
);


--
-- Name: agent_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_audit_events (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    event_type text NOT NULL,
    actor_type text NOT NULL,
    actor_id text,
    summary text NOT NULL,
    changes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_audit_events_actor_type_check CHECK ((actor_type = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text]))),
    CONSTRAINT agent_audit_events_event_type_check CHECK ((event_type = ANY (ARRAY['created'::text, 'updated'::text, 'capabilities_changed'::text, 'paused'::text, 'resumed'::text, 'disabled'::text, 'archived'::text, 'duplicated'::text])))
);


--
-- Name: agent_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_capabilities (
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    capability_id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    assigned_by_type text DEFAULT 'owner'::text NOT NULL,
    assigned_by_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_capabilities_assigned_by_type_check CHECK ((assigned_by_type = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text])))
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id text NOT NULL,
    session_id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    thread_id text,
    status text DEFAULT 'running'::text NOT NULL,
    model_steps integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric(10,4) DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    executor_kind text DEFAULT 'persistent-agent'::text NOT NULL,
    role_id text,
    CONSTRAINT agent_runs_estimated_cost_usd_check CHECK ((estimated_cost_usd >= (0)::numeric)),
    CONSTRAINT agent_runs_executor_kind_valid CHECK ((executor_kind = ANY (ARRAY['primary-agent'::text, 'persistent-agent'::text, 'on-demand-role'::text]))),
    CONSTRAINT agent_runs_model_steps_check CHECK ((model_steps >= 0)),
    CONSTRAINT agent_runs_role_attribution_valid CHECK (((executor_kind = 'on-demand-role'::text) = (role_id IS NOT NULL))),
    CONSTRAINT agent_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: agentphone_call; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_call (
    call_id text NOT NULL,
    cursor integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agentphone_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_config (
    id integer DEFAULT 1 NOT NULL,
    number_id text,
    phone_number text,
    agent_id text,
    webhook_secret text,
    owner_number text,
    operational_enabled boolean DEFAULT false NOT NULL,
    daily_message_limit integer DEFAULT 25 NOT NULL,
    daily_call_limit integer DEFAULT 5 NOT NULL,
    quiet_hours_start smallint DEFAULT 21 NOT NULL,
    quiet_hours_end smallint DEFAULT 8 NOT NULL,
    timezone text DEFAULT 'America/Los_Angeles'::text NOT NULL,
    usage_day date DEFAULT CURRENT_DATE NOT NULL,
    message_segments_used integer DEFAULT 0 NOT NULL,
    calls_used integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agentphone_config_calls_used_check CHECK ((calls_used >= 0)),
    CONSTRAINT agentphone_config_daily_call_limit_check CHECK (((daily_call_limit >= 1) AND (daily_call_limit <= 50))),
    CONSTRAINT agentphone_config_daily_message_limit_check CHECK (((daily_message_limit >= 1) AND (daily_message_limit <= 500))),
    CONSTRAINT agentphone_config_id_check CHECK ((id = 1)),
    CONSTRAINT agentphone_config_message_segments_used_check CHECK ((message_segments_used >= 0)),
    CONSTRAINT agentphone_config_quiet_hours_end_check CHECK (((quiet_hours_end >= 0) AND (quiet_hours_end <= 23))),
    CONSTRAINT agentphone_config_quiet_hours_start_check CHECK (((quiet_hours_start >= 0) AND (quiet_hours_start <= 23)))
);


--
-- Name: agentphone_contact_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_contact_policy (
    phone_number text NOT NULL,
    consent_status text NOT NULL,
    consent_source text NOT NULL,
    first_outbound_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agentphone_contact_policy_consent_status_check CHECK ((consent_status = ANY (ARRAY['allowed'::text, 'blocked'::text])))
);


--
-- Name: agentphone_inbound; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_inbound (
    message_id text NOT NULL,
    conversation_id text NOT NULL,
    sender text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'claimed'::text NOT NULL,
    error text,
    text text
);


--
-- Name: agentphone_usage_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_usage_event (
    id bigint NOT NULL,
    kind text NOT NULL,
    recipient text NOT NULL,
    units integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agentphone_usage_event_kind_check CHECK ((kind = ANY (ARRAY['message_segment'::text, 'call'::text]))),
    CONSTRAINT agentphone_usage_event_units_check CHECK ((units > 0))
);


--
-- Name: agentphone_usage_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agentphone_usage_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agentphone_usage_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agentphone_usage_event_id_seq OWNED BY public.agentphone_usage_event.id;


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id text NOT NULL,
    owner_id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    label text,
    role text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    instructions text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    preferred_model text,
    reasoning_preference text DEFAULT 'default'::text NOT NULL,
    avatar_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_ceiling text DEFAULT 'low'::text NOT NULL,
    notification_policy text DEFAULT 'activity'::text NOT NULL,
    max_steps integer DEFAULT 20 NOT NULL,
    max_runtime_seconds integer DEFAULT 900 NOT NULL,
    max_estimated_cost_usd numeric(10,4) DEFAULT 2 NOT NULL,
    max_retries integer DEFAULT 1 NOT NULL,
    created_by_type text DEFAULT 'owner'::text NOT NULL,
    created_by_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT agents_check CHECK (((NOT is_primary) OR (status = 'active'::text))),
    CONSTRAINT agents_check1 CHECK (((status = 'archived'::text) = (archived_at IS NOT NULL))),
    CONSTRAINT agents_created_by_type_check CHECK ((created_by_type = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text]))),
    CONSTRAINT agents_instructions_check CHECK (((char_length(instructions) >= 1) AND (char_length(instructions) <= 20000))),
    CONSTRAINT agents_max_estimated_cost_usd_check CHECK ((max_estimated_cost_usd > (0)::numeric)),
    CONSTRAINT agents_max_retries_check CHECK (((max_retries >= 0) AND (max_retries <= 10))),
    CONSTRAINT agents_max_runtime_seconds_check CHECK (((max_runtime_seconds >= 10) AND (max_runtime_seconds <= 86400))),
    CONSTRAINT agents_max_steps_check CHECK (((max_steps >= 1) AND (max_steps <= 200))),
    CONSTRAINT agents_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT agents_notification_policy_check CHECK ((notification_policy = ANY (ARRAY['silent'::text, 'activity'::text, 'digest'::text, 'push_on_block'::text]))),
    CONSTRAINT agents_reasoning_preference_check CHECK ((reasoning_preference = ANY (ARRAY['default'::text, 'none'::text, 'minimal'::text, 'low'::text, 'medium'::text, 'high'::text, 'xhigh'::text]))),
    CONSTRAINT agents_risk_ceiling_check CHECK ((risk_ceiling = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT agents_role_check CHECK (((char_length(role) >= 1) AND (char_length(role) <= 120))),
    CONSTRAINT agents_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT agents_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'disabled'::text, 'archived'::text])))
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    name text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_runs (
    id bigint NOT NULL,
    kind text NOT NULL,
    automation_id text NOT NULL,
    fired_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    error text,
    thread_id text
);


--
-- Name: automation_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_runs_id_seq OWNED BY public.automation_runs.id;


--
-- Name: beta_goal_attention_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_goal_attention_snapshots (
    owner_id text NOT NULL,
    goal_id text NOT NULL,
    revision integer NOT NULL,
    snapshot jsonb NOT NULL
);


--
-- Name: beta_goal_work_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_goal_work_bindings (
    owner_id text NOT NULL,
    correlation_key text NOT NULL,
    work_id uuid NOT NULL,
    binding jsonb NOT NULL
);


--
-- Name: beta_result_provenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_result_provenance (
    owner_id text NOT NULL,
    result_id uuid NOT NULL,
    contract jsonb NOT NULL,
    source text NOT NULL,
    CONSTRAINT beta_result_provenance_source_check CHECK ((source = ANY (ARRAY['LOCAL_FIXTURE'::text, 'CANONICAL'::text])))
);


--
-- Name: beta_source_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_source_receipts (
    owner_id text NOT NULL,
    event_key text NOT NULL,
    event jsonb NOT NULL,
    binding jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: beta_work_admission_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_work_admission_attempts (
    owner_id text NOT NULL,
    work_id uuid NOT NULL,
    work_version integer NOT NULL,
    work_generation integer NOT NULL,
    status text NOT NULL,
    reason text NOT NULL,
    receipt jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT beta_work_admission_attempts_status_check CHECK ((status = ANY (ARRAY['ADMITTED'::text, 'DENIED'::text])))
);


--
-- Name: beta_work_contexts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_work_contexts (
    owner_id text NOT NULL,
    work_id uuid NOT NULL,
    context_ref text NOT NULL,
    document jsonb NOT NULL
);


--
-- Name: beta_work_continuations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_work_continuations (
    owner_id text NOT NULL,
    response_id text NOT NULL,
    work_id uuid NOT NULL,
    work_version integer NOT NULL,
    work_generation integer NOT NULL,
    action_id text NOT NULL,
    response_hash text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT beta_work_continuations_status_check CHECK ((status = ANY (ARRAY['ELIGIBLE'::text, 'STALE'::text])))
);


--
-- Name: beta_work_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_work_decisions (
    owner_id text NOT NULL,
    work_id uuid NOT NULL,
    action_id text NOT NULL,
    work_version integer NOT NULL,
    work_generation integer NOT NULL,
    event jsonb NOT NULL
);


--
-- Name: browser_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.browser_sessions (
    id text NOT NULL,
    computer_session_id text NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    current_url text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT browser_sessions_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'running'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'lost'::text, 'expired'::text, 'stopped'::text])))
);


--
-- Name: capsule_memory_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capsule_memory_policy (
    owner_id text NOT NULL,
    memory_id text NOT NULL,
    item_digest text NOT NULL,
    destination_eve_id text NOT NULL,
    approved_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: capsule_memory_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capsule_memory_receipts (
    owner_id text NOT NULL,
    eve_id text NOT NULL,
    id text NOT NULL,
    capsule_digest text NOT NULL,
    request_digest text NOT NULL,
    records jsonb NOT NULL,
    memory_ids jsonb NOT NULL,
    result text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capsule_memory_receipts_result_check CHECK ((result = ANY (ARRAY['active'::text, 'rolled_back'::text])))
);


--
-- Name: chat_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_files (
    id text NOT NULL,
    thread_id text NOT NULL,
    filename text NOT NULL,
    media_type text NOT NULL,
    size_bytes bigint NOT NULL,
    blob_url text NOT NULL,
    blob_path text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_files_size_bytes_check CHECK ((size_bytes >= 0))
);


--
-- Name: computer_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_actions (
    id text NOT NULL,
    computer_session_id text NOT NULL,
    run_id text,
    agent_id text NOT NULL,
    call_id text NOT NULL,
    type text NOT NULL,
    target text,
    input_summary text DEFAULT ''::text NOT NULL,
    output_summary text,
    status text DEFAULT 'running'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    evidence_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    failure_code text,
    failure_summary text,
    control_version bigint NOT NULL,
    CONSTRAINT computer_actions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'denied'::text, 'timed_out'::text]))),
    CONSTRAINT computer_actions_type_check CHECK ((type = ANY (ARRAY['browser.navigate'::text, 'browser.click'::text, 'browser.type'::text, 'browser.read'::text, 'file.read'::text, 'file.write'::text, 'file.download'::text, 'file.upload'::text, 'terminal.command'::text])))
);


--
-- Name: computer_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_artifacts (
    id text NOT NULL,
    owner_id text NOT NULL,
    computer_session_id text NOT NULL,
    action_id text,
    run_id text,
    kind text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    storage_key text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT computer_artifacts_kind_check CHECK ((kind = ANY (ARRAY['screenshot'::text, 'download'::text, 'report'::text, 'file'::text, 'log'::text, 'json'::text]))),
    CONSTRAINT computer_artifacts_size_bytes_check CHECK ((size_bytes >= 0))
);


--
-- Name: computer_control_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_control_leases (
    computer_session_id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    run_id text,
    controller text NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    claimed_by text,
    claimed_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    expires_at timestamp with time zone,
    transition_reason text,
    state_fingerprint text,
    checkpoint jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_input_enabled boolean DEFAULT false NOT NULL,
    owner_input_in_flight integer DEFAULT 0 NOT NULL,
    gateway_actions_in_flight integer DEFAULT 0 NOT NULL,
    CONSTRAINT computer_control_leases_check CHECK (((controller = 'OWNER'::text) = (claimed_by IS NOT NULL))),
    CONSTRAINT computer_control_leases_check1 CHECK (((controller = 'OWNER'::text) = (expires_at IS NOT NULL))),
    CONSTRAINT computer_control_leases_controller_check CHECK ((controller = ANY (ARRAY['AGENT'::text, 'OWNER'::text, 'PAUSED'::text, 'NONE'::text]))),
    CONSTRAINT computer_control_leases_gateway_actions_in_flight_check CHECK ((gateway_actions_in_flight >= 0)),
    CONSTRAINT computer_control_leases_owner_input_enabled_check CHECK (((NOT owner_input_enabled) OR (controller = 'OWNER'::text))),
    CONSTRAINT computer_control_leases_owner_input_in_flight_check CHECK ((owner_input_in_flight >= 0)),
    CONSTRAINT computer_control_leases_version_check CHECK ((version > 0))
);


--
-- Name: computer_control_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_control_receipts (
    id text NOT NULL,
    computer_session_id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    run_id text,
    event_type text NOT NULL,
    previous_controller text,
    new_controller text NOT NULL,
    control_version bigint NOT NULL,
    requested_by text NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT computer_control_receipts_control_version_check CHECK ((control_version > 0)),
    CONSTRAINT computer_control_receipts_new_controller_check CHECK ((new_controller = ANY (ARRAY['AGENT'::text, 'OWNER'::text, 'PAUSED'::text, 'NONE'::text]))),
    CONSTRAINT computer_control_receipts_previous_controller_check CHECK (((previous_controller IS NULL) OR (previous_controller = ANY (ARRAY['AGENT'::text, 'OWNER'::text, 'PAUSED'::text, 'NONE'::text]))))
);


--
-- Name: computer_resource_lifecycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_resource_lifecycles (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    run_id text NOT NULL,
    computer_session_id text NOT NULL,
    runtime_session_id text NOT NULL,
    provider text NOT NULL,
    environment text NOT NULL,
    resource_name text NOT NULL,
    generation bigint NOT NULL,
    provision_id text NOT NULL,
    preparation_id text NOT NULL,
    source_snapshot_id text NOT NULL,
    provider_session_id text,
    owned_snapshot_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    state text DEFAULT 'provisioning'::text NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    claim_token text,
    claimed_until timestamp with time zone,
    provision_until timestamp with time zone DEFAULT (now() + '00:02:30'::interval) NOT NULL,
    retry_after timestamp with time zone DEFAULT now() NOT NULL,
    cleanup_attempts integer DEFAULT 0 NOT NULL,
    reason text,
    initiator text,
    failure_code text,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT computer_resource_lifecycles_check CHECK (((claim_token IS NULL) = (claimed_until IS NULL))),
    CONSTRAINT computer_resource_lifecycles_check1 CHECK (((claim_token IS NULL) OR (state = 'cleanup_pending'::text))),
    CONSTRAINT computer_resource_lifecycles_check2 CHECK (((state = 'cleaned'::text) = (verified_at IS NOT NULL))),
    CONSTRAINT computer_resource_lifecycles_cleanup_attempts_check CHECK ((cleanup_attempts >= 0)),
    CONSTRAINT computer_resource_lifecycles_environment_check CHECK ((environment <> ''::text)),
    CONSTRAINT computer_resource_lifecycles_generation_check CHECK ((generation > 0)),
    CONSTRAINT computer_resource_lifecycles_initiator_check CHECK ((initiator = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text]))),
    CONSTRAINT computer_resource_lifecycles_owned_snapshot_ids_check CHECK ((jsonb_typeof(owned_snapshot_ids) = 'array'::text)),
    CONSTRAINT computer_resource_lifecycles_owner_id_check CHECK ((owner_id <> ''::text)),
    CONSTRAINT computer_resource_lifecycles_provider_check CHECK ((provider = 'vercel'::text)),
    CONSTRAINT computer_resource_lifecycles_state_check CHECK ((state = ANY (ARRAY['provisioning'::text, 'active'::text, 'cleanup_pending'::text, 'cleaned'::text]))),
    CONSTRAINT computer_resource_lifecycles_version_check CHECK ((version > 0))
);


--
-- Name: computer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_sessions (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    goal_id text,
    goal_task_id text,
    run_id text,
    runtime_session_id text NOT NULL,
    sandbox_id text,
    status text DEFAULT 'provisioning'::text NOT NULL,
    environment_type text DEFAULT 'eve-sandbox'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    resource_limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    network_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    failure_code text,
    failure_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT computer_sessions_check CHECK (((status = ANY (ARRAY['completed'::text, 'failed'::text, 'lost'::text, 'expired'::text, 'stopped'::text])) = (completed_at IS NOT NULL))),
    CONSTRAINT computer_sessions_check1 CHECK (((status = ANY (ARRAY['failed'::text, 'lost'::text])) = (failure_code IS NOT NULL))),
    CONSTRAINT computer_sessions_environment_type_check CHECK ((environment_type = ANY (ARRAY['eve-sandbox'::text, 'vercel-sandbox'::text]))),
    CONSTRAINT computer_sessions_status_check CHECK ((status = ANY (ARRAY['provisioning'::text, 'ready'::text, 'running'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'lost'::text, 'expired'::text, 'stopped'::text])))
);


--
-- Name: computer_template_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_template_events (
    id bigint NOT NULL,
    preparation_id text NOT NULL,
    event text NOT NULL,
    failure_code text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: computer_template_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.computer_template_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: computer_template_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.computer_template_events_id_seq OWNED BY public.computer_template_events.id;


--
-- Name: computer_template_preparations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_template_preparations (
    id text NOT NULL,
    scope text NOT NULL,
    fingerprint text NOT NULL,
    provider text NOT NULL,
    state text NOT NULL,
    deadline timestamp with time zone NOT NULL,
    template_id text,
    failure_code text,
    retry_after timestamp with time zone DEFAULT now() NOT NULL,
    cleanup_attempts integer DEFAULT 0 NOT NULL,
    cleanup_token text,
    cleanup_failed boolean DEFAULT false NOT NULL,
    recovery_until timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    cost_usd numeric(12,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT computer_template_preparations_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT computer_template_preparations_state_check CHECK ((state = ANY (ARRAY['PREPARING'::text, 'READY'::text, 'FAILED'::text, 'CLEANING'::text, 'CLEANED'::text])))
);


--
-- Name: computer_template_waiters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_template_waiters (
    id text NOT NULL,
    scope text NOT NULL,
    fingerprint text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: context_assemblies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_assemblies (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    session_id text NOT NULL,
    agent_run_id text,
    thread_id text,
    goal_id text,
    goal_task_id text,
    task_run_id text,
    memory_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    thread_summary_id text,
    source_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    estimated_tokens integer NOT NULL,
    budget jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT context_assemblies_estimated_tokens_check CHECK ((estimated_tokens >= 0))
);


--
-- Name: engineering_conversation_budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_conversation_budget (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    binding_hash text NOT NULL,
    ceiling_microusd bigint NOT NULL,
    deadline timestamp with time zone NOT NULL,
    max_calls integer NOT NULL,
    spent_microusd bigint DEFAULT 0 NOT NULL,
    reserved_microusd bigint DEFAULT 0 NOT NULL,
    calls_started integer DEFAULT 0 NOT NULL,
    inflight boolean DEFAULT false NOT NULL,
    usage_unknown boolean DEFAULT false NOT NULL,
    CONSTRAINT engineering_conversation_budget_binding_hash_check CHECK ((binding_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_conversation_budget_calls_started_check CHECK ((calls_started >= 0)),
    CONSTRAINT engineering_conversation_budget_ceiling_microusd_check CHECK ((ceiling_microusd > 0)),
    CONSTRAINT engineering_conversation_budget_max_calls_check CHECK (((max_calls >= 1) AND (max_calls <= 30))),
    CONSTRAINT engineering_conversation_budget_reserved_microusd_check CHECK ((reserved_microusd >= 0)),
    CONSTRAINT engineering_conversation_budget_scope_kind_check CHECK ((scope_kind = 'personal'::text)),
    CONSTRAINT engineering_conversation_budget_spent_microusd_check CHECK ((spent_microusd >= 0))
);


--
-- Name: engineering_conversation_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_conversation_calls (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    step_key text NOT NULL,
    session_id text NOT NULL,
    request_hash text NOT NULL,
    model_id text NOT NULL,
    reserved_microusd bigint NOT NULL,
    spent_microusd bigint,
    status text NOT NULL,
    result jsonb,
    CONSTRAINT engineering_conversation_calls_check CHECK (((status <> 'COMPLETED'::text) OR ((result IS NOT NULL) AND (spent_microusd IS NOT NULL)))),
    CONSTRAINT engineering_conversation_calls_request_hash_check CHECK ((request_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_conversation_calls_reserved_microusd_check CHECK ((reserved_microusd > 0)),
    CONSTRAINT engineering_conversation_calls_spent_microusd_check CHECK ((spent_microusd >= 0)),
    CONSTRAINT engineering_conversation_calls_status_check CHECK ((status = ANY (ARRAY['INFLIGHT'::text, 'COMPLETED'::text, 'UNKNOWN'::text])))
);


--
-- Name: engineering_direct_verification_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_direct_verification_jobs (
    scope_id text NOT NULL,
    scope_kind text DEFAULT 'personal'::text NOT NULL,
    work_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    candidate_sha text NOT NULL,
    workspace_revision integer NOT NULL,
    status text DEFAULT 'QUEUED'::text NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    last_error text,
    evidence_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    route_run_id uuid,
    CONSTRAINT engineering_direct_verification_jobs_attempt_check CHECK (((attempt >= 0) AND (attempt <= 8))),
    CONSTRAINT engineering_direct_verification_jobs_candidate_sha_check CHECK ((candidate_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT engineering_direct_verification_jobs_check CHECK (((status = 'RUNNING'::text) = ((lease_token IS NOT NULL) AND (lease_until IS NOT NULL)))),
    CONSTRAINT engineering_direct_verification_jobs_evidence_count_check CHECK ((evidence_count >= 0)),
    CONSTRAINT engineering_direct_verification_jobs_last_error_check CHECK (((last_error IS NULL) OR (length(last_error) <= 1000))),
    CONSTRAINT engineering_direct_verification_jobs_scope_kind_check CHECK ((scope_kind = 'personal'::text)),
    CONSTRAINT engineering_direct_verification_jobs_status_check CHECK ((status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'RECOVERY_REQUIRED'::text, 'COMPLETED'::text, 'STALE'::text]))),
    CONSTRAINT engineering_direct_verification_jobs_workspace_revision_check CHECK ((workspace_revision > 0))
);


--
-- Name: engineering_direct_workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_direct_workspaces (
    scope_id text NOT NULL,
    scope_kind text DEFAULT 'personal'::text NOT NULL,
    work_id uuid NOT NULL,
    decision_id uuid NOT NULL,
    route_run_id uuid NOT NULL,
    work_version integer NOT NULL,
    work_generation integer NOT NULL,
    criteria_version integer NOT NULL,
    repository text NOT NULL,
    base_sha text NOT NULL,
    profile_hash text NOT NULL,
    deadline timestamp with time zone NOT NULL,
    source_files jsonb NOT NULL,
    draft_files jsonb NOT NULL,
    plan text DEFAULT ''::text NOT NULL,
    phase text DEFAULT 'DRAFT'::text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    candidates jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    producer text DEFAULT 'NATIVE_SOFIE'::text NOT NULL,
    factory_receipt_id uuid,
    CONSTRAINT engineering_direct_workspaces_base_sha_check CHECK ((base_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT engineering_direct_workspaces_candidates_check CHECK ((jsonb_typeof(candidates) = 'array'::text)),
    CONSTRAINT engineering_direct_workspaces_criteria_version_check CHECK ((criteria_version > 0)),
    CONSTRAINT engineering_direct_workspaces_draft_files_check CHECK ((jsonb_typeof(draft_files) = 'object'::text)),
    CONSTRAINT engineering_direct_workspaces_evidence_check CHECK ((jsonb_typeof(evidence) = 'array'::text)),
    CONSTRAINT engineering_direct_workspaces_phase_check CHECK ((phase = ANY (ARRAY['DRAFT'::text, 'VERIFICATION_REQUESTED'::text, 'VERIFICATION_FAILED'::text, 'VERIFICATION_PASSED'::text]))),
    CONSTRAINT engineering_direct_workspaces_plan_check CHECK ((length(plan) <= 8000)),
    CONSTRAINT engineering_direct_workspaces_producer_check CHECK ((producer = ANY (ARRAY['NATIVE_SOFIE'::text, 'MYFACTORY'::text]))),
    CONSTRAINT engineering_direct_workspaces_profile_hash_check CHECK ((profile_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT engineering_direct_workspaces_revision_check CHECK ((revision > 0)),
    CONSTRAINT engineering_direct_workspaces_scope_kind_check CHECK ((scope_kind = 'personal'::text)),
    CONSTRAINT engineering_direct_workspaces_source_files_check CHECK ((jsonb_typeof(source_files) = 'object'::text)),
    CONSTRAINT engineering_direct_workspaces_work_generation_check CHECK ((work_generation > 0)),
    CONSTRAINT engineering_direct_workspaces_work_version_check CHECK ((work_version > 0)),
    CONSTRAINT engineering_workspace_producer CHECK (((producer = 'MYFACTORY'::text) = (factory_receipt_id IS NOT NULL)))
);


--
-- Name: engineering_execution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_execution (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    revision bigint NOT NULL,
    state jsonb NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    reserved_usd numeric(12,6) DEFAULT 0 NOT NULL,
    model_requests integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_execution_model_requests_check CHECK ((model_requests >= 0)),
    CONSTRAINT engineering_execution_reserved_usd_check CHECK ((reserved_usd >= (0)::numeric)),
    CONSTRAINT engineering_execution_revision_check CHECK ((revision > 0)),
    CONSTRAINT engineering_execution_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['personal'::text, 'organization'::text]))),
    CONSTRAINT engineering_execution_state_check CHECK ((jsonb_typeof(state) = 'object'::text))
);


--
-- Name: engineering_execution_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_execution_history (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    revision bigint NOT NULL,
    kind text NOT NULL,
    actor_id text NOT NULL,
    state jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: engineering_factory_admissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_factory_admissions (
    request_id uuid NOT NULL,
    receipt_id uuid NOT NULL,
    manifest_digest text NOT NULL,
    key_policy jsonb NOT NULL,
    admitted_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT engineering_factory_admissions_key_policy_check CHECK ((jsonb_typeof(key_policy) = 'object'::text)),
    CONSTRAINT engineering_factory_admissions_manifest_digest_check CHECK ((manifest_digest ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: engineering_factory_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_factory_receipts (
    id uuid NOT NULL,
    request_id uuid NOT NULL,
    envelope_digest text NOT NULL,
    envelope text NOT NULL,
    received_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    state text DEFAULT 'RECEIVED'::text NOT NULL,
    history jsonb DEFAULT '[{"state": "RECEIVED"}]'::jsonb NOT NULL,
    provenance jsonb,
    reason text,
    CONSTRAINT engineering_factory_receipts_envelope_check CHECK ((octet_length(envelope) <= 12582912)),
    CONSTRAINT engineering_factory_receipts_envelope_digest_check CHECK ((envelope_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_receipts_state_check CHECK ((state = ANY (ARRAY['RECEIVED'::text, 'AUTHENTICATED'::text, 'ATTESTED'::text, 'INTEGRITY_VERIFIED'::text, 'ADMITTED'::text, 'REJECTED'::text, 'STALE'::text, 'CONFLICT'::text])))
);


--
-- Name: engineering_factory_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_factory_requests (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    actor_id text NOT NULL,
    agent_id text NOT NULL,
    factory_id text NOT NULL,
    operation_id text NOT NULL,
    binding jsonb NOT NULL,
    verified_manifest_digest text,
    current boolean DEFAULT true NOT NULL,
    cancelled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT engineering_factory_requests_binding_check CHECK ((jsonb_typeof(binding) = 'object'::text)),
    CONSTRAINT engineering_factory_requests_operation_id_check CHECK ((operation_id ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_requests_verified_manifest_digest_check CHECK ((verified_manifest_digest ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: engineering_factory_result_conflicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_factory_result_conflicts (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    receipt_id uuid NOT NULL,
    observed_envelope_digest text NOT NULL,
    observed_manifest_digest text NOT NULL,
    reason text NOT NULL,
    observed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT engineering_factory_result_confl_observed_envelope_digest_check CHECK ((observed_envelope_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_result_confl_observed_manifest_digest_check CHECK ((observed_manifest_digest ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: engineering_factory_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_factory_results (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    work_version integer NOT NULL,
    work_generation integer NOT NULL,
    criteria_version integer NOT NULL,
    agent_id text NOT NULL,
    factory_request_id uuid NOT NULL,
    factory_id text NOT NULL,
    factory_source_commit text NOT NULL,
    factory_source_tree text NOT NULL,
    factory_configuration_digest text NOT NULL,
    work_order_id uuid NOT NULL,
    run_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    producer text DEFAULT 'MYFACTORY'::text NOT NULL,
    producer_status text NOT NULL,
    protocol_version integer NOT NULL,
    signing_key_id text NOT NULL,
    signing_key_version text NOT NULL,
    operation_id text NOT NULL,
    manifest_digest text NOT NULL,
    candidate_commit text NOT NULL,
    candidate_tree text NOT NULL,
    evidence_manifest_digest text NOT NULL,
    artifact_manifest_digest text NOT NULL,
    signed_envelope text NOT NULL,
    signed_envelope_digest text NOT NULL,
    producer_issued_at timestamp with time zone,
    producer_completed_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    admission_state text DEFAULT 'RECEIVED'::text NOT NULL,
    reason text,
    trust_status text DEFAULT 'UNASSESSED'::text NOT NULL,
    cryptographically_valid boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT engineering_factory_results_admission_state_check CHECK ((admission_state = ANY (ARRAY['RECEIVED'::text, 'AUTHENTICATED'::text, 'ATTESTED'::text, 'INTEGRITY_VERIFIED'::text, 'ADMITTED'::text, 'REJECTED'::text, 'STALE'::text, 'CONFLICT'::text]))),
    CONSTRAINT engineering_factory_results_artifact_manifest_digest_check CHECK ((artifact_manifest_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_results_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT engineering_factory_results_criteria_version_check CHECK ((criteria_version > 0)),
    CONSTRAINT engineering_factory_results_evidence_manifest_digest_check CHECK ((evidence_manifest_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_results_factory_configuration_digest_check CHECK ((factory_configuration_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_results_manifest_digest_check CHECK ((manifest_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_results_operation_id_check CHECK ((operation_id ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_results_producer_check CHECK ((producer = 'MYFACTORY'::text)),
    CONSTRAINT engineering_factory_results_protocol_version_check CHECK ((protocol_version > 0)),
    CONSTRAINT engineering_factory_results_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['personal'::text, 'organization'::text]))),
    CONSTRAINT engineering_factory_results_signed_envelope_digest_check CHECK ((signed_envelope_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_factory_results_trust_status_check CHECK ((trust_status = ANY (ARRAY['UNASSESSED'::text, 'CURRENT'::text, 'ROTATED'::text, 'REVOKED'::text, 'LEGACY'::text]))),
    CONSTRAINT engineering_factory_results_work_generation_check CHECK ((work_generation > 0)),
    CONSTRAINT engineering_factory_results_work_version_check CHECK ((work_version > 0))
);


--
-- Name: engineering_learning_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_learning_drafts (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text DEFAULT 'personal'::text NOT NULL,
    work_id uuid NOT NULL,
    work_version integer NOT NULL,
    repository text NOT NULL,
    work_shape text NOT NULL,
    feedback_id uuid NOT NULL,
    feedback_claim jsonb NOT NULL,
    candidate jsonb NOT NULL,
    content_hash text NOT NULL,
    status text DEFAULT 'DRAFT_UNVERIFIED'::text NOT NULL,
    trust text DEFAULT 'ADVISORY_ONLY'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_learning_drafts_candidate_check CHECK ((jsonb_typeof(candidate) = 'object'::text)),
    CONSTRAINT engineering_learning_drafts_candidate_check1 CHECK (((candidate ->> 'status'::text) = 'DRAFT'::text)),
    CONSTRAINT engineering_learning_drafts_check CHECK (((candidate ->> 'candidateId'::text) = (id)::text)),
    CONSTRAINT engineering_learning_drafts_check1 CHECK (((candidate ->> 'contentHash'::text) = content_hash)),
    CONSTRAINT engineering_learning_drafts_check10 CHECK (((candidate ->> 'trust'::text) = trust)),
    CONSTRAINT engineering_learning_drafts_check11 CHECK (((feedback_claim ->> 'feedbackId'::text) = (feedback_id)::text)),
    CONSTRAINT engineering_learning_drafts_check12 CHECK (((feedback_claim ->> 'workId'::text) = (work_id)::text)),
    CONSTRAINT engineering_learning_drafts_check13 CHECK ((((feedback_claim ->> 'workVersion'::text))::integer = work_version)),
    CONSTRAINT engineering_learning_drafts_check14 CHECK ((((feedback_claim -> 'scope'::text) ->> 'kind'::text) = scope_kind)),
    CONSTRAINT engineering_learning_drafts_check15 CHECK ((((feedback_claim -> 'scope'::text) ->> 'id'::text) = scope_id)),
    CONSTRAINT engineering_learning_drafts_check16 CHECK (((feedback_claim ->> 'ownerId'::text) = scope_id)),
    CONSTRAINT engineering_learning_drafts_check17 CHECK (((feedback_claim ->> 'repository'::text) = repository)),
    CONSTRAINT engineering_learning_drafts_check18 CHECK (((feedback_claim ->> 'workShape'::text) = work_shape)),
    CONSTRAINT engineering_learning_drafts_check2 CHECK (((candidate ->> 'sourceFeedbackId'::text) = (feedback_id)::text)),
    CONSTRAINT engineering_learning_drafts_check3 CHECK (((candidate ->> 'sourceWorkId'::text) = (work_id)::text)),
    CONSTRAINT engineering_learning_drafts_check4 CHECK ((((candidate ->> 'sourceWorkVersion'::text))::integer = work_version)),
    CONSTRAINT engineering_learning_drafts_check5 CHECK ((((candidate -> 'scope'::text) ->> 'kind'::text) = scope_kind)),
    CONSTRAINT engineering_learning_drafts_check6 CHECK ((((candidate -> 'scope'::text) ->> 'id'::text) = scope_id)),
    CONSTRAINT engineering_learning_drafts_check7 CHECK (((candidate ->> 'ownerId'::text) = scope_id)),
    CONSTRAINT engineering_learning_drafts_check8 CHECK ((((candidate -> 'applicability'::text) ->> 'repository'::text) = repository)),
    CONSTRAINT engineering_learning_drafts_check9 CHECK ((((candidate -> 'applicability'::text) ->> 'workShape'::text) = work_shape)),
    CONSTRAINT engineering_learning_drafts_content_hash_check CHECK ((content_hash ~ '^sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT engineering_learning_drafts_feedback_claim_check CHECK ((jsonb_typeof(feedback_claim) = 'object'::text)),
    CONSTRAINT engineering_learning_drafts_scope_kind_check CHECK ((scope_kind = 'personal'::text)),
    CONSTRAINT engineering_learning_drafts_status_check CHECK ((status = 'DRAFT_UNVERIFIED'::text)),
    CONSTRAINT engineering_learning_drafts_trust_check CHECK ((trust = 'ADVISORY_ONLY'::text)),
    CONSTRAINT engineering_learning_drafts_work_shape_check CHECK (((length(work_shape) >= 1) AND (length(work_shape) <= 80))),
    CONSTRAINT engineering_learning_drafts_work_version_check CHECK ((work_version > 0))
);


--
-- Name: engineering_model_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_model_calls (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    reserved_usd numeric(12,6) NOT NULL,
    state text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_model_calls_state_check CHECK ((state = ANY (ARRAY['RESERVED'::text, 'RETURNED'::text, 'UNKNOWN'::text])))
);


--
-- Name: engineering_native_model_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_native_model_calls (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    step_key text NOT NULL,
    request_hash text NOT NULL,
    model_id text NOT NULL,
    reserved_microusd bigint NOT NULL,
    spent_microusd bigint,
    status text NOT NULL,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT engineering_native_model_calls_check CHECK ((((status = 'COMPLETED'::text) AND (result IS NOT NULL) AND (spent_microusd IS NOT NULL) AND (completed_at IS NOT NULL)) OR (status <> 'COMPLETED'::text))),
    CONSTRAINT engineering_native_model_calls_request_hash_check CHECK ((request_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_native_model_calls_reserved_microusd_check CHECK ((reserved_microusd > 0)),
    CONSTRAINT engineering_native_model_calls_spent_microusd_check CHECK ((spent_microusd >= 0)),
    CONSTRAINT engineering_native_model_calls_status_check CHECK ((status = ANY (ARRAY['INFLIGHT'::text, 'COMPLETED'::text, 'UNKNOWN'::text])))
);


--
-- Name: engineering_native_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_native_results (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    candidate_sha text NOT NULL,
    work_version integer NOT NULL,
    work_generation integer NOT NULL,
    proof jsonb NOT NULL,
    content_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_native_results_candidate_sha_check CHECK ((candidate_sha ~ '^[a-f0-9]{40}$'::text)),
    CONSTRAINT engineering_native_results_content_hash_check CHECK ((content_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_native_results_proof_check CHECK ((jsonb_typeof(proof) = 'object'::text)),
    CONSTRAINT engineering_native_results_work_generation_check CHECK ((work_generation > 0)),
    CONSTRAINT engineering_native_results_work_version_check CHECK ((work_version > 0))
);


--
-- Name: engineering_native_runtime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_native_runtime (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    route_run_id uuid NOT NULL,
    session_id text NOT NULL,
    reserved_microusd bigint DEFAULT 0 NOT NULL,
    spent_microusd bigint DEFAULT 0 NOT NULL,
    calls_started integer DEFAULT 0 NOT NULL,
    inflight boolean DEFAULT false NOT NULL,
    usage_unknown boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_native_runtime_calls_started_check CHECK ((calls_started >= 0)),
    CONSTRAINT engineering_native_runtime_reserved_microusd_check CHECK ((reserved_microusd >= 0)),
    CONSTRAINT engineering_native_runtime_scope_kind_check CHECK ((scope_kind = 'personal'::text)),
    CONSTRAINT engineering_native_runtime_spent_microusd_check CHECK ((spent_microusd >= 0))
);


--
-- Name: engineering_route_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_route_runs (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    route text NOT NULL,
    provider_id text,
    provider_version text,
    status text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    decision_id uuid,
    work_version integer,
    work_generation integer,
    writer_generation bigint NOT NULL,
    factory_request_id uuid,
    dispatch_state text,
    dispatch_identity uuid,
    dispatch_claimed_at timestamp with time zone,
    stop_reason text,
    quiescence jsonb,
    fenced_at timestamp with time zone,
    completion_retired_at timestamp with time zone,
    custody_snapshot jsonb,
    factory_candidate jsonb,
    CONSTRAINT engineering_route_runs_check CHECK (((provider_id IS NULL) = (provider_version IS NULL))),
    CONSTRAINT engineering_route_runs_custody_snapshot_check CHECK (((custody_snapshot IS NULL) OR (jsonb_typeof(custody_snapshot) = 'object'::text))),
    CONSTRAINT engineering_route_runs_dispatch_state_check CHECK ((dispatch_state = ANY (ARRAY['PREPARED'::text, 'UNKNOWN'::text, 'DISPATCHED'::text, 'STOPPING'::text, 'TERMINAL'::text]))),
    CONSTRAINT engineering_route_runs_factory_candidate_check CHECK (((factory_candidate IS NULL) OR (jsonb_typeof(factory_candidate) = 'object'::text))),
    CONSTRAINT engineering_route_runs_quiescence_check CHECK (((quiescence IS NULL) OR (jsonb_typeof(quiescence) = 'object'::text))),
    CONSTRAINT engineering_route_runs_route_check CHECK ((route = ANY (ARRAY['DIRECT'::text, 'DEEP_AGENT'::text, 'EXECUTOR'::text, 'MYFACTORY'::text, 'RELAY'::text, 'HUMAN'::text]))),
    CONSTRAINT engineering_route_runs_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['personal'::text, 'organization'::text]))),
    CONSTRAINT engineering_route_runs_status_check CHECK ((status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'BLOCKED'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text, 'UNKNOWN'::text]))),
    CONSTRAINT engineering_route_runs_work_generation_check CHECK ((work_generation > 0)),
    CONSTRAINT engineering_route_runs_work_version_check CHECK ((work_version > 0)),
    CONSTRAINT engineering_writer_generation_positive CHECK ((writer_generation > 0))
);


--
-- Name: engineering_route_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_route_transitions (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    work_version integer NOT NULL,
    from_route text NOT NULL,
    to_route text NOT NULL,
    reason text NOT NULL,
    trigger text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decision_id uuid,
    context_snapshot_ref text,
    authority_snapshot_ref text,
    CONSTRAINT engineering_route_transitions_from_route_check CHECK ((from_route = ANY (ARRAY['DIRECT'::text, 'DEEP_AGENT'::text, 'EXECUTOR'::text, 'MYFACTORY'::text, 'RELAY'::text, 'HUMAN'::text]))),
    CONSTRAINT engineering_route_transitions_reason_check CHECK (((length(reason) >= 1) AND (length(reason) <= 2000))),
    CONSTRAINT engineering_route_transitions_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['personal'::text, 'organization'::text]))),
    CONSTRAINT engineering_route_transitions_to_route_check CHECK ((to_route = ANY (ARRAY['DIRECT'::text, 'DEEP_AGENT'::text, 'EXECUTOR'::text, 'MYFACTORY'::text, 'RELAY'::text, 'HUMAN'::text]))),
    CONSTRAINT engineering_route_transitions_trigger_check CHECK (((length(trigger) >= 1) AND (length(trigger) <= 160))),
    CONSTRAINT engineering_route_transitions_work_version_check CHECK ((work_version > 0))
);


--
-- Name: engineering_routing_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_routing_decisions (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    work_version integer NOT NULL,
    selected_route text NOT NULL,
    reason text NOT NULL,
    source text NOT NULL,
    profile jsonb NOT NULL,
    eligible_routes jsonb NOT NULL,
    rejected_routes jsonb NOT NULL,
    constraints jsonb NOT NULL,
    provider_id text,
    provider_version text,
    status text DEFAULT 'PROPOSED'::text NOT NULL,
    actor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    admission_reason text,
    admission_policy_id text,
    admission_policy_version integer,
    admission_request jsonb,
    admission_context_snapshot jsonb,
    admission_authority_snapshot jsonb,
    admission_context_hash text,
    admission_authority_hash text,
    admitted_at timestamp with time zone,
    factory_preparation jsonb,
    factory_observation jsonb,
    CONSTRAINT engineering_routing_admission_complete CHECK ((((status = 'PROPOSED'::text) AND (admitted_at IS NULL)) OR ((status = 'ADMITTED'::text) AND (admitted_at IS NOT NULL) AND (admission_reason IS NOT NULL) AND (admission_policy_id IS NOT NULL) AND (admission_policy_version IS NOT NULL) AND (admission_request IS NOT NULL) AND (jsonb_typeof(admission_request) = 'object'::text) AND (admission_context_snapshot IS NOT NULL) AND (jsonb_typeof(admission_context_snapshot) = 'object'::text) AND (admission_authority_snapshot IS NOT NULL) AND (jsonb_typeof(admission_authority_snapshot) = 'object'::text) AND (admission_context_hash ~ '^sha256:[0-9a-f]{64}$'::text) AND (admission_authority_hash ~ '^sha256:[0-9a-f]{64}$'::text) AND (provider_id IS NOT NULL) AND (provider_version IS NOT NULL)))),
    CONSTRAINT engineering_routing_decisions_check CHECK (((provider_id IS NULL) = (provider_version IS NULL))),
    CONSTRAINT engineering_routing_decisions_constraints_check CHECK ((jsonb_typeof(constraints) = 'array'::text)),
    CONSTRAINT engineering_routing_decisions_eligible_routes_check CHECK ((jsonb_typeof(eligible_routes) = 'array'::text)),
    CONSTRAINT engineering_routing_decisions_factory_observation_check CHECK (((factory_observation IS NULL) OR (jsonb_typeof(factory_observation) = 'object'::text))),
    CONSTRAINT engineering_routing_decisions_factory_preparation_check CHECK (((factory_preparation IS NULL) OR (jsonb_typeof(factory_preparation) = 'object'::text))),
    CONSTRAINT engineering_routing_decisions_profile_check CHECK ((jsonb_typeof(profile) = 'object'::text)),
    CONSTRAINT engineering_routing_decisions_reason_check CHECK (((length(reason) >= 1) AND (length(reason) <= 2000))),
    CONSTRAINT engineering_routing_decisions_rejected_routes_check CHECK ((jsonb_typeof(rejected_routes) = 'array'::text)),
    CONSTRAINT engineering_routing_decisions_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['personal'::text, 'organization'::text]))),
    CONSTRAINT engineering_routing_decisions_selected_route_check CHECK ((selected_route = ANY (ARRAY['DIRECT'::text, 'DEEP_AGENT'::text, 'EXECUTOR'::text, 'MYFACTORY'::text, 'RELAY'::text, 'HUMAN'::text]))),
    CONSTRAINT engineering_routing_decisions_source_check CHECK ((source = ANY (ARRAY['RULE'::text, 'SOFIE_RECOMMENDATION'::text, 'OWNER_PREFERENCE'::text, 'POLICY'::text, 'RECOVERY'::text, 'LEARNING_RECOMMENDATION'::text]))),
    CONSTRAINT engineering_routing_decisions_status_check CHECK ((status = ANY (ARRAY['PROPOSED'::text, 'ADMITTED'::text]))),
    CONSTRAINT engineering_routing_decisions_work_version_check CHECK ((work_version > 0))
);


--
-- Name: engineering_work; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_work (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    created_by text NOT NULL,
    title text NOT NULL,
    objective text NOT NULL,
    repository text NOT NULL,
    lifecycle text DEFAULT 'active'::text NOT NULL,
    control text DEFAULT 'paused'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    criteria_version integer DEFAULT 1 NOT NULL,
    max_cost_usd numeric NOT NULL,
    max_duration_seconds integer NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_work_control_check CHECK ((control = ANY (ARRAY['agent'::text, 'human'::text, 'paused'::text, 'stopping'::text]))),
    CONSTRAINT engineering_work_criteria_version_check CHECK ((criteria_version > 0)),
    CONSTRAINT engineering_work_generation_check CHECK ((generation > 0)),
    CONSTRAINT engineering_work_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['active'::text, 'accepted'::text, 'cancelled'::text, 'failed'::text, 'superseded'::text]))),
    CONSTRAINT engineering_work_max_cost_usd_check CHECK (((max_cost_usd > (0)::numeric) AND (max_cost_usd <= (100)::numeric))),
    CONSTRAINT engineering_work_max_duration_seconds_check CHECK (((max_duration_seconds >= 60) AND (max_duration_seconds <= 3600))),
    CONSTRAINT engineering_work_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['personal'::text, 'organization'::text]))),
    CONSTRAINT engineering_work_version_check CHECK ((version > 0))
);


--
-- Name: engineering_work_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_work_criteria (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    version integer NOT NULL,
    items jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_work_criteria_items_check CHECK (((jsonb_typeof(items) = 'array'::text) AND ((jsonb_array_length(items) >= 1) AND (jsonb_array_length(items) <= 20)))),
    CONSTRAINT engineering_work_criteria_version_check1 CHECK ((version > 0))
);


--
-- Name: engineering_work_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_work_events (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    version integer NOT NULL,
    actor_id text NOT NULL,
    kind text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_work_events_version_check CHECK ((version > 0))
);


--
-- Name: engineering_work_knowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_work_knowledge (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    knowledge_id text NOT NULL,
    source_id text NOT NULL,
    provenance_relation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engineering_work_knowledge_provenance_relation_check CHECK ((provenance_relation = ANY (ARRAY['supports'::text, 'confirmed_by'::text]))),
    CONSTRAINT engineering_work_knowledge_scope_kind_check CHECK ((scope_kind = 'personal'::text))
);


--
-- Name: engineering_work_model_budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_work_model_budget (
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    actor_id text NOT NULL,
    agent_id text NOT NULL,
    agent_revision text NOT NULL,
    policy_hash text NOT NULL,
    policy_version integer NOT NULL,
    budget_version integer DEFAULT 1 NOT NULL,
    ceiling_microusd bigint NOT NULL,
    spent_microusd bigint DEFAULT 0 NOT NULL,
    reserved_microusd bigint DEFAULT 0 NOT NULL,
    max_calls integer NOT NULL,
    calls_admitted integer DEFAULT 0 NOT NULL,
    deadline timestamp with time zone NOT NULL,
    status text NOT NULL,
    historical jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT engineering_work_model_budget_ceiling_microusd_check CHECK ((ceiling_microusd > 0)),
    CONSTRAINT engineering_work_model_budget_max_calls_check CHECK ((max_calls > 0)),
    CONSTRAINT engineering_work_model_budget_reserved_microusd_check CHECK ((reserved_microusd >= 0)),
    CONSTRAINT engineering_work_model_budget_scope_kind_check CHECK ((scope_kind = 'personal'::text)),
    CONSTRAINT engineering_work_model_budget_spent_microusd_check CHECK ((spent_microusd >= 0)),
    CONSTRAINT engineering_work_model_budget_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'HISTORICAL_RECONCILIATION'::text, 'OVERAGE'::text, 'REVOKED'::text])))
);


--
-- Name: engineering_work_model_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engineering_work_model_calls (
    id uuid NOT NULL,
    scope_id text NOT NULL,
    scope_kind text NOT NULL,
    work_id uuid NOT NULL,
    actor_id text NOT NULL,
    agent_id text NOT NULL,
    agent_revision text NOT NULL,
    work_version integer NOT NULL,
    work_generation integer NOT NULL,
    session_id text NOT NULL,
    step_key text NOT NULL,
    request_hash text NOT NULL,
    purpose text NOT NULL,
    route_run_id uuid,
    provider text NOT NULL,
    model_id text NOT NULL,
    policy_hash text NOT NULL,
    policy_version integer NOT NULL,
    budget_version integer NOT NULL,
    reserved_microusd bigint NOT NULL,
    spent_microusd bigint,
    pricing jsonb NOT NULL,
    bounds jsonb NOT NULL,
    status text NOT NULL,
    dispatch_token uuid NOT NULL,
    result jsonb,
    result_hash text,
    usage_receipt jsonb,
    usage_semantics text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    dispatch_at timestamp with time zone,
    result_at timestamp with time zone,
    reconciled_at timestamp with time zone,
    reconciliation_note text,
    CONSTRAINT engineering_work_model_calls_check CHECK (((purpose = 'NATIVE_EXECUTION'::text) = (route_run_id IS NOT NULL))),
    CONSTRAINT engineering_work_model_calls_check1 CHECK (((status <> ALL (ARRAY['RESULT_RETAINED'::text, 'RECONCILED'::text])) OR ((result IS NOT NULL) AND (result_hash IS NOT NULL)))),
    CONSTRAINT engineering_work_model_calls_check2 CHECK (((status <> 'RECONCILED'::text) OR ((spent_microusd IS NOT NULL) AND (usage_receipt IS NOT NULL)))),
    CONSTRAINT engineering_work_model_calls_purpose_check CHECK ((purpose = ANY (ARRAY['CONVERSATION_REASONING'::text, 'NATIVE_EXECUTION'::text, 'VERIFICATION_MODEL'::text]))),
    CONSTRAINT engineering_work_model_calls_request_hash_check CHECK ((request_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT engineering_work_model_calls_reserved_microusd_check CHECK ((reserved_microusd > 0)),
    CONSTRAINT engineering_work_model_calls_spent_microusd_check CHECK ((spent_microusd >= 0)),
    CONSTRAINT engineering_work_model_calls_status_check CHECK ((status = ANY (ARRAY['RESERVED'::text, 'DISPATCHED'::text, 'RESULT_RETAINED'::text, 'RECONCILED'::text, 'USAGE_UNKNOWN'::text, 'FAILED_BEFORE_DISPATCH'::text]))),
    CONSTRAINT engineering_work_model_calls_usage_semantics_check CHECK ((usage_semantics = ANY (ARRAY['INCREMENTAL'::text, 'UNKNOWN'::text])))
);


--
-- Name: eve_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eve_events (
    id text NOT NULL,
    owner_id text NOT NULL,
    type text NOT NULL,
    source_type text NOT NULL,
    source_id text,
    goal_id text,
    goal_task_id text,
    run_id text,
    severity text DEFAULT 'info'::text NOT NULL,
    summary text NOT NULL,
    rationale jsonb DEFAULT '[]'::jsonb NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    idempotency_key text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_classification text DEFAULT 'activity'::text NOT NULL,
    CONSTRAINT eve_events_delivery_classification_check CHECK ((delivery_classification = ANY (ARRAY['silent'::text, 'activity'::text, 'digest'::text, 'push'::text, 'urgent'::text]))),
    CONSTRAINT eve_events_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'attention'::text, 'warning'::text, 'critical'::text])))
);


--
-- Name: execution_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_attempts (
    owner_id text NOT NULL,
    occurrence_id text NOT NULL,
    attempt_number integer NOT NULL,
    claim_version bigint NOT NULL,
    worker_id text NOT NULL,
    status text NOT NULL,
    failure_category text,
    retry_decision text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    cost_status text DEFAULT 'unknown'::text NOT NULL,
    cost_usd numeric(12,6),
    CONSTRAINT execution_attempts_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT execution_attempts_check CHECK (((cost_status = 'unknown'::text) = (cost_usd IS NULL))),
    CONSTRAINT execution_attempts_cost_status_check CHECK ((cost_status = ANY (ARRAY['known'::text, 'estimated'::text, 'unknown'::text]))),
    CONSTRAINT execution_attempts_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT execution_attempts_retry_decision_check CHECK ((retry_decision = ANY (ARRAY['retry'::text, 'stop'::text, 'recovery_required'::text, 'wait'::text]))),
    CONSTRAINT execution_attempts_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'interrupted'::text, 'waiting'::text, 'cancelled'::text])))
);


--
-- Name: execution_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_occurrences (
    id text NOT NULL,
    owner_id text NOT NULL,
    routine_id text NOT NULL,
    routine_version integer NOT NULL,
    occurrence_key text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    run_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    claim_version bigint DEFAULT 0 NOT NULL,
    claimed_by text,
    claimed_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    lease_expires_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_category text,
    completed_at timestamp with time zone,
    cost_status text DEFAULT 'unknown'::text NOT NULL,
    cost_usd numeric(12,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    runtime_session_id text,
    admission jsonb,
    preflight jsonb,
    CONSTRAINT execution_occurrences_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT execution_occurrences_check CHECK (((status = 'running'::text) = (claimed_by IS NOT NULL))),
    CONSTRAINT execution_occurrences_check1 CHECK (((status = 'running'::text) = (lease_expires_at IS NOT NULL))),
    CONSTRAINT execution_occurrences_check2 CHECK (((cost_status = 'unknown'::text) = (cost_usd IS NULL))),
    CONSTRAINT execution_occurrences_cost_status_check CHECK ((cost_status = ANY (ARRAY['known'::text, 'estimated'::text, 'unknown'::text]))),
    CONSTRAINT execution_occurrences_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT execution_occurrences_run_required CHECK (((run_id IS NOT NULL) OR (status = 'blocked_precheck'::text))),
    CONSTRAINT execution_occurrences_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'waiting'::text, 'retrying'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'recovery_required'::text, 'blocked_precheck'::text])))
);


--
-- Name: execution_routine_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_routine_versions (
    owner_id text NOT NULL,
    routine_id text NOT NULL,
    version integer NOT NULL,
    configuration jsonb NOT NULL,
    changed_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    review_binding jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT execution_routine_versions_version_check CHECK ((version > 0))
);


--
-- Name: execution_routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_routines (
    id text NOT NULL,
    owner_id text NOT NULL,
    source_kind text NOT NULL,
    source_id text NOT NULL,
    name text NOT NULL,
    agent_id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    configuration jsonb NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    failure_threshold integer DEFAULT 3 NOT NULL,
    last_failure text,
    last_success_at timestamp with time zone,
    paused_at timestamp with time zone,
    pause_sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT execution_routines_consecutive_failures_check CHECK ((consecutive_failures >= 0)),
    CONSTRAINT execution_routines_failure_threshold_check CHECK (((failure_threshold >= 1) AND (failure_threshold <= 10))),
    CONSTRAINT execution_routines_source_kind_check CHECK ((source_kind = ANY (ARRAY['reminder'::text, 'review'::text, 'webhook'::text, 'manual'::text]))),
    CONSTRAINT execution_routines_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'auto_paused'::text, 'disabled'::text, 'archived'::text]))),
    CONSTRAINT execution_routines_version_check CHECK ((version > 0))
);


--
-- Name: goal_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_milestones (
    id text NOT NULL,
    goal_id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    target_date date,
    completed_at timestamp with time zone,
    "position" integer DEFAULT 0 NOT NULL,
    success_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_milestones_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text]))),
    CONSTRAINT goal_milestones_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
);


--
-- Name: goal_outcome_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_outcome_evidence (
    owner_id text NOT NULL,
    goal_id text NOT NULL,
    generation integer NOT NULL,
    criterion text NOT NULL,
    reference text NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_outcome_evidence_source_check CHECK ((source = ANY (ARRAY['result'::text, 'owner'::text])))
);


--
-- Name: goal_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_plans (
    id text NOT NULL,
    goal_id text NOT NULL,
    version integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    summary text NOT NULL,
    strategy text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded_at timestamp with time zone,
    CONSTRAINT goal_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text]))),
    CONSTRAINT goal_plans_version_check CHECK ((version > 0))
);


--
-- Name: goal_task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_task_dependencies (
    task_id text NOT NULL,
    depends_on_task_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_task_dependencies_check CHECK ((task_id <> depends_on_task_id))
);


--
-- Name: goal_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_tasks (
    id text NOT NULL,
    goal_id text NOT NULL,
    milestone_id text,
    parent_task_id text,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    due_at timestamp with time zone,
    assigned_to text,
    required_capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    success_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    estimated_effort_minutes integer,
    estimated_cost_usd numeric(10,4),
    "position" integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    paused boolean DEFAULT false NOT NULL,
    blocker text,
    next_action text,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT goal_tasks_estimated_cost_usd_check CHECK (((estimated_cost_usd IS NULL) OR (estimated_cost_usd >= (0)::numeric))),
    CONSTRAINT goal_tasks_estimated_effort_minutes_check CHECK (((estimated_effort_minutes IS NULL) OR (estimated_effort_minutes > 0))),
    CONSTRAINT goal_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT goal_tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'ready'::text, 'in_progress'::text, 'waiting'::text, 'blocked'::text, 'verification'::text, 'completed'::text, 'cancelled'::text, 'failed'::text]))),
    CONSTRAINT goal_tasks_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 240))),
    CONSTRAINT goal_work_positive_generation CHECK ((generation > 0))
);


--
-- Name: goal_thread_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_thread_links (
    goal_id text NOT NULL,
    owner_id text NOT NULL,
    thread_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: goal_work_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_work_dependencies (
    owner_id text NOT NULL,
    goal_id text NOT NULL,
    task_id text NOT NULL,
    id text NOT NULL,
    kind text NOT NULL,
    reference text NOT NULL,
    label text NOT NULL,
    not_before timestamp with time zone,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    resolved_at timestamp with time zone,
    evidence_ref text,
    decision_option text,
    CONSTRAINT goal_work_dependencies_kind_check CHECK ((kind = ANY (ARRAY['task'::text, 'external'::text, 'owner'::text, 'schedule'::text, 'file'::text, 'capability'::text, 'work'::text])))
);


--
-- Name: goal_work_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_work_links (
    owner_id text NOT NULL,
    goal_id text NOT NULL,
    task_id text NOT NULL,
    goal_generation integer NOT NULL,
    task_generation integer NOT NULL,
    correlation_key text NOT NULL,
    request jsonb NOT NULL,
    state text NOT NULL,
    work_id text,
    work_state text,
    result_id text,
    result jsonb,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_work_links_state_check CHECK ((state = ANY (ARRAY['prepared'::text, 'linked'::text, 'denied'::text, 'result'::text, 'superseded'::text])))
);


--
-- Name: goal_work_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_work_signals (
    owner_id text NOT NULL,
    event_id text NOT NULL,
    payload jsonb NOT NULL
);


--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id text NOT NULL,
    owner_id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    motivation text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    planning_mode text DEFAULT 'simple'::text NOT NULL,
    success_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_date date,
    source text DEFAULT 'chat'::text NOT NULL,
    source_reference text,
    workspace_id text,
    idempotency_key text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    requires_owner_confirmation boolean DEFAULT false NOT NULL,
    confirmed_generation integer,
    confirmation_ref text,
    revision integer DEFAULT 1 NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    CONSTRAINT goal_work_positive_versions CHECK (((generation > 0) AND (revision > 0))),
    CONSTRAINT goals_planning_mode_check CHECK ((planning_mode = ANY (ARRAY['instant'::text, 'simple'::text, 'structured'::text, 'complex'::text]))),
    CONSTRAINT goals_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT goals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'blocked'::text, 'waiting'::text, 'completed'::text, 'abandoned'::text, 'archived'::text]))),
    CONSTRAINT goals_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
);


--
-- Name: inbox_attention_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_attention_evidence (
    owner_id text NOT NULL,
    id text NOT NULL,
    item_id text NOT NULL,
    data jsonb NOT NULL,
    system text GENERATED ALWAYS AS ((data #>> '{event,source,system}'::text[])) STORED NOT NULL,
    account_id text GENERATED ALWAYS AS ((data #>> '{event,source,accountId}'::text[])) STORED NOT NULL,
    event_id text GENERATED ALWAYS AS ((data #>> '{event,source,eventId}'::text[])) STORED NOT NULL,
    CONSTRAINT inbox_attention_evidence_check CHECK (((NOT ((data ->> 'ownerId'::text) IS DISTINCT FROM owner_id)) AND (NOT ((data ->> 'id'::text) IS DISTINCT FROM id)) AND (NOT ((data ->> 'itemId'::text) IS DISTINCT FROM item_id)))),
    CONSTRAINT inbox_attention_evidence_data_check CHECK ((((data ->> 'digest'::text) ~ '^[0-9a-f]{64}$'::text) AND (((data ->> 'deliveries'::text))::bigint > 0)))
);

ALTER TABLE ONLY public.inbox_attention_evidence FORCE ROW LEVEL SECURITY;


--
-- Name: inbox_attention_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_attention_items (
    owner_id text NOT NULL,
    id text NOT NULL,
    data jsonb NOT NULL,
    status text GENERATED ALWAYS AS ((data ->> 'status'::text)) STORED NOT NULL,
    kind text GENERATED ALWAYS AS ((data ->> 'kind'::text)) STORED NOT NULL,
    needs_action integer GENERATED ALWAYS AS (
CASE
    WHEN (((data ->> 'status'::text) = 'NEEDS_ACTION'::text) AND ((data #>> '{action,involvement}'::text[]) = 'NECESSARY_JUDGMENT'::text) AND ((data #>> '{action,reason}'::text[]) <> 'internal_coordination'::text)) THEN 1
    ELSE 0
END) STORED,
    expires_at text GENERATED ALWAYS AS ((data #>> '{action,expiresAt}'::text[])) STORED,
    score integer GENERATED ALWAYS AS (((data ->> 'priorityScore'::text))::integer) STORED NOT NULL,
    deadline text GENERATED ALWAYS AS (COALESCE((data #>> '{priority,deadlineAt}'::text[]), '9999'::text)) STORED NOT NULL,
    CONSTRAINT inbox_attention_items_check CHECK (((NOT ((data ->> 'ownerId'::text) IS DISTINCT FROM owner_id)) AND (NOT ((data ->> 'id'::text) IS DISTINCT FROM id)))),
    CONSTRAINT inbox_attention_items_check1 CHECK (((status <> 'NEEDS_ACTION'::text) OR (((data -> 'action'::text) <> 'null'::jsonb) AND ((data ->> 'actionBinding'::text) ~ '^[0-9a-f]{64}$'::text)))),
    CONSTRAINT inbox_attention_items_check2 CHECK (((status <> 'RESOLVED'::text) OR (((data ->> 'resolvedAt'::text))::timestamp with time zone IS NOT NULL))),
    CONSTRAINT inbox_attention_items_check3 CHECK (((status <> 'SUPERSEDED'::text) OR (((data ->> 'supersededAt'::text))::timestamp with time zone IS NOT NULL))),
    CONSTRAINT inbox_attention_items_data_check CHECK (((jsonb_typeof(data) = 'object'::text) AND (NOT ((data ->> 'version'::text) IS DISTINCT FROM 'myeve.attention.v1'::text)))),
    CONSTRAINT inbox_attention_items_data_check1 CHECK (((((data ->> 'revision'::text))::bigint > 0) AND (((data ->> 'episode'::text))::integer > 0))),
    CONSTRAINT inbox_attention_items_data_check2 CHECK ((data ?& ARRAY['correlationId'::text, 'workId'::text, 'workGeneration'::text, 'workVersion'::text, 'source'::text, 'createdAt'::text, 'updatedAt'::text, 'action'::text, 'actionBinding'::text])),
    CONSTRAINT inbox_attention_items_data_check3 CHECK ((((data -> 'workGeneration'::text) = 'null'::jsonb) OR ((data -> 'workId'::text) <> 'null'::jsonb))),
    CONSTRAINT inbox_attention_items_data_check4 CHECK (((((data ->> 'createdAt'::text))::timestamp with time zone IS NOT NULL) AND (((data ->> 'updatedAt'::text))::timestamp with time zone IS NOT NULL))),
    CONSTRAINT inbox_attention_items_kind_check CHECK ((kind = ANY (ARRAY['MESSAGE'::text, 'REQUEST'::text, 'DECISION'::text, 'APPROVAL'::text, 'BLOCKER'::text, 'FOLLOW_UP'::text, 'REMINDER'::text, 'RESULT'::text, 'EXCEPTION'::text]))),
    CONSTRAINT inbox_attention_items_status_check CHECK ((status = ANY (ARRAY['NEW'::text, 'SEEN'::text, 'NEEDS_ACTION'::text, 'WAITING'::text, 'RESOLVED'::text, 'DISMISSED'::text, 'SUPERSEDED'::text])))
);

ALTER TABLE ONLY public.inbox_attention_items FORCE ROW LEVEL SECURITY;


--
-- Name: inbox_attention_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_attention_responses (
    owner_id text NOT NULL,
    id text NOT NULL,
    item_id text NOT NULL,
    data jsonb NOT NULL,
    status text GENERATED ALWAYS AS ((data ->> 'status'::text)) STORED NOT NULL,
    CONSTRAINT inbox_attention_responses_check CHECK (((NOT ((data ->> 'ownerId'::text) IS DISTINCT FROM owner_id)) AND (NOT ((data ->> 'id'::text) IS DISTINCT FROM id)) AND (NOT ((data ->> 'itemId'::text) IS DISTINCT FROM item_id)))),
    CONSTRAINT inbox_attention_responses_data_check CHECK ((data ?& ARRAY['workId'::text, 'workGeneration'::text, 'workVersion'::text, 'correlationId'::text, 'episode'::text, 'goal'::text, 'actionBinding'::text, 'answer'::text, 'createdAt'::text])),
    CONSTRAINT inbox_attention_responses_data_check1 CHECK (((data ->> 'actionBinding'::text) ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT inbox_attention_responses_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'DELIVERED'::text, 'CANCELLED'::text, 'STALE'::text])))
);

ALTER TABLE ONLY public.inbox_attention_responses FORCE ROW LEVEL SECURITY;


--
-- Name: knowledge_provenance_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_provenance_links (
    id text NOT NULL,
    owner_id text NOT NULL,
    knowledge_id text NOT NULL,
    source_id text NOT NULL,
    relation text NOT NULL,
    confidence numeric(4,3) DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_provenance_links_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT knowledge_provenance_links_relation_check CHECK ((relation = ANY (ARRAY['supports'::text, 'contradicts'::text, 'derived_from'::text, 'mentioned_in'::text, 'confirmed_by'::text])))
);


--
-- Name: knowledge_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_records (
    id text NOT NULL,
    owner_id text NOT NULL,
    kind text NOT NULL,
    title text,
    statement text NOT NULL,
    confidence numeric(4,3) DEFAULT 1 NOT NULL,
    status text NOT NULL,
    occurrence_count integer,
    first_seen_at timestamp with time zone,
    last_confirmed_at timestamp with time zone,
    first_observed_at timestamp with time zone,
    last_observed_at timestamp with time zone,
    test_description text,
    decision_trigger text,
    rationale text,
    alternatives jsonb DEFAULT '[]'::jsonb NOT NULL,
    decided_at timestamp with time zone,
    reopen_condition text,
    subject text,
    due_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    preference_key text,
    preference_value jsonb,
    preference_scope text,
    preference_source_type text,
    preference_source_id text,
    active boolean,
    review_at timestamp with time zone,
    expires_at timestamp with time zone,
    generated_at timestamp with time zone,
    created_by_type text NOT NULL,
    created_by_id text,
    goal_id text,
    project_ref text,
    supersedes_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_records_check CHECK (((supersedes_id IS NULL) OR (supersedes_id <> id))),
    CONSTRAINT knowledge_records_check1 CHECK ((((kind = 'fact'::text) AND (status = ANY (ARRAY['active'::text, 'stale'::text, 'superseded'::text, 'contradicted'::text]))) OR ((kind = 'observation'::text) AND (status = ANY (ARRAY['active'::text, 'dismissed'::text, 'promoted'::text, 'stale'::text, 'contradicted'::text]))) OR ((kind = 'hypothesis'::text) AND (status = ANY (ARRAY['open'::text, 'supported'::text, 'rejected'::text, 'inconclusive'::text, 'promoted'::text]))) OR ((kind = 'decision'::text) AND (status = ANY (ARRAY['active'::text, 'superseded'::text, 'reopened'::text, 'reversed'::text]))) OR ((kind = 'commitment'::text) AND (status = ANY (ARRAY['open'::text, 'fulfilled'::text, 'missed'::text, 'cancelled'::text, 'superseded'::text]))) OR ((kind = 'preference'::text) AND (status = ANY (ARRAY['active'::text, 'inactive'::text, 'superseded'::text, 'expired'::text]))) OR ((kind = 'insight'::text) AND (status = ANY (ARRAY['active'::text, 'stale'::text, 'superseded'::text, 'contradicted'::text]))))),
    CONSTRAINT knowledge_records_check2 CHECK (((kind <> 'observation'::text) OR (occurrence_count IS NOT NULL))),
    CONSTRAINT knowledge_records_check3 CHECK (((kind <> 'decision'::text) OR ((title IS NOT NULL) AND (decided_at IS NOT NULL)))),
    CONSTRAINT knowledge_records_check4 CHECK (((kind <> 'commitment'::text) OR (subject IS NOT NULL))),
    CONSTRAINT knowledge_records_check5 CHECK (((kind <> 'preference'::text) OR ((preference_key IS NOT NULL) AND (preference_value IS NOT NULL) AND (preference_scope IS NOT NULL) AND (preference_source_type IS NOT NULL) AND (active IS NOT NULL)))),
    CONSTRAINT knowledge_records_check6 CHECK (((kind <> 'insight'::text) OR (generated_at IS NOT NULL))),
    CONSTRAINT knowledge_records_check7 CHECK (((created_by_type = 'agent'::text) = (created_by_id IS NOT NULL))),
    CONSTRAINT knowledge_records_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT knowledge_records_created_by_type_check CHECK ((created_by_type = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text, 'import'::text]))),
    CONSTRAINT knowledge_records_kind_check CHECK ((kind = ANY (ARRAY['fact'::text, 'observation'::text, 'hypothesis'::text, 'decision'::text, 'commitment'::text, 'preference'::text, 'insight'::text]))),
    CONSTRAINT knowledge_records_occurrence_count_check CHECK (((occurrence_count IS NULL) OR (occurrence_count > 0))),
    CONSTRAINT knowledge_records_preference_source_type_check CHECK (((preference_source_type IS NULL) OR (preference_source_type = ANY (ARRAY['explicit_user'::text, 'approved_observation'::text, 'system_default'::text])))),
    CONSTRAINT knowledge_records_statement_check CHECK (((char_length(statement) >= 1) AND (char_length(statement) <= 20000)))
);


--
-- Name: knowledge_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_relationships (
    id text NOT NULL,
    owner_id text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    predicate text NOT NULL,
    object_type text NOT NULL,
    object_id text NOT NULL,
    confidence numeric(4,3) DEFAULT 1 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_relationships_check CHECK (((subject_type <> object_type) OR (subject_id <> object_id))),
    CONSTRAINT knowledge_relationships_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT knowledge_relationships_object_type_check CHECK ((object_type = ANY (ARRAY['source'::text, 'fact'::text, 'observation'::text, 'hypothesis'::text, 'decision'::text, 'commitment'::text, 'preference'::text, 'insight'::text, 'goal'::text, 'agent'::text, 'project'::text, 'person'::text, 'organization'::text]))),
    CONSTRAINT knowledge_relationships_predicate_check CHECK ((predicate ~ '^[a-z][a-z0-9_]{0,63}$'::text)),
    CONSTRAINT knowledge_relationships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'stale'::text, 'superseded'::text, 'contradicted'::text]))),
    CONSTRAINT knowledge_relationships_subject_type_check CHECK ((subject_type = ANY (ARRAY['source'::text, 'fact'::text, 'observation'::text, 'hypothesis'::text, 'decision'::text, 'commitment'::text, 'preference'::text, 'insight'::text, 'goal'::text, 'agent'::text, 'project'::text, 'person'::text, 'organization'::text])))
);


--
-- Name: knowledge_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_sources (
    id text NOT NULL,
    owner_id text NOT NULL,
    source_type text NOT NULL,
    provider text,
    external_id text,
    reference_uri text,
    author text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    content_hash text,
    snapshot_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_sources_check CHECK (((reference_uri IS NOT NULL) OR (external_id IS NOT NULL) OR (snapshot_ref IS NOT NULL) OR (source_type = 'manual'::text))),
    CONSTRAINT knowledge_sources_source_type_check CHECK ((source_type = ANY (ARRAY['chat'::text, 'email'::text, 'slack'::text, 'telegram'::text, 'calendar'::text, 'file'::text, 'web'::text, 'run'::text, 'manual'::text])))
);


--
-- Name: memory_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_records (
    id text NOT NULL,
    owner_id text NOT NULL,
    scope_type text NOT NULL,
    scope_id text NOT NULL,
    content text NOT NULL,
    provider text DEFAULT 'supermemory'::text NOT NULL,
    provider_id text,
    source_type text DEFAULT 'explicit'::text NOT NULL,
    source_id text,
    confidence numeric(4,3) DEFAULT 1 NOT NULL,
    permanent boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_confirmed_at timestamp with time zone,
    CONSTRAINT memory_records_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT memory_records_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 4000))),
    CONSTRAINT memory_records_scope_type_check CHECK ((scope_type = ANY (ARRAY['owner'::text, 'agent'::text, 'goal'::text, 'project'::text, 'task'::text]))),
    CONSTRAINT memory_records_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'deleted'::text])))
);


--
-- Name: memory_scope_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_scope_migrations (
    owner_id text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_peer_action_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_peer_action_bindings (
    owner_id text NOT NULL,
    run_id text NOT NULL,
    action_key text NOT NULL,
    permission_id text NOT NULL,
    permission_revision integer NOT NULL,
    request_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_peer_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_peer_permissions (
    id text NOT NULL,
    owner_id text NOT NULL,
    local_agent_id text NOT NULL,
    relay_origin text NOT NULL,
    local_relay_account_id text NOT NULL,
    local_relay_agent_id text NOT NULL,
    peer_account_id text NOT NULL,
    peer_agent_id text NOT NULL,
    display_name text NOT NULL,
    policies jsonb NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revision integer DEFAULT 1 NOT NULL,
    mutation_id text NOT NULL,
    mutation_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_peer_permissions_policies_check CHECK ((jsonb_typeof(policies) = 'array'::text)),
    CONSTRAINT myeve_peer_permissions_revision_check CHECK ((revision > 0))
);


--
-- Name: myeve_relay_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_activity (
    id text NOT NULL,
    owner_id text NOT NULL,
    request_id text,
    kind text NOT NULL,
    metadata jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_artifacts (
    id text NOT NULL,
    owner_id text NOT NULL,
    request_id text,
    content_encrypted text NOT NULL,
    metadata jsonb NOT NULL,
    audience text NOT NULL,
    audience_public_key text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_connections (
    owner_id text NOT NULL,
    local_agent_id text NOT NULL,
    relay_owner_id text NOT NULL,
    relay_agent_id text NOT NULL,
    address text NOT NULL,
    issuer text NOT NULL,
    signing_key_id text NOT NULL,
    signing_public_key text NOT NULL,
    agent_credential_encrypted text NOT NULL,
    owner_session_encrypted text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    local_work_policy jsonb DEFAULT '{"analysis": "approval", "research": "approval", "summarization": "approval", "artifact_generation": "approval"}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_relay_connections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'revoked'::text])))
);


--
-- Name: myeve_relay_external_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_external_context (
    owner_id text NOT NULL,
    request_id text NOT NULL,
    source_owner_id text NOT NULL,
    source_agent_id text NOT NULL,
    publication_id text,
    publication_version integer,
    context_encrypted text NOT NULL,
    retrieved_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: myeve_relay_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_grants (
    id text NOT NULL,
    owner_id text NOT NULL,
    document jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_relay_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: myeve_relay_message_delegations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_message_delegations (
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    grantee_owner_id text NOT NULL,
    grantee_agent_id text NOT NULL,
    relay_delegation_id text NOT NULL,
    credential_encrypted text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_peers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_peers (
    owner_id text NOT NULL,
    address text NOT NULL,
    artifact_origin text NOT NULL,
    artifact_public_key text NOT NULL
);


--
-- Name: myeve_relay_projection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_projection (
    owner_id text NOT NULL,
    publication_id text NOT NULL,
    reference text NOT NULL,
    revision text NOT NULL,
    record jsonb NOT NULL
);


--
-- Name: myeve_relay_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_publications (
    id text NOT NULL,
    owner_id text NOT NULL,
    relay_view_id text,
    version integer DEFAULT 0 NOT NULL,
    name text NOT NULL,
    visibility text DEFAULT 'PRIVATE'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    audience jsonb DEFAULT '[]'::jsonb NOT NULL,
    preview_hash text NOT NULL,
    preview_expires_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    document jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_relay_publications_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'revoked'::text, 'sync_required'::text]))),
    CONSTRAINT myeve_relay_publications_visibility_check CHECK ((visibility = ANY (ARRAY['PRIVATE'::text, 'SHARED'::text, 'UNLISTED'::text, 'PUBLIC'::text])))
);


--
-- Name: myeve_relay_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_receipts (
    id text NOT NULL,
    owner_id text NOT NULL,
    relay_account_id text NOT NULL,
    sequence bigint NOT NULL,
    record jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_reply_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_reply_claims (
    owner_id text NOT NULL,
    parent_request_id text NOT NULL,
    reply_request_id text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_requests (
    owner_id text NOT NULL,
    request_id text NOT NULL,
    direction text NOT NULL,
    capability text NOT NULL,
    conversation_id text,
    sender_owner_id text NOT NULL,
    sender_agent_id text NOT NULL,
    envelope_hash text NOT NULL,
    envelope_encrypted text,
    result_encrypted text,
    state text DEFAULT 'incoming'::text NOT NULL,
    local_run_id text,
    local_decision text,
    relay_acknowledged boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_relay_requests_direction_check CHECK ((direction = ANY (ARRAY['incoming'::text, 'outgoing'::text]))),
    CONSTRAINT myeve_relay_requests_state_check CHECK ((state = ANY (ARRAY['incoming'::text, 'processing'::text, 'needs_approval'::text, 'accepted'::text, 'completed'::text, 'denied'::text, 'expired'::text, 'recovery_required'::text])))
);


--
-- Name: outcome_evidence_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outcome_evidence_links (
    outcome_id text NOT NULL,
    evidence_type text NOT NULL,
    evidence_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outcome_evidence_links_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['event'::text, 'task_artifact'::text])))
);


--
-- Name: outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outcomes (
    id text NOT NULL,
    owner_id text NOT NULL,
    goal_id text,
    goal_task_id text,
    run_id text,
    status text DEFAULT 'unknown'::text NOT NULL,
    owner_feedback text DEFAULT 'unknown'::text NOT NULL,
    summary text NOT NULL,
    rationale jsonb DEFAULT '[]'::jsonb NOT NULL,
    idempotency_key text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outcomes_owner_feedback_check CHECK ((owner_feedback = ANY (ARRAY['helpful'::text, 'neutral'::text, 'unhelpful'::text, 'unknown'::text]))),
    CONSTRAINT outcomes_status_check CHECK ((status = ANY (ARRAY['successful'::text, 'partially_successful'::text, 'blocked'::text, 'failed'::text, 'abandoned'::text, 'ineffective'::text, 'unknown'::text]))),
    CONSTRAINT outcomes_summary_check CHECK (((char_length(summary) >= 1) AND (char_length(summary) <= 1000)))
);


--
-- Name: owner_channel_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_channel_commands (
    command_id text NOT NULL,
    relay_account_id text NOT NULL,
    request_id text NOT NULL,
    owner_id text NOT NULL,
    payload_hash text NOT NULL,
    operation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT owner_channel_commands_operation_check CHECK ((operation = ANY (ARRAY['start'::text, 'status'::text, 'approval'::text, 'recovery'::text, 'cancel'::text])))
);


--
-- Name: owner_channel_nonces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_channel_nonces (
    nonce text NOT NULL,
    relay_account_id text NOT NULL,
    owner_id text NOT NULL,
    environment text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: owner_channel_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_channel_requests (
    relay_account_id text NOT NULL,
    request_id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    source_identity text NOT NULL,
    relay_thread_id text NOT NULL,
    work_hash text NOT NULL,
    run_id text NOT NULL,
    request jsonb NOT NULL,
    admitted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    dispatch_id uuid,
    dispatched_at timestamp with time zone,
    last_observed_at timestamp with time zone,
    cancel_acknowledged_at timestamp with time zone,
    budget_resumed_at timestamp with time zone,
    remaining_runtime_ms integer,
    session_id text,
    turn_id text,
    tokens_used integer DEFAULT 0 NOT NULL,
    usage_unknown boolean DEFAULT false NOT NULL,
    actions_started integer DEFAULT 0 NOT NULL,
    model_reserved_microusd bigint DEFAULT 0 NOT NULL,
    model_spent_microusd bigint DEFAULT 0 NOT NULL,
    tokens_reserved integer DEFAULT 0 NOT NULL,
    model_calls_started integer DEFAULT 0 NOT NULL,
    tools_requested integer DEFAULT 0 NOT NULL,
    CONSTRAINT owner_channel_requests_actions_started_check CHECK (((actions_started >= 0) AND (actions_started <= 12))),
    CONSTRAINT owner_channel_requests_model_calls_started_check CHECK ((model_calls_started >= 0)),
    CONSTRAINT owner_channel_requests_model_reserved_microusd_check CHECK ((model_reserved_microusd >= 0)),
    CONSTRAINT owner_channel_requests_model_spent_microusd_check CHECK ((model_spent_microusd >= 0)),
    CONSTRAINT owner_channel_requests_remaining_runtime_ms_check CHECK (((remaining_runtime_ms >= 0) AND (remaining_runtime_ms <= 60000))),
    CONSTRAINT owner_channel_requests_tokens_reserved_check CHECK ((tokens_reserved >= 0)),
    CONSTRAINT owner_channel_requests_tokens_used_check CHECK ((tokens_used >= 0)),
    CONSTRAINT owner_channel_requests_tools_requested_check CHECK (((tools_requested >= 0) AND (tools_requested <= 12)))
);


--
-- Name: owner_data_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_data_operations (
    id text NOT NULL,
    owner_id text NOT NULL,
    operation_type text NOT NULL,
    status text NOT NULL,
    archive_version integer,
    record_count integer,
    domain_counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    checksum text,
    error_summary text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT owner_data_operations_operation_type_check CHECK ((operation_type = ANY (ARRAY['export_started'::text, 'export_completed'::text, 'export_failed'::text, 'backup_verified'::text, 'restore_planned'::text, 'restore_started'::text, 'restore_completed'::text, 'restore_failed'::text, 'restore_verified'::text, 'memory_corrected'::text, 'memory_deleted'::text, 'memory_forgotten'::text, 'knowledge_corrected'::text, 'knowledge_deleted'::text, 'preference_corrected'::text, 'contradiction_resolved'::text, 'connector_disconnected'::text, 'connector_revoked'::text, 'deletion_started'::text, 'deletion_completed'::text, 'deletion_failed'::text]))),
    CONSTRAINT owner_data_operations_record_count_check CHECK (((record_count IS NULL) OR (record_count >= 0))),
    CONSTRAINT owner_data_operations_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'partially_completed'::text, 'failed'::text])))
);


--
-- Name: owner_model_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_model_calls (
    owner_id text NOT NULL,
    run_id text NOT NULL,
    step_key text NOT NULL,
    request_hash text NOT NULL,
    model_id text NOT NULL,
    reserved_microusd bigint NOT NULL,
    reserved_tokens integer NOT NULL,
    status text NOT NULL,
    spent_microusd bigint,
    used_tokens integer,
    result jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT owner_model_calls_reserved_microusd_check CHECK ((reserved_microusd > 0)),
    CONSTRAINT owner_model_calls_reserved_tokens_check CHECK ((reserved_tokens > 0)),
    CONSTRAINT owner_model_calls_status_check CHECK ((status = ANY (ARRAY['inflight'::text, 'completed'::text, 'unknown'::text])))
);


--
-- Name: owner_qualification_budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_qualification_budget (
    singleton boolean DEFAULT true NOT NULL,
    reserved_microusd bigint NOT NULL,
    spent_microusd bigint NOT NULL,
    CONSTRAINT owner_qualification_budget_check CHECK (((reserved_microusd + spent_microusd) <= 5000000)),
    CONSTRAINT owner_qualification_budget_reserved_microusd_check CHECK ((reserved_microusd >= 0)),
    CONSTRAINT owner_qualification_budget_singleton_check CHECK (singleton),
    CONSTRAINT owner_qualification_budget_spent_microusd_check CHECK ((spent_microusd >= 0))
);


--
-- Name: persistent_browser_profile_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persistent_browser_profile_grants (
    id text NOT NULL,
    owner_id text NOT NULL,
    profile_id text NOT NULL,
    agent_id text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: persistent_browser_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persistent_browser_profiles (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    provider text DEFAULT 'orgo'::text NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    last_used_at timestamp with time zone,
    last_owner_takeover_at timestamp with time zone,
    last_authenticated_at timestamp with time zone,
    failure_summary text,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT persistent_browser_profiles_check CHECK (((status = 'revoked'::text) = (revoked_at IS NOT NULL))),
    CONSTRAINT persistent_browser_profiles_generation_check CHECK ((generation > 0)),
    CONSTRAINT persistent_browser_profiles_provider_check CHECK ((provider = 'orgo'::text)),
    CONSTRAINT persistent_browser_profiles_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'takeover_required'::text, 'reconnect_required'::text, 'revoked'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    endpoint text NOT NULL,
    subscription jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id text
);


--
-- Name: recall_learning; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recall_learning (
    owner_id text NOT NULL,
    id text NOT NULL,
    repository text NOT NULL,
    work_type text NOT NULL,
    scope_kind text DEFAULT 'personal'::text NOT NULL,
    work_id uuid,
    revision integer NOT NULL,
    document jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recall_learning_check CHECK (((((document ->> 'id'::text) = id) AND (((document ->> 'revision'::text))::integer = revision)) IS TRUE)),
    CONSTRAINT recall_learning_check1 CHECK ((((((document -> 'scope'::text) ->> 'ownerId'::text) = owner_id) AND (((document -> 'scope'::text) ->> 'repository'::text) = repository) AND (((document -> 'scope'::text) ->> 'workType'::text) = work_type)) IS TRUE)),
    CONSTRAINT recall_learning_check2 CHECK ((NOT (((document -> 'scope'::text) ->> 'workId'::text) IS DISTINCT FROM (work_id)::text))),
    CONSTRAINT recall_learning_document_check CHECK (((jsonb_typeof(document) = 'object'::text) AND (document ?& ARRAY['id'::text, 'revision'::text, 'scope'::text, 'versions'::text, 'events'::text]))),
    CONSTRAINT recall_learning_document_check1 CHECK (((document -> 'scope'::text) ?& ARRAY['ownerId'::text, 'repository'::text, 'workType'::text, 'workId'::text])),
    CONSTRAINT recall_learning_document_check2 CHECK (((jsonb_typeof((document -> 'versions'::text)) = 'array'::text) AND ((jsonb_array_length((document -> 'versions'::text)) >= 1) AND (jsonb_array_length((document -> 'versions'::text)) <= 40)))),
    CONSTRAINT recall_learning_document_check3 CHECK (((jsonb_typeof((document -> 'events'::text)) = 'array'::text) AND ((jsonb_array_length((document -> 'events'::text)) >= 1) AND (jsonb_array_length((document -> 'events'::text)) <= 400)))),
    CONSTRAINT recall_learning_id_check CHECK ((id ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT recall_learning_repository_check CHECK ((repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'::text)),
    CONSTRAINT recall_learning_revision_check CHECK ((revision > 0)),
    CONSTRAINT recall_learning_scope_kind_check CHECK ((scope_kind = 'personal'::text)),
    CONSTRAINT recall_learning_work_type_check CHECK ((work_type = ANY (ARRAY['research'::text, 'implementation'::text, 'review'::text])))
);


--
-- Name: recall_learning_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recall_learning_events (
    owner_id text NOT NULL,
    event_id uuid NOT NULL,
    family_id text NOT NULL
);


--
-- Name: recall_learning_uses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recall_learning_uses (
    owner_id text NOT NULL,
    scope_kind text DEFAULT 'personal'::text NOT NULL,
    work_id uuid NOT NULL,
    family_id text NOT NULL,
    version integer NOT NULL,
    candidate_hash text NOT NULL,
    context_ref text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recall_learning_uses_candidate_hash_check CHECK ((candidate_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT recall_learning_uses_context_ref_check CHECK (((length(context_ref) >= 1) AND (length(context_ref) <= 255))),
    CONSTRAINT recall_learning_uses_scope_kind_check CHECK ((scope_kind = 'personal'::text)),
    CONSTRAINT recall_learning_uses_version_check CHECK ((version > 0))
);


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    id bigint NOT NULL,
    merchant text NOT NULL,
    total_cents bigint NOT NULL,
    currency text NOT NULL,
    category text NOT NULL,
    purchased_at date NOT NULL,
    items jsonb,
    notes text,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.receipts_id_seq OWNED BY public.receipts.id;


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id integer NOT NULL,
    prompt text NOT NULL,
    cron text,
    timezone text NOT NULL,
    next_fire_at timestamp with time zone NOT NULL,
    chat_id text,
    status text DEFAULT 'active'::text NOT NULL,
    claimed_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_fired_at timestamp with time zone,
    routine_name text,
    approval_boundary text,
    source_outcome_id text,
    owner_id text,
    configuration_version integer DEFAULT 1 NOT NULL,
    reviewed_version integer,
    reviewed_at timestamp with time zone,
    execution_routine_id text,
    CONSTRAINT reminders_configuration_version_check CHECK ((configuration_version > 0))
);


--
-- Name: reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reminders_id_seq OWNED BY public.reminders.id;


--
-- Name: review_checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_checkpoints (
    owner_id text NOT NULL,
    review_kind text NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    last_generated_at timestamp with time zone NOT NULL,
    last_event_at timestamp with time zone,
    last_event_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    local_period_key text,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    review_snapshot jsonb,
    CONSTRAINT review_checkpoints_review_kind_check CHECK ((review_kind = ANY (ARRAY['daily'::text, 'weekly'::text])))
);


--
-- Name: review_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_deliveries (
    id text NOT NULL,
    owner_id text NOT NULL,
    review_kind text,
    checkpoint_id text,
    local_period_key text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    attempted_at timestamp with time zone,
    delivered_at timestamp with time zone,
    requested_channel text NOT NULL,
    channel text NOT NULL,
    delivery_classification text DEFAULT 'digest'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    deduplication_key text NOT NULL,
    deduplication_hits integer DEFAULT 0 NOT NULL,
    failure_category text,
    failure_code text,
    failure_summary text,
    next_attempt_at timestamp with time zone,
    claimed_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_id text,
    run_id text,
    result_reference text,
    claim_version bigint DEFAULT 0 NOT NULL,
    result_unknown boolean DEFAULT false NOT NULL,
    CONSTRAINT review_deliveries_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT review_deliveries_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'push'::text, 'telegram'::text]))),
    CONSTRAINT review_deliveries_deduplication_hits_check CHECK ((deduplication_hits >= 0)),
    CONSTRAINT review_deliveries_delivery_classification_check CHECK ((delivery_classification = ANY (ARRAY['silent'::text, 'activity'::text, 'digest'::text, 'push'::text, 'urgent'::text]))),
    CONSTRAINT review_deliveries_failure_category_check CHECK ((failure_category = ANY (ARRAY['transient'::text, 'configuration'::text, 'authorization'::text, 'provider'::text, 'invalid_destination'::text, 'unknown'::text]))),
    CONSTRAINT review_deliveries_requested_channel_check CHECK ((requested_channel = ANY (ARRAY['in_app'::text, 'push'::text, 'telegram'::text]))),
    CONSTRAINT review_deliveries_review_kind_check CHECK ((review_kind = ANY (ARRAY['daily'::text, 'weekly'::text]))),
    CONSTRAINT review_deliveries_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'deferred'::text, 'delivering'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text, 'skipped'::text])))
);


--
-- Name: review_delivery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_delivery_attempts (
    id bigint NOT NULL,
    delivery_id text NOT NULL,
    attempt_number integer NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text NOT NULL,
    failure_category text,
    failure_code text,
    failure_summary text,
    CONSTRAINT review_delivery_attempts_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT review_delivery_attempts_failure_category_check CHECK ((failure_category = ANY (ARRAY['transient'::text, 'configuration'::text, 'authorization'::text, 'provider'::text, 'invalid_destination'::text, 'unknown'::text]))),
    CONSTRAINT review_delivery_attempts_status_check CHECK ((status = ANY (ARRAY['delivering'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: review_delivery_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.review_delivery_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_delivery_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.review_delivery_attempts_id_seq OWNED BY public.review_delivery_attempts.id;


--
-- Name: review_delivery_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_delivery_preferences (
    owner_id text NOT NULL,
    owner_timezone text DEFAULT 'UTC'::text NOT NULL,
    daily_brief_enabled boolean DEFAULT false NOT NULL,
    daily_brief_time time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    weekly_review_enabled boolean DEFAULT false NOT NULL,
    weekly_review_day smallint DEFAULT 0 NOT NULL,
    weekly_review_time time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    quiet_hours_enabled boolean DEFAULT false NOT NULL,
    quiet_hours_start time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    quiet_hours_end time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    preferred_delivery_channel text DEFAULT 'in_app'::text NOT NULL,
    max_proactive_pushes_per_day smallint DEFAULT 2 NOT NULL,
    daily_next_at timestamp with time zone,
    weekly_next_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_delivery_preferences_max_proactive_pushes_per_day_check CHECK (((max_proactive_pushes_per_day >= 0) AND (max_proactive_pushes_per_day <= 20))),
    CONSTRAINT review_delivery_preferences_preferred_delivery_channel_check CHECK ((preferred_delivery_channel = ANY (ARRAY['in_app'::text, 'push'::text, 'telegram'::text]))),
    CONSTRAINT review_delivery_preferences_weekly_review_day_check CHECK (((weekly_review_day >= 0) AND (weekly_review_day <= 6)))
);


--
-- Name: routine_pending_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_pending_sends (
    owner_id text NOT NULL,
    run_id text NOT NULL,
    action_id text NOT NULL,
    request jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: run_context_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run_context_entries (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    task_run_id text,
    goal_id text,
    goal_task_id text,
    content text NOT NULL,
    source_type text DEFAULT 'checkpoint'::text NOT NULL,
    source_id text,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT run_context_entries_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 12000))),
    CONSTRAINT run_context_entries_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'promoted'::text])))
);


--
-- Name: skill_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_assignments (
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    skill_name text NOT NULL,
    enabled boolean NOT NULL,
    assigned_by text DEFAULT 'owner'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skill_assignments_agent_id_check CHECK ((agent_id = ANY (ARRAY['functional-state'::text, 'ux-accessibility'::text, 'trust-resilience'::text]))),
    CONSTRAINT skill_assignments_assigned_by_check CHECK ((assigned_by = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text])))
);


--
-- Name: skill_eval_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_eval_results (
    run_id text NOT NULL,
    skill_name text NOT NULL,
    eval_id text NOT NULL,
    verdict text NOT NULL,
    assertions jsonb DEFAULT '[]'::jsonb NOT NULL,
    error text,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    content_hash text,
    duration_ms integer,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    CONSTRAINT skill_eval_results_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT skill_eval_results_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT skill_eval_results_input_tokens_check CHECK ((input_tokens >= 0)),
    CONSTRAINT skill_eval_results_output_tokens_check CHECK ((output_tokens >= 0)),
    CONSTRAINT skill_eval_results_verdict_check CHECK ((verdict = ANY (ARRAY['passed'::text, 'failed'::text, 'scored'::text, 'skipped'::text])))
);


--
-- Name: skill_eval_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_eval_runs (
    id text NOT NULL,
    owner_id text NOT NULL,
    target text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    passed integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    scored integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    errored integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    mode text DEFAULT 'manual'::text NOT NULL,
    requested_count integer DEFAULT 0 NOT NULL,
    completed_count integer DEFAULT 0 NOT NULL,
    requested_skills jsonb DEFAULT '[]'::jsonb NOT NULL,
    cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    error text,
    CONSTRAINT skill_eval_runs_completed_count_check CHECK ((completed_count >= 0)),
    CONSTRAINT skill_eval_runs_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT skill_eval_runs_errored_check CHECK ((errored >= 0)),
    CONSTRAINT skill_eval_runs_failed_check CHECK ((failed >= 0)),
    CONSTRAINT skill_eval_runs_mode_check CHECK ((mode = ANY (ARRAY['manual'::text, 'changed'::text, 'ci'::text]))),
    CONSTRAINT skill_eval_runs_passed_check CHECK ((passed >= 0)),
    CONSTRAINT skill_eval_runs_requested_count_check CHECK ((requested_count >= 0)),
    CONSTRAINT skill_eval_runs_scored_check CHECK ((scored >= 0)),
    CONSTRAINT skill_eval_runs_skipped_check CHECK ((skipped >= 0)),
    CONSTRAINT skill_eval_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: skill_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_usage_events (
    id bigint NOT NULL,
    owner_id text NOT NULL,
    skill_name text NOT NULL,
    agent_id text NOT NULL,
    session_id text NOT NULL,
    turn_id text NOT NULL,
    task_run_id text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    loaded_step_index integer DEFAULT 0 NOT NULL,
    last_accounted_step integer DEFAULT 0 NOT NULL,
    outcome text DEFAULT 'loaded'::text NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cache_read_tokens bigint DEFAULT 0 NOT NULL,
    cache_write_tokens bigint DEFAULT 0 NOT NULL,
    cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    CONSTRAINT skill_usage_events_cache_read_tokens_check CHECK ((cache_read_tokens >= 0)),
    CONSTRAINT skill_usage_events_cache_write_tokens_check CHECK ((cache_write_tokens >= 0)),
    CONSTRAINT skill_usage_events_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT skill_usage_events_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT skill_usage_events_input_tokens_check CHECK ((input_tokens >= 0)),
    CONSTRAINT skill_usage_events_outcome_check CHECK ((outcome = ANY (ARRAY['loaded'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT skill_usage_events_output_tokens_check CHECK ((output_tokens >= 0))
);


--
-- Name: skill_usage_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skill_usage_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skill_usage_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.skill_usage_events_id_seq OWNED BY public.skill_usage_events.id;


--
-- Name: sofie_file_owner_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sofie_file_owner_reconciliations (
    file_id text NOT NULL,
    thread_id text NOT NULL,
    previous_owner_id text,
    resolved_owner_id text NOT NULL,
    proof text NOT NULL,
    reconciled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sofie_file_owner_reconciliations_proof_check CHECK ((proof = 'web_chat_threads.owner_id'::text))
);


--
-- Name: sofie_migration_bridge_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sofie_migration_bridge_receipts (
    id text NOT NULL,
    source_ledger jsonb NOT NULL,
    canonical_manifest jsonb NOT NULL,
    satisfied_migrations jsonb NOT NULL,
    reconciled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sofie_migration_bridge_receipts_canonical_manifest_check CHECK ((jsonb_typeof(canonical_manifest) = 'object'::text)),
    CONSTRAINT sofie_migration_bridge_receipts_id_check CHECK ((id = '0033'::text)),
    CONSTRAINT sofie_migration_bridge_receipts_satisfied_migrations_check CHECK ((jsonb_typeof(satisfied_migrations) = 'object'::text)),
    CONSTRAINT sofie_migration_bridge_receipts_source_ledger_check CHECK ((jsonb_typeof(source_ledger) = 'array'::text))
);


--
-- Name: sofie_migration_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sofie_migration_reconciliations (
    id text NOT NULL,
    origin text NOT NULL,
    source_ledger jsonb NOT NULL,
    satisfied_migrations jsonb NOT NULL,
    reconciled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sofie_migration_reconciliations_origin_check CHECK ((origin = ANY (ARRAY['canonical'::text, '396631afa4739e5ca8ac0c5c81781f82f3160403'::text]))),
    CONSTRAINT sofie_migration_reconciliations_satisfied_migrations_check CHECK ((jsonb_typeof(satisfied_migrations) = 'object'::text)),
    CONSTRAINT sofie_migration_reconciliations_source_ledger_check CHECK ((jsonb_typeof(source_ledger) = 'array'::text))
);


--
-- Name: sofie_published_main_bridge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sofie_published_main_bridge (
    id text NOT NULL,
    source_commit text NOT NULL,
    source_ledger jsonb NOT NULL,
    canonical_manifest jsonb NOT NULL,
    satisfied_migrations jsonb NOT NULL,
    reconciled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sofie_published_main_bridge_canonical_manifest_check CHECK ((jsonb_typeof(canonical_manifest) = 'object'::text)),
    CONSTRAINT sofie_published_main_bridge_id_check CHECK ((id = '0068'::text)),
    CONSTRAINT sofie_published_main_bridge_satisfied_migrations_check CHECK ((jsonb_typeof(satisfied_migrations) = 'object'::text)),
    CONSTRAINT sofie_published_main_bridge_source_ledger_check CHECK ((jsonb_typeof(source_ledger) = 'array'::text))
);


--
-- Name: sofie_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sofie_schema_migrations (
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_acceptance_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_acceptance_checks (
    id text NOT NULL,
    task_id text NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    specialist_role text NOT NULL,
    environment text NOT NULL,
    required boolean DEFAULT true NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    result_summary text,
    checked_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_acceptance_checks_environment_check CHECK ((environment = ANY (ARRAY['local'::text, 'preview'::text, 'both'::text]))),
    CONSTRAINT task_acceptance_checks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'blocked'::text])))
);


--
-- Name: task_approval_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_approval_decisions (
    id text NOT NULL,
    task_id text NOT NULL,
    requested_by text NOT NULL,
    prompt text NOT NULL,
    decision text,
    decided_by text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    owner_id text NOT NULL,
    goal_id text,
    goal_task_id text,
    agent_id text,
    role_id text,
    capability_id text,
    provider text,
    resource text,
    action text NOT NULL,
    action_class text NOT NULL,
    action_parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    binding_hash text NOT NULL,
    risk text NOT NULL,
    effects jsonb DEFAULT '[]'::jsonb NOT NULL,
    estimated_cost_usd numeric(10,4),
    expires_at timestamp with time zone NOT NULL,
    status text NOT NULL,
    decision_reason text,
    CONSTRAINT task_approval_action_class_check CHECK ((action_class = ANY (ARRAY['read'::text, 'write'::text, 'create'::text, 'update'::text, 'delete'::text, 'send'::text, 'publish'::text, 'spend'::text, 'deploy'::text, 'execute'::text, 'transfer'::text]))),
    CONSTRAINT task_approval_decisions_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'denied'::text]))),
    CONSTRAINT task_approval_risk_check CHECK ((risk = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT task_approval_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text, 'invalidated'::text])))
);


--
-- Name: task_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_artifacts (
    id text NOT NULL,
    task_id text NOT NULL,
    check_id text,
    specialist_role text,
    kind text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    storage_key text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    redacted boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_artifacts_kind_check CHECK ((kind = ANY (ARRAY['screenshot'::text, 'report'::text, 'log'::text, 'json'::text]))),
    CONSTRAINT task_artifacts_size_bytes_check CHECK ((size_bytes >= 0))
);


--
-- Name: task_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_milestones (
    id bigint NOT NULL,
    task_id text NOT NULL,
    kind text NOT NULL,
    summary text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_milestones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_milestones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_milestones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_milestones_id_seq OWNED BY public.task_milestones.id;


--
-- Name: task_run_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_run_sessions (
    task_id text NOT NULL,
    session_id text NOT NULL,
    role text NOT NULL,
    call_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_current boolean DEFAULT true NOT NULL
);


--
-- Name: task_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_runs (
    id text NOT NULL,
    owner_id text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    thread_id text,
    status text NOT NULL,
    status_reason text,
    target jsonb DEFAULT '{}'::jsonb NOT NULL,
    max_duration_seconds integer NOT NULL,
    max_specialists integer NOT NULL,
    max_model_steps integer NOT NULL,
    max_retries_per_specialist integer NOT NULL,
    max_estimated_cost_usd numeric(10,4) NOT NULL,
    model_steps integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric(10,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    deadline_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    goal_id text,
    goal_task_id text,
    agent_id text,
    objective text,
    expected_output text,
    parent_task_id text,
    source_task_id text,
    role_id text,
    result_summary text,
    review_status text DEFAULT 'draft'::text NOT NULL,
    CONSTRAINT task_runs_estimated_cost_usd_check CHECK ((estimated_cost_usd >= (0)::numeric)),
    CONSTRAINT task_runs_kind_check CHECK ((kind = ANY (ARRAY['product_qa'::text, 'delegated_work'::text]))),
    CONSTRAINT task_runs_max_duration_seconds_check CHECK ((max_duration_seconds > 0)),
    CONSTRAINT task_runs_max_estimated_cost_usd_check CHECK ((max_estimated_cost_usd > (0)::numeric)),
    CONSTRAINT task_runs_max_model_steps_check CHECK ((max_model_steps > 0)),
    CONSTRAINT task_runs_max_retries_per_specialist_check CHECK ((max_retries_per_specialist >= 0)),
    CONSTRAINT task_runs_max_specialists_check CHECK ((max_specialists >= 0)),
    CONSTRAINT task_runs_model_steps_check CHECK ((model_steps >= 0)),
    CONSTRAINT task_runs_review_status_check CHECK ((review_status = ANY (ARRAY['draft'::text, 'ready_for_review'::text, 'accepted'::text, 'revision_requested'::text, 'superseded'::text]))),
    CONSTRAINT task_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'awaiting_approval'::text, 'waiting_for_owner'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: task_specialists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_specialists (
    task_id text NOT NULL,
    role text NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    active_session_id text,
    summary text,
    error text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_specialists_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT task_specialists_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: task_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_transitions (
    id bigint NOT NULL,
    task_id text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_transitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_transitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_transitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_transitions_id_seq OWNED BY public.task_transitions.id;


--
-- Name: telegram_owner_inbound_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_owner_inbound_receipts (
    owner_id text NOT NULL,
    bot_id text NOT NULL,
    chat_id text NOT NULL,
    message_id text NOT NULL,
    payload_hash text NOT NULL,
    status text DEFAULT 'DISPATCH_UNKNOWN'::text NOT NULL,
    reply_text_hash text,
    provider_message_id text,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_owner_inbound_receipts_check CHECK (((bot_id ~ '^[0-9]{6,20}$'::text) AND (chat_id ~ '^[1-9][0-9]{0,18}$'::text) AND (message_id ~ '^[1-9][0-9]{0,18}$'::text))),
    CONSTRAINT telegram_owner_inbound_receipts_check1 CHECK (((status = 'REPLIED'::text) = (provider_message_id IS NOT NULL))),
    CONSTRAINT telegram_owner_inbound_receipts_check2 CHECK (((status = ANY (ARRAY['REPLY_UNKNOWN'::text, 'REPLIED'::text])) = (reply_text_hash IS NOT NULL))),
    CONSTRAINT telegram_owner_inbound_receipts_payload_hash_check CHECK ((payload_hash ~ '^sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT telegram_owner_inbound_receipts_reply_text_hash_check CHECK (((reply_text_hash IS NULL) OR (reply_text_hash ~ '^sha256:[0-9a-f]{64}$'::text))),
    CONSTRAINT telegram_owner_inbound_receipts_status_check CHECK ((status = ANY (ARRAY['DISPATCH_UNKNOWN'::text, 'TURN_STARTED'::text, 'REPLY_UNKNOWN'::text, 'REPLIED'::text])))
);


--
-- Name: thread_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thread_summaries (
    id text NOT NULL,
    owner_id text NOT NULL,
    thread_id text NOT NULL,
    goal_id text,
    purpose text DEFAULT ''::text NOT NULL,
    important_facts jsonb DEFAULT '[]'::jsonb NOT NULL,
    decisions jsonb DEFAULT '[]'::jsonb NOT NULL,
    open_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    commitments jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_message_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT thread_summaries_source_message_count_check CHECK ((source_message_count >= 0)),
    CONSTRAINT thread_summaries_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text])))
);


--
-- Name: web_chat_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_chat_threads (
    id text NOT NULL,
    title text NOT NULL,
    updated_at bigint NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    renamed boolean DEFAULT false NOT NULL,
    origin text DEFAULT 'web'::text NOT NULL,
    chat jsonb DEFAULT '{}'::jsonb NOT NULL,
    owner_id text NOT NULL,
    agent_id text,
    role_id text,
    CONSTRAINT web_chat_threads_one_executor CHECK (((agent_id IS NULL) OR (role_id IS NULL)))
);


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id text NOT NULL,
    secret text NOT NULL,
    name text NOT NULL,
    prompt text NOT NULL,
    chat_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_fired_at timestamp with time zone,
    fire_count integer DEFAULT 0 NOT NULL
);


--
-- Name: action_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_receipts ALTER COLUMN id SET DEFAULT nextval('public.action_receipts_id_seq'::regclass);


--
-- Name: agentphone_usage_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_usage_event ALTER COLUMN id SET DEFAULT nextval('public.agentphone_usage_event_id_seq'::regclass);


--
-- Name: automation_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs ALTER COLUMN id SET DEFAULT nextval('public.automation_runs_id_seq'::regclass);


--
-- Name: computer_template_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_template_events ALTER COLUMN id SET DEFAULT nextval('public.computer_template_events_id_seq'::regclass);


--
-- Name: receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts ALTER COLUMN id SET DEFAULT nextval('public.receipts_id_seq'::regclass);


--
-- Name: reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders ALTER COLUMN id SET DEFAULT nextval('public.reminders_id_seq'::regclass);


--
-- Name: review_delivery_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_attempts ALTER COLUMN id SET DEFAULT nextval('public.review_delivery_attempts_id_seq'::regclass);


--
-- Name: skill_usage_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events ALTER COLUMN id SET DEFAULT nextval('public.skill_usage_events_id_seq'::regclass);


--
-- Name: task_milestones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_milestones ALTER COLUMN id SET DEFAULT nextval('public.task_milestones_id_seq'::regclass);


--
-- Name: task_transitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_transitions ALTER COLUMN id SET DEFAULT nextval('public.task_transitions_id_seq'::regclass);


--
-- Name: action_receipts action_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_receipts
    ADD CONSTRAINT action_receipts_pkey PRIMARY KEY (id);


--
-- Name: action_requests action_requests_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: action_requests action_requests_owner_id_run_id_action_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_owner_id_run_id_action_key_key UNIQUE (owner_id, run_id, action_key);


--
-- Name: action_requests action_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_pkey PRIMARY KEY (id);


--
-- Name: agent_audit_events agent_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_audit_events
    ADD CONSTRAINT agent_audit_events_pkey PRIMARY KEY (id);


--
-- Name: agent_capabilities agent_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_capabilities
    ADD CONSTRAINT agent_capabilities_pkey PRIMARY KEY (agent_id, capability_id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: agentphone_call agentphone_call_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_call
    ADD CONSTRAINT agentphone_call_pkey PRIMARY KEY (call_id);


--
-- Name: agentphone_config agentphone_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_config
    ADD CONSTRAINT agentphone_config_pkey PRIMARY KEY (id);


--
-- Name: agentphone_contact_policy agentphone_contact_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_contact_policy
    ADD CONSTRAINT agentphone_contact_policy_pkey PRIMARY KEY (phone_number);


--
-- Name: agentphone_inbound agentphone_inbound_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_inbound
    ADD CONSTRAINT agentphone_inbound_pkey PRIMARY KEY (message_id);


--
-- Name: agentphone_usage_event agentphone_usage_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_usage_event
    ADD CONSTRAINT agentphone_usage_event_pkey PRIMARY KEY (id);


--
-- Name: agents agents_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: agents agents_owner_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_owner_id_slug_key UNIQUE (owner_id, slug);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (name);


--
-- Name: automation_runs automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_pkey PRIMARY KEY (id);


--
-- Name: beta_goal_attention_snapshots beta_goal_attention_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_goal_attention_snapshots
    ADD CONSTRAINT beta_goal_attention_snapshots_pkey PRIMARY KEY (owner_id, goal_id);


--
-- Name: beta_goal_work_bindings beta_goal_work_bindings_owner_id_work_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_goal_work_bindings
    ADD CONSTRAINT beta_goal_work_bindings_owner_id_work_id_key UNIQUE (owner_id, work_id);


--
-- Name: beta_goal_work_bindings beta_goal_work_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_goal_work_bindings
    ADD CONSTRAINT beta_goal_work_bindings_pkey PRIMARY KEY (owner_id, correlation_key);


--
-- Name: beta_result_provenance beta_result_provenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_result_provenance
    ADD CONSTRAINT beta_result_provenance_pkey PRIMARY KEY (owner_id, result_id);


--
-- Name: beta_source_receipts beta_source_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_source_receipts
    ADD CONSTRAINT beta_source_receipts_pkey PRIMARY KEY (owner_id, event_key);


--
-- Name: beta_work_admission_attempts beta_work_admission_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_admission_attempts
    ADD CONSTRAINT beta_work_admission_attempts_pkey PRIMARY KEY (owner_id, work_id, work_version, work_generation);


--
-- Name: beta_work_contexts beta_work_contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_contexts
    ADD CONSTRAINT beta_work_contexts_pkey PRIMARY KEY (owner_id, work_id, context_ref);


--
-- Name: beta_work_continuations beta_work_continuations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_continuations
    ADD CONSTRAINT beta_work_continuations_pkey PRIMARY KEY (owner_id, response_id);


--
-- Name: beta_work_decisions beta_work_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_decisions
    ADD CONSTRAINT beta_work_decisions_pkey PRIMARY KEY (owner_id, action_id);


--
-- Name: browser_sessions browser_sessions_computer_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_sessions
    ADD CONSTRAINT browser_sessions_computer_session_id_key UNIQUE (computer_session_id);


--
-- Name: browser_sessions browser_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_sessions
    ADD CONSTRAINT browser_sessions_pkey PRIMARY KEY (id);


--
-- Name: capsule_memory_policy capsule_memory_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capsule_memory_policy
    ADD CONSTRAINT capsule_memory_policy_pkey PRIMARY KEY (owner_id, memory_id, destination_eve_id);


--
-- Name: capsule_memory_receipts capsule_memory_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capsule_memory_receipts
    ADD CONSTRAINT capsule_memory_receipts_pkey PRIMARY KEY (owner_id, eve_id, id);


--
-- Name: chat_files chat_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_files
    ADD CONSTRAINT chat_files_pkey PRIMARY KEY (id);


--
-- Name: computer_actions computer_actions_computer_session_id_call_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_actions
    ADD CONSTRAINT computer_actions_computer_session_id_call_id_key UNIQUE (computer_session_id, call_id);


--
-- Name: computer_actions computer_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_actions
    ADD CONSTRAINT computer_actions_pkey PRIMARY KEY (id);


--
-- Name: computer_artifacts computer_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_pkey PRIMARY KEY (id);


--
-- Name: computer_artifacts computer_artifacts_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_storage_key_key UNIQUE (storage_key);


--
-- Name: computer_control_leases computer_control_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_leases
    ADD CONSTRAINT computer_control_leases_pkey PRIMARY KEY (computer_session_id);


--
-- Name: computer_control_receipts computer_control_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_receipts
    ADD CONSTRAINT computer_control_receipts_pkey PRIMARY KEY (id);


--
-- Name: computer_resource_lifecycles computer_resource_lifecycles_computer_session_id_generation_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_resource_lifecycles
    ADD CONSTRAINT computer_resource_lifecycles_computer_session_id_generation_key UNIQUE (computer_session_id, generation);


--
-- Name: computer_resource_lifecycles computer_resource_lifecycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_resource_lifecycles
    ADD CONSTRAINT computer_resource_lifecycles_pkey PRIMARY KEY (id);


--
-- Name: computer_resource_lifecycles computer_resource_lifecycles_provision_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_resource_lifecycles
    ADD CONSTRAINT computer_resource_lifecycles_provision_id_key UNIQUE (provision_id);


--
-- Name: computer_resource_lifecycles computer_resource_lifecycles_resource_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_resource_lifecycles
    ADD CONSTRAINT computer_resource_lifecycles_resource_name_key UNIQUE (resource_name);


--
-- Name: computer_sessions computer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_pkey PRIMARY KEY (id);


--
-- Name: computer_template_events computer_template_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_template_events
    ADD CONSTRAINT computer_template_events_pkey PRIMARY KEY (id);


--
-- Name: computer_template_preparations computer_template_preparations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_template_preparations
    ADD CONSTRAINT computer_template_preparations_pkey PRIMARY KEY (id);


--
-- Name: computer_template_waiters computer_template_waiters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_template_waiters
    ADD CONSTRAINT computer_template_waiters_pkey PRIMARY KEY (id);


--
-- Name: context_assemblies context_assemblies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_assemblies
    ADD CONSTRAINT context_assemblies_pkey PRIMARY KEY (id);


--
-- Name: engineering_conversation_budget engineering_conversation_budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_conversation_budget
    ADD CONSTRAINT engineering_conversation_budget_pkey PRIMARY KEY (scope_id, scope_kind, work_id);


--
-- Name: engineering_conversation_calls engineering_conversation_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_conversation_calls
    ADD CONSTRAINT engineering_conversation_calls_pkey PRIMARY KEY (scope_id, scope_kind, work_id, step_key);


--
-- Name: engineering_direct_verification_jobs engineering_direct_verificati_scope_id_scope_kind_work_id_c_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_verification_jobs
    ADD CONSTRAINT engineering_direct_verificati_scope_id_scope_kind_work_id_c_key UNIQUE (scope_id, scope_kind, work_id, candidate_id);


--
-- Name: engineering_direct_verification_jobs engineering_direct_verification_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_verification_jobs
    ADD CONSTRAINT engineering_direct_verification_jobs_pkey PRIMARY KEY (scope_id, scope_kind, work_id, candidate_sha);


--
-- Name: engineering_direct_workspaces engineering_direct_workspaces_decision_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_workspaces
    ADD CONSTRAINT engineering_direct_workspaces_decision_id_key UNIQUE (decision_id);


--
-- Name: engineering_direct_workspaces engineering_direct_workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_workspaces
    ADD CONSTRAINT engineering_direct_workspaces_pkey PRIMARY KEY (scope_id, scope_kind, work_id);


--
-- Name: engineering_direct_workspaces engineering_direct_workspaces_route_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_workspaces
    ADD CONSTRAINT engineering_direct_workspaces_route_run_id_key UNIQUE (route_run_id);


--
-- Name: engineering_execution_history engineering_execution_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_execution_history
    ADD CONSTRAINT engineering_execution_history_pkey PRIMARY KEY (scope_id, scope_kind, work_id, revision);


--
-- Name: engineering_execution engineering_execution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_execution
    ADD CONSTRAINT engineering_execution_pkey PRIMARY KEY (scope_id, scope_kind, work_id);


--
-- Name: engineering_factory_admissions engineering_factory_admissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_admissions
    ADD CONSTRAINT engineering_factory_admissions_pkey PRIMARY KEY (request_id);


--
-- Name: engineering_factory_admissions engineering_factory_admissions_receipt_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_admissions
    ADD CONSTRAINT engineering_factory_admissions_receipt_id_key UNIQUE (receipt_id);


--
-- Name: engineering_factory_receipts engineering_factory_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_receipts
    ADD CONSTRAINT engineering_factory_receipts_pkey PRIMARY KEY (id);


--
-- Name: engineering_factory_receipts engineering_factory_receipts_request_id_envelope_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_receipts
    ADD CONSTRAINT engineering_factory_receipts_request_id_envelope_digest_key UNIQUE (request_id, envelope_digest);


--
-- Name: engineering_factory_receipts engineering_factory_receipts_request_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_receipts
    ADD CONSTRAINT engineering_factory_receipts_request_id_id_key UNIQUE (request_id, id);


--
-- Name: engineering_factory_requests engineering_factory_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_requests
    ADD CONSTRAINT engineering_factory_requests_pkey PRIMARY KEY (id);


--
-- Name: engineering_factory_requests engineering_factory_requests_scope_id_scope_kind_factory_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_requests
    ADD CONSTRAINT engineering_factory_requests_scope_id_scope_kind_factory_id_key UNIQUE (scope_id, scope_kind, factory_id, operation_id);


--
-- Name: engineering_factory_result_conflicts engineering_factory_result_co_receipt_id_observed_envelope__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_result_conflicts
    ADD CONSTRAINT engineering_factory_result_co_receipt_id_observed_envelope__key UNIQUE (receipt_id, observed_envelope_digest);


--
-- Name: engineering_factory_result_conflicts engineering_factory_result_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_result_conflicts
    ADD CONSTRAINT engineering_factory_result_conflicts_pkey PRIMARY KEY (id);


--
-- Name: engineering_factory_results engineering_factory_results_factory_request_id_run_id_attem_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_results
    ADD CONSTRAINT engineering_factory_results_factory_request_id_run_id_attem_key UNIQUE (factory_request_id, run_id, attempt_number);


--
-- Name: engineering_factory_results engineering_factory_results_operation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_results
    ADD CONSTRAINT engineering_factory_results_operation_id_key UNIQUE (operation_id);


--
-- Name: engineering_factory_results engineering_factory_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_results
    ADD CONSTRAINT engineering_factory_results_pkey PRIMARY KEY (id);


--
-- Name: engineering_factory_results engineering_factory_results_scope_id_scope_kind_work_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_results
    ADD CONSTRAINT engineering_factory_results_scope_id_scope_kind_work_id_id_key UNIQUE (scope_id, scope_kind, work_id, id);


--
-- Name: engineering_learning_drafts engineering_learning_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_learning_drafts
    ADD CONSTRAINT engineering_learning_drafts_pkey PRIMARY KEY (id);


--
-- Name: engineering_learning_drafts engineering_learning_drafts_scope_id_feedback_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_learning_drafts
    ADD CONSTRAINT engineering_learning_drafts_scope_id_feedback_id_key UNIQUE (scope_id, feedback_id);


--
-- Name: engineering_learning_drafts engineering_learning_drafts_scope_id_scope_kind_work_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_learning_drafts
    ADD CONSTRAINT engineering_learning_drafts_scope_id_scope_kind_work_id_id_key UNIQUE (scope_id, scope_kind, work_id, id);


--
-- Name: engineering_model_calls engineering_model_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_model_calls
    ADD CONSTRAINT engineering_model_calls_pkey PRIMARY KEY (id);


--
-- Name: engineering_native_model_calls engineering_native_model_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_model_calls
    ADD CONSTRAINT engineering_native_model_calls_pkey PRIMARY KEY (scope_id, scope_kind, work_id, step_key);


--
-- Name: engineering_native_results engineering_native_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_results
    ADD CONSTRAINT engineering_native_results_pkey PRIMARY KEY (id);


--
-- Name: engineering_native_results engineering_native_results_scope_id_scope_kind_work_id_cand_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_results
    ADD CONSTRAINT engineering_native_results_scope_id_scope_kind_work_id_cand_key UNIQUE (scope_id, scope_kind, work_id, candidate_sha);


--
-- Name: engineering_native_runtime engineering_native_runtime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_runtime
    ADD CONSTRAINT engineering_native_runtime_pkey PRIMARY KEY (scope_id, scope_kind, work_id);


--
-- Name: engineering_native_runtime engineering_native_runtime_route_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_runtime
    ADD CONSTRAINT engineering_native_runtime_route_run_id_key UNIQUE (route_run_id);


--
-- Name: engineering_route_runs engineering_route_runs_decision_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_runs
    ADD CONSTRAINT engineering_route_runs_decision_id_key UNIQUE (decision_id);


--
-- Name: engineering_route_runs engineering_route_runs_dispatch_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_runs
    ADD CONSTRAINT engineering_route_runs_dispatch_identity_key UNIQUE (dispatch_identity);


--
-- Name: engineering_route_runs engineering_route_runs_factory_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_runs
    ADD CONSTRAINT engineering_route_runs_factory_request_id_key UNIQUE (factory_request_id);


--
-- Name: engineering_route_runs engineering_route_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_runs
    ADD CONSTRAINT engineering_route_runs_pkey PRIMARY KEY (id);


--
-- Name: engineering_route_transitions engineering_route_transitions_decision_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_transitions
    ADD CONSTRAINT engineering_route_transitions_decision_id_key UNIQUE (decision_id);


--
-- Name: engineering_route_transitions engineering_route_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_transitions
    ADD CONSTRAINT engineering_route_transitions_pkey PRIMARY KEY (id);


--
-- Name: engineering_routing_decisions engineering_routing_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_routing_decisions
    ADD CONSTRAINT engineering_routing_decisions_pkey PRIMARY KEY (id);


--
-- Name: engineering_routing_decisions engineering_routing_decisions_scope_id_scope_kind_work_id_w_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_routing_decisions
    ADD CONSTRAINT engineering_routing_decisions_scope_id_scope_kind_work_id_w_key UNIQUE (scope_id, scope_kind, work_id, work_version);


--
-- Name: engineering_work_criteria engineering_work_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_criteria
    ADD CONSTRAINT engineering_work_criteria_pkey PRIMARY KEY (scope_id, scope_kind, work_id, version);


--
-- Name: engineering_work_events engineering_work_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_events
    ADD CONSTRAINT engineering_work_events_pkey PRIMARY KEY (id);


--
-- Name: engineering_work_events engineering_work_events_scope_id_scope_kind_work_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_events
    ADD CONSTRAINT engineering_work_events_scope_id_scope_kind_work_id_version_key UNIQUE (scope_id, scope_kind, work_id, version);


--
-- Name: engineering_work_knowledge engineering_work_knowledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_knowledge
    ADD CONSTRAINT engineering_work_knowledge_pkey PRIMARY KEY (scope_id, scope_kind, work_id, knowledge_id);


--
-- Name: engineering_work_knowledge engineering_work_knowledge_scope_id_knowledge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_knowledge
    ADD CONSTRAINT engineering_work_knowledge_scope_id_knowledge_id_key UNIQUE (scope_id, knowledge_id);


--
-- Name: engineering_work_model_budget engineering_work_model_budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_model_budget
    ADD CONSTRAINT engineering_work_model_budget_pkey PRIMARY KEY (scope_id, scope_kind, work_id);


--
-- Name: engineering_work_model_calls engineering_work_model_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_model_calls
    ADD CONSTRAINT engineering_work_model_calls_pkey PRIMARY KEY (id);


--
-- Name: engineering_work_model_calls engineering_work_model_calls_scope_id_scope_kind_work_id_se_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_model_calls
    ADD CONSTRAINT engineering_work_model_calls_scope_id_scope_kind_work_id_se_key UNIQUE (scope_id, scope_kind, work_id, session_id, step_key);


--
-- Name: engineering_work engineering_work_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work
    ADD CONSTRAINT engineering_work_pkey PRIMARY KEY (id);


--
-- Name: engineering_work engineering_work_scope_id_scope_kind_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work
    ADD CONSTRAINT engineering_work_scope_id_scope_kind_id_key UNIQUE (scope_id, scope_kind, id);


--
-- Name: engineering_work engineering_work_scope_id_scope_kind_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work
    ADD CONSTRAINT engineering_work_scope_id_scope_kind_idempotency_key_key UNIQUE (scope_id, scope_kind, idempotency_key);


--
-- Name: eve_events eve_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eve_events
    ADD CONSTRAINT eve_events_pkey PRIMARY KEY (id);


--
-- Name: execution_attempts execution_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_attempts
    ADD CONSTRAINT execution_attempts_pkey PRIMARY KEY (owner_id, occurrence_id, attempt_number);


--
-- Name: execution_occurrences execution_occurrences_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: execution_occurrences execution_occurrences_owner_id_routine_id_occurrence_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_owner_id_routine_id_occurrence_key_key UNIQUE (owner_id, routine_id, occurrence_key);


--
-- Name: execution_occurrences execution_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_pkey PRIMARY KEY (id);


--
-- Name: execution_occurrences execution_occurrences_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_run_id_key UNIQUE (run_id);


--
-- Name: execution_routine_versions execution_routine_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routine_versions
    ADD CONSTRAINT execution_routine_versions_pkey PRIMARY KEY (owner_id, routine_id, version);


--
-- Name: execution_routines execution_routines_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routines
    ADD CONSTRAINT execution_routines_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: execution_routines execution_routines_owner_id_source_kind_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routines
    ADD CONSTRAINT execution_routines_owner_id_source_kind_source_id_key UNIQUE (owner_id, source_kind, source_id);


--
-- Name: execution_routines execution_routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routines
    ADD CONSTRAINT execution_routines_pkey PRIMARY KEY (id);


--
-- Name: goal_milestones goal_milestones_goal_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_milestones
    ADD CONSTRAINT goal_milestones_goal_id_id_key UNIQUE (goal_id, id);


--
-- Name: goal_milestones goal_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_milestones
    ADD CONSTRAINT goal_milestones_pkey PRIMARY KEY (id);


--
-- Name: goal_outcome_evidence goal_outcome_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_outcome_evidence
    ADD CONSTRAINT goal_outcome_evidence_pkey PRIMARY KEY (owner_id, goal_id, generation, criterion);


--
-- Name: goal_plans goal_plans_goal_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_plans
    ADD CONSTRAINT goal_plans_goal_id_version_key UNIQUE (goal_id, version);


--
-- Name: goal_plans goal_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_plans
    ADD CONSTRAINT goal_plans_pkey PRIMARY KEY (id);


--
-- Name: goal_task_dependencies goal_task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_task_dependencies
    ADD CONSTRAINT goal_task_dependencies_pkey PRIMARY KEY (task_id, depends_on_task_id);


--
-- Name: goal_tasks goal_tasks_goal_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_goal_id_id_key UNIQUE (goal_id, id);


--
-- Name: goal_tasks goal_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_pkey PRIMARY KEY (id);


--
-- Name: goal_thread_links goal_thread_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_thread_links
    ADD CONSTRAINT goal_thread_links_pkey PRIMARY KEY (goal_id, thread_id);


--
-- Name: goal_work_dependencies goal_work_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_dependencies
    ADD CONSTRAINT goal_work_dependencies_pkey PRIMARY KEY (owner_id, task_id, id);


--
-- Name: goal_work_links goal_work_links_owner_id_task_id_goal_generation_task_gener_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_links
    ADD CONSTRAINT goal_work_links_owner_id_task_id_goal_generation_task_gener_key UNIQUE (owner_id, task_id, goal_generation, task_generation);


--
-- Name: goal_work_links goal_work_links_owner_id_work_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_links
    ADD CONSTRAINT goal_work_links_owner_id_work_id_key UNIQUE (owner_id, work_id);


--
-- Name: goal_work_links goal_work_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_links
    ADD CONSTRAINT goal_work_links_pkey PRIMARY KEY (correlation_key);


--
-- Name: goal_work_signals goal_work_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_signals
    ADD CONSTRAINT goal_work_signals_pkey PRIMARY KEY (owner_id, event_id);


--
-- Name: goals goals_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: inbox_attention_evidence inbox_attention_evidence_owner_id_system_account_id_event_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attention_evidence
    ADD CONSTRAINT inbox_attention_evidence_owner_id_system_account_id_event_i_key UNIQUE (owner_id, system, account_id, event_id);


--
-- Name: inbox_attention_evidence inbox_attention_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attention_evidence
    ADD CONSTRAINT inbox_attention_evidence_pkey PRIMARY KEY (owner_id, id);


--
-- Name: inbox_attention_items inbox_attention_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attention_items
    ADD CONSTRAINT inbox_attention_items_pkey PRIMARY KEY (owner_id, id);


--
-- Name: inbox_attention_responses inbox_attention_responses_owner_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attention_responses
    ADD CONSTRAINT inbox_attention_responses_owner_id_item_id_key UNIQUE (owner_id, item_id);


--
-- Name: inbox_attention_responses inbox_attention_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attention_responses
    ADD CONSTRAINT inbox_attention_responses_pkey PRIMARY KEY (owner_id, id);


--
-- Name: knowledge_provenance_links knowledge_provenance_links_owner_id_knowledge_id_source_id__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_provenance_links
    ADD CONSTRAINT knowledge_provenance_links_owner_id_knowledge_id_source_id__key UNIQUE (owner_id, knowledge_id, source_id, relation);


--
-- Name: knowledge_provenance_links knowledge_provenance_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_provenance_links
    ADD CONSTRAINT knowledge_provenance_links_pkey PRIMARY KEY (id);


--
-- Name: knowledge_records knowledge_records_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: knowledge_records knowledge_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_pkey PRIMARY KEY (id);


--
-- Name: knowledge_relationships knowledge_relationships_owner_id_subject_type_subject_id_pr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_relationships
    ADD CONSTRAINT knowledge_relationships_owner_id_subject_type_subject_id_pr_key UNIQUE (owner_id, subject_type, subject_id, predicate, object_type, object_id);


--
-- Name: knowledge_relationships knowledge_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_relationships
    ADD CONSTRAINT knowledge_relationships_pkey PRIMARY KEY (id);


--
-- Name: knowledge_sources knowledge_sources_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_sources
    ADD CONSTRAINT knowledge_sources_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: knowledge_sources knowledge_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_sources
    ADD CONSTRAINT knowledge_sources_pkey PRIMARY KEY (id);


--
-- Name: memory_records memory_records_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_records
    ADD CONSTRAINT memory_records_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: memory_records memory_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_records
    ADD CONSTRAINT memory_records_pkey PRIMARY KEY (id);


--
-- Name: memory_scope_migrations memory_scope_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_scope_migrations
    ADD CONSTRAINT memory_scope_migrations_pkey PRIMARY KEY (owner_id);


--
-- Name: myeve_peer_action_bindings myeve_peer_action_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_peer_action_bindings
    ADD CONSTRAINT myeve_peer_action_bindings_pkey PRIMARY KEY (owner_id, run_id, action_key);


--
-- Name: myeve_peer_permissions myeve_peer_permissions_owner_id_local_agent_id_relay_origin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_peer_permissions
    ADD CONSTRAINT myeve_peer_permissions_owner_id_local_agent_id_relay_origin_key UNIQUE (owner_id, local_agent_id, relay_origin, local_relay_account_id, local_relay_agent_id, peer_account_id, peer_agent_id);


--
-- Name: myeve_peer_permissions myeve_peer_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_peer_permissions
    ADD CONSTRAINT myeve_peer_permissions_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_activity myeve_relay_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_activity
    ADD CONSTRAINT myeve_relay_activity_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_artifacts myeve_relay_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_artifacts
    ADD CONSTRAINT myeve_relay_artifacts_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_connections myeve_relay_connections_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_connections
    ADD CONSTRAINT myeve_relay_connections_address_key UNIQUE (address);


--
-- Name: myeve_relay_connections myeve_relay_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_connections
    ADD CONSTRAINT myeve_relay_connections_pkey PRIMARY KEY (owner_id);


--
-- Name: myeve_relay_external_context myeve_relay_external_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_external_context
    ADD CONSTRAINT myeve_relay_external_context_pkey PRIMARY KEY (owner_id, request_id);


--
-- Name: myeve_relay_grants myeve_relay_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_grants
    ADD CONSTRAINT myeve_relay_grants_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_message_delegations myeve_relay_message_delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_message_delegations
    ADD CONSTRAINT myeve_relay_message_delegations_pkey PRIMARY KEY (owner_id, agent_id, grantee_owner_id, grantee_agent_id);


--
-- Name: myeve_relay_peers myeve_relay_peers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_peers
    ADD CONSTRAINT myeve_relay_peers_pkey PRIMARY KEY (owner_id, address);


--
-- Name: myeve_relay_projection myeve_relay_projection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_projection
    ADD CONSTRAINT myeve_relay_projection_pkey PRIMARY KEY (publication_id, reference);


--
-- Name: myeve_relay_publications myeve_relay_publications_owner_id_relay_view_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_publications
    ADD CONSTRAINT myeve_relay_publications_owner_id_relay_view_id_key UNIQUE (owner_id, relay_view_id);


--
-- Name: myeve_relay_publications myeve_relay_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_publications
    ADD CONSTRAINT myeve_relay_publications_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_receipts myeve_relay_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_receipts
    ADD CONSTRAINT myeve_relay_receipts_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_receipts myeve_relay_receipts_relay_account_id_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_receipts
    ADD CONSTRAINT myeve_relay_receipts_relay_account_id_sequence_key UNIQUE (relay_account_id, sequence);


--
-- Name: myeve_relay_reply_claims myeve_relay_reply_claims_owner_id_reply_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_reply_claims
    ADD CONSTRAINT myeve_relay_reply_claims_owner_id_reply_request_id_key UNIQUE (owner_id, reply_request_id);


--
-- Name: myeve_relay_reply_claims myeve_relay_reply_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_reply_claims
    ADD CONSTRAINT myeve_relay_reply_claims_pkey PRIMARY KEY (owner_id, parent_request_id);


--
-- Name: myeve_relay_requests myeve_relay_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_requests
    ADD CONSTRAINT myeve_relay_requests_pkey PRIMARY KEY (owner_id, request_id);


--
-- Name: outcome_evidence_links outcome_evidence_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcome_evidence_links
    ADD CONSTRAINT outcome_evidence_links_pkey PRIMARY KEY (outcome_id, evidence_type, evidence_id);


--
-- Name: outcomes outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_pkey PRIMARY KEY (id);


--
-- Name: owner_channel_commands owner_channel_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_channel_commands
    ADD CONSTRAINT owner_channel_commands_pkey PRIMARY KEY (command_id);


--
-- Name: owner_channel_nonces owner_channel_nonces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_channel_nonces
    ADD CONSTRAINT owner_channel_nonces_pkey PRIMARY KEY (nonce);


--
-- Name: owner_channel_requests owner_channel_requests_owner_id_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_channel_requests
    ADD CONSTRAINT owner_channel_requests_owner_id_run_id_key UNIQUE (owner_id, run_id);


--
-- Name: owner_channel_requests owner_channel_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_channel_requests
    ADD CONSTRAINT owner_channel_requests_pkey PRIMARY KEY (relay_account_id, request_id);


--
-- Name: owner_channel_requests owner_channel_requests_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_channel_requests
    ADD CONSTRAINT owner_channel_requests_session_id_key UNIQUE (session_id);


--
-- Name: owner_data_operations owner_data_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_data_operations
    ADD CONSTRAINT owner_data_operations_pkey PRIMARY KEY (id);


--
-- Name: owner_model_calls owner_model_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_model_calls
    ADD CONSTRAINT owner_model_calls_pkey PRIMARY KEY (owner_id, run_id, step_key);


--
-- Name: owner_qualification_budget owner_qualification_budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_qualification_budget
    ADD CONSTRAINT owner_qualification_budget_pkey PRIMARY KEY (singleton);


--
-- Name: persistent_browser_profile_grants persistent_browser_profile_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profile_grants
    ADD CONSTRAINT persistent_browser_profile_grants_pkey PRIMARY KEY (id);


--
-- Name: persistent_browser_profiles persistent_browser_profiles_owner_id_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profiles
    ADD CONSTRAINT persistent_browser_profiles_owner_id_agent_id_key UNIQUE (owner_id, agent_id);


--
-- Name: persistent_browser_profiles persistent_browser_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profiles
    ADD CONSTRAINT persistent_browser_profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (endpoint);


--
-- Name: recall_learning_events recall_learning_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_learning_events
    ADD CONSTRAINT recall_learning_events_pkey PRIMARY KEY (owner_id, event_id);


--
-- Name: recall_learning recall_learning_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_learning
    ADD CONSTRAINT recall_learning_pkey PRIMARY KEY (owner_id, id);


--
-- Name: recall_learning_uses recall_learning_uses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_learning_uses
    ADD CONSTRAINT recall_learning_uses_pkey PRIMARY KEY (owner_id, work_id, family_id, version, context_ref);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: review_checkpoints review_checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_checkpoints
    ADD CONSTRAINT review_checkpoints_pkey PRIMARY KEY (id);


--
-- Name: review_deliveries review_deliveries_deduplication_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_deduplication_key_key UNIQUE (deduplication_key);


--
-- Name: review_deliveries review_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_pkey PRIMARY KEY (id);


--
-- Name: review_delivery_attempts review_delivery_attempts_delivery_id_attempt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_attempts
    ADD CONSTRAINT review_delivery_attempts_delivery_id_attempt_number_key UNIQUE (delivery_id, attempt_number);


--
-- Name: review_delivery_attempts review_delivery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_attempts
    ADD CONSTRAINT review_delivery_attempts_pkey PRIMARY KEY (id);


--
-- Name: review_delivery_preferences review_delivery_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_preferences
    ADD CONSTRAINT review_delivery_preferences_pkey PRIMARY KEY (owner_id);


--
-- Name: routine_pending_sends routine_pending_sends_action_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_pending_sends
    ADD CONSTRAINT routine_pending_sends_action_id_key UNIQUE (action_id);


--
-- Name: routine_pending_sends routine_pending_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_pending_sends
    ADD CONSTRAINT routine_pending_sends_pkey PRIMARY KEY (owner_id, run_id);


--
-- Name: run_context_entries run_context_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_context_entries
    ADD CONSTRAINT run_context_entries_pkey PRIMARY KEY (id);


--
-- Name: skill_assignments skill_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_assignments
    ADD CONSTRAINT skill_assignments_pkey PRIMARY KEY (owner_id, agent_id, skill_name);


--
-- Name: skill_eval_results skill_eval_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_eval_results
    ADD CONSTRAINT skill_eval_results_pkey PRIMARY KEY (run_id, skill_name);


--
-- Name: skill_eval_runs skill_eval_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_eval_runs
    ADD CONSTRAINT skill_eval_runs_pkey PRIMARY KEY (id);


--
-- Name: skill_usage_events skill_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_pkey PRIMARY KEY (id);


--
-- Name: skill_usage_events skill_usage_events_session_id_turn_id_skill_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_session_id_turn_id_skill_name_key UNIQUE (session_id, turn_id, skill_name);


--
-- Name: sofie_file_owner_reconciliations sofie_file_owner_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sofie_file_owner_reconciliations
    ADD CONSTRAINT sofie_file_owner_reconciliations_pkey PRIMARY KEY (file_id);


--
-- Name: sofie_migration_bridge_receipts sofie_migration_bridge_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sofie_migration_bridge_receipts
    ADD CONSTRAINT sofie_migration_bridge_receipts_pkey PRIMARY KEY (id);


--
-- Name: sofie_migration_reconciliations sofie_migration_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sofie_migration_reconciliations
    ADD CONSTRAINT sofie_migration_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: sofie_published_main_bridge sofie_published_main_bridge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sofie_published_main_bridge
    ADD CONSTRAINT sofie_published_main_bridge_pkey PRIMARY KEY (id);


--
-- Name: sofie_schema_migrations sofie_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sofie_schema_migrations
    ADD CONSTRAINT sofie_schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: task_acceptance_checks task_acceptance_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_acceptance_checks
    ADD CONSTRAINT task_acceptance_checks_pkey PRIMARY KEY (id);


--
-- Name: task_acceptance_checks task_acceptance_checks_task_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_acceptance_checks
    ADD CONSTRAINT task_acceptance_checks_task_id_slug_key UNIQUE (task_id, slug);


--
-- Name: task_approval_decisions task_approval_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approval_decisions
    ADD CONSTRAINT task_approval_decisions_pkey PRIMARY KEY (id);


--
-- Name: task_artifacts task_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_pkey PRIMARY KEY (id);


--
-- Name: task_artifacts task_artifacts_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_storage_key_key UNIQUE (storage_key);


--
-- Name: task_milestones task_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_milestones
    ADD CONSTRAINT task_milestones_pkey PRIMARY KEY (id);


--
-- Name: task_run_sessions task_run_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_run_sessions
    ADD CONSTRAINT task_run_sessions_pkey PRIMARY KEY (task_id, session_id);


--
-- Name: task_runs task_runs_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: task_runs task_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_pkey PRIMARY KEY (id);


--
-- Name: task_specialists task_specialists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_specialists
    ADD CONSTRAINT task_specialists_pkey PRIMARY KEY (task_id, role);


--
-- Name: task_transitions task_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_transitions
    ADD CONSTRAINT task_transitions_pkey PRIMARY KEY (id);


--
-- Name: telegram_owner_inbound_receipts telegram_owner_inbound_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_owner_inbound_receipts
    ADD CONSTRAINT telegram_owner_inbound_receipts_pkey PRIMARY KEY (owner_id, bot_id, chat_id, message_id);


--
-- Name: thread_summaries thread_summaries_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_summaries
    ADD CONSTRAINT thread_summaries_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: thread_summaries thread_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_summaries
    ADD CONSTRAINT thread_summaries_pkey PRIMARY KEY (id);


--
-- Name: web_chat_threads web_chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_chat_threads
    ADD CONSTRAINT web_chat_threads_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: action_requests_live_binding; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX action_requests_live_binding ON public.action_requests USING btree (owner_id, run_id, parameter_hash) WHERE (status = ANY (ARRAY['planned'::text, 'awaiting_approval'::text, 'authorized'::text, 'executing'::text, 'verifying'::text, 'result_unknown'::text, 'recovering'::text, 'needs_you'::text, 'retryable'::text]));


--
-- Name: action_requests_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_requests_run ON public.action_requests USING btree (owner_id, run_id, created_at);


--
-- Name: agent_audit_owner_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_audit_owner_recent ON public.agent_audit_events USING btree (owner_id, created_at DESC, id DESC);


--
-- Name: agent_capabilities_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_capabilities_owner_agent ON public.agent_capabilities USING btree (owner_id, agent_id, capability_id);


--
-- Name: agent_runs_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_owner_agent ON public.agent_runs USING btree (owner_id, agent_id, updated_at DESC);


--
-- Name: agent_runs_owner_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_owner_role ON public.agent_runs USING btree (owner_id, role_id, updated_at DESC) WHERE (role_id IS NOT NULL);


--
-- Name: agent_runs_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_session ON public.agent_runs USING btree (session_id, updated_at DESC);


--
-- Name: agentphone_usage_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agentphone_usage_event_created ON public.agentphone_usage_event USING btree (created_at DESC);


--
-- Name: agents_one_primary_per_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agents_one_primary_per_owner ON public.agents USING btree (owner_id) WHERE is_primary;


--
-- Name: agents_owner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_owner_status ON public.agents USING btree (owner_id, status, updated_at DESC);


--
-- Name: automation_runs_by_automation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_by_automation ON public.automation_runs USING btree (kind, automation_id, fired_at DESC);


--
-- Name: chat_files_owner_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_files_owner_created_idx ON public.chat_files USING btree (owner_id, created_at DESC);


--
-- Name: chat_files_owner_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_files_owner_thread_idx ON public.chat_files USING btree (owner_id, thread_id, created_at DESC);


--
-- Name: computer_actions_session_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_actions_session_timeline ON public.computer_actions USING btree (computer_session_id, started_at, id);


--
-- Name: computer_artifacts_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_artifacts_session ON public.computer_artifacts USING btree (computer_session_id, created_at, id);


--
-- Name: computer_control_receipts_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_control_receipts_timeline ON public.computer_control_receipts USING btree (owner_id, computer_session_id, created_at DESC, id DESC);


--
-- Name: computer_resource_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX computer_resource_current ON public.computer_resource_lifecycles USING btree (computer_session_id) WHERE (state = ANY (ARRAY['provisioning'::text, 'active'::text]));


--
-- Name: computer_resource_owner_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_resource_owner_session ON public.computer_resource_lifecycles USING btree (owner_id, computer_session_id, generation DESC);


--
-- Name: computer_resource_recovery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_resource_recovery ON public.computer_resource_lifecycles USING btree (environment, state, retry_after);


--
-- Name: computer_sessions_agent_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_sessions_agent_recent ON public.computer_sessions USING btree (owner_id, agent_id, last_activity_at DESC, id DESC);


--
-- Name: computer_sessions_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_sessions_expiry ON public.computer_sessions USING btree (expires_at) WHERE (status = ANY (ARRAY['provisioning'::text, 'ready'::text, 'running'::text, 'paused'::text]));


--
-- Name: computer_sessions_one_active_runtime; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX computer_sessions_one_active_runtime ON public.computer_sessions USING btree (runtime_session_id) WHERE (status = ANY (ARRAY['provisioning'::text, 'ready'::text, 'running'::text, 'paused'::text]));


--
-- Name: computer_sessions_owner_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_sessions_owner_recent ON public.computer_sessions USING btree (owner_id, last_activity_at DESC, id DESC);


--
-- Name: computer_template_events_preparation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_template_events_preparation ON public.computer_template_events USING btree (preparation_id, created_at);


--
-- Name: computer_template_live_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX computer_template_live_key ON public.computer_template_preparations USING btree (scope, fingerprint) WHERE (state = ANY (ARRAY['PREPARING'::text, 'READY'::text, 'CLEANING'::text]));


--
-- Name: computer_template_recovery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_template_recovery ON public.computer_template_preparations USING btree (state, deadline);


--
-- Name: computer_template_waiters_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_template_waiters_key ON public.computer_template_waiters USING btree (scope, fingerprint, expires_at);


--
-- Name: context_assemblies_run_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX context_assemblies_run_recent ON public.context_assemblies USING btree (owner_id, agent_id, session_id, created_at DESC);


--
-- Name: delivery_occurrence_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX delivery_occurrence_channel ON public.review_deliveries USING btree (owner_id, occurrence_id, requested_channel) WHERE (occurrence_id IS NOT NULL);


--
-- Name: engineering_direct_verification_jobs_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_direct_verification_jobs_pending ON public.engineering_direct_verification_jobs USING btree (status, updated_at, work_id) WHERE (status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'RECOVERY_REQUIRED'::text]));


--
-- Name: engineering_execution_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_execution_updated ON public.engineering_execution USING btree (updated_at);


--
-- Name: engineering_factory_current_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX engineering_factory_current_request ON public.engineering_factory_requests USING btree (scope_id, scope_kind, work_id) WHERE current;


--
-- Name: engineering_factory_prepare_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX engineering_factory_prepare_request ON public.engineering_routing_decisions USING btree (((factory_preparation #>> '{request,requestId}'::text[]))) WHERE (factory_preparation IS NOT NULL);


--
-- Name: engineering_factory_results_work; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_factory_results_work ON public.engineering_factory_results USING btree (scope_id, scope_kind, work_id, received_at DESC, id);


--
-- Name: engineering_learning_drafts_work_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_learning_drafts_work_recent ON public.engineering_learning_drafts USING btree (scope_id, scope_kind, work_id, created_at DESC, id DESC);


--
-- Name: engineering_route_runs_one_open_writer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX engineering_route_runs_one_open_writer ON public.engineering_route_runs USING btree (scope_id, scope_kind, work_id) WHERE (status <> ALL (ARRAY['COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text]));


--
-- Name: engineering_route_runs_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_route_runs_recent ON public.engineering_route_runs USING btree (scope_id, scope_kind, work_id, updated_at DESC, id);


--
-- Name: engineering_route_transitions_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_route_transitions_recent ON public.engineering_route_transitions USING btree (scope_id, scope_kind, work_id, created_at DESC, id);


--
-- Name: engineering_routing_decisions_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_routing_decisions_recent ON public.engineering_routing_decisions USING btree (scope_id, scope_kind, work_id, work_version DESC);


--
-- Name: engineering_work_knowledge_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_work_knowledge_recent ON public.engineering_work_knowledge USING btree (scope_id, scope_kind, work_id, created_at DESC, knowledge_id);


--
-- Name: engineering_work_model_calls_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_work_model_calls_unresolved ON public.engineering_work_model_calls USING btree (scope_id, scope_kind, work_id, status);


--
-- Name: engineering_work_scope_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engineering_work_scope_updated ON public.engineering_work USING btree (scope_id, scope_kind, updated_at DESC, id);


--
-- Name: engineering_writer_generation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX engineering_writer_generation ON public.engineering_route_runs USING btree (scope_id, scope_kind, work_id, writer_generation);


--
-- Name: eve_events_delivery_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eve_events_delivery_queue ON public.eve_events USING btree (owner_id, delivery_classification, occurred_at DESC) WHERE (delivery_classification = ANY (ARRAY['digest'::text, 'push'::text, 'urgent'::text]));


--
-- Name: eve_events_goal_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eve_events_goal_timeline ON public.eve_events USING btree (goal_id, occurred_at DESC, id DESC) WHERE (goal_id IS NOT NULL);


--
-- Name: eve_events_owner_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX eve_events_owner_idempotency ON public.eve_events USING btree (owner_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: eve_events_owner_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eve_events_owner_timeline ON public.eve_events USING btree (owner_id, occurred_at DESC, id DESC);


--
-- Name: execution_occurrence_runtime; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX execution_occurrence_runtime ON public.execution_occurrences USING btree (runtime_session_id) WHERE (runtime_session_id IS NOT NULL);


--
-- Name: execution_occurrences_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_occurrences_due ON public.execution_occurrences USING btree (next_attempt_at, scheduled_for) WHERE (status = ANY (ARRAY['pending'::text, 'retrying'::text]));


--
-- Name: goal_milestones_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_milestones_order ON public.goal_milestones USING btree (goal_id, "position", created_at, id);


--
-- Name: goal_plans_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_plans_active ON public.goal_plans USING btree (goal_id, version DESC) WHERE (status = 'active'::text);


--
-- Name: goal_task_dependencies_reverse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_task_dependencies_reverse ON public.goal_task_dependencies USING btree (depends_on_task_id, task_id);


--
-- Name: goal_tasks_by_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_tasks_by_goal ON public.goal_tasks USING btree (goal_id, "position", created_at, id);


--
-- Name: goal_tasks_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_tasks_due ON public.goal_tasks USING btree (goal_id, status, due_at) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text]));


--
-- Name: goal_threads_by_owner_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_threads_by_owner_thread ON public.goal_thread_links USING btree (owner_id, thread_id, created_at DESC);


--
-- Name: goal_work_active_goals; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_work_active_goals ON public.goals USING btree (owner_id, id) WHERE (status = 'active'::text);


--
-- Name: goal_work_dependencies_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_work_dependencies_due ON public.goal_work_dependencies USING btree (owner_id, not_before, task_id) WHERE ((resolved_at IS NULL) AND (kind = 'schedule'::text));


--
-- Name: goal_work_dependencies_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_work_dependencies_goal ON public.goal_work_dependencies USING btree (owner_id, goal_id, task_id, id);


--
-- Name: goal_work_dependency_reverse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_work_dependency_reverse ON public.goal_work_dependencies USING btree (owner_id, goal_id, reference) WHERE (kind = 'task'::text);


--
-- Name: goal_work_interventions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_work_interventions ON public.eve_events USING btree (owner_id, goal_id) WHERE (type = 'HUMAN_INTERVENTION'::text);


--
-- Name: goal_work_links_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_work_links_owner ON public.goal_work_links USING btree (owner_id, goal_id, task_id, created_at DESC);


--
-- Name: goals_owner_focus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_owner_focus ON public.goals USING btree (owner_id, priority, target_date, updated_at DESC) WHERE (status = ANY (ARRAY['active'::text, 'blocked'::text, 'waiting'::text]));


--
-- Name: goals_owner_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX goals_owner_idempotency ON public.goals USING btree (owner_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: goals_owner_status_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_owner_status_updated ON public.goals USING btree (owner_id, status, updated_at DESC, id DESC);


--
-- Name: inbox_action_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_action_window ON public.inbox_attention_items USING btree (owner_id, ((data ->> 'actionRequiredAt'::text))) WHERE (needs_action = 1);


--
-- Name: inbox_correlation_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_correlation_thread ON public.inbox_attention_items USING btree (owner_id, ((data ->> 'correlationId'::text)), score DESC, deadline, id);


--
-- Name: inbox_episode_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inbox_episode_identity ON public.inbox_attention_items USING btree (owner_id, ((data ->> 'correlationId'::text)), (((data ->> 'episode'::text))::integer));


--
-- Name: inbox_evidence_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_evidence_page ON public.inbox_attention_evidence USING btree (owner_id, item_id, id);


--
-- Name: inbox_followup_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_followup_due ON public.inbox_attention_items USING btree (owner_id, ((data ->> 'followUpAt'::text))) WHERE (status = 'WAITING'::text);


--
-- Name: inbox_needs_you; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_needs_you ON public.inbox_attention_items USING btree (owner_id, needs_action, score DESC, deadline, id);


--
-- Name: inbox_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_page ON public.inbox_attention_items USING btree (owner_id, score DESC, deadline, id);


--
-- Name: inbox_replies_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_replies_window ON public.inbox_attention_items USING btree (owner_id, ((data ->> 'lastExternalReplyAt'::text)));


--
-- Name: inbox_resolved_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_resolved_window ON public.inbox_attention_items USING btree (owner_id, ((data ->> 'resolvedAt'::text))) WHERE (status = 'RESOLVED'::text);


--
-- Name: inbox_response_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_response_pending ON public.inbox_attention_responses USING btree (owner_id, status, id);


--
-- Name: inbox_work_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_work_thread ON public.inbox_attention_items USING btree (owner_id, ((data ->> 'workId'::text)), score DESC, deadline, id);


--
-- Name: knowledge_provenance_owner_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_provenance_owner_claim ON public.knowledge_provenance_links USING btree (owner_id, knowledge_id, created_at DESC);


--
-- Name: knowledge_records_one_successor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX knowledge_records_one_successor ON public.knowledge_records USING btree (owner_id, supersedes_id) WHERE (supersedes_id IS NOT NULL);


--
-- Name: knowledge_records_owner_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_records_owner_goal ON public.knowledge_records USING btree (owner_id, goal_id, updated_at DESC) WHERE (goal_id IS NOT NULL);


--
-- Name: knowledge_records_owner_kind_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_records_owner_kind_status ON public.knowledge_records USING btree (owner_id, kind, status, updated_at DESC, id DESC);


--
-- Name: knowledge_records_owner_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_records_owner_search ON public.knowledge_records USING gin (to_tsvector('english'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || statement)));


--
-- Name: knowledge_relationships_owner_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_relationships_owner_object ON public.knowledge_relationships USING btree (owner_id, object_type, object_id, status, updated_at DESC);


--
-- Name: knowledge_relationships_owner_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_relationships_owner_subject ON public.knowledge_relationships USING btree (owner_id, subject_type, subject_id, status, updated_at DESC);


--
-- Name: knowledge_sources_owner_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX knowledge_sources_owner_external ON public.knowledge_sources USING btree (owner_id, provider, external_id) WHERE ((provider IS NOT NULL) AND (external_id IS NOT NULL));


--
-- Name: knowledge_sources_owner_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_sources_owner_recent ON public.knowledge_sources USING btree (owner_id, captured_at DESC, id DESC);


--
-- Name: memory_records_owner_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX memory_records_owner_provider_id ON public.memory_records USING btree (owner_id, provider, provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: memory_records_scope_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_records_scope_active ON public.memory_records USING btree (owner_id, scope_type, scope_id, updated_at DESC) WHERE (status = 'active'::text);


--
-- Name: myeve_peer_permissions_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX myeve_peer_permissions_owner_agent ON public.myeve_peer_permissions USING btree (owner_id, local_agent_id);


--
-- Name: myeve_relay_activity_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX myeve_relay_activity_owner ON public.myeve_relay_activity USING btree (owner_id, created_at);


--
-- Name: myeve_relay_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX myeve_relay_inbox ON public.myeve_relay_requests USING btree (owner_id, state, created_at);


--
-- Name: outcome_evidence_reverse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outcome_evidence_reverse ON public.outcome_evidence_links USING btree (evidence_type, evidence_id, outcome_id);


--
-- Name: outcomes_goal_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outcomes_goal_timeline ON public.outcomes USING btree (goal_id, occurred_at DESC, id DESC) WHERE (goal_id IS NOT NULL);


--
-- Name: outcomes_owner_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outcomes_owner_idempotency ON public.outcomes USING btree (owner_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: outcomes_owner_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outcomes_owner_timeline ON public.outcomes USING btree (owner_id, occurred_at DESC, id DESC);


--
-- Name: owner_data_operations_owner_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_data_operations_owner_history ON public.owner_data_operations USING btree (owner_id, created_at DESC, id DESC);


--
-- Name: persistent_browser_profile_grants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX persistent_browser_profile_grants_active ON public.persistent_browser_profile_grants USING btree (profile_id, agent_id) WHERE (revoked_at IS NULL);


--
-- Name: persistent_browser_profile_grants_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX persistent_browser_profile_grants_agent ON public.persistent_browser_profile_grants USING btree (owner_id, agent_id) WHERE (revoked_at IS NULL);


--
-- Name: persistent_browser_profiles_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX persistent_browser_profiles_owner ON public.persistent_browser_profiles USING btree (owner_id, updated_at DESC);


--
-- Name: push_subscriptions_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_owner ON public.push_subscriptions USING btree (owner_id, created_at DESC);


--
-- Name: recall_learning_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recall_learning_scope ON public.recall_learning USING btree (owner_id, repository, work_type, work_id);


--
-- Name: recall_learning_uses_work; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recall_learning_uses_work ON public.recall_learning_uses USING btree (owner_id, work_id, recorded_at DESC);


--
-- Name: receipts_by_purchase_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipts_by_purchase_date ON public.receipts USING btree (purchased_at DESC, id DESC);


--
-- Name: reminders_owner_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_owner_review ON public.reminders USING btree (owner_id, status, reviewed_version);


--
-- Name: review_checkpoints_owner_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_checkpoints_owner_latest ON public.review_checkpoints USING btree (owner_id, review_kind, last_generated_at DESC);


--
-- Name: review_checkpoints_owner_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX review_checkpoints_owner_period ON public.review_checkpoints USING btree (owner_id, review_kind, local_period_key) WHERE (local_period_key IS NOT NULL);


--
-- Name: review_deliveries_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_deliveries_due ON public.review_deliveries USING btree (next_attempt_at, scheduled_for) WHERE (status = ANY (ARRAY['scheduled'::text, 'deferred'::text, 'failed'::text]));


--
-- Name: review_deliveries_owner_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_deliveries_owner_history ON public.review_deliveries USING btree (owner_id, scheduled_for DESC, id DESC);


--
-- Name: review_delivery_preferences_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_delivery_preferences_due ON public.review_delivery_preferences USING btree (daily_next_at, weekly_next_at) WHERE (daily_brief_enabled OR weekly_review_enabled);


--
-- Name: run_context_entries_execution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX run_context_entries_execution ON public.run_context_entries USING btree (owner_id, agent_id, task_run_id, updated_at DESC) WHERE (status = 'active'::text);


--
-- Name: skill_assignments_by_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_assignments_by_owner_agent ON public.skill_assignments USING btree (owner_id, agent_id, enabled, skill_name);


--
-- Name: skill_eval_results_by_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_eval_results_by_skill ON public.skill_eval_results USING btree (skill_name, completed_at DESC, run_id DESC);


--
-- Name: skill_eval_results_by_skill_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_eval_results_by_skill_hash ON public.skill_eval_results USING btree (skill_name, content_hash, completed_at DESC);


--
-- Name: skill_eval_runs_by_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_eval_runs_by_owner ON public.skill_eval_runs USING btree (owner_id, started_at DESC);


--
-- Name: skill_usage_by_owner_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_usage_by_owner_skill ON public.skill_usage_events USING btree (owner_id, skill_name, occurred_at DESC);


--
-- Name: skill_usage_by_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_usage_by_task ON public.skill_usage_events USING btree (owner_id, task_run_id, occurred_at DESC) WHERE (task_run_id IS NOT NULL);


--
-- Name: task_approval_owner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_approval_owner_status ON public.task_approval_decisions USING btree (owner_id, status, requested_at DESC, id DESC);


--
-- Name: task_milestones_by_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_milestones_by_task ON public.task_milestones USING btree (task_id, created_at, id);


--
-- Name: task_run_sessions_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX task_run_sessions_current ON public.task_run_sessions USING btree (session_id) WHERE is_current;


--
-- Name: task_run_sessions_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_run_sessions_history ON public.task_run_sessions USING btree (session_id, task_id);


--
-- Name: task_runs_by_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_by_goal ON public.task_runs USING btree (owner_id, goal_id, updated_at DESC) WHERE (goal_id IS NOT NULL);


--
-- Name: task_runs_by_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_by_owner ON public.task_runs USING btree (owner_id, updated_at DESC, id DESC);


--
-- Name: task_runs_by_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_by_thread ON public.task_runs USING btree (owner_id, thread_id, updated_at DESC) WHERE (thread_id IS NOT NULL);


--
-- Name: task_runs_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_owner_agent ON public.task_runs USING btree (owner_id, agent_id, updated_at DESC) WHERE (agent_id IS NOT NULL);


--
-- Name: task_runs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_parent ON public.task_runs USING btree (owner_id, parent_task_id, created_at) WHERE (parent_task_id IS NOT NULL);


--
-- Name: task_transitions_by_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_transitions_by_task ON public.task_transitions USING btree (task_id, created_at, id);


--
-- Name: telegram_owner_receipts_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_owner_receipts_unresolved ON public.telegram_owner_inbound_receipts USING btree (owner_id, updated_at) WHERE (status = ANY (ARRAY['DISPATCH_UNKNOWN'::text, 'TURN_STARTED'::text, 'REPLY_UNKNOWN'::text]));


--
-- Name: thread_summaries_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX thread_summaries_one_active ON public.thread_summaries USING btree (owner_id, thread_id) WHERE (status = 'active'::text);


--
-- Name: web_chat_threads_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_chat_threads_owner_agent ON public.web_chat_threads USING btree (owner_id, agent_id, updated_at DESC);


--
-- Name: web_chat_threads_owner_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_chat_threads_owner_role ON public.web_chat_threads USING btree (owner_id, role_id, updated_at DESC) WHERE (role_id IS NOT NULL);


--
-- Name: goal_work_links beta_goal_result_fence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER beta_goal_result_fence BEFORE INSERT OR UPDATE ON public.goal_work_links FOR EACH ROW EXECUTE FUNCTION public.beta_goal_result_fence();


--
-- Name: engineering_native_results beta_new_result_invalidation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER beta_new_result_invalidation BEFORE INSERT ON public.engineering_native_results FOR EACH ROW EXECUTE FUNCTION public.beta_new_result_invalidation();


--
-- Name: beta_result_provenance beta_result_provenance_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER beta_result_provenance_immutable BEFORE DELETE OR UPDATE ON public.beta_result_provenance FOR EACH ROW EXECUTE FUNCTION public.engineering_native_result_immutable();


--
-- Name: engineering_work beta_work_evidence_invalidation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER beta_work_evidence_invalidation AFTER UPDATE ON public.engineering_work FOR EACH ROW EXECUTE FUNCTION public.beta_work_evidence_invalidation();


--
-- Name: engineering_routing_decisions completion_admission_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER completion_admission_immutable BEFORE UPDATE ON public.engineering_routing_decisions FOR EACH ROW EXECUTE FUNCTION public.engineering_completion_immutable();


--
-- Name: engineering_work_model_calls completion_call_capacity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER completion_call_capacity BEFORE INSERT ON public.engineering_work_model_calls FOR EACH ROW EXECUTE FUNCTION public.engineering_completion_call();


--
-- Name: engineering_work_model_calls completion_dispatch_capacity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER completion_dispatch_capacity BEFORE UPDATE ON public.engineering_work_model_calls FOR EACH ROW EXECUTE FUNCTION public.engineering_completion_dispatch();


--
-- Name: computer_resource_lifecycles computer_resource_binding_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER computer_resource_binding_immutable BEFORE UPDATE ON public.computer_resource_lifecycles FOR EACH ROW EXECUTE FUNCTION public.preserve_computer_resource_binding();


--
-- Name: engineering_conversation_budget conversation_budget_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversation_budget_frozen BEFORE INSERT OR DELETE OR UPDATE ON public.engineering_conversation_budget FOR EACH ROW EXECUTE FUNCTION public.engineering_legacy_budget_frozen();


--
-- Name: engineering_conversation_calls conversation_calls_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversation_calls_frozen BEFORE INSERT OR DELETE OR UPDATE ON public.engineering_conversation_calls FOR EACH ROW EXECUTE FUNCTION public.engineering_legacy_budget_frozen();


--
-- Name: engineering_routing_decisions engineering_factory_prepare_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engineering_factory_prepare_guard BEFORE INSERT OR DELETE OR UPDATE ON public.engineering_routing_decisions FOR EACH ROW EXECUTE FUNCTION public.engineering_factory_prepare_guard();


--
-- Name: engineering_native_runtime engineering_native_custody_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engineering_native_custody_guard BEFORE INSERT OR DELETE OR UPDATE ON public.engineering_native_runtime FOR EACH ROW EXECUTE FUNCTION public.engineering_writer_custody_guard();


--
-- Name: engineering_native_results engineering_native_result_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engineering_native_result_immutable BEFORE DELETE OR UPDATE ON public.engineering_native_results FOR EACH ROW EXECUTE FUNCTION public.engineering_native_result_immutable();


--
-- Name: engineering_direct_workspaces engineering_workspace_custody_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engineering_workspace_custody_guard BEFORE INSERT OR DELETE OR UPDATE ON public.engineering_direct_workspaces FOR EACH ROW EXECUTE FUNCTION public.engineering_writer_custody_guard();


--
-- Name: engineering_work engineering_writer_control_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engineering_writer_control_guard BEFORE UPDATE ON public.engineering_work FOR EACH ROW EXECUTE FUNCTION public.engineering_writer_control_guard();


--
-- Name: engineering_route_runs engineering_writer_history_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engineering_writer_history_no_delete BEFORE DELETE ON public.engineering_route_runs FOR EACH ROW EXECUTE FUNCTION public.engineering_writer_history_no_delete();


--
-- Name: engineering_route_runs engineering_writer_run_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engineering_writer_run_guard BEFORE INSERT OR UPDATE ON public.engineering_route_runs FOR EACH ROW EXECUTE FUNCTION public.engineering_writer_run_guard();


--
-- Name: execution_routines execution_routines_revoke_changed_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER execution_routines_revoke_changed_authority BEFORE UPDATE ON public.execution_routines FOR EACH ROW EXECUTE FUNCTION public.revoke_changed_routine_authority();


--
-- Name: goal_task_dependencies goal_work_dependency_fence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goal_work_dependency_fence AFTER INSERT OR DELETE ON public.goal_task_dependencies FOR EACH ROW EXECUTE FUNCTION public.goal_work_dependency_fence();


--
-- Name: goals goal_work_goal_fence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goal_work_goal_fence BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.goal_work_goal_fence();


--
-- Name: goal_plans goal_work_plan_fence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goal_work_plan_fence BEFORE INSERT ON public.goal_plans FOR EACH ROW EXECUTE FUNCTION public.goal_work_plan_fence();


--
-- Name: goal_tasks goal_work_task_fence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goal_work_task_fence BEFORE INSERT OR DELETE OR UPDATE ON public.goal_tasks FOR EACH ROW EXECUTE FUNCTION public.goal_work_task_fence();


--
-- Name: inbox_attention_evidence inbox_evidence_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_evidence_history BEFORE UPDATE ON public.inbox_attention_evidence FOR EACH ROW EXECUTE FUNCTION public.inbox_guard_history();


--
-- Name: inbox_attention_items inbox_item_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_item_history BEFORE UPDATE ON public.inbox_attention_items FOR EACH ROW EXECUTE FUNCTION public.inbox_guard_history();


--
-- Name: inbox_attention_responses inbox_response_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_response_history BEFORE UPDATE ON public.inbox_attention_responses FOR EACH ROW EXECUTE FUNCTION public.inbox_guard_history();


--
-- Name: engineering_model_calls legacy_executor_common_fence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER legacy_executor_common_fence BEFORE INSERT ON public.engineering_model_calls FOR EACH ROW EXECUTE FUNCTION public.engineering_legacy_executor_common_fence();


--
-- Name: engineering_native_model_calls native_calls_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER native_calls_frozen BEFORE INSERT OR DELETE OR UPDATE ON public.engineering_native_model_calls FOR EACH ROW EXECUTE FUNCTION public.engineering_legacy_budget_frozen();


--
-- Name: engineering_route_runs native_completion_admission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER native_completion_admission BEFORE INSERT ON public.engineering_route_runs FOR EACH ROW EXECUTE FUNCTION public.engineering_completion_admission();


--
-- Name: engineering_native_runtime native_economics_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER native_economics_frozen BEFORE UPDATE ON public.engineering_native_runtime FOR EACH ROW EXECUTE FUNCTION public.engineering_native_economics_frozen();


--
-- Name: owner_model_calls owner_model_qualification_accounting; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER owner_model_qualification_accounting BEFORE INSERT OR UPDATE ON public.owner_model_calls FOR EACH ROW EXECUTE FUNCTION public.account_owner_qualification_model_call();


--
-- Name: recall_learning recall_event_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER recall_event_identity AFTER INSERT OR UPDATE ON public.recall_learning FOR EACH ROW EXECUTE FUNCTION public.recall_claim_events();


--
-- Name: recall_learning recall_family_integrity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER recall_family_integrity BEFORE INSERT OR UPDATE ON public.recall_learning FOR EACH ROW EXECUTE FUNCTION public.recall_validate_family();


--
-- Name: recall_learning_uses recall_use_integrity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER recall_use_integrity BEFORE INSERT ON public.recall_learning_uses FOR EACH ROW EXECUTE FUNCTION public.recall_validate_use();


--
-- Name: reminders reminders_invalidate_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reminders_invalidate_authority BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.invalidate_reminder_authority();


--
-- Name: engineering_work_model_calls work_model_receipt_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_model_receipt_identity BEFORE DELETE OR UPDATE ON public.engineering_work_model_calls FOR EACH ROW EXECUTE FUNCTION public.engineering_model_receipt_identity();


--
-- Name: action_receipts action_receipts_owner_id_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_receipts
    ADD CONSTRAINT action_receipts_owner_id_action_id_fkey FOREIGN KEY (owner_id, action_id) REFERENCES public.action_requests(owner_id, id);


--
-- Name: action_requests action_requests_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.task_approval_decisions(id);


--
-- Name: action_requests action_requests_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id);


--
-- Name: action_requests action_requests_owner_id_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_owner_id_occurrence_id_fkey FOREIGN KEY (owner_id, occurrence_id) REFERENCES public.execution_occurrences(owner_id, id);


--
-- Name: action_requests action_requests_owner_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_owner_id_run_id_fkey FOREIGN KEY (owner_id, run_id) REFERENCES public.task_runs(owner_id, id);


--
-- Name: agent_audit_events agent_audit_events_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_audit_events
    ADD CONSTRAINT agent_audit_events_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: agent_capabilities agent_capabilities_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_capabilities
    ADD CONSTRAINT agent_capabilities_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE CASCADE;


--
-- Name: agent_runs agent_runs_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: beta_goal_attention_snapshots beta_goal_attention_snapshots_owner_id_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_goal_attention_snapshots
    ADD CONSTRAINT beta_goal_attention_snapshots_owner_id_goal_id_fkey FOREIGN KEY (owner_id, goal_id) REFERENCES public.goals(owner_id, id);


--
-- Name: beta_goal_work_bindings beta_goal_work_bindings_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_goal_work_bindings
    ADD CONSTRAINT beta_goal_work_bindings_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.engineering_work(id);


--
-- Name: beta_result_provenance beta_result_provenance_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_result_provenance
    ADD CONSTRAINT beta_result_provenance_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.engineering_native_results(id);


--
-- Name: beta_work_admission_attempts beta_work_admission_attempts_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_admission_attempts
    ADD CONSTRAINT beta_work_admission_attempts_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.engineering_work(id);


--
-- Name: beta_work_contexts beta_work_contexts_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_contexts
    ADD CONSTRAINT beta_work_contexts_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.engineering_work(id);


--
-- Name: beta_work_continuations beta_work_continuations_owner_id_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_continuations
    ADD CONSTRAINT beta_work_continuations_owner_id_action_id_fkey FOREIGN KEY (owner_id, action_id) REFERENCES public.beta_work_decisions(owner_id, action_id);


--
-- Name: beta_work_continuations beta_work_continuations_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_continuations
    ADD CONSTRAINT beta_work_continuations_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.engineering_work(id);


--
-- Name: beta_work_decisions beta_work_decisions_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_work_decisions
    ADD CONSTRAINT beta_work_decisions_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.engineering_work(id);


--
-- Name: browser_sessions browser_sessions_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_sessions
    ADD CONSTRAINT browser_sessions_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: capsule_memory_policy capsule_memory_policy_owner_id_memory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capsule_memory_policy
    ADD CONSTRAINT capsule_memory_policy_owner_id_memory_id_fkey FOREIGN KEY (owner_id, memory_id) REFERENCES public.memory_records(owner_id, id) ON DELETE CASCADE;


--
-- Name: computer_actions computer_actions_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_actions
    ADD CONSTRAINT computer_actions_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_actions computer_actions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_actions
    ADD CONSTRAINT computer_actions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_artifacts computer_artifacts_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.computer_actions(id) ON DELETE SET NULL;


--
-- Name: computer_artifacts computer_artifacts_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_artifacts computer_artifacts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_control_leases computer_control_leases_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_leases
    ADD CONSTRAINT computer_control_leases_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_control_leases computer_control_leases_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_leases
    ADD CONSTRAINT computer_control_leases_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: computer_control_leases computer_control_leases_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_leases
    ADD CONSTRAINT computer_control_leases_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_control_receipts computer_control_receipts_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_receipts
    ADD CONSTRAINT computer_control_receipts_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_control_receipts computer_control_receipts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_receipts
    ADD CONSTRAINT computer_control_receipts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_sessions computer_sessions_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: computer_sessions computer_sessions_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: computer_sessions computer_sessions_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: computer_sessions computer_sessions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_template_events computer_template_events_preparation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_template_events
    ADD CONSTRAINT computer_template_events_preparation_id_fkey FOREIGN KEY (preparation_id) REFERENCES public.computer_template_preparations(id);


--
-- Name: context_assemblies context_assemblies_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_assemblies
    ADD CONSTRAINT context_assemblies_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: context_assemblies context_assemblies_thread_summary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_assemblies
    ADD CONSTRAINT context_assemblies_thread_summary_id_fkey FOREIGN KEY (thread_summary_id) REFERENCES public.thread_summaries(id) ON DELETE SET NULL;


--
-- Name: engineering_conversation_budget engineering_conversation_budge_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_conversation_budget
    ADD CONSTRAINT engineering_conversation_budge_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_conversation_calls engineering_conversation_calls_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_conversation_calls
    ADD CONSTRAINT engineering_conversation_calls_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_conversation_budget(scope_id, scope_kind, work_id);


--
-- Name: engineering_direct_verification_jobs engineering_direct_verificatio_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_verification_jobs
    ADD CONSTRAINT engineering_direct_verificatio_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_direct_workspaces(scope_id, scope_kind, work_id) ON DELETE RESTRICT;


--
-- Name: engineering_direct_verification_jobs engineering_direct_verification_jobs_route_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_verification_jobs
    ADD CONSTRAINT engineering_direct_verification_jobs_route_run_id_fkey FOREIGN KEY (route_run_id) REFERENCES public.engineering_route_runs(id);


--
-- Name: engineering_direct_workspaces engineering_direct_workspaces_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_workspaces
    ADD CONSTRAINT engineering_direct_workspaces_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.engineering_routing_decisions(id);


--
-- Name: engineering_direct_workspaces engineering_direct_workspaces_factory_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_workspaces
    ADD CONSTRAINT engineering_direct_workspaces_factory_receipt_id_fkey FOREIGN KEY (factory_receipt_id) REFERENCES public.engineering_factory_receipts(id);


--
-- Name: engineering_direct_workspaces engineering_direct_workspaces_route_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_workspaces
    ADD CONSTRAINT engineering_direct_workspaces_route_run_id_fkey FOREIGN KEY (route_run_id) REFERENCES public.engineering_route_runs(id);


--
-- Name: engineering_direct_workspaces engineering_direct_workspaces_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_direct_workspaces
    ADD CONSTRAINT engineering_direct_workspaces_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id) ON DELETE RESTRICT;


--
-- Name: engineering_execution_history engineering_execution_history_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_execution_history
    ADD CONSTRAINT engineering_execution_history_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_execution(scope_id, scope_kind, work_id);


--
-- Name: engineering_execution engineering_execution_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_execution
    ADD CONSTRAINT engineering_execution_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_factory_admissions engineering_factory_admissions_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_admissions
    ADD CONSTRAINT engineering_factory_admissions_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.engineering_factory_requests(id);


--
-- Name: engineering_factory_admissions engineering_factory_admissions_request_id_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_admissions
    ADD CONSTRAINT engineering_factory_admissions_request_id_receipt_id_fkey FOREIGN KEY (request_id, receipt_id) REFERENCES public.engineering_factory_receipts(request_id, id);


--
-- Name: engineering_factory_receipts engineering_factory_receipts_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_receipts
    ADD CONSTRAINT engineering_factory_receipts_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.engineering_factory_requests(id);


--
-- Name: engineering_factory_requests engineering_factory_requests_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_requests
    ADD CONSTRAINT engineering_factory_requests_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_factory_result_conflicts engineering_factory_result_co_scope_id_scope_kind_work_id__fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_result_conflicts
    ADD CONSTRAINT engineering_factory_result_co_scope_id_scope_kind_work_id__fkey FOREIGN KEY (scope_id, scope_kind, work_id, receipt_id) REFERENCES public.engineering_factory_results(scope_id, scope_kind, work_id, id);


--
-- Name: engineering_factory_results engineering_factory_results_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_factory_results
    ADD CONSTRAINT engineering_factory_results_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_learning_drafts engineering_learning_drafts_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_learning_drafts
    ADD CONSTRAINT engineering_learning_drafts_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id) ON DELETE RESTRICT;


--
-- Name: engineering_model_calls engineering_model_calls_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_model_calls
    ADD CONSTRAINT engineering_model_calls_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_execution(scope_id, scope_kind, work_id);


--
-- Name: engineering_native_model_calls engineering_native_model_calls_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_model_calls
    ADD CONSTRAINT engineering_native_model_calls_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_native_runtime(scope_id, scope_kind, work_id);


--
-- Name: engineering_native_results engineering_native_results_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_results
    ADD CONSTRAINT engineering_native_results_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_native_runtime engineering_native_runtime_route_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_runtime
    ADD CONSTRAINT engineering_native_runtime_route_run_id_fkey FOREIGN KEY (route_run_id) REFERENCES public.engineering_route_runs(id);


--
-- Name: engineering_native_runtime engineering_native_runtime_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_native_runtime
    ADD CONSTRAINT engineering_native_runtime_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_route_runs engineering_route_runs_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_runs
    ADD CONSTRAINT engineering_route_runs_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.engineering_routing_decisions(id);


--
-- Name: engineering_route_runs engineering_route_runs_factory_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_runs
    ADD CONSTRAINT engineering_route_runs_factory_request_id_fkey FOREIGN KEY (factory_request_id) REFERENCES public.engineering_factory_requests(id);


--
-- Name: engineering_route_runs engineering_route_runs_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_runs
    ADD CONSTRAINT engineering_route_runs_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_route_transitions engineering_route_transitions_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_transitions
    ADD CONSTRAINT engineering_route_transitions_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.engineering_routing_decisions(id);


--
-- Name: engineering_route_transitions engineering_route_transitions_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_route_transitions
    ADD CONSTRAINT engineering_route_transitions_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_routing_decisions engineering_routing_decisions_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_routing_decisions
    ADD CONSTRAINT engineering_routing_decisions_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_work_criteria engineering_work_criteria_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_criteria
    ADD CONSTRAINT engineering_work_criteria_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_work_events engineering_work_events_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_events
    ADD CONSTRAINT engineering_work_events_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_work_knowledge engineering_work_knowledge_scope_id_knowledge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_knowledge
    ADD CONSTRAINT engineering_work_knowledge_scope_id_knowledge_id_fkey FOREIGN KEY (scope_id, knowledge_id) REFERENCES public.knowledge_records(owner_id, id) ON DELETE RESTRICT;


--
-- Name: engineering_work_knowledge engineering_work_knowledge_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_knowledge
    ADD CONSTRAINT engineering_work_knowledge_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id) ON DELETE RESTRICT;


--
-- Name: engineering_work_knowledge engineering_work_knowledge_scope_id_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_knowledge
    ADD CONSTRAINT engineering_work_knowledge_scope_id_source_id_fkey FOREIGN KEY (scope_id, source_id) REFERENCES public.knowledge_sources(owner_id, id) ON DELETE RESTRICT;


--
-- Name: engineering_work_model_budget engineering_work_model_budget_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_model_budget
    ADD CONSTRAINT engineering_work_model_budget_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: engineering_work_model_calls engineering_work_model_calls_route_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_model_calls
    ADD CONSTRAINT engineering_work_model_calls_route_run_id_fkey FOREIGN KEY (route_run_id) REFERENCES public.engineering_route_runs(id);


--
-- Name: engineering_work_model_calls engineering_work_model_calls_scope_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engineering_work_model_calls
    ADD CONSTRAINT engineering_work_model_calls_scope_id_scope_kind_work_id_fkey FOREIGN KEY (scope_id, scope_kind, work_id) REFERENCES public.engineering_work_model_budget(scope_id, scope_kind, work_id);


--
-- Name: eve_events eve_events_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eve_events
    ADD CONSTRAINT eve_events_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: eve_events eve_events_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eve_events
    ADD CONSTRAINT eve_events_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: execution_attempts execution_attempts_owner_id_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_attempts
    ADD CONSTRAINT execution_attempts_owner_id_occurrence_id_fkey FOREIGN KEY (owner_id, occurrence_id) REFERENCES public.execution_occurrences(owner_id, id);


--
-- Name: execution_occurrences execution_occurrences_owner_id_routine_id_routine_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_owner_id_routine_id_routine_version_fkey FOREIGN KEY (owner_id, routine_id, routine_version) REFERENCES public.execution_routine_versions(owner_id, routine_id, version);


--
-- Name: execution_occurrences execution_occurrences_owner_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_owner_id_run_id_fkey FOREIGN KEY (owner_id, run_id) REFERENCES public.task_runs(owner_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: execution_routine_versions execution_routine_versions_owner_id_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routine_versions
    ADD CONSTRAINT execution_routine_versions_owner_id_routine_id_fkey FOREIGN KEY (owner_id, routine_id) REFERENCES public.execution_routines(owner_id, id);


--
-- Name: execution_routines execution_routines_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routines
    ADD CONSTRAINT execution_routines_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id);


--
-- Name: goal_milestones goal_milestones_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_milestones
    ADD CONSTRAINT goal_milestones_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_outcome_evidence goal_outcome_evidence_owner_id_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_outcome_evidence
    ADD CONSTRAINT goal_outcome_evidence_owner_id_goal_id_fkey FOREIGN KEY (owner_id, goal_id) REFERENCES public.goals(owner_id, id);


--
-- Name: goal_plans goal_plans_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_plans
    ADD CONSTRAINT goal_plans_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_task_dependencies goal_task_dependencies_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_task_dependencies
    ADD CONSTRAINT goal_task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.goal_tasks(id) ON DELETE CASCADE;


--
-- Name: goal_task_dependencies goal_task_dependencies_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_task_dependencies
    ADD CONSTRAINT goal_task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.goal_tasks(id) ON DELETE CASCADE;


--
-- Name: goal_tasks goal_tasks_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_tasks goal_tasks_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.goal_milestones(id) ON DELETE SET NULL;


--
-- Name: goal_tasks goal_tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: goal_thread_links goal_thread_links_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_thread_links
    ADD CONSTRAINT goal_thread_links_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_work_dependencies goal_work_dependencies_goal_id_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_dependencies
    ADD CONSTRAINT goal_work_dependencies_goal_id_task_id_fkey FOREIGN KEY (goal_id, task_id) REFERENCES public.goal_tasks(goal_id, id);


--
-- Name: goal_work_dependencies goal_work_dependencies_owner_id_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_dependencies
    ADD CONSTRAINT goal_work_dependencies_owner_id_goal_id_fkey FOREIGN KEY (owner_id, goal_id) REFERENCES public.goals(owner_id, id);


--
-- Name: goal_work_links goal_work_links_goal_id_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_links
    ADD CONSTRAINT goal_work_links_goal_id_task_id_fkey FOREIGN KEY (goal_id, task_id) REFERENCES public.goal_tasks(goal_id, id);


--
-- Name: goal_work_links goal_work_links_owner_id_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_work_links
    ADD CONSTRAINT goal_work_links_owner_id_goal_id_fkey FOREIGN KEY (owner_id, goal_id) REFERENCES public.goals(owner_id, id);


--
-- Name: inbox_attention_evidence inbox_attention_evidence_owner_id_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attention_evidence
    ADD CONSTRAINT inbox_attention_evidence_owner_id_item_id_fkey FOREIGN KEY (owner_id, item_id) REFERENCES public.inbox_attention_items(owner_id, id);


--
-- Name: inbox_attention_responses inbox_attention_responses_owner_id_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attention_responses
    ADD CONSTRAINT inbox_attention_responses_owner_id_item_id_fkey FOREIGN KEY (owner_id, item_id) REFERENCES public.inbox_attention_items(owner_id, id);


--
-- Name: knowledge_provenance_links knowledge_provenance_links_owner_id_knowledge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_provenance_links
    ADD CONSTRAINT knowledge_provenance_links_owner_id_knowledge_id_fkey FOREIGN KEY (owner_id, knowledge_id) REFERENCES public.knowledge_records(owner_id, id) ON DELETE CASCADE;


--
-- Name: knowledge_provenance_links knowledge_provenance_links_owner_id_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_provenance_links
    ADD CONSTRAINT knowledge_provenance_links_owner_id_source_id_fkey FOREIGN KEY (owner_id, source_id) REFERENCES public.knowledge_sources(owner_id, id) ON DELETE RESTRICT;


--
-- Name: knowledge_records knowledge_records_owner_id_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_owner_id_created_by_id_fkey FOREIGN KEY (owner_id, created_by_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: knowledge_records knowledge_records_owner_id_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_owner_id_goal_id_fkey FOREIGN KEY (owner_id, goal_id) REFERENCES public.goals(owner_id, id) ON DELETE RESTRICT;


--
-- Name: knowledge_records knowledge_records_owner_id_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_owner_id_supersedes_id_fkey FOREIGN KEY (owner_id, supersedes_id) REFERENCES public.knowledge_records(owner_id, id) ON DELETE RESTRICT;


--
-- Name: myeve_peer_action_bindings myeve_peer_action_bindings_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_peer_action_bindings
    ADD CONSTRAINT myeve_peer_action_bindings_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.myeve_peer_permissions(id);


--
-- Name: myeve_peer_action_bindings myeve_peer_action_bindings_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_peer_action_bindings
    ADD CONSTRAINT myeve_peer_action_bindings_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id);


--
-- Name: myeve_peer_permissions myeve_peer_permissions_local_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_peer_permissions
    ADD CONSTRAINT myeve_peer_permissions_local_agent_id_fkey FOREIGN KEY (local_agent_id) REFERENCES public.agents(id);


--
-- Name: myeve_relay_connections myeve_relay_connections_local_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_connections
    ADD CONSTRAINT myeve_relay_connections_local_agent_id_fkey FOREIGN KEY (local_agent_id) REFERENCES public.agents(id);


--
-- Name: myeve_relay_message_delegations myeve_relay_message_delegations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_message_delegations
    ADD CONSTRAINT myeve_relay_message_delegations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.myeve_relay_connections(owner_id) ON DELETE CASCADE;


--
-- Name: myeve_relay_projection myeve_relay_projection_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_projection
    ADD CONSTRAINT myeve_relay_projection_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.myeve_relay_publications(id);


--
-- Name: myeve_relay_publications myeve_relay_publications_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_publications
    ADD CONSTRAINT myeve_relay_publications_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.myeve_relay_connections(owner_id);


--
-- Name: myeve_relay_reply_claims myeve_relay_reply_claims_owner_id_parent_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_reply_claims
    ADD CONSTRAINT myeve_relay_reply_claims_owner_id_parent_request_id_fkey FOREIGN KEY (owner_id, parent_request_id) REFERENCES public.myeve_relay_requests(owner_id, request_id) ON DELETE RESTRICT;


--
-- Name: myeve_relay_reply_claims myeve_relay_reply_claims_owner_id_reply_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_reply_claims
    ADD CONSTRAINT myeve_relay_reply_claims_owner_id_reply_request_id_fkey FOREIGN KEY (owner_id, reply_request_id) REFERENCES public.myeve_relay_requests(owner_id, request_id) ON DELETE RESTRICT;


--
-- Name: myeve_relay_requests myeve_relay_requests_local_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_requests
    ADD CONSTRAINT myeve_relay_requests_local_run_id_fkey FOREIGN KEY (local_run_id) REFERENCES public.task_runs(id);


--
-- Name: myeve_relay_requests myeve_relay_requests_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_requests
    ADD CONSTRAINT myeve_relay_requests_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.myeve_relay_connections(owner_id);


--
-- Name: outcome_evidence_links outcome_evidence_links_outcome_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcome_evidence_links
    ADD CONSTRAINT outcome_evidence_links_outcome_id_fkey FOREIGN KEY (outcome_id) REFERENCES public.outcomes(id) ON DELETE CASCADE;


--
-- Name: outcomes outcomes_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: outcomes outcomes_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: outcomes outcomes_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: owner_channel_commands owner_channel_commands_relay_account_id_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_channel_commands
    ADD CONSTRAINT owner_channel_commands_relay_account_id_request_id_fkey FOREIGN KEY (relay_account_id, request_id) REFERENCES public.owner_channel_requests(relay_account_id, request_id);


--
-- Name: owner_channel_requests owner_channel_requests_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_channel_requests
    ADD CONSTRAINT owner_channel_requests_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id);


--
-- Name: owner_channel_requests owner_channel_requests_owner_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_channel_requests
    ADD CONSTRAINT owner_channel_requests_owner_id_run_id_fkey FOREIGN KEY (owner_id, run_id) REFERENCES public.task_runs(owner_id, id);


--
-- Name: owner_model_calls owner_model_calls_owner_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_model_calls
    ADD CONSTRAINT owner_model_calls_owner_id_run_id_fkey FOREIGN KEY (owner_id, run_id) REFERENCES public.owner_channel_requests(owner_id, run_id);


--
-- Name: persistent_browser_profile_grants persistent_browser_profile_grants_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profile_grants
    ADD CONSTRAINT persistent_browser_profile_grants_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: persistent_browser_profile_grants persistent_browser_profile_grants_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profile_grants
    ADD CONSTRAINT persistent_browser_profile_grants_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.persistent_browser_profiles(id) ON DELETE CASCADE;


--
-- Name: persistent_browser_profiles persistent_browser_profiles_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profiles
    ADD CONSTRAINT persistent_browser_profiles_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: recall_learning_events recall_learning_events_owner_id_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_learning_events
    ADD CONSTRAINT recall_learning_events_owner_id_family_id_fkey FOREIGN KEY (owner_id, family_id) REFERENCES public.recall_learning(owner_id, id);


--
-- Name: recall_learning recall_learning_owner_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_learning
    ADD CONSTRAINT recall_learning_owner_id_scope_kind_work_id_fkey FOREIGN KEY (owner_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: recall_learning_uses recall_learning_uses_owner_id_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_learning_uses
    ADD CONSTRAINT recall_learning_uses_owner_id_family_id_fkey FOREIGN KEY (owner_id, family_id) REFERENCES public.recall_learning(owner_id, id);


--
-- Name: recall_learning_uses recall_learning_uses_owner_id_scope_kind_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_learning_uses
    ADD CONSTRAINT recall_learning_uses_owner_id_scope_kind_work_id_fkey FOREIGN KEY (owner_id, scope_kind, work_id) REFERENCES public.engineering_work(scope_id, scope_kind, id);


--
-- Name: reminders reminders_execution_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_execution_routine_id_fkey FOREIGN KEY (execution_routine_id) REFERENCES public.execution_routines(id);


--
-- Name: reminders reminders_source_outcome_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_source_outcome_id_fkey FOREIGN KEY (source_outcome_id) REFERENCES public.outcomes(id) ON DELETE SET NULL;


--
-- Name: review_deliveries review_deliveries_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.review_checkpoints(id) ON DELETE SET NULL;


--
-- Name: review_deliveries review_deliveries_owner_id_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_owner_id_occurrence_id_fkey FOREIGN KEY (owner_id, occurrence_id) REFERENCES public.execution_occurrences(owner_id, id);


--
-- Name: review_deliveries review_deliveries_owner_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_owner_id_run_id_fkey FOREIGN KEY (owner_id, run_id) REFERENCES public.task_runs(owner_id, id);


--
-- Name: review_delivery_attempts review_delivery_attempts_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_attempts
    ADD CONSTRAINT review_delivery_attempts_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.review_deliveries(id) ON DELETE CASCADE;


--
-- Name: routine_pending_sends routine_pending_sends_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_pending_sends
    ADD CONSTRAINT routine_pending_sends_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.action_requests(id) ON DELETE CASCADE;


--
-- Name: routine_pending_sends routine_pending_sends_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_pending_sends
    ADD CONSTRAINT routine_pending_sends_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: run_context_entries run_context_entries_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_context_entries
    ADD CONSTRAINT run_context_entries_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE CASCADE;


--
-- Name: run_context_entries run_context_entries_owner_id_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_context_entries
    ADD CONSTRAINT run_context_entries_owner_id_goal_id_fkey FOREIGN KEY (owner_id, goal_id) REFERENCES public.goals(owner_id, id) ON DELETE CASCADE;


--
-- Name: run_context_entries run_context_entries_owner_id_task_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_context_entries
    ADD CONSTRAINT run_context_entries_owner_id_task_run_id_fkey FOREIGN KEY (owner_id, task_run_id) REFERENCES public.task_runs(owner_id, id) ON DELETE CASCADE;


--
-- Name: skill_eval_results skill_eval_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_eval_results
    ADD CONSTRAINT skill_eval_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.skill_eval_runs(id) ON DELETE CASCADE;


--
-- Name: skill_usage_events skill_usage_events_task_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_task_run_id_fkey FOREIGN KEY (task_run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: task_acceptance_checks task_acceptance_checks_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_acceptance_checks
    ADD CONSTRAINT task_acceptance_checks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_acceptance_checks task_acceptance_checks_task_id_specialist_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_acceptance_checks
    ADD CONSTRAINT task_acceptance_checks_task_id_specialist_role_fkey FOREIGN KEY (task_id, specialist_role) REFERENCES public.task_specialists(task_id, role);


--
-- Name: task_approval_decisions task_approval_decisions_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approval_decisions
    ADD CONSTRAINT task_approval_decisions_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: task_approval_decisions task_approval_decisions_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approval_decisions
    ADD CONSTRAINT task_approval_decisions_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: task_approval_decisions task_approval_decisions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approval_decisions
    ADD CONSTRAINT task_approval_decisions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_artifacts task_artifacts_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.task_acceptance_checks(id) ON DELETE SET NULL;


--
-- Name: task_artifacts task_artifacts_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_artifacts task_artifacts_task_id_specialist_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_task_id_specialist_role_fkey FOREIGN KEY (task_id, specialist_role) REFERENCES public.task_specialists(task_id, role);


--
-- Name: task_milestones task_milestones_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_milestones
    ADD CONSTRAINT task_milestones_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_run_sessions task_run_sessions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_run_sessions
    ADD CONSTRAINT task_run_sessions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_runs task_runs_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: task_runs task_runs_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: task_runs task_runs_owner_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_owner_agent_fk FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: task_runs task_runs_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: task_runs task_runs_source_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_source_task_id_fkey FOREIGN KEY (source_task_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: task_specialists task_specialists_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_specialists
    ADD CONSTRAINT task_specialists_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_transitions task_transitions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_transitions
    ADD CONSTRAINT task_transitions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: thread_summaries thread_summaries_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_summaries
    ADD CONSTRAINT thread_summaries_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: web_chat_threads web_chat_threads_owner_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_chat_threads
    ADD CONSTRAINT web_chat_threads_owner_agent_fk FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: eve_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eve_events ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_outcome_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_outcome_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: eve_events goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.eve_events TO myeve_beta_goals USING ((owner_id = current_setting('app.owner_id'::text, true))) WITH CHECK ((owner_id = current_setting('app.owner_id'::text, true)));


--
-- Name: goal_outcome_evidence goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.goal_outcome_evidence TO myeve_beta_goals USING ((owner_id = current_setting('app.owner_id'::text, true))) WITH CHECK ((owner_id = current_setting('app.owner_id'::text, true)));


--
-- Name: goal_plans goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.goal_plans TO myeve_beta_goals USING ((EXISTS ( SELECT 1
   FROM public.goals g
  WHERE ((g.id = goal_plans.goal_id) AND (g.owner_id = current_setting('app.owner_id'::text, true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.goals g
  WHERE ((g.id = goal_plans.goal_id) AND (g.owner_id = current_setting('app.owner_id'::text, true))))));


--
-- Name: goal_task_dependencies goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.goal_task_dependencies TO myeve_beta_goals USING ((EXISTS ( SELECT 1
   FROM public.goal_tasks t
  WHERE (t.id = goal_task_dependencies.task_id)))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.goal_tasks t
  WHERE (t.id = goal_task_dependencies.task_id))) AND (EXISTS ( SELECT 1
   FROM public.goal_tasks t
  WHERE (t.id = goal_task_dependencies.depends_on_task_id)))));


--
-- Name: goal_tasks goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.goal_tasks TO myeve_beta_goals USING ((EXISTS ( SELECT 1
   FROM public.goals g
  WHERE ((g.id = goal_tasks.goal_id) AND (g.owner_id = current_setting('app.owner_id'::text, true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.goals g
  WHERE ((g.id = goal_tasks.goal_id) AND (g.owner_id = current_setting('app.owner_id'::text, true))))));


--
-- Name: goal_work_dependencies goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.goal_work_dependencies TO myeve_beta_goals USING ((owner_id = current_setting('app.owner_id'::text, true))) WITH CHECK ((owner_id = current_setting('app.owner_id'::text, true)));


--
-- Name: goal_work_links goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.goal_work_links TO myeve_beta_goals USING ((owner_id = current_setting('app.owner_id'::text, true))) WITH CHECK ((owner_id = current_setting('app.owner_id'::text, true)));


--
-- Name: goal_work_signals goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.goal_work_signals TO myeve_beta_goals USING ((owner_id = current_setting('app.owner_id'::text, true))) WITH CHECK ((owner_id = current_setting('app.owner_id'::text, true)));


--
-- Name: goals goal_runtime_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_runtime_owner ON public.goals TO myeve_beta_goals USING ((owner_id = current_setting('app.owner_id'::text, true))) WITH CHECK ((owner_id = current_setting('app.owner_id'::text, true)));


--
-- Name: goal_task_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_task_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_work_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_work_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_work_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_work_links ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_work_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_work_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_attention_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_attention_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_attention_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_attention_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_attention_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_attention_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_attention_evidence inbox_evidence_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_evidence_owner ON public.inbox_attention_evidence USING ((owner_id = current_setting('myeve.inbox_owner'::text, true))) WITH CHECK ((owner_id = current_setting('myeve.inbox_owner'::text, true)));


--
-- Name: inbox_attention_items inbox_item_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_item_owner ON public.inbox_attention_items USING ((owner_id = current_setting('myeve.inbox_owner'::text, true))) WITH CHECK ((owner_id = current_setting('myeve.inbox_owner'::text, true)));


--
-- Name: inbox_attention_responses inbox_response_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_response_owner ON public.inbox_attention_responses USING ((owner_id = current_setting('myeve.inbox_owner'::text, true))) WITH CHECK ((owner_id = current_setting('myeve.inbox_owner'::text, true)));


--
-- Name: recall_learning_events recall_events_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recall_events_owner_read ON public.recall_learning_events FOR SELECT USING ((owner_id = CURRENT_USER));


--
-- Name: recall_learning; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recall_learning ENABLE ROW LEVEL SECURITY;

--
-- Name: recall_learning_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recall_learning_events ENABLE ROW LEVEL SECURITY;

--
-- Name: recall_learning_uses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recall_learning_uses ENABLE ROW LEVEL SECURITY;

--
-- Name: recall_learning recall_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recall_owner_read ON public.recall_learning FOR SELECT USING ((owner_id = CURRENT_USER));


--
-- Name: recall_learning_uses recall_uses_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recall_uses_owner_read ON public.recall_learning_uses FOR SELECT USING ((owner_id = CURRENT_USER));


--
-- PostgreSQL database dump complete
--
