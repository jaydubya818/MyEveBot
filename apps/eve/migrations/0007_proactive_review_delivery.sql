ALTER TABLE review_checkpoints
  ADD COLUMN IF NOT EXISTS id text;

-- statement-breakpoint
UPDATE review_checkpoints
SET id = 'checkpoint_legacy_' || md5(owner_id || ':' || review_kind || ':' || period_start::text)
WHERE id IS NULL;

-- statement-breakpoint
ALTER TABLE review_checkpoints
  ALTER COLUMN id SET NOT NULL,
  ADD COLUMN IF NOT EXISTS local_period_key text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS review_snapshot jsonb;

-- statement-breakpoint
ALTER TABLE review_checkpoints DROP CONSTRAINT IF EXISTS review_checkpoints_pkey;

-- statement-breakpoint
ALTER TABLE review_checkpoints ADD PRIMARY KEY (id);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS review_checkpoints_owner_period
  ON review_checkpoints (owner_id, review_kind, local_period_key)
  WHERE local_period_key IS NOT NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS review_checkpoints_owner_latest
  ON review_checkpoints (owner_id, review_kind, last_generated_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS review_delivery_preferences (
  owner_id text PRIMARY KEY,
  owner_timezone text NOT NULL DEFAULT 'UTC',
  daily_brief_enabled boolean NOT NULL DEFAULT false,
  daily_brief_time time NOT NULL DEFAULT '07:00',
  weekly_review_enabled boolean NOT NULL DEFAULT false,
  weekly_review_day smallint NOT NULL DEFAULT 0 CHECK (weekly_review_day BETWEEN 0 AND 6),
  weekly_review_time time NOT NULL DEFAULT '19:00',
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time NOT NULL DEFAULT '22:00',
  quiet_hours_end time NOT NULL DEFAULT '07:00',
  preferred_delivery_channel text NOT NULL DEFAULT 'in_app'
    CHECK (preferred_delivery_channel IN ('in_app', 'push', 'telegram')),
  max_proactive_pushes_per_day smallint NOT NULL DEFAULT 2
    CHECK (max_proactive_pushes_per_day BETWEEN 0 AND 20),
  daily_next_at timestamptz,
  weekly_next_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS review_delivery_preferences_due
  ON review_delivery_preferences (daily_next_at, weekly_next_at)
  WHERE daily_brief_enabled OR weekly_review_enabled;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS review_deliveries (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  review_kind text NOT NULL CHECK (review_kind IN ('daily', 'weekly')),
  checkpoint_id text REFERENCES review_checkpoints(id) ON DELETE SET NULL,
  local_period_key text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  attempted_at timestamptz,
  delivered_at timestamptz,
  requested_channel text NOT NULL CHECK (requested_channel IN ('in_app', 'push', 'telegram')),
  channel text NOT NULL CHECK (channel IN ('in_app', 'push', 'telegram')),
  delivery_classification text NOT NULL DEFAULT 'digest'
    CHECK (delivery_classification IN ('silent', 'activity', 'digest', 'push', 'urgent')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'deferred', 'delivering', 'delivered', 'failed', 'cancelled', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  deduplication_key text NOT NULL UNIQUE,
  deduplication_hits integer NOT NULL DEFAULT 0 CHECK (deduplication_hits >= 0),
  failure_category text CHECK (failure_category IN ('transient', 'configuration', 'authorization', 'provider', 'invalid_destination', 'unknown')),
  failure_code text,
  failure_summary text,
  next_attempt_at timestamptz,
  claimed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS review_deliveries_due
  ON review_deliveries (next_attempt_at, scheduled_for)
  WHERE status IN ('scheduled', 'deferred', 'failed');

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS review_deliveries_owner_history
  ON review_deliveries (owner_id, scheduled_for DESC, id DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS review_delivery_attempts (
  id bigserial PRIMARY KEY,
  delivery_id text NOT NULL REFERENCES review_deliveries(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('delivering', 'delivered', 'failed', 'skipped')),
  failure_category text CHECK (failure_category IN ('transient', 'configuration', 'authorization', 'provider', 'invalid_destination', 'unknown')),
  failure_code text,
  failure_summary text,
  UNIQUE (delivery_id, attempt_number)
);

-- statement-breakpoint
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS owner_id text;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS push_subscriptions_owner
  ON push_subscriptions (owner_id, created_at DESC);
