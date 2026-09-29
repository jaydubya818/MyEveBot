-- M6 staging only. These rows are unverified feedback claims and advisory
-- suggestions. No application writer may promote them without independent
-- qualification and an exact authenticated owner review source.
CREATE TABLE engineering_learning_drafts (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'personal' CHECK (scope_kind = 'personal'),
  work_id uuid NOT NULL,
  work_version integer NOT NULL CHECK (work_version > 0),
  repository text NOT NULL,
  work_shape text NOT NULL CHECK (length(work_shape) BETWEEN 1 AND 80),
  feedback_id uuid NOT NULL,
  feedback_claim jsonb NOT NULL CHECK (jsonb_typeof(feedback_claim) = 'object'),
  candidate jsonb NOT NULL CHECK (jsonb_typeof(candidate) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'DRAFT_UNVERIFIED' CHECK (status = 'DRAFT_UNVERIFIED'),
  trust text NOT NULL DEFAULT 'ADVISORY_ONLY' CHECK (trust = 'ADVISORY_ONLY'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, scope_kind, work_id, id),
  UNIQUE (scope_id, feedback_id),
  FOREIGN KEY (scope_id, scope_kind, work_id)
    REFERENCES engineering_work (scope_id, scope_kind, id) ON DELETE RESTRICT,
  CHECK (candidate->>'candidateId' = id::text),
  CHECK (candidate->>'contentHash' = content_hash),
  CHECK (candidate->>'sourceFeedbackId' = feedback_id::text),
  CHECK (candidate->>'sourceWorkId' = work_id::text),
  CHECK ((candidate->>'sourceWorkVersion')::integer = work_version),
  CHECK (candidate->'scope'->>'kind' = scope_kind),
  CHECK (candidate->'scope'->>'id' = scope_id),
  CHECK (candidate->>'ownerId' = scope_id),
  CHECK (candidate->'applicability'->>'repository' = repository),
  CHECK (candidate->'applicability'->>'workShape' = work_shape),
  CHECK (candidate->>'status' = 'DRAFT'),
  CHECK (candidate->>'trust' = trust),
  CHECK (feedback_claim->>'feedbackId' = feedback_id::text),
  CHECK (feedback_claim->>'workId' = work_id::text),
  CHECK ((feedback_claim->>'workVersion')::integer = work_version),
  CHECK (feedback_claim->'scope'->>'kind' = scope_kind),
  CHECK (feedback_claim->'scope'->>'id' = scope_id),
  CHECK (feedback_claim->>'ownerId' = scope_id),
  CHECK (feedback_claim->>'repository' = repository),
  CHECK (feedback_claim->>'workShape' = work_shape)
);

-- statement-breakpoint
CREATE INDEX engineering_learning_drafts_work_recent
  ON engineering_learning_drafts (scope_id, scope_kind, work_id, created_at DESC, id DESC);
