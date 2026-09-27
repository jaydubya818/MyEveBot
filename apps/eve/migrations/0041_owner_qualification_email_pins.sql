-- Durable, append-only allowance for owner-authorized qualification email pins.
-- A pin's identity is its id AND the digest of its exact draft; both are unique, so
-- an exhausted draft can never be reissued under a new id and an id can never be
-- rebound to another draft. Attempts only increase and rows are never deleted, so
-- restarts, reloads or re-registration cannot restore an allowance.
CREATE TABLE owner_qualification_email_pins (
 pin_id text PRIMARY KEY CHECK(pin_id ~ '^email-pin-[0-9]{1,3}$'),
 draft_sha256 text NOT NULL UNIQUE CHECK(draft_sha256 ~ '^[0-9a-f]{64}$'),
 max_sends integer NOT NULL CHECK(max_sends=1),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=max_sends),
 first_attempt_action_id text,
 exhausted_at timestamptz,
 registered_at timestamptz NOT NULL DEFAULT now(),
 CHECK((attempts<max_sends)=(exhausted_at IS NULL))
);
-- statement-breakpoint
CREATE FUNCTION guard_owner_qualification_email_pin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN
  RAISE EXCEPTION 'Qualification email pins are append-only';
 END IF;
 IF NEW.pin_id IS DISTINCT FROM OLD.pin_id OR NEW.draft_sha256 IS DISTINCT FROM OLD.draft_sha256
    OR NEW.max_sends IS DISTINCT FROM OLD.max_sends OR NEW.registered_at IS DISTINCT FROM OLD.registered_at
    OR NEW.attempts<OLD.attempts
    OR (OLD.first_attempt_action_id IS NOT NULL AND NEW.first_attempt_action_id IS DISTINCT FROM OLD.first_attempt_action_id)
    OR (OLD.exhausted_at IS NOT NULL AND NEW.exhausted_at IS DISTINCT FROM OLD.exhausted_at) THEN
  RAISE EXCEPTION 'Qualification email pin identity and consumed allowance are immutable';
 END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER owner_qualification_email_pin_guard BEFORE UPDATE OR DELETE ON owner_qualification_email_pins
 FOR EACH ROW EXECUTE FUNCTION guard_owner_qualification_email_pin();
-- statement-breakpoint
CREATE TRIGGER owner_qualification_email_pin_no_truncate BEFORE TRUNCATE ON owner_qualification_email_pins
 FOR EACH STATEMENT EXECUTE FUNCTION guard_owner_qualification_email_pin();
