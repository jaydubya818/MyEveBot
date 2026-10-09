-- Additive Work intent/history. No credential, grant or executable handle is stored here.
CREATE TABLE engineering_work (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL,
  scope_kind text NOT NULL CHECK(scope_kind IN ('personal','organization')),
  created_by text NOT NULL,
  title text NOT NULL,
  objective text NOT NULL,
  repository text NOT NULL,
  lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','accepted','cancelled','failed','superseded')),
  control text NOT NULL DEFAULT 'paused' CHECK(control IN ('agent','human','paused','stopping')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
  criteria_version integer NOT NULL DEFAULT 1 CHECK(criteria_version>0),
  max_cost_usd numeric NOT NULL CHECK(max_cost_usd>0 AND max_cost_usd<=100),
  max_duration_seconds integer NOT NULL CHECK(max_duration_seconds BETWEEN 60 AND 3600),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id,scope_kind,id),
  UNIQUE(scope_id,scope_kind,idempotency_key)
);
-- statement-breakpoint
CREATE INDEX engineering_work_scope_updated ON engineering_work(scope_id,scope_kind,updated_at DESC,id);
-- statement-breakpoint
CREATE TABLE engineering_work_criteria (
  scope_id text NOT NULL,
  scope_kind text NOT NULL,
  work_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 20),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope_id,scope_kind,work_id,version),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
CREATE TABLE engineering_work_events (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL,
  scope_kind text NOT NULL,
  work_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  actor_id text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id,scope_kind,work_id,version),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
