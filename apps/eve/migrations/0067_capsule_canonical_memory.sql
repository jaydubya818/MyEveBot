-- Alpha portability approvals bind the exact current source representation.
CREATE TABLE capsule_memory_policy (
  owner_id text NOT NULL, memory_id text NOT NULL, item_digest text NOT NULL,
  destination_eve_id text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,memory_id,destination_eve_id),
  FOREIGN KEY(owner_id,memory_id) REFERENCES memory_records(owner_id,id) ON DELETE CASCADE
);
-- statement-breakpoint
-- Receipts retain imported provenance and staged material, never execution authority.
CREATE TABLE capsule_memory_receipts (
  owner_id text NOT NULL, eve_id text NOT NULL, id text NOT NULL,
  capsule_digest text NOT NULL, request_digest text NOT NULL,
  records jsonb NOT NULL, memory_ids jsonb NOT NULL, result text NOT NULL CHECK(result IN ('active','rolled_back')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,eve_id,id)
);
