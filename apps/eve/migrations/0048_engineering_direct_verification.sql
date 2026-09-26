-- A protected check is a server-owned job for one frozen native candidate.
-- An expired RUNNING lease is ambiguous and must be reconciled before retry.
CREATE TABLE engineering_direct_verification_jobs (
  scope_id text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'personal' CHECK (scope_kind = 'personal'),
  work_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  candidate_sha text NOT NULL CHECK (candidate_sha ~ '^[0-9a-f]{40}$'),
  workspace_revision integer NOT NULL CHECK (workspace_revision > 0),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN
    ('QUEUED','RUNNING','RECOVERY_REQUIRED','COMPLETED','STALE')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 8),
  lease_token uuid,
  lease_until timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 1000),
  evidence_count integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id,scope_kind,work_id,candidate_sha),
  UNIQUE (scope_id,scope_kind,work_id,candidate_id),
  FOREIGN KEY (scope_id,scope_kind,work_id)
    REFERENCES engineering_direct_workspaces (scope_id,scope_kind,work_id) ON DELETE RESTRICT,
  CHECK ((status = 'RUNNING') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
-- statement-breakpoint
CREATE INDEX engineering_direct_verification_jobs_pending
  ON engineering_direct_verification_jobs (status,updated_at,work_id)
  WHERE status IN ('QUEUED','RUNNING','RECOVERY_REQUIRED');
