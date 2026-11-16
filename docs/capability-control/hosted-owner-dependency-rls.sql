-- Owner installation jay. Apply only to the sofie-personal-agent app database.
-- Keep both ends of goal task dependencies within the deployment owner's scope.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'goal_task_dependencies'
      AND policyname = 'hosted_runtime_app_connection'
      AND roles = ARRAY['myeve_hosted_runtime_jay'::name]
  ) THEN
    RAISE EXCEPTION 'Expected the owner hosted runtime dependency policy';
  END IF;
END;
$$;

ALTER POLICY hosted_runtime_app_connection ON public.goal_task_dependencies
  USING (
    EXISTS (
      SELECT 1 FROM public.goal_tasks AS task
      JOIN public.goals AS goal ON goal.id = task.goal_id
      WHERE task.id = goal_task_dependencies.task_id AND goal.owner_id = 'owner'
    )
    AND EXISTS (
      SELECT 1 FROM public.goal_tasks AS task
      JOIN public.goals AS goal ON goal.id = task.goal_id
      WHERE task.id = goal_task_dependencies.depends_on_task_id AND goal.owner_id = 'owner'
    )
  );

COMMIT;
