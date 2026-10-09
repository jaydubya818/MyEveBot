ALTER TABLE action_requests
  ADD COLUMN reason_code text NOT NULL DEFAULT 'legacy_decision',
  ADD COLUMN policy_version text NOT NULL DEFAULT 'local-v1';

-- statement-breakpoint
ALTER TABLE execution_routine_versions ADD COLUMN review_binding jsonb NOT NULL DEFAULT '{}'::jsonb;

-- statement-breakpoint
-- Standing grants are immutable snapshots. Direct configuration edits revoke
-- the live routine; approval creates a new snapshot and advances the version.
CREATE FUNCTION revoke_changed_routine_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.configuration,NEW.agent_id) IS DISTINCT FROM ROW(OLD.configuration,OLD.agent_id)
     AND NEW.version=OLD.version THEN
    NEW.status := 'paused';
    NEW.paused_at := now();
  END IF;
  RETURN NEW;
END $$;

-- statement-breakpoint
CREATE TRIGGER execution_routines_revoke_changed_authority BEFORE UPDATE ON execution_routines
FOR EACH ROW EXECUTE FUNCTION revoke_changed_routine_authority();
