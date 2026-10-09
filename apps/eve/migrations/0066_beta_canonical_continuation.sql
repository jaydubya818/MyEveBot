-- Trusted composition state only. Neither Goal nor Inbox runtime roles receive access.
CREATE TABLE beta_work_admission_attempts (
 owner_id text NOT NULL, work_id uuid NOT NULL REFERENCES engineering_work(id),
 work_version integer NOT NULL, work_generation integer NOT NULL,
 status text NOT NULL CHECK(status IN ('ADMITTED','DENIED')), reason text NOT NULL,
 receipt jsonb, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,work_id,work_version,work_generation)
);
CREATE TABLE beta_work_decisions (
 owner_id text NOT NULL, work_id uuid NOT NULL REFERENCES engineering_work(id), action_id text NOT NULL,
 work_version integer NOT NULL, work_generation integer NOT NULL, event jsonb NOT NULL,
 PRIMARY KEY(owner_id,action_id)
);
CREATE TABLE beta_work_continuations (
 owner_id text NOT NULL, response_id text NOT NULL, work_id uuid NOT NULL REFERENCES engineering_work(id),
 work_version integer NOT NULL, work_generation integer NOT NULL, action_id text NOT NULL,
 response_hash text NOT NULL, status text NOT NULL CHECK(status IN ('ELIGIBLE','STALE')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,response_id),
 FOREIGN KEY(owner_id,action_id) REFERENCES beta_work_decisions(owner_id,action_id)
);
REVOKE ALL ON beta_work_admission_attempts,beta_work_decisions,beta_work_continuations FROM PUBLIC;
-- statement-breakpoint
CREATE TABLE beta_source_receipts (
 owner_id text NOT NULL, event_key text NOT NULL, event jsonb NOT NULL, binding jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,event_key)
);
REVOKE ALL ON beta_source_receipts FROM PUBLIC;
