-- Provider-neutral preparation identity. No runtime resources or authority are created.
CREATE TABLE computer_template_preparations (
  id text PRIMARY KEY,
  scope text NOT NULL,
  fingerprint text NOT NULL,
  provider text NOT NULL,
  state text NOT NULL CHECK (state IN ('PREPARING','READY','FAILED','CLEANING','CLEANED')),
  deadline timestamptz NOT NULL,
  template_id text,
  failure_code text,
  retry_after timestamptz NOT NULL DEFAULT now(),
  cleanup_attempts integer NOT NULL DEFAULT 0,
  cleanup_token text,
  cleanup_failed boolean NOT NULL DEFAULT false,
  recovery_until timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  cost_usd numeric(12,6) CHECK (cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE UNIQUE INDEX computer_template_live_key ON computer_template_preparations(scope,fingerprint)
WHERE state IN ('PREPARING','READY','CLEANING');
-- statement-breakpoint
CREATE INDEX computer_template_recovery ON computer_template_preparations(state,deadline);
-- statement-breakpoint
CREATE TABLE computer_template_waiters (
  id text PRIMARY KEY,
  scope text NOT NULL,
  fingerprint text NOT NULL,
  expires_at timestamptz NOT NULL
);
-- statement-breakpoint
CREATE INDEX computer_template_waiters_key ON computer_template_waiters(scope,fingerprint,expires_at);
-- statement-breakpoint
CREATE TABLE computer_template_events (
  id bigserial PRIMARY KEY,
  preparation_id text NOT NULL REFERENCES computer_template_preparations(id),
  event text NOT NULL,
  failure_code text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX computer_template_events_preparation ON computer_template_events(preparation_id,created_at);
