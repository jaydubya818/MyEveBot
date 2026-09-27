-- Replace __GOAL_RUNTIME_ROLE__ with the integration-assigned, quoted dedicated
-- runtime role. It must be NOSUPERUSER NOBYPASSRLS and must NOT own these tables.
-- No role creation, shared grants, schema head update, or migration number here.
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goals TO __GOAL_RUNTIME_ROLE__
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_tasks TO __GOAL_RUNTIME_ROLE__
 USING(EXISTS(SELECT 1 FROM goals g WHERE g.id=goal_id AND g.owner_id=current_setting('app.owner_id',true)))
 WITH CHECK(EXISTS(SELECT 1 FROM goals g WHERE g.id=goal_id AND g.owner_id=current_setting('app.owner_id',true)));
ALTER TABLE goal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_plans TO __GOAL_RUNTIME_ROLE__
 USING(EXISTS(SELECT 1 FROM goals g WHERE g.id=goal_id AND g.owner_id=current_setting('app.owner_id',true)))
 WITH CHECK(EXISTS(SELECT 1 FROM goals g WHERE g.id=goal_id AND g.owner_id=current_setting('app.owner_id',true)));
ALTER TABLE goal_task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_task_dependencies TO __GOAL_RUNTIME_ROLE__
 USING(EXISTS(SELECT 1 FROM goal_tasks t WHERE t.id=task_id))
 WITH CHECK(EXISTS(SELECT 1 FROM goal_tasks t WHERE t.id=task_id) AND EXISTS(SELECT 1 FROM goal_tasks t WHERE t.id=depends_on_task_id));
ALTER TABLE eve_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON eve_events TO __GOAL_RUNTIME_ROLE__
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_work_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_work_dependencies TO __GOAL_RUNTIME_ROLE__
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_work_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_work_links TO __GOAL_RUNTIME_ROLE__
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_work_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_work_signals TO __GOAL_RUNTIME_ROLE__
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
ALTER TABLE goal_outcome_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_runtime_owner ON goal_outcome_evidence TO __GOAL_RUNTIME_ROLE__
 USING(owner_id=current_setting('app.owner_id',true)) WITH CHECK(owner_id=current_setting('app.owner_id',true));
GRANT SELECT,INSERT,UPDATE ON goals,goal_tasks,goal_plans,goal_work_links TO __GOAL_RUNTIME_ROLE__;
GRANT SELECT,INSERT ON eve_events,goal_work_signals,goal_outcome_evidence TO __GOAL_RUNTIME_ROLE__;
GRANT SELECT,INSERT,UPDATE,DELETE ON goal_work_dependencies TO __GOAL_RUNTIME_ROLE__;
GRANT SELECT ON goal_task_dependencies TO __GOAL_RUNTIME_ROLE__;
