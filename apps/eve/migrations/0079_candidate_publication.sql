-- Decisions and external effects are separate from immutable Results/Proof.
CREATE TABLE engineering_owner_decisions (
 id uuid PRIMARY KEY, owner_id text NOT NULL, work_id uuid NOT NULL,
 result_id uuid NOT NULL REFERENCES engineering_native_results(id),
 binding jsonb NOT NULL, binding_hash text NOT NULL,
 action text NOT NULL CHECK(action IN ('open_pr','push_branch','keep_private','reject')),
 previous_id uuid REFERENCES engineering_owner_decisions(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 UNIQUE(owner_id,work_id,result_id,previous_id)
);
-- statement-breakpoint
CREATE TABLE engineering_candidate_publications (
 result_id uuid PRIMARY KEY REFERENCES engineering_native_results(id),
 owner_id text NOT NULL, decision_id uuid NOT NULL REFERENCES engineering_owner_decisions(id),
 state text NOT NULL CHECK(state IN ('APPROVED','PUBLISHING','BRANCH_PUBLISHED','PR_OPEN','UNKNOWN','DENIED')),
 push_attempted boolean NOT NULL DEFAULT false, pr_attempted boolean NOT NULL DEFAULT false,
 remote jsonb NOT NULL DEFAULT '{}'::jsonb, reason text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX engineering_owner_decision_work ON engineering_owner_decisions(owner_id,work_id,created_at DESC,id);
