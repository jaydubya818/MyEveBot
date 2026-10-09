-- Legacy records remain historical; none receive inferred standing authority.
ALTER TABLE reminders
  ADD COLUMN owner_id text,
  ADD COLUMN configuration_version integer NOT NULL DEFAULT 1 CHECK (configuration_version>0),
  ADD COLUMN reviewed_version integer,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN execution_routine_id text REFERENCES execution_routines(id);

-- statement-breakpoint
CREATE INDEX reminders_owner_review ON reminders(owner_id,status,reviewed_version);

-- statement-breakpoint
ALTER TABLE execution_occurrences ADD COLUMN runtime_session_id text;

-- statement-breakpoint
CREATE UNIQUE INDEX execution_occurrence_runtime ON execution_occurrences(runtime_session_id) WHERE runtime_session_id IS NOT NULL;

-- statement-breakpoint
CREATE FUNCTION invalidate_reminder_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.prompt,NEW.cron,NEW.timezone,NEW.chat_id,NEW.approval_boundary)
     IS DISTINCT FROM ROW(OLD.prompt,OLD.cron,OLD.timezone,OLD.chat_id,OLD.approval_boundary) THEN
    NEW.configuration_version := OLD.configuration_version+1;
    NEW.reviewed_version := NULL;
    NEW.reviewed_at := NULL;
    IF OLD.execution_routine_id IS NOT NULL THEN
      UPDATE execution_routines SET status='paused',paused_at=now(),updated_at=now()
      WHERE id=OLD.execution_routine_id;
    END IF;
  END IF;
  IF NEW.status IN ('paused','cancelled') AND OLD.execution_routine_id IS NOT NULL THEN
    UPDATE execution_routines SET status='paused',paused_at=now(),updated_at=now()
    WHERE id=OLD.execution_routine_id;
  END IF;
  RETURN NEW;
END $$;

-- statement-breakpoint
CREATE TRIGGER reminders_invalidate_authority BEFORE UPDATE ON reminders
FOR EACH ROW EXECUTE FUNCTION invalidate_reminder_authority();
