-- Forward-only hardening after 0058 qualified. Preserve retained Result/history bytes.
-- Serialize Goal completion with canonical Work revision changes, including callers
-- outside the beta HTTP surface. These functions grant no executor authority.
CREATE FUNCTION beta_goal_result_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE w engineering_work%ROWTYPE; r engineering_native_results%ROWTYPE; latest uuid;
BEGIN
 IF NEW.state='result' AND NEW.result->>'current'='true' AND NEW.result->>'verified'='true' THEN
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND id=NEW.work_id::uuid FOR SHARE;
  SELECT * INTO STRICT r FROM engineering_native_results WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND work_id=w.id AND id=NEW.result_id::uuid;
  SELECT id INTO latest FROM engineering_native_results WHERE scope_id=NEW.owner_id AND scope_kind='personal' AND work_id=w.id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF r.work_version<>w.version OR r.work_generation<>w.generation OR (r.proof->>'criteriaVersion')::integer<>w.criteria_version
    OR latest<>r.id OR w.lifecycle IN ('cancelled','failed','superseded') THEN
    RAISE EXCEPTION 'Current canonical Work Result required';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER beta_goal_result_fence BEFORE INSERT OR UPDATE ON goal_work_links
 FOR EACH ROW EXECUTE FUNCTION beta_goal_result_fence();
REVOKE ALL ON FUNCTION beta_goal_result_fence() FROM PUBLIC;
-- statement-breakpoint
CREATE FUNCTION beta_work_evidence_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE link record;
BEGIN
 IF (NEW.version,NEW.generation,NEW.criteria_version) IS NOT DISTINCT FROM (OLD.version,OLD.generation,OLD.criteria_version) THEN RETURN NEW; END IF;
 FOR link IN SELECT * FROM goal_work_links WHERE owner_id=NEW.scope_id AND work_id=NEW.id::text AND state='result' ORDER BY goal_id LOOP
  UPDATE goals SET status=CASE WHEN status IN ('active','completed') THEN 'paused' ELSE status END,
   generation=generation+1,revision=revision+1,updated_at=now() WHERE owner_id=NEW.scope_id AND id=link.goal_id;
  UPDATE goal_work_links SET result=jsonb_set(result,'{current}','false'::jsonb),updated_at=now() WHERE correlation_key=link.correlation_key;
  UPDATE goal_tasks SET status='verification',paused=true,blocker='Canonical Work changed after this Result',
   next_action='Review the changed Work and revise the Task before resuming',updated_at=now() WHERE goal_id=link.goal_id AND id=link.task_id AND status='completed';
  INSERT INTO eve_events(id,owner_id,type,source_type,goal_id,goal_task_id,summary,payload,idempotency_key)
   VALUES('work-invalidation:'||NEW.id||':'||NEW.version,NEW.scope_id,'WORK_EVIDENCE_INVALIDATED','system',link.goal_id,link.task_id,
   'Canonical Work changed; prior Result remains historical',jsonb_build_object('workId',NEW.id,'oldVersion',OLD.version,'version',NEW.version,'resultId',link.result_id),
   'work-invalidation:'||NEW.id||':'||NEW.version) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER beta_work_evidence_invalidation AFTER UPDATE ON engineering_work
 FOR EACH ROW EXECUTE FUNCTION beta_work_evidence_invalidation();
REVOKE ALL ON FUNCTION beta_work_evidence_invalidation() FROM PUBLIC;
