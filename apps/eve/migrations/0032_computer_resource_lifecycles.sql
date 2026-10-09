-- Ownership facts deliberately have no cascading FKs: cleanup outlives sessions/runs.
CREATE TABLE computer_resource_lifecycles (
  id text PRIMARY KEY,
  owner_id text NOT NULL CHECK (owner_id <> ''),
  agent_id text NOT NULL,
  run_id text NOT NULL,
  computer_session_id text NOT NULL,
  runtime_session_id text NOT NULL,
  provider text NOT NULL CHECK (provider = 'vercel'),
  environment text NOT NULL CHECK (environment <> ''),
  resource_name text NOT NULL UNIQUE,
  generation bigint NOT NULL CHECK (generation > 0),
  provision_id text NOT NULL UNIQUE,
  preparation_id text NOT NULL,
  source_snapshot_id text NOT NULL,
  provider_session_id text,
  owned_snapshot_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(owned_snapshot_ids) = 'array'),
  state text NOT NULL DEFAULT 'provisioning' CHECK (state IN ('provisioning','active','cleanup_pending','cleaned')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  claim_token text,
  claimed_until timestamptz,
  provision_until timestamptz NOT NULL DEFAULT (now() + interval '150 seconds'),
  retry_after timestamptz NOT NULL DEFAULT now(),
  cleanup_attempts integer NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  reason text,
  initiator text CHECK (initiator IN ('owner','agent','system')),
  failure_code text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (computer_session_id, generation),
  CHECK ((claim_token IS NULL) = (claimed_until IS NULL)),
  CHECK (claim_token IS NULL OR state = 'cleanup_pending'),
  CHECK ((state = 'cleaned') = (verified_at IS NOT NULL))
);
-- statement-breakpoint
CREATE UNIQUE INDEX computer_resource_current ON computer_resource_lifecycles(computer_session_id)
  WHERE state IN ('provisioning','active');
-- statement-breakpoint
CREATE INDEX computer_resource_owner_session ON computer_resource_lifecycles(owner_id,computer_session_id,generation DESC);
-- statement-breakpoint
CREATE INDEX computer_resource_recovery ON computer_resource_lifecycles(environment,state,retry_after);
-- statement-breakpoint
CREATE FUNCTION preserve_computer_resource_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.owner_id,NEW.agent_id,NEW.run_id,NEW.computer_session_id,NEW.runtime_session_id,
    NEW.provider,NEW.environment,NEW.resource_name,NEW.generation,NEW.provision_id,NEW.preparation_id,NEW.source_snapshot_id,NEW.provision_until)
    IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.agent_id,OLD.run_id,OLD.computer_session_id,OLD.runtime_session_id,
    OLD.provider,OLD.environment,OLD.resource_name,OLD.generation,OLD.provision_id,OLD.preparation_id,OLD.source_snapshot_id,OLD.provision_until)
  THEN RAISE EXCEPTION 'Computer resource ownership is immutable'; END IF;
  RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER computer_resource_binding_immutable BEFORE UPDATE ON computer_resource_lifecycles
  FOR EACH ROW EXECUTE FUNCTION preserve_computer_resource_binding();
-- statement-breakpoint
-- Legacy resources cannot acquire ownership retrospectively. Fence their execution.
UPDATE computer_control_leases SET controller='NONE',version=version+1,owner_input_enabled=false,
  claimed_by=NULL,claimed_at=NULL,expires_at=NULL,transition_reason='Legacy Computer requires a new owned resource',updated_at=now();
-- statement-breakpoint
UPDATE computer_sessions SET status='lost',failure_code='legacy_resource_unbound',
  failure_summary='Historical provider ownership is unverified. Start a new Computer.',completed_at=coalesce(completed_at,now())
  WHERE status IN ('provisioning','ready','running','paused');
