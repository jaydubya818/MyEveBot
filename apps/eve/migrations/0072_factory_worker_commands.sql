-- Request transport only; no writer, admission, dispatch or publication authority.
CREATE TABLE engineering_factory_commands (
 id uuid PRIMARY KEY,
 scope_id text NOT NULL,
 scope_kind text NOT NULL CHECK(scope_kind='personal'),
 work_id uuid NOT NULL,
 work_version integer NOT NULL CHECK(work_version>0),
 work_generation integer NOT NULL CHECK(work_generation>0),
 operation text NOT NULL CHECK(operation IN ('start','reconcile','stop','takeover')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','blocked','stale')),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id),
 UNIQUE(scope_id,scope_kind,work_id,work_version,work_generation,operation)
);
-- statement-breakpoint
CREATE INDEX engineering_factory_commands_pending ON engineering_factory_commands(scope_id,created_at) WHERE status IN ('pending','running');
