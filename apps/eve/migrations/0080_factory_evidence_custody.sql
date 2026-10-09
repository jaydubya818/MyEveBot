-- Factory EvidenceProvider bytes survive producer workspace cleanup. No execution authority.
CREATE TABLE engineering_factory_evidence (
 scope_id text NOT NULL, scope_kind text NOT NULL CHECK(scope_kind IN ('personal','organization')),
 work_id uuid NOT NULL, receipt_id uuid NOT NULL REFERENCES engineering_factory_receipts(id),
 candidate_sha text NOT NULL, reference text NOT NULL CHECK(reference ~ '^factory-evidence:sha256:[a-f0-9]{64}$'),
 binding jsonb NOT NULL, metadata jsonb NOT NULL, bytes bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope_id,scope_kind,work_id,candidate_sha,reference),
 CHECK(metadata->>'kind' IN ('TestEvidence','DiffEvidence')),
 CHECK(octet_length(bytes)>0 AND octet_length(bytes)<=4194304),
 CHECK(octet_length(bytes)=(metadata->>'size')::integer)
);
-- statement-breakpoint
CREATE FUNCTION engineering_factory_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Factory evidence custody is immutable'; END $$;
-- statement-breakpoint
CREATE TRIGGER engineering_factory_evidence_immutable BEFORE UPDATE OR DELETE ON engineering_factory_evidence
 FOR EACH ROW EXECUTE FUNCTION engineering_factory_evidence_immutable();
-- statement-breakpoint
CREATE UNIQUE INDEX engineering_factory_evidence_kind ON engineering_factory_evidence(scope_id,scope_kind,work_id,candidate_sha,(metadata->>'kind'));
