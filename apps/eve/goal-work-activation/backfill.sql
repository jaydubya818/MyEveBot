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
