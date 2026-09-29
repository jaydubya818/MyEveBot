
-- UNNUMBERED INTEGRATION PROPOSAL. Apply only through the canonical migration
-- owner after allocation. This file is used directly ONLY in disposable tests.
CREATE TABLE recall_learning (
  owner_id text NOT NULL,
  id text NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  repository text NOT NULL CHECK (repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  work_type text NOT NULL CHECK (work_type IN ('research','implementation','review')),
  scope_kind text NOT NULL DEFAULT 'personal' CHECK (scope_kind='personal'),
  work_id uuid,
  revision integer NOT NULL CHECK (revision > 0),
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id),
  CHECK (jsonb_typeof(document)='object' AND document ?& ARRAY['id','revision','scope','versions','events']),
  CHECK ((document->>'id'=id AND (document->>'revision')::integer=revision) IS TRUE),
  CHECK (document->'scope' ?& ARRAY['ownerId','repository','workType','workId']),
  CHECK ((document->'scope'->>'ownerId'=owner_id AND document->'scope'->>'repository'=repository AND document->'scope'->>'workType'=work_type) IS TRUE),
  CHECK ((document->'scope'->>'workId') IS NOT DISTINCT FROM work_id::text),
  CHECK (jsonb_typeof(document->'versions')='array' AND jsonb_array_length(document->'versions') BETWEEN 1 AND 40),
  CHECK (jsonb_typeof(document->'events')='array' AND jsonb_array_length(document->'events') BETWEEN 1 AND 400)
);
CREATE INDEX recall_learning_scope ON recall_learning(owner_id,repository,work_type,work_id);
CREATE TABLE recall_learning_events (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  family_id text NOT NULL,
  PRIMARY KEY(owner_id,event_id),
  FOREIGN KEY(owner_id,family_id) REFERENCES recall_learning(owner_id,id)
);
CREATE TABLE recall_learning_uses (
  owner_id text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'personal' CHECK (scope_kind='personal'),
  work_id uuid NOT NULL,
  family_id text NOT NULL,
  version integer NOT NULL CHECK (version>0),
  candidate_hash text NOT NULL CHECK (candidate_hash ~ '^[a-f0-9]{64}$'),
  context_ref text NOT NULL CHECK (length(context_ref) BETWEEN 1 AND 255),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,work_id,family_id,version,context_ref),
  FOREIGN KEY(owner_id,family_id) REFERENCES recall_learning(owner_id,id),
  FOREIGN KEY(owner_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
CREATE INDEX recall_learning_uses_work ON recall_learning_uses(owner_id,work_id,recorded_at DESC);

CREATE FUNCTION recall_validate_family() RETURNS trigger LANGUAGE plpgsql AS $$
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
END $$;
CREATE TRIGGER recall_family_integrity BEFORE INSERT OR UPDATE ON recall_learning FOR EACH ROW EXECUTE FUNCTION recall_validate_family();

CREATE FUNCTION recall_claim_events() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER recall_event_identity AFTER INSERT OR UPDATE ON recall_learning FOR EACH ROW EXECUTE FUNCTION recall_claim_events();

CREATE FUNCTION recall_validate_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM recall_learning l JOIN engineering_work w ON w.scope_id=l.owner_id AND w.scope_kind='personal' AND w.id=NEW.work_id,
    jsonb_array_elements(l.document->'versions') v
    WHERE l.owner_id=NEW.owner_id AND l.id=NEW.family_id AND w.repository=l.repository AND (l.work_id IS NULL OR l.work_id=w.id)
      AND (v->>'version')::integer=NEW.version AND v->>'hash'=NEW.candidate_hash AND v->>'status'='PROMOTED')
    THEN RAISE EXCEPTION 'usage scope or active version mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recall_use_integrity BEFORE INSERT ON recall_learning_uses FOR EACH ROW EXECUTE FUNCTION recall_validate_use();

-- No ambient permissions. Restricted SQL readers see only a role-bound owner.
-- The existing trusted application connection retains application-level scope
-- checks; no user-controlled session variable is treated as an owner grant.
REVOKE ALL ON recall_learning,recall_learning_events,recall_learning_uses FROM PUBLIC;
ALTER TABLE recall_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_learning_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY recall_owner_read ON recall_learning FOR SELECT USING(owner_id=current_user);
CREATE POLICY recall_events_owner_read ON recall_learning_events FOR SELECT USING(owner_id=current_user);
CREATE POLICY recall_uses_owner_read ON recall_learning_uses FOR SELECT USING(owner_id=current_user);
REVOKE ALL ON FUNCTION recall_validate_family(),recall_claim_events(),recall_validate_use() FROM PUBLIC;

-- statement-breakpoint
-- Goal OS activation.
-- ACTIVATION CANDIDATE. No migration number. Apply only after canonical ownership signoff.
-- Extends the existing Goal OS. Work/Inbox data remains owned by those services.
ALTER TABLE goals ADD COLUMN requires_owner_confirmation boolean NOT NULL DEFAULT false;
ALTER TABLE goals ADD COLUMN confirmed_generation integer;
ALTER TABLE goals ADD COLUMN confirmation_ref text;
ALTER TABLE goals ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE goals ADD COLUMN generation integer NOT NULL DEFAULT 1;
ALTER TABLE goal_tasks ADD COLUMN generation integer NOT NULL DEFAULT 1;
ALTER TABLE goal_tasks ADD COLUMN paused boolean NOT NULL DEFAULT false;
ALTER TABLE goal_tasks ADD COLUMN blocker text;
ALTER TABLE goal_tasks ADD COLUMN next_action text;
ALTER TABLE goal_tasks ADD COLUMN provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE goal_work_dependencies (
  owner_id text NOT NULL, goal_id text NOT NULL, task_id text NOT NULL,
  id text NOT NULL, kind text NOT NULL CHECK(kind IN ('task','external','owner','schedule','file','capability','work')),
  reference text NOT NULL, label text NOT NULL, not_before timestamptz,
  options jsonb NOT NULL DEFAULT '[]', resolved_at timestamptz, evidence_ref text, decision_option text,
  PRIMARY KEY(owner_id,task_id,id),
  FOREIGN KEY(owner_id,goal_id) REFERENCES goals(owner_id,id),
  FOREIGN KEY(goal_id,task_id) REFERENCES goal_tasks(goal_id,id)
);
CREATE INDEX goal_work_dependencies_due ON goal_work_dependencies(owner_id,not_before,task_id)
  WHERE resolved_at IS NULL AND kind='schedule';
CREATE TABLE goal_work_links (
  owner_id text NOT NULL, goal_id text NOT NULL, task_id text NOT NULL,
  goal_generation integer NOT NULL, task_generation integer NOT NULL,
  correlation_key text PRIMARY KEY, request jsonb NOT NULL,
  state text NOT NULL CHECK(state IN ('prepared','linked','denied','result','superseded')),
  work_id text, work_state text, result_id text, result jsonb, reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,task_id,goal_generation,task_generation),
  UNIQUE(owner_id,work_id),
  FOREIGN KEY(owner_id,goal_id) REFERENCES goals(owner_id,id),
  FOREIGN KEY(goal_id,task_id) REFERENCES goal_tasks(goal_id,id)
);
CREATE INDEX goal_work_links_owner ON goal_work_links(owner_id,goal_id,task_id,created_at DESC);
CREATE TABLE goal_work_signals (
  owner_id text NOT NULL, event_id text NOT NULL, payload jsonb NOT NULL,
  PRIMARY KEY(owner_id,event_id)
);
CREATE TABLE goal_outcome_evidence (
  owner_id text NOT NULL, goal_id text NOT NULL, generation integer NOT NULL,
  criterion text NOT NULL, reference text NOT NULL, source text NOT NULL CHECK(source IN ('result','owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,goal_id,generation,criterion),
  FOREIGN KEY(owner_id,goal_id) REFERENCES goals(owner_id,id)
);

-- Existing writers also invalidate stale orchestration and serialize structural
-- task edits against Goal completion. These triggers grant no Work authority.
CREATE FUNCTION goal_work_goal_fence() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER goal_work_goal_fence BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION goal_work_goal_fence();
CREATE FUNCTION goal_work_task_fence() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER goal_work_task_fence BEFORE INSERT OR UPDATE OR DELETE ON goal_tasks
 FOR EACH ROW EXECUTE FUNCTION goal_work_task_fence();
CREATE FUNCTION goal_work_plan_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE goals SET generation=generation+1,updated_at=now() WHERE id=NEW.goal_id;
  RETURN NEW;
END $$;
CREATE TRIGGER goal_work_plan_fence BEFORE INSERT ON goal_plans FOR EACH ROW EXECUTE FUNCTION goal_work_plan_fence();
CREATE FUNCTION goal_work_dependency_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE goal_tasks SET generation=generation+1,updated_at=now() WHERE id=COALESCE(NEW.task_id,OLD.task_id);
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER goal_work_dependency_fence AFTER INSERT OR DELETE ON goal_task_dependencies
 FOR EACH ROW EXECUTE FUNCTION goal_work_dependency_fence();

ALTER TABLE goals ADD CONSTRAINT goal_work_positive_versions CHECK (generation>0 AND revision>0);
ALTER TABLE goal_tasks ADD CONSTRAINT goal_work_positive_generation CHECK (generation>0);
CREATE INDEX goal_work_active_goals ON goals(owner_id,id) WHERE status='active';
CREATE INDEX goal_work_dependencies_goal ON goal_work_dependencies(owner_id,goal_id,task_id,id);
CREATE INDEX goal_work_dependency_reverse ON goal_work_dependencies(owner_id,goal_id,reference) WHERE kind='task';

CREATE INDEX goal_work_interventions ON eve_events(owner_id,goal_id) WHERE type='HUMAN_INTERVENTION';

-- statement-breakpoint
-- Retain legacy history; never invent evidence.
-- Run once in the same activation transaction AFTER schema.sql. Preserve history;
-- pre-existing status text is not newly verified canonical Result evidence.
INSERT INTO eve_events(id,owner_id,type,source_type,goal_id,goal_task_id,summary,payload,idempotency_key)
SELECT 'goal-activation-task:'||t.id,g.owner_id,'LEGACY_COMPLETION_RETAINED','migration',g.id,t.id,
  'Historical task completion retained for evidence review',jsonb_build_object('status',t.status,'completedAt',t.completed_at),
  'goal-activation-task:'||t.id FROM goal_tasks t JOIN goals g ON g.id=t.goal_id
WHERE t.status='completed' AND NOT EXISTS(SELECT 1 FROM goal_work_links l WHERE l.task_id=t.id)
ON CONFLICT DO NOTHING;
UPDATE goal_tasks t SET status='verification',blocker='Historical completion requires canonical evidence review'
WHERE t.status='completed' AND NOT EXISTS(SELECT 1 FROM goal_work_links l WHERE l.task_id=t.id);
INSERT INTO eve_events(id,owner_id,type,source_type,goal_id,summary,payload,idempotency_key)
SELECT 'goal-activation:'||g.id,g.owner_id,'LEGACY_COMPLETION_RETAINED','migration',g.id,
  'Historical Goal completion retained for evidence review',jsonb_build_object('status',g.status,'completedAt',g.completed_at),
  'goal-activation:'||g.id FROM goals g WHERE g.status='completed'
AND NOT EXISTS(SELECT 1 FROM goal_outcome_evidence e WHERE e.goal_id=g.id)
ON CONFLICT DO NOTHING;
UPDATE goals g SET status='paused' WHERE g.status='completed'
AND NOT EXISTS(SELECT 1 FROM goal_outcome_evidence e WHERE e.goal_id=g.id);
UPDATE goal_tasks SET provenance='{"kind":"legacy","reference":"pre-activation","depth":0}'::jsonb WHERE provenance='{}'::jsonb;

-- statement-breakpoint
-- Restricted runtime identities. No login or application membership granted.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='myeve_beta_goals') THEN CREATE ROLE myeve_beta_goals NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='myeve_beta_inbox') THEN CREATE ROLE myeve_beta_inbox NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('myeve_beta_goals','myeve_beta_inbox') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin OR rolinherit)) THEN RAISE EXCEPTION 'Unsafe existing beta runtime role'; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO myeve_beta_goals,myeve_beta_inbox;

-- statement-breakpoint
-- Goal access contract.
-- Replace myeve_beta_goals with the integration-assigned, quoted dedicated
-- runtime role. It must be NOSUPERUSER NOBYPASSRLS and must NOT own these tables.
-- No role creation, shared grants, schema head update, or migration number here.
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goals TO myeve_beta_goals
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_tasks TO myeve_beta_goals
 USING(EXISTS(SELECT 1 FROM goals g WHERE g.id=goal_id AND g.owner_id=current_setting('app.owner_id',true)))
 WITH CHECK(EXISTS(SELECT 1 FROM goals g WHERE g.id=goal_id AND g.owner_id=current_setting('app.owner_id',true)));
ALTER TABLE goal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_plans TO myeve_beta_goals
 USING(EXISTS(SELECT 1 FROM goals g WHERE g.id=goal_id AND g.owner_id=current_setting('app.owner_id',true)))
 WITH CHECK(EXISTS(SELECT 1 FROM goals g WHERE g.id=goal_id AND g.owner_id=current_setting('app.owner_id',true)));
ALTER TABLE goal_task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_task_dependencies TO myeve_beta_goals
 USING(EXISTS(SELECT 1 FROM goal_tasks t WHERE t.id=task_id))
 WITH CHECK(EXISTS(SELECT 1 FROM goal_tasks t WHERE t.id=task_id) AND EXISTS(SELECT 1 FROM goal_tasks t WHERE t.id=depends_on_task_id));
ALTER TABLE eve_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON eve_events TO myeve_beta_goals
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_work_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_work_dependencies TO myeve_beta_goals
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_work_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_work_links TO myeve_beta_goals
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_work_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_work_signals TO myeve_beta_goals
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_outcome_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_outcome_evidence TO myeve_beta_goals
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
GRANT SELECT,INSERT,UPDATE ON goals,goal_tasks,goal_plans,goal_work_links TO myeve_beta_goals;
GRANT SELECT,INSERT ON eve_events,goal_work_signals,goal_outcome_evidence TO myeve_beta_goals;
GRANT SELECT,INSERT,UPDATE,DELETE ON goal_work_dependencies TO myeve_beta_goals;
GRANT SELECT ON goal_task_dependencies TO myeve_beta_goals;

-- statement-breakpoint
-- Universal Inbox activation. No historical messages imported.
-- UNNUMBERED CANDIDATE: local qualification only. Not discovered by db:migrate.
-- Apply in one transaction after canonical schema ownership approves integration.
CREATE TABLE inbox_attention_items (
  owner_id text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
  status text GENERATED ALWAYS AS (data->>'status') STORED NOT NULL,
  kind text GENERATED ALWAYS AS (data->>'kind') STORED NOT NULL,
  needs_action integer GENERATED ALWAYS AS (CASE WHEN data->>'status'='NEEDS_ACTION'
    AND data#>>'{action,involvement}'='NECESSARY_JUDGMENT' AND data#>>'{action,reason}'<>'internal_coordination' THEN 1 ELSE 0 END) STORED,
  expires_at text GENERATED ALWAYS AS (data#>>'{action,expiresAt}') STORED,
  score integer GENERATED ALWAYS AS ((data->>'priorityScore')::integer) STORED NOT NULL,
  deadline text GENERATED ALWAYS AS (coalesce(data#>>'{priority,deadlineAt}','9999')) STORED NOT NULL,
  PRIMARY KEY(owner_id,id),
  CHECK (jsonb_typeof(data)='object' AND (data->>'version') IS NOT DISTINCT FROM 'myeve.attention.v1'),
  CHECK ((data->>'ownerId') IS NOT DISTINCT FROM owner_id AND (data->>'id') IS NOT DISTINCT FROM id),
  CHECK (status IN ('NEW','SEEN','NEEDS_ACTION','WAITING','RESOLVED','DISMISSED','SUPERSEDED')),
  CHECK (kind IN ('MESSAGE','REQUEST','DECISION','APPROVAL','BLOCKER','FOLLOW_UP','REMINDER','RESULT','EXCEPTION')),
  CHECK ((data->>'revision')::bigint>0 AND (data->>'episode')::integer>0),
  CHECK (data ?& ARRAY['correlationId','workId','workGeneration','workVersion','source','createdAt','updatedAt','action','actionBinding']),
  CHECK (data->'workGeneration'='null'::jsonb OR data->'workId'<>'null'::jsonb),
  CHECK (status<>'NEEDS_ACTION' OR (data->'action'<>'null'::jsonb AND data->>'actionBinding' ~ '^[0-9a-f]{64}$')),
  CHECK ((data->>'createdAt')::timestamptz IS NOT NULL AND (data->>'updatedAt')::timestamptz IS NOT NULL),
  CHECK (status<>'RESOLVED' OR (data->>'resolvedAt')::timestamptz IS NOT NULL),
  CHECK (status<>'SUPERSEDED' OR (data->>'supersededAt')::timestamptz IS NOT NULL)
);
CREATE UNIQUE INDEX inbox_episode_identity ON inbox_attention_items(owner_id,(data->>'correlationId'),((data->>'episode')::integer));
CREATE INDEX inbox_page ON inbox_attention_items(owner_id,score DESC,deadline,id);
CREATE INDEX inbox_needs_you ON inbox_attention_items(owner_id,needs_action,score DESC,deadline,id);
CREATE INDEX inbox_work_thread ON inbox_attention_items(owner_id,(data->>'workId'),score DESC,deadline,id);
CREATE INDEX inbox_correlation_thread ON inbox_attention_items(owner_id,(data->>'correlationId'),score DESC,deadline,id);
CREATE INDEX inbox_resolved_window ON inbox_attention_items(owner_id,(data->>'resolvedAt')) WHERE status='RESOLVED';
CREATE INDEX inbox_replies_window ON inbox_attention_items(owner_id,(data->>'lastExternalReplyAt'));
CREATE INDEX inbox_followup_due ON inbox_attention_items(owner_id,(data->>'followUpAt')) WHERE status='WAITING';
CREATE INDEX inbox_action_window ON inbox_attention_items(owner_id,(data->>'actionRequiredAt')) WHERE needs_action=1;
CREATE TABLE inbox_attention_evidence (
  owner_id text NOT NULL, id text NOT NULL, item_id text NOT NULL, data jsonb NOT NULL,
  system text GENERATED ALWAYS AS (data#>>'{event,source,system}') STORED NOT NULL,
  account_id text GENERATED ALWAYS AS (data#>>'{event,source,accountId}') STORED NOT NULL,
  event_id text GENERATED ALWAYS AS (data#>>'{event,source,eventId}') STORED NOT NULL,
  PRIMARY KEY(owner_id,id), UNIQUE(owner_id,system,account_id,event_id),
  FOREIGN KEY(owner_id,item_id) REFERENCES inbox_attention_items(owner_id,id),
  CHECK ((data->>'ownerId') IS NOT DISTINCT FROM owner_id AND (data->>'id') IS NOT DISTINCT FROM id AND (data->>'itemId') IS NOT DISTINCT FROM item_id),
  CHECK (data->>'digest' ~ '^[0-9a-f]{64}$' AND (data->>'deliveries')::bigint>0)
);
CREATE INDEX inbox_evidence_page ON inbox_attention_evidence(owner_id,item_id,id);
CREATE TABLE inbox_attention_responses (
  owner_id text NOT NULL, id text NOT NULL, item_id text NOT NULL, data jsonb NOT NULL,
  status text GENERATED ALWAYS AS (data->>'status') STORED NOT NULL,
  PRIMARY KEY(owner_id,id), UNIQUE(owner_id,item_id),
  FOREIGN KEY(owner_id,item_id) REFERENCES inbox_attention_items(owner_id,id),
  CHECK ((data->>'ownerId') IS NOT DISTINCT FROM owner_id AND (data->>'id') IS NOT DISTINCT FROM id AND (data->>'itemId') IS NOT DISTINCT FROM item_id),
  CHECK (status IN ('PENDING','DELIVERED','CANCELLED','STALE')),
  CHECK (data ?& ARRAY['workId','workGeneration','workVersion','correlationId','episode','goal','actionBinding','answer','createdAt']),
  CHECK (data->>'actionBinding' ~ '^[0-9a-f]{64}$')
);
CREATE INDEX inbox_response_pending ON inbox_attention_responses(owner_id,status,id);
CREATE FUNCTION inbox_guard_history() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER inbox_item_history BEFORE UPDATE ON inbox_attention_items FOR EACH ROW EXECUTE FUNCTION inbox_guard_history();
CREATE TRIGGER inbox_evidence_history BEFORE UPDATE ON inbox_attention_evidence FOR EACH ROW EXECUTE FUNCTION inbox_guard_history();
CREATE TRIGGER inbox_response_history BEFORE UPDATE ON inbox_attention_responses FOR EACH ROW EXECUTE FUNCTION inbox_guard_history();
ALTER TABLE inbox_attention_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_items FORCE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY inbox_item_owner ON inbox_attention_items USING (owner_id=current_setting('myeve.inbox_owner',true)) WITH CHECK (owner_id=current_setting('myeve.inbox_owner',true));
CREATE POLICY inbox_evidence_owner ON inbox_attention_evidence USING (owner_id=current_setting('myeve.inbox_owner',true)) WITH CHECK (owner_id=current_setting('myeve.inbox_owner',true));
CREATE POLICY inbox_response_owner ON inbox_attention_responses USING (owner_id=current_setting('myeve.inbox_owner',true)) WITH CHECK (owner_id=current_setting('myeve.inbox_owner',true));
REVOKE ALL ON inbox_attention_items,inbox_attention_evidence,inbox_attention_responses FROM PUBLIC;
REVOKE ALL ON FUNCTION inbox_guard_history() FROM PUBLIC;
-- DBA grants SELECT,INSERT,UPDATE only to a non-owner, NOSUPERUSER NOBYPASSRLS runtime role.
-- Runtime receives no CREATE, DELETE, TRUNCATE, role membership or canonical Work/approval table privileges.

-- statement-breakpoint
-- Restricted Inbox access.
GRANT SELECT,INSERT,UPDATE ON inbox_attention_items,inbox_attention_evidence,inbox_attention_responses TO myeve_beta_inbox;

-- statement-breakpoint
-- Durable cross-contract bindings. No provider authority.
CREATE TABLE beta_goal_work_bindings (
 owner_id text NOT NULL, correlation_key text NOT NULL, work_id uuid NOT NULL,
 binding jsonb NOT NULL, PRIMARY KEY(owner_id,correlation_key), UNIQUE(owner_id,work_id),
 FOREIGN KEY(work_id) REFERENCES engineering_work(id)
);
CREATE TABLE beta_goal_attention_snapshots (
 owner_id text NOT NULL, goal_id text NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL,
 PRIMARY KEY(owner_id,goal_id), FOREIGN KEY(owner_id,goal_id) REFERENCES goals(owner_id,id)
);
CREATE TABLE beta_work_contexts (
 owner_id text NOT NULL, work_id uuid NOT NULL, context_ref text NOT NULL, document jsonb NOT NULL,
 PRIMARY KEY(owner_id,work_id,context_ref), FOREIGN KEY(work_id) REFERENCES engineering_work(id)
);
REVOKE ALL ON beta_goal_work_bindings,beta_goal_attention_snapshots,beta_work_contexts FROM PUBLIC;

-- statement-breakpoint
CREATE TABLE beta_result_provenance (
 owner_id text NOT NULL, result_id uuid NOT NULL REFERENCES engineering_native_results(id),
 contract jsonb NOT NULL, source text NOT NULL CHECK(source IN ('LOCAL_FIXTURE','CANONICAL')),
 PRIMARY KEY(owner_id,result_id)
);
REVOKE ALL ON beta_result_provenance FROM PUBLIC;
CREATE TRIGGER beta_result_provenance_immutable BEFORE UPDATE OR DELETE ON beta_result_provenance
 FOR EACH ROW EXECUTE FUNCTION engineering_native_result_immutable();
