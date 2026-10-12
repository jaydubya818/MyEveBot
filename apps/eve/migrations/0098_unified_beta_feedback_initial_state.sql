-- An application INSERT cannot impersonate operator triage or fabricate history.
CREATE FUNCTION unified_beta_feedback_initial_state() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM 'REPORTED' OR NEW.triage_note IS NOT NULL OR NEW.revision IS DISTINCT FROM 1
  OR NEW.priority IS DISTINCT FROM (CASE NEW.impact WHEN 'BLOCKED' THEN 'P1' WHEN 'IMPAIRED' THEN 'P2' WHEN 'MINOR' THEN 'P3' END)
 THEN RAISE EXCEPTION 'FEEDBACK_INITIAL_STATE_REQUIRED'; END IF;
 NEW.created_at=clock_timestamp();NEW.updated_at=NEW.created_at;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER unified_beta_feedback_initial_state BEFORE INSERT ON unified_beta_feedback
 FOR EACH ROW EXECUTE FUNCTION unified_beta_feedback_initial_state();
