-- A newly retained Result makes any prior completion historical. Serialize inserts
-- with Result-to-Task verification; retain immutable evidence and require review.
CREATE FUNCTION beta_new_result_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE link record;
BEGIN
 PERFORM 1 FROM engineering_work WHERE scope_id=NEW.scope_id AND scope_kind=NEW.scope_kind AND id=NEW.work_id FOR UPDATE;
 FOR link IN SELECT * FROM goal_work_links WHERE owner_id=NEW.scope_id AND work_id=NEW.work_id::text
  AND state='result' AND result_id<>NEW.id::text AND result->>'current'='true' ORDER BY goal_id LOOP
  UPDATE goals SET status=CASE WHEN status IN ('active','completed') THEN 'paused' ELSE status END,
   generation=generation+1,revision=revision+1,updated_at=now() WHERE owner_id=NEW.scope_id AND id=link.goal_id;
  UPDATE goal_work_links SET result=jsonb_set(result,'{current}','false'::jsonb),updated_at=now() WHERE correlation_key=link.correlation_key;
  UPDATE goal_tasks SET status='verification',paused=true,blocker='A newer canonical Result requires review',
   next_action='Review the new Result and revise the Task before resuming',updated_at=now() WHERE goal_id=link.goal_id AND id=link.task_id AND status='completed';
  INSERT INTO eve_events(id,owner_id,type,source_type,goal_id,goal_task_id,summary,payload,idempotency_key)
   VALUES('result-supersession:'||NEW.id||':'||link.task_id,NEW.scope_id,'WORK_EVIDENCE_INVALIDATED','system',link.goal_id,link.task_id,
   'A newer Result was retained; prior completion remains historical',jsonb_build_object('workId',NEW.work_id,'resultId',NEW.id,'priorResultId',link.result_id),
   'result-supersession:'||NEW.id||':'||link.task_id) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER beta_new_result_invalidation BEFORE INSERT ON engineering_native_results
 FOR EACH ROW EXECUTE FUNCTION beta_new_result_invalidation();
REVOKE ALL ON FUNCTION beta_new_result_invalidation() FROM PUBLIC;
