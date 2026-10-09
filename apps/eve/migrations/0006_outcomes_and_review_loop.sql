CREATE TABLE IF NOT EXISTS outcomes (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  goal_id text REFERENCES goals(id) ON DELETE SET NULL,
  goal_task_id text REFERENCES goal_tasks(id) ON DELETE SET NULL,
  run_id text REFERENCES task_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('successful', 'partially_successful', 'blocked', 'failed', 'abandoned', 'ineffective', 'unknown')),
  owner_feedback text NOT NULL DEFAULT 'unknown'
    CHECK (owner_feedback IN ('helpful', 'neutral', 'unhelpful', 'unknown')),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1000),
  rationale jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS outcomes_owner_idempotency
  ON outcomes (owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS outcomes_owner_timeline
  ON outcomes (owner_id, occurred_at DESC, id DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS outcomes_goal_timeline
  ON outcomes (goal_id, occurred_at DESC, id DESC)
  WHERE goal_id IS NOT NULL;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS outcome_evidence_links (
  outcome_id text NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN ('event', 'task_artifact')),
  evidence_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outcome_id, evidence_type, evidence_id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS outcome_evidence_reverse
  ON outcome_evidence_links (evidence_type, evidence_id, outcome_id);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS review_checkpoints (
  owner_id text NOT NULL,
  review_kind text NOT NULL CHECK (review_kind IN ('daily', 'weekly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  last_generated_at timestamptz NOT NULL,
  last_event_at timestamptz,
  last_event_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, review_kind)
);

-- statement-breakpoint
ALTER TABLE eve_events
  ADD COLUMN IF NOT EXISTS delivery_classification text NOT NULL DEFAULT 'activity'
    CHECK (delivery_classification IN ('silent', 'activity', 'digest', 'push', 'urgent'));

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS eve_events_delivery_queue
  ON eve_events (owner_id, delivery_classification, occurred_at DESC)
  WHERE delivery_classification IN ('digest', 'push', 'urgent');
