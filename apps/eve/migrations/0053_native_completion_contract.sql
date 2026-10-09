-- 0051/0052 remain immutable. Completion is capacity inside the common Work
-- ceiling, stored in the existing immutable admission snapshot, not another purse.
CREATE FUNCTION engineering_completion_capacity(s text, w uuid) RETURNS TABLE(micro_usd bigint, call_slots bigint)
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
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
 -- Expiry/idleness never releases unfinished obligations; UNKNOWN provider
 -- exposure remains in the common ledger even after proven branch release.
$$;
-- statement-breakpoint
CREATE FUNCTION engineering_completion_remaining(s text,w uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT micro_usd FROM engineering_completion_capacity(s,w)
$$;
-- statement-breakpoint
CREATE FUNCTION engineering_completion_slots(s text,w uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT call_slots FROM engineering_completion_capacity(s,w)
$$;
-- statement-breakpoint
CREATE FUNCTION engineering_completion_admission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
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
END $$;
-- statement-breakpoint
CREATE TRIGGER native_completion_admission BEFORE INSERT ON engineering_route_runs
FOR EACH ROW EXECUTE FUNCTION engineering_completion_admission();
-- statement-breakpoint
CREATE FUNCTION engineering_completion_call() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
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
-- statement-breakpoint
CREATE TRIGGER completion_call_capacity BEFORE INSERT ON engineering_work_model_calls
FOR EACH ROW EXECUTE FUNCTION engineering_completion_call();
-- statement-breakpoint
CREATE FUNCTION engineering_completion_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF OLD.admission_authority_snapshot ? 'completion' AND NEW.admission_authority_snapshot IS DISTINCT FROM OLD.admission_authority_snapshot THEN RAISE EXCEPTION 'Completion admission history is immutable'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER completion_admission_immutable BEFORE UPDATE ON engineering_routing_decisions
FOR EACH ROW EXECUTE FUNCTION engineering_completion_immutable();
-- statement-breakpoint
CREATE FUNCTION engineering_completion_dispatch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
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
-- statement-breakpoint
CREATE TRIGGER completion_dispatch_capacity BEFORE UPDATE ON engineering_work_model_calls
FOR EACH ROW EXECUTE FUNCTION engineering_completion_dispatch();
