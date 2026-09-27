-- CANDIDATE ONLY. Not a numbered migration; apply only in isolated qualification.
-- Extends the existing Goal OS. Work/Inbox data remains owned by those services.
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
  IF (NEW.title,NEW.description,NEW.success_criteria) IS DISTINCT FROM
     (OLD.title,OLD.description,OLD.success_criteria) THEN
    NEW.generation := OLD.generation + 1;
    IF OLD.status='completed' THEN NEW.status:='active'; END IF;
  END IF;
  IF NEW.status='completed' AND OLD.status<>'completed' THEN
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
