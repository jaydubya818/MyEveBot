-- ER1 persists route assessments and future route/run history. These records are
-- explanatory state, never an execution grant or a provider credential.
CREATE TABLE engineering_routing_decisions (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL,
  scope_kind text NOT NULL CHECK(scope_kind IN ('personal','organization')),
  work_id uuid NOT NULL,
  work_version integer NOT NULL CHECK(work_version > 0),
  selected_route text NOT NULL CHECK(selected_route IN ('DIRECT','DEEP_AGENT','EXECUTOR','MYFACTORY','RELAY','HUMAN')),
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
  source text NOT NULL CHECK(source IN ('RULE','SOFIE_RECOMMENDATION','OWNER_PREFERENCE','POLICY','RECOVERY','LEARNING_RECOMMENDATION')),
  profile jsonb NOT NULL CHECK(jsonb_typeof(profile) = 'object'),
  eligible_routes jsonb NOT NULL CHECK(jsonb_typeof(eligible_routes) = 'array'),
  rejected_routes jsonb NOT NULL CHECK(jsonb_typeof(rejected_routes) = 'array'),
  constraints jsonb NOT NULL CHECK(jsonb_typeof(constraints) = 'array'),
  provider_id text,
  provider_version text,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','ADMITTED')),
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id,scope_kind,work_id,work_version),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id),
  CHECK((provider_id IS NULL) = (provider_version IS NULL))
);
-- statement-breakpoint
CREATE INDEX engineering_routing_decisions_recent
  ON engineering_routing_decisions(scope_id,scope_kind,work_id,work_version DESC);
-- statement-breakpoint
CREATE TABLE engineering_route_transitions (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL,
  scope_kind text NOT NULL CHECK(scope_kind IN ('personal','organization')),
  work_id uuid NOT NULL,
  work_version integer NOT NULL CHECK(work_version > 0),
  from_route text NOT NULL CHECK(from_route IN ('DIRECT','DEEP_AGENT','EXECUTOR','MYFACTORY','RELAY','HUMAN')),
  to_route text NOT NULL CHECK(to_route IN ('DIRECT','DEEP_AGENT','EXECUTOR','MYFACTORY','RELAY','HUMAN')),
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
  trigger text NOT NULL CHECK(length(trigger) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
CREATE INDEX engineering_route_transitions_recent
  ON engineering_route_transitions(scope_id,scope_kind,work_id,created_at DESC,id);
-- statement-breakpoint
CREATE TABLE engineering_route_runs (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL,
  scope_kind text NOT NULL CHECK(scope_kind IN ('personal','organization')),
  work_id uuid NOT NULL,
  route text NOT NULL CHECK(route IN ('DIRECT','DEEP_AGENT','EXECUTOR','MYFACTORY','RELAY','HUMAN')),
  provider_id text,
  provider_version text,
  status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','BLOCKED','COMPLETED','FAILED','CANCELLED','UNKNOWN')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id),
  CHECK((provider_id IS NULL) = (provider_version IS NULL))
);
-- statement-breakpoint
CREATE INDEX engineering_route_runs_recent
  ON engineering_route_runs(scope_id,scope_kind,work_id,updated_at DESC,id);
