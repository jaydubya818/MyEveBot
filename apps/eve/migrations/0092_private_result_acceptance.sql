-- Add a private acceptance action to the canonical owner-decision history.
-- No new Result, publication, execution authority, activation or grants.
ALTER TABLE engineering_owner_decisions DROP CONSTRAINT engineering_owner_decisions_action_check;
-- statement-breakpoint
ALTER TABLE engineering_owner_decisions ADD CONSTRAINT engineering_owner_decisions_action_check CHECK(action IN('open_pr','push_branch','keep_private','reject','accept_private'));
-- statement-breakpoint
ALTER TABLE engineering_owner_decisions ADD COLUMN response_id text;
-- statement-breakpoint
CREATE UNIQUE INDEX engineering_private_acceptance_response ON engineering_owner_decisions(owner_id,response_id) WHERE action='accept_private';
-- statement-breakpoint
CREATE UNIQUE INDEX engineering_private_acceptance_result ON engineering_owner_decisions(owner_id,work_id,result_id) WHERE action='accept_private';
-- statement-breakpoint
ALTER TABLE beta_work_decisions ADD COLUMN result_acceptance_binding jsonb;
-- statement-breakpoint
CREATE FUNCTION engineering_private_acceptance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.action='accept_private' OR (TG_OP='UPDATE' AND NEW.action='accept_private') THEN RAISE EXCEPTION 'Private acceptance history is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER engineering_private_acceptance_guard BEFORE UPDATE OR DELETE ON engineering_owner_decisions FOR EACH ROW EXECUTE FUNCTION engineering_private_acceptance_guard();
