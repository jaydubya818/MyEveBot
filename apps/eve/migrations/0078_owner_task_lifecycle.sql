-- Keep one current binding; all owner-chat transitions take the same session lock.
-- Historical Runs, approvals and Actions are never copied into fresh authority.
CREATE FUNCTION owner_run_recoverable(previous task_runs) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT previous.kind='delegated_work'
    AND (previous.id LIKE 'action_run_%' OR previous.id LIKE 'task_%')
    AND previous.parent_task_id IS NULL AND previous.source_task_id IS NULL
    AND previous.goal_id IS NULL AND previous.goal_task_id IS NULL AND previous.role_id IS NULL
    AND previous.model_steps<previous.max_model_steps
    AND previous.estimated_cost_usd<previous.max_estimated_cost_usd
    AND NOT EXISTS(SELECT 1 FROM execution_occurrences WHERE run_id=previous.id)
    AND NOT EXISTS(SELECT 1 FROM owner_channel_requests WHERE run_id=previous.id)
    AND NOT EXISTS(SELECT 1 FROM task_run_sessions WHERE task_id=previous.id AND role<>'orchestrator')
    AND ((previous.status='completed' AND (previous.id LIKE 'action_run_%'
          OR (previous.completed_at IS NOT NULL AND previous.result_summary IS NOT NULL)))
      OR (previous.status IN ('running','awaiting_approval') AND previous.deadline_at<=clock_timestamp()));
$$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION owner_chat_run(p_owner text,p_session text,p_agent text,p_new_id text,p_recover boolean,p_initialize boolean)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE previous task_runs%ROWTYPE; agent agents%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-chat-run:' || p_session,0));
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
    IF NOT owner_run_recoverable(previous) THEN RAISE EXCEPTION 'RUN_RECOVERY_REQUIRES_OWNER_REVIEW'; END IF;
  ELSIF NOT p_initialize THEN RETURN NULL;
  END IF;
  -- A missing pointer in a populated conversation is not permission to reparent Work.
  IF previous.id IS NULL AND EXISTS(SELECT 1 FROM task_run_sessions WHERE session_id=p_session)
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
-- statement-breakpoint
-- Tools cannot renew expired authority. Fresh owner input first uses owner_chat_run.
-- start_task may replace ONLY a live owner-chat placeholder with no Actions, without
-- extending its deadline or limits. Normal Work is never silently detached.
CREATE FUNCTION start_owner_task(p_owner text,p_session text,p_agent text,p_call text,p_new_id text,p_contract jsonb)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE previous task_runs%ROWTYPE; agent agents%ROWTYPE; replay text;
  duration integer; steps integer; cost numeric; deadline timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-chat-run:' || p_session,0));
  IF p_call IS NULL OR p_call='' OR p_new_id NOT LIKE 'task_%' THEN RAISE EXCEPTION 'RUN_BINDING_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM task_run_sessions s JOIN task_runs r ON r.id=s.task_id
    WHERE s.session_id=p_session AND (r.owner_id<>p_owner OR r.agent_id IS DISTINCT FROM p_agent))
    THEN RAISE EXCEPTION 'RUN_BINDING_INVALID'; END IF;
  -- Durable tool-call replay resolves the original result even after later rollover.
  SELECT s.task_id INTO replay FROM task_run_sessions s JOIN task_runs r ON r.id=s.task_id
    WHERE s.session_id=p_session AND s.call_id=p_call AND s.role='orchestrator'
      AND r.owner_id=p_owner AND r.agent_id=p_agent;
  IF FOUND THEN RETURN replay; END IF;
  SELECT * INTO agent FROM agents WHERE id=p_agent AND owner_id=p_owner AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RUN_BINDING_INVALID'; END IF;
  SELECT r.* INTO previous FROM task_runs r JOIN task_run_sessions s ON s.task_id=r.id
    WHERE s.session_id=p_session AND s.is_current FOR UPDATE OF r;
  IF FOUND THEN
    IF previous.deadline_at<=clock_timestamp() THEN RAISE EXCEPTION 'RUN_EXPIRED'; END IF;
    IF previous.status<>'running' OR previous.id NOT LIKE 'action_run_%'
      OR previous.parent_task_id IS NOT NULL OR previous.source_task_id IS NOT NULL
      OR previous.goal_id IS NOT NULL OR previous.goal_task_id IS NOT NULL OR previous.role_id IS NOT NULL
      OR previous.model_steps>=previous.max_model_steps OR previous.estimated_cost_usd>=previous.max_estimated_cost_usd
      OR EXISTS(SELECT 1 FROM execution_occurrences WHERE run_id=previous.id)
      OR EXISTS(SELECT 1 FROM owner_channel_requests WHERE run_id=previous.id)
      OR EXISTS(SELECT 1 FROM action_requests WHERE run_id=previous.id)
      OR EXISTS(SELECT 1 FROM task_run_sessions WHERE task_id=previous.id AND role<>'orchestrator')
      THEN RAISE EXCEPTION 'RUN_ACTIVE_OR_REVIEW_REQUIRED'; END IF;
  ELSIF EXISTS(SELECT 1 FROM task_run_sessions WHERE session_id=p_session) THEN
    RAISE EXCEPTION 'RUN_BINDING_INVALID';
  END IF;
  duration=LEAST((p_contract->>'maxDurationSeconds')::integer,agent.max_runtime_seconds,previous.max_duration_seconds);
  steps=LEAST((p_contract->>'maxModelSteps')::integer,agent.max_steps,previous.max_model_steps);
  cost=LEAST((p_contract->>'maxEstimatedCostUsd')::numeric,agent.max_estimated_cost_usd,previous.max_estimated_cost_usd);
  deadline=LEAST(clock_timestamp()+duration*interval '1 second',previous.deadline_at);
  IF COALESCE(previous.model_steps,0)>=steps OR COALESCE(previous.estimated_cost_usd,0)>=cost
    THEN RAISE EXCEPTION 'RUN_ACTIVE_OR_REVIEW_REQUIRED'; END IF;
  IF p_contract->>'goalId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM goals WHERE id=p_contract->>'goalId' AND owner_id=p_owner)
    THEN RAISE EXCEPTION 'RUN_BINDING_INVALID'; END IF;
  IF p_contract->>'goalTaskId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM goal_tasks t JOIN goals g ON g.id=t.goal_id
    WHERE t.id=p_contract->>'goalTaskId' AND g.id=p_contract->>'goalId' AND g.owner_id=p_owner)
    THEN RAISE EXCEPTION 'RUN_BINDING_INVALID'; END IF;
  INSERT INTO task_runs(id,owner_id,kind,title,thread_id,agent_id,status,objective,expected_output,
    goal_id,goal_task_id,parent_task_id,source_task_id,role_id,
    max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,model_steps,estimated_cost_usd,started_at,deadline_at)
    VALUES(p_new_id,p_owner,'delegated_work',p_contract->>'title',p_contract->>'threadId',p_agent,'running',
      p_contract->>'objective',p_contract->>'expectedOutput',p_contract->>'goalId',p_contract->>'goalTaskId',
      p_contract->>'parentTaskId',p_contract->>'sourceTaskId',p_contract->>'roleId',duration,
      (p_contract->>'maxWorkers')::integer,steps,0,cost,COALESCE(previous.model_steps,0),COALESCE(previous.estimated_cost_usd,0),clock_timestamp(),deadline);
  IF previous.id IS NOT NULL THEN
    -- No Actions exist on the placeholder. Retain consumed model usage in the
    -- new task budget. Terminalize the placeholder so even a stale
    -- caller holding its ID cannot admit an Action after the current link moves.
    UPDATE task_runs SET status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp(),
      status_reason='Action-free owner-chat context replaced by explicit task' WHERE id=previous.id;
    INSERT INTO task_transitions(task_id,from_status,to_status,actor,reason)
      VALUES(previous.id,previous.status,'cancelled','system','Action-free owner-chat context replaced by explicit task');
    UPDATE task_run_sessions SET is_current=false WHERE session_id=p_session AND is_current;
  END IF;
  INSERT INTO task_run_sessions(task_id,session_id,role,call_id,is_current) VALUES(p_new_id,p_session,'orchestrator',p_call,true);
  INSERT INTO task_transitions(task_id,from_status,to_status,actor,reason)
    VALUES(p_new_id,NULL,'running','agent','Bounded owner task created without inherited authority');
  INSERT INTO task_milestones(task_id,kind,summary,metadata)
    VALUES(p_new_id,'task_started','Owner task started',jsonb_build_object('expectedOutput',p_contract->>'expectedOutput'));
  RETURN p_new_id;
END $$;
