-- A route admission records the verified basis and reserves one Work writer.
-- It does not start a provider or authorize an effect after the Work changes.
ALTER TABLE engineering_routing_decisions
  ADD COLUMN admission_reason text,
  ADD COLUMN admission_policy_id text,
  ADD COLUMN admission_policy_version integer,
  ADD COLUMN admission_request jsonb,
  ADD COLUMN admission_context_snapshot jsonb,
  ADD COLUMN admission_authority_snapshot jsonb,
  ADD COLUMN admission_context_hash text,
  ADD COLUMN admission_authority_hash text,
  ADD COLUMN admitted_at timestamptz,
  ADD CONSTRAINT engineering_routing_admission_complete CHECK (
    (status = 'PROPOSED' AND admitted_at IS NULL)
    OR (status = 'ADMITTED' AND admitted_at IS NOT NULL
      AND admission_reason IS NOT NULL AND admission_policy_id IS NOT NULL
      AND admission_policy_version IS NOT NULL AND admission_request IS NOT NULL
      AND jsonb_typeof(admission_request) = 'object'
      AND admission_context_snapshot IS NOT NULL
      AND jsonb_typeof(admission_context_snapshot) = 'object'
      AND admission_authority_snapshot IS NOT NULL
      AND jsonb_typeof(admission_authority_snapshot) = 'object'
      AND admission_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND admission_authority_hash ~ '^sha256:[0-9a-f]{64}$'
      AND provider_id IS NOT NULL AND provider_version IS NOT NULL)
  );
-- statement-breakpoint
ALTER TABLE engineering_route_transitions
  ADD COLUMN decision_id uuid UNIQUE REFERENCES engineering_routing_decisions(id),
  ADD COLUMN context_snapshot_ref text,
  ADD COLUMN authority_snapshot_ref text;
-- statement-breakpoint
ALTER TABLE engineering_route_runs
  ADD COLUMN decision_id uuid UNIQUE REFERENCES engineering_routing_decisions(id),
  ADD COLUMN work_version integer CHECK(work_version > 0),
  ADD COLUMN work_generation integer CHECK(work_generation > 0);
-- statement-breakpoint
CREATE UNIQUE INDEX engineering_route_runs_one_open_writer
  ON engineering_route_runs(scope_id,scope_kind,work_id)
  WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED');
