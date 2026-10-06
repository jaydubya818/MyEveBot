-- Fixed production three-owner accounting class. Historical 0074 rows and
-- allowances retain their original class; this installs no Work or authority.
ALTER TABLE engineering_alpha_work_budget ADD COLUMN authority_class text NOT NULL DEFAULT 'FACTORY_CONVERSATION_V1';
-- statement-breakpoint
ALTER TABLE engineering_alpha_work_budget DROP CONSTRAINT engineering_alpha_work_budget_factory_microusd_check;
-- statement-breakpoint
ALTER TABLE engineering_alpha_work_budget ADD CONSTRAINT alpha_class_fixed_partition CHECK (
 (authority_class='FACTORY_CONVERSATION_V1' AND factory_microusd=1050000) OR
 (authority_class='THREE_OWNER_CONVERSATION_V1' AND factory_microusd=1000000));
-- statement-breakpoint
CREATE OR REPLACE FUNCTION engineering_alpha_model_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; a agents%ROWTYPE; b engineering_work_model_budget%ROWTYPE; k engineering_alpha_work_budget%ROWTYPE; stage text; claiming boolean; authority_class text; factory_limit bigint; work_limit numeric; seconds_limit integer;
BEGIN
 claiming=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN claiming=OLD.status='RESERVED' AND NEW.status='DISPATCHED'; END IF;
 IF NOT claiming THEN RETURN NEW; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 SELECT * INTO k FROM engineering_alpha_work_budget WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id;
 IF k.work_id IS NULL AND NOT(NEW.bounds ? 'alphaFactory') THEN RETURN NEW; END IF;
 SELECT * INTO STRICT a FROM agents WHERE id=NEW.agent_id AND owner_id=w.scope_id FOR UPDATE;
 SELECT * INTO STRICT b FROM engineering_work_model_budget WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id FOR UPDATE;
 stage=NEW.bounds#>>'{alphaFactory,stage}';
 authority_class=COALESCE(NEW.bounds#>>'{alphaFactory,mode}','FACTORY_CONVERSATION_V1');
 IF authority_class NOT IN ('FACTORY_CONVERSATION_V1','THREE_OWNER_CONVERSATION_V1') THEN RAISE EXCEPTION 'Unsupported private-alpha authority class'; END IF;
 factory_limit=CASE WHEN authority_class='THREE_OWNER_CONVERSATION_V1' THEN 1000000 ELSE 1050000 END;
 work_limit=(300000+factory_limit)::numeric/1000000;
 seconds_limit=CASE WHEN authority_class='THREE_OWNER_CONVERSATION_V1' THEN 180 ELSE 600 END;
 IF NEW.purpose<>'CONVERSATION_REASONING' OR NEW.provider<>'vercel-gateway/openai' OR NEW.model_id<>'openai/gpt-5.4-mini'
  OR stage IS NULL OR stage NOT IN('admission','explanation') OR NEW.reserved_microusd>150000
  OR b.ceiling_microusd<>300000 OR b.max_calls<>2 OR w.max_cost_usd<work_limit OR a.max_estimated_cost_usd<work_limit OR a.max_steps<5
  OR w.max_duration_seconds>seconds_limit OR b.deadline>clock_timestamp()+make_interval(secs=>seconds_limit)
  OR w.lifecycle<>'active' OR w.control<>'agent'
 THEN RAISE EXCEPTION 'Private-alpha combined Work allowance denied'; END IF;
 IF k.work_id IS NULL THEN
  IF stage<>'admission' OR TG_OP<>'INSERT' OR EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id)
   OR EXISTS(SELECT 1 FROM engineering_routing_decisions d WHERE d.scope_id=w.scope_id AND d.scope_kind=w.scope_kind AND d.work_id=w.id)
  THEN RAISE EXCEPTION 'Private-alpha allocation requires a fresh Work'; END IF;
  INSERT INTO engineering_alpha_work_budget(scope_id,scope_kind,work_id,work_version,work_generation,agent_id,policy_hash,sofie_microusd,factory_microusd,authority_class) VALUES(w.scope_id,w.scope_kind,w.id,w.version,w.generation,a.id,NEW.policy_hash,300000,factory_limit,authority_class) RETURNING * INTO k;
 END IF;
 IF k.authority_class<>authority_class OR k.factory_microusd<>factory_limit OR k.work_version<>w.version OR k.work_generation<>w.generation OR k.agent_id<>a.id OR k.policy_hash<>NEW.policy_hash
  OR EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id AND c.id<>NEW.id AND c.status IN('RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN'))
  OR EXISTS(SELECT 1 FROM engineering_route_runs r WHERE r.scope_id=w.scope_id AND r.scope_kind=w.scope_kind AND r.work_id=w.id AND r.status NOT IN('COMPLETED','FAILED','CANCELLED'))
 THEN RAISE EXCEPTION 'Private-alpha authority changed or unresolved exposure'; END IF;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id AND c.bounds#>>'{alphaFactory,stage}'=stage)
 THEN RAISE EXCEPTION 'Private-alpha phase operation already used; no retry'; END IF;
 IF stage='admission' AND EXISTS(SELECT 1 FROM engineering_routing_decisions d WHERE d.scope_id=w.scope_id AND d.scope_kind=w.scope_kind AND d.work_id=w.id)
 THEN RAISE EXCEPTION 'Factory preparation prevents another admission model call'; END IF;
 IF stage='explanation' AND NOT EXISTS(
  SELECT 1 FROM engineering_native_results result JOIN engineering_routing_decisions d ON d.scope_id=result.scope_id AND d.scope_kind=result.scope_kind AND d.work_id=result.work_id
  JOIN engineering_route_runs r ON r.decision_id=d.id
  WHERE result.scope_id=w.scope_id AND result.scope_kind=w.scope_kind AND result.work_id=w.id AND result.work_version=w.version AND result.work_generation=w.generation
  AND r.dispatch_state='TERMINAL' AND r.route='MYFACTORY' AND r.status='COMPLETED'
  AND d.factory_observation#>>'{value,spend,status}'='KNOWN' AND d.factory_observation#>>'{value,spend,accountingComplete}'='true'
  AND d.factory_observation#>>'{value,spend,retainedMicrousd}'='0')
 THEN RAISE EXCEPTION 'Final explanation requires current Result and complete Factory accounting'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION engineering_alpha_factory_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; b engineering_work_model_budget%ROWTYPE; k engineering_alpha_work_budget%ROWTYPE; p jsonb; work_limit numeric; completion_limit bigint;
BEGIN
 IF NEW.factory_preparation IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.factory_preparation IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 SELECT * INTO b FROM engineering_work_model_budget WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id FOR UPDATE;
 IF b.work_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO k FROM engineering_alpha_work_budget WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id;
 IF k.work_id IS NULL THEN RETURN NEW; END IF;
 p=NEW.factory_preparation->'request';
 work_limit=(k.sofie_microusd+k.factory_microusd)::numeric/1000000;
 completion_limit=CASE WHEN k.authority_class='THREE_OWNER_CONVERSATION_V1' THEN 84864 ELSE 336864 END;
 IF k.work_id IS NULL OR k.work_version<>w.version OR k.work_generation<>w.generation OR b.status<>'ACTIVE' OR b.reserved_microusd<>0
  OR b.calls_admitted<>1 OR b.spent_microusd>150000 OR w.max_cost_usd<work_limit
  OR NOT EXISTS(SELECT 1 FROM agents a WHERE a.id=k.agent_id AND a.owner_id=w.scope_id AND a.is_primary AND a.status='active' AND a.updated_at::text=b.agent_revision AND a.max_steps>=5 AND a.max_estimated_cost_usd>=work_limit)
  OR NOT EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id AND c.status='RECONCILED' AND c.bounds#>>'{alphaFactory,stage}'='admission')
  OR (p->>'maxSpendUsd')::numeric IS DISTINCT FROM k.factory_microusd::numeric/1000000 OR (p->>'deadline')::timestamptz IS DISTINCT FROM b.deadline
  OR p#>>'{spendContract,version}' IS DISTINCT FROM 'WORK_LEDGER_V2'
  OR p#>>'{spendContract,plannedProductiveOperations}' IS DISTINCT FROM '2'
  OR p#>>'{spendContract,plannedCompletionOperations}' IS DISTINCT FROM '1'
  OR p#>>'{spendContract,maxPaidOperations}' IS DISTINCT FROM '3'
  OR (p#>>'{spendContract,completionReserveMicrousd}')::bigint IS DISTINCT FROM completion_limit
 THEN RAISE EXCEPTION 'Factory cannot exceed or reset its partition of the combined Work budget'; END IF;
 RETURN NEW;
END $$;
