CREATE TABLE unified_beta_feedback (
 owner_id text NOT NULL,id uuid NOT NULL,input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
 platform text NOT NULL CHECK(platform IN('MyEve / Sofie','MyApps','Relay','MyFactory','MissionControl','Capability controls')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),details text NOT NULL CHECK(length(details) BETWEEN 1 AND 4000),
 impact text NOT NULL CHECK(impact IN('BLOCKED','IMPAIRED','MINOR')),
 priority text NOT NULL CHECK(priority IN('P1','P2','P3')),
 work_id uuid,work_version integer,work_generation integer,mission_id text,
 status text NOT NULL DEFAULT 'REPORTED' CHECK(status IN('REPORTED','TRIAGED','RESOLVED')),
 triage_note text,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,id),CHECK((work_id IS NULL)=(work_version IS NULL)),CHECK((work_id IS NULL)=(work_generation IS NULL))
);
CREATE INDEX unified_beta_feedback_queue ON unified_beta_feedback(owner_id,created_at DESC,id DESC);
ALTER TABLE unified_beta_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_beta_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_owner ON unified_beta_feedback USING(owner_id=current_setting('myeve.feedback_owner',true))
 WITH CHECK(owner_id=current_setting('myeve.feedback_owner',true));
REVOKE ALL ON unified_beta_feedback FROM PUBLIC;
CREATE TABLE unified_beta_feedback_triage (
 owner_id text NOT NULL,report_id uuid NOT NULL,revision integer NOT NULL,actor text NOT NULL,
 status text NOT NULL,triage_note text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,report_id,revision),FOREIGN KEY(owner_id,report_id) REFERENCES unified_beta_feedback(owner_id,id)
);
ALTER TABLE unified_beta_feedback_triage ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_beta_feedback_triage FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_owner ON unified_beta_feedback_triage USING(owner_id=current_setting('myeve.feedback_owner',true))
 WITH CHECK(owner_id=current_setting('myeve.feedback_owner',true));
REVOKE ALL ON unified_beta_feedback_triage FROM PUBLIC;
-- statement-breakpoint
CREATE FUNCTION unified_beta_feedback_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='unified_beta_feedback_triage' THEN RAISE EXCEPTION 'FEEDBACK_HISTORY_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','triage_note','revision','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','triage_note','revision','updated_at']) THEN RAISE EXCEPTION 'FEEDBACK_REPORT_IMMUTABLE'; END IF;
 IF NEW.status NOT IN('TRIAGED','RESOLVED') OR length(btrim(coalesce(NEW.triage_note,''))) NOT BETWEEN 1 AND 4000
 THEN RAISE EXCEPTION 'FEEDBACK_TRIAGE_REQUIRED'; END IF;
 NEW.revision=OLD.revision+1;NEW.updated_at=clock_timestamp();
 INSERT INTO unified_beta_feedback_triage(owner_id,report_id,revision,actor,status,triage_note)
 VALUES(NEW.owner_id,NEW.id,NEW.revision,current_user,NEW.status,NEW.triage_note);
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER unified_beta_feedback_guard BEFORE UPDATE OR DELETE ON unified_beta_feedback FOR EACH ROW EXECUTE FUNCTION unified_beta_feedback_guard();
CREATE TRIGGER unified_beta_feedback_triage_guard BEFORE UPDATE OR DELETE ON unified_beta_feedback_triage FOR EACH ROW EXECUTE FUNCTION unified_beta_feedback_guard();
-- Application role receives SELECT/INSERT only through the reviewed installation grant package.
-- Existing privileged operator custody owns triage updates; application callers cannot assign status or notes.
