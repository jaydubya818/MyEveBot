-- 0051 is immutable. Its rows and 0050 receipts remain historical evidence.
CREATE TABLE engineering_work_model_budget (
 scope_id text NOT NULL, scope_kind text NOT NULL CHECK(scope_kind='personal'), work_id uuid NOT NULL,
 actor_id text NOT NULL, agent_id text NOT NULL, agent_revision text NOT NULL,
 policy_hash text NOT NULL, policy_version integer NOT NULL, budget_version integer NOT NULL DEFAULT 1,
 ceiling_microusd bigint NOT NULL CHECK(ceiling_microusd>0),
 spent_microusd bigint NOT NULL DEFAULT 0 CHECK(spent_microusd>=0),
 reserved_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_microusd>=0),
 max_calls integer NOT NULL CHECK(max_calls>0), calls_admitted integer NOT NULL DEFAULT 0,
 deadline timestamptz NOT NULL, status text NOT NULL CHECK(status IN ('ACTIVE','HISTORICAL_RECONCILIATION','OVERAGE','REVOKED')),
 historical jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(scope_id,scope_kind,work_id),
 FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
CREATE TABLE engineering_work_model_calls (
 id uuid PRIMARY KEY, scope_id text NOT NULL, scope_kind text NOT NULL, work_id uuid NOT NULL,
 actor_id text NOT NULL, agent_id text NOT NULL, agent_revision text NOT NULL,
 work_version integer NOT NULL, work_generation integer NOT NULL,
 session_id text NOT NULL, step_key text NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 purpose text NOT NULL CHECK(purpose IN ('CONVERSATION_REASONING','NATIVE_EXECUTION','VERIFICATION_MODEL')),
 route_run_id uuid REFERENCES engineering_route_runs(id),
 provider text NOT NULL, model_id text NOT NULL, policy_hash text NOT NULL, policy_version integer NOT NULL, budget_version integer NOT NULL,
 reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0), spent_microusd bigint CHECK(spent_microusd>=0),
 pricing jsonb NOT NULL, bounds jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('RESERVED','DISPATCHED','RESULT_RETAINED','RECONCILED','USAGE_UNKNOWN','FAILED_BEFORE_DISPATCH')),
 dispatch_token uuid NOT NULL, result jsonb, result_hash text, usage_receipt jsonb,
 usage_semantics text CHECK(usage_semantics IN ('INCREMENTAL','UNKNOWN')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), dispatch_at timestamptz, result_at timestamptz, reconciled_at timestamptz,
 reconciliation_note text,
 UNIQUE(scope_id,scope_kind,work_id,session_id,step_key),
 FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work_model_budget(scope_id,scope_kind,work_id),
 CHECK((purpose='NATIVE_EXECUTION')=(route_run_id IS NOT NULL)),
 CHECK(status NOT IN ('RESULT_RETAINED','RECONCILED') OR (result IS NOT NULL AND result_hash IS NOT NULL)),
 CHECK(status<>'RECONCILED' OR (spent_microusd IS NOT NULL AND usage_receipt IS NOT NULL))
);
-- statement-breakpoint
CREATE INDEX engineering_work_model_calls_unresolved ON engineering_work_model_calls(scope_id,scope_kind,work_id,status);
-- statement-breakpoint
CREATE FUNCTION engineering_legacy_budget_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Legacy accounting is immutable after 0052; use common Work ledger'; END $$;
-- statement-breakpoint
CREATE TRIGGER conversation_budget_frozen BEFORE INSERT OR UPDATE OR DELETE ON engineering_conversation_budget FOR EACH ROW EXECUTE FUNCTION engineering_legacy_budget_frozen();
-- statement-breakpoint
CREATE TRIGGER conversation_calls_frozen BEFORE INSERT OR UPDATE OR DELETE ON engineering_conversation_calls FOR EACH ROW EXECUTE FUNCTION engineering_legacy_budget_frozen();
-- statement-breakpoint
CREATE TRIGGER native_calls_frozen BEFORE INSERT OR UPDATE OR DELETE ON engineering_native_model_calls FOR EACH ROW EXECUTE FUNCTION engineering_legacy_budget_frozen();
-- statement-breakpoint
CREATE FUNCTION engineering_native_economics_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.spent_microusd,NEW.reserved_microusd,NEW.calls_started,NEW.inflight,NEW.usage_unknown)
 IS DISTINCT FROM (OLD.spent_microusd,OLD.reserved_microusd,OLD.calls_started,OLD.inflight,OLD.usage_unknown)
 THEN RAISE EXCEPTION 'Native economic authority moved to common Work ledger'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER native_economics_frozen BEFORE UPDATE ON engineering_native_runtime FOR EACH ROW EXECUTE FUNCTION engineering_native_economics_frozen();
-- statement-breakpoint
-- Transaction entry point: Work -> Agent -> common budget -> native custody -> receipt.
-- Policy grants are server-side parameters; the frozen policy hash must match on every call.
CREATE FUNCTION engineering_model_reserve(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
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
-- statement-breakpoint
CREATE FUNCTION engineering_model_transition(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
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
-- statement-breakpoint
CREATE FUNCTION engineering_model_receipt_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accounting receipts cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','spent_microusd','result','result_hash','usage_receipt','usage_semantics','dispatch_at','result_at','reconciled_at','reconciliation_note'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','spent_microusd','result','result_hash','usage_receipt','usage_semantics','dispatch_at','result_at','reconciled_at','reconciliation_note']) THEN RAISE EXCEPTION 'Receipt identity is immutable'; END IF;
 IF OLD.status IN ('RECONCILED','FAILED_BEFORE_DISPATCH') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Terminal receipt is immutable'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER work_model_receipt_identity BEFORE UPDATE OR DELETE ON engineering_work_model_calls FOR EACH ROW EXECUTE FUNCTION engineering_model_receipt_identity();
-- statement-breakpoint
ALTER FUNCTION engineering_model_reserve(jsonb) SECURITY DEFINER;
-- statement-breakpoint
ALTER FUNCTION engineering_model_reserve(jsonb) SET search_path = pg_catalog, public, pg_temp;
-- statement-breakpoint
ALTER FUNCTION engineering_model_transition(jsonb) SECURITY DEFINER;
-- statement-breakpoint
ALTER FUNCTION engineering_model_transition(jsonb) SET search_path = pg_catalog, public, pg_temp;
-- statement-breakpoint
REVOKE ALL ON engineering_work_model_budget,engineering_work_model_calls FROM PUBLIC;
-- statement-breakpoint
-- Unrelated legacy executor Work is untouched. Once a Work has canonical
-- accounting, a legacy executor cannot open a second spend authority for it.
CREATE FUNCTION engineering_legacy_executor_common_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM engineering_work_model_budget WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND work_id=NEW.work_id) THEN
  RAISE EXCEPTION 'This Work requires common-ledger model admission';
 END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER legacy_executor_common_fence BEFORE INSERT ON engineering_model_calls FOR EACH ROW EXECUTE FUNCTION engineering_legacy_executor_common_fence();
