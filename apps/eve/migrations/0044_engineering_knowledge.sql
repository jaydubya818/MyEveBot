-- A Knowledge record used as engineering memory belongs to exactly one
-- personal Work. The existing Knowledge tables retain the claim and its
-- source history; this link supplies the missing enforceable Work boundary.
CREATE TABLE engineering_work_knowledge (
  scope_id text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind = 'personal'),
  work_id uuid NOT NULL,
  knowledge_id text NOT NULL,
  source_id text NOT NULL,
  provenance_relation text NOT NULL CHECK (provenance_relation IN ('supports', 'confirmed_by')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id, scope_kind, work_id, knowledge_id),
  UNIQUE (scope_id, knowledge_id),
  FOREIGN KEY (scope_id, scope_kind, work_id)
    REFERENCES engineering_work (scope_id, scope_kind, id) ON DELETE RESTRICT,
  FOREIGN KEY (scope_id, knowledge_id)
    REFERENCES knowledge_records (owner_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scope_id, source_id)
    REFERENCES knowledge_sources (owner_id, id) ON DELETE RESTRICT
);

-- statement-breakpoint
CREATE INDEX engineering_work_knowledge_recent
  ON engineering_work_knowledge (scope_id, scope_kind, work_id, created_at DESC, knowledge_id);
