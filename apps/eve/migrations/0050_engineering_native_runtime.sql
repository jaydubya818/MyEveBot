-- One native model writer and conservative durable spend ledger per Work.
-- Reservations survive process loss. Unknown calls are never refunded or retried.
CREATE TABLE engineering_native_runtime (
  scope_id text NOT NULL,
  scope_kind text NOT NULL CHECK(scope_kind='personal'),
  work_id uuid NOT NULL,
  route_run_id uuid NOT NULL UNIQUE REFERENCES engineering_route_runs(id),
  session_id text NOT NULL,
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_microusd>=0),
  spent_microusd bigint NOT NULL DEFAULT 0 CHECK(spent_microusd>=0),
  calls_started integer NOT NULL DEFAULT 0 CHECK(calls_started>=0),
  inflight boolean NOT NULL DEFAULT false,
  usage_unknown boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope_id,scope_kind,work_id),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
CREATE TABLE engineering_native_model_calls (
  scope_id text NOT NULL, scope_kind text NOT NULL, work_id uuid NOT NULL,
  step_key text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  model_id text NOT NULL,
  reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0),
  spent_microusd bigint CHECK(spent_microusd>=0),
  status text NOT NULL CHECK(status IN ('INFLIGHT','COMPLETED','UNKNOWN')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  PRIMARY KEY(scope_id,scope_kind,work_id,step_key),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_native_runtime(scope_id,scope_kind,work_id),
  CHECK ((status='COMPLETED' AND result IS NOT NULL AND spent_microusd IS NOT NULL AND completed_at IS NOT NULL) OR status<>'COMPLETED')
);
-- statement-breakpoint
-- Immutable result records are written only from retained independent verification.
CREATE TABLE engineering_native_results (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL, scope_kind text NOT NULL, work_id uuid NOT NULL,
  candidate_sha text NOT NULL CHECK(candidate_sha ~ '^[a-f0-9]{40}$'),
  work_version integer NOT NULL CHECK(work_version>0),
  work_generation integer NOT NULL CHECK(work_generation>0),
  proof jsonb NOT NULL CHECK(jsonb_typeof(proof)='object'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id,scope_kind,work_id,candidate_sha),
  FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
CREATE FUNCTION engineering_native_result_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Native result records are immutable'; END;
$$;
-- statement-breakpoint
CREATE TRIGGER engineering_native_result_immutable BEFORE UPDATE OR DELETE ON engineering_native_results
FOR EACH ROW EXECUTE FUNCTION engineering_native_result_immutable();
