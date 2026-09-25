-- Preserve every historical association; the previous unique constraint proves
-- that each existing session has exactly one current binding.
ALTER TABLE task_run_sessions ADD COLUMN is_current boolean NOT NULL DEFAULT true;
-- statement-breakpoint
ALTER TABLE task_run_sessions DROP CONSTRAINT task_run_sessions_session_id_key;
-- statement-breakpoint
CREATE UNIQUE INDEX task_run_sessions_current ON task_run_sessions(session_id) WHERE is_current;
-- statement-breakpoint
CREATE INDEX task_run_sessions_history ON task_run_sessions(session_id,task_id);
-- statement-breakpoint
-- This is the canonical owner-chat initializer previously in action-context.ts.
-- The transaction-scoped session lock serializes initialization and rollover,
-- including the zero-row case. No network operation occurs in this function.
CREATE FUNCTION owner_chat_run(p_owner text,p_session text,p_agent text,p_new_id text,p_recover boolean,p_initialize boolean)
RETURNS text LANGUAGE plpgsql AS $$
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
