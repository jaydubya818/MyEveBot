-- Native Sofie draft custody for an already admitted DIRECT route. An agent
-- cannot manufacture a route admission, protected evidence, or publication.
CREATE TABLE engineering_direct_workspaces (
  scope_id text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'personal' CHECK (scope_kind = 'personal'),
  work_id uuid NOT NULL,
  decision_id uuid NOT NULL UNIQUE REFERENCES engineering_routing_decisions(id),
  route_run_id uuid NOT NULL UNIQUE REFERENCES engineering_route_runs(id),
  work_version integer NOT NULL CHECK (work_version > 0),
  work_generation integer NOT NULL CHECK (work_generation > 0),
  criteria_version integer NOT NULL CHECK (criteria_version > 0),
  repository text NOT NULL,
  base_sha text NOT NULL CHECK (base_sha ~ '^[0-9a-f]{40}$'),
  profile_hash text NOT NULL CHECK (profile_hash ~ '^[0-9a-f]{64}$'),
  deadline timestamptz NOT NULL,
  source_files jsonb NOT NULL CHECK (jsonb_typeof(source_files) = 'object'),
  draft_files jsonb NOT NULL CHECK (jsonb_typeof(draft_files) = 'object'),
  plan text NOT NULL DEFAULT '' CHECK (length(plan) <= 8000),
  phase text NOT NULL DEFAULT 'DRAFT' CHECK (phase IN
    ('DRAFT','VERIFICATION_REQUESTED','VERIFICATION_FAILED','VERIFICATION_PASSED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidates) = 'array'),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id,scope_kind,work_id),
  FOREIGN KEY (scope_id,scope_kind,work_id)
    REFERENCES engineering_work(scope_id,scope_kind,id) ON DELETE RESTRICT
);
