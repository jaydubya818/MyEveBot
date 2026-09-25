CREATE TABLE engineering_execution (
  scope_id text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('personal','organization')),
  work_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  lease_token uuid,
  lease_until timestamptz,
  reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(reserved_usd >= 0),
  model_requests integer NOT NULL DEFAULT 0 CHECK(model_requests >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope_id,scope_kind,work_id),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
CREATE TABLE engineering_execution_history (
  scope_id text NOT NULL, scope_kind text NOT NULL, work_id uuid NOT NULL,
  revision bigint NOT NULL, kind text NOT NULL, actor_id text NOT NULL,
  state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope_id,scope_kind,work_id,revision),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_execution(scope_id,scope_kind,work_id)
);
CREATE INDEX engineering_execution_updated ON engineering_execution(updated_at);
CREATE TABLE engineering_model_calls (
  id uuid PRIMARY KEY, scope_id text NOT NULL, scope_kind text NOT NULL, work_id uuid NOT NULL,
  attempt_id uuid NOT NULL, reserved_usd numeric(12,6) NOT NULL,
  state text NOT NULL CHECK(state IN ('RESERVED','RETURNED','UNKNOWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_execution(scope_id,scope_kind,work_id)
);
