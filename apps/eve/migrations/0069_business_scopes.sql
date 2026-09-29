-- Two partners only. Existing owner partitions and immutable ledgers are unchanged.
CREATE TABLE business_partnership (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 owner_a text NOT NULL, owner_b text NOT NULL CHECK(owner_b<>owner_a),
 accepted_a boolean NOT NULL DEFAULT false, accepted_b boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
-- A deliberately narrow projection: no sessions, connections, credentials, private
-- provenance links, provider IDs, blob locations or unrelated nested records.
CREATE VIEW business_resource_projection AS
SELECT owner_id,'MEMORY'::text AS kind,id,
 jsonb_build_object('content',content,'status',status,'updatedAt',updated_at) AS document
 FROM memory_records WHERE status='active'
UNION ALL SELECT owner_id,'KNOWLEDGE',id,
 jsonb_build_object('title',title,'statement',statement,'kind',kind,'status',status,'updatedAt',updated_at)
 FROM knowledge_records WHERE kind<>'preference' AND status NOT IN ('deleted','superseded')
UNION ALL SELECT owner_id,'FILE',id,
 jsonb_build_object('filename',filename,'mediaType',media_type,'sizeBytes',size_bytes,'createdAt',created_at,'contentRevision',encode(sha256(convert_to(blob_url||'|'||blob_path,'UTF8')),'hex'))
 FROM chat_files WHERE owner_id IS NOT NULL
UNION ALL SELECT owner_id,'GOAL',id,
 jsonb_build_object('title',title,'description',description,'status',status,'criteria',success_criteria,'revision',revision,'generation',generation)
 FROM goals
UNION ALL SELECT scope_id,'WORK',id::text,
 jsonb_build_object('title',title,'objective',objective,'repository',repository,'lifecycle',lifecycle,'control',control,'version',version,'generation',generation)
 FROM engineering_work WHERE scope_kind='personal'
UNION ALL SELECT scope_id,'RESULT',id::text,
 jsonb_build_object('workId',work_id,'candidateSha',candidate_sha,'proof',proof,'contentHash',content_hash,'workVersion',work_version,'workGeneration',work_generation)
 FROM engineering_native_results WHERE scope_kind='personal';
-- statement-breakpoint
CREATE VIEW business_resource_revision AS
 SELECT *,encode(sha256(convert_to(document::text,'UTF8')),'hex') AS revision_hash FROM business_resource_projection;
-- statement-breakpoint
CREATE TABLE business_resource_grants (
 id uuid PRIMARY KEY, owner_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('MEMORY','KNOWLEDGE','FILE','GOAL','WORK','RESULT')),
 resource_id text NOT NULL, revision_hash text NOT NULL CHECK(revision_hash ~ '^[a-f0-9]{64}$'),
 scope text NOT NULL CHECK(scope IN ('BUSINESS_SHARED','WORK_SCOPED')),
 partnership_revision integer NOT NULL,
 work_owner text, work_id uuid, work_version integer, work_generation integer,
 expires_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((scope='BUSINESS_SHARED' AND work_owner IS NULL AND work_id IS NULL AND work_version IS NULL AND work_generation IS NULL AND expires_at IS NULL)
 OR (scope='WORK_SCOPED' AND kind IN ('MEMORY','KNOWLEDGE','FILE') AND work_owner IS NOT NULL AND work_id IS NOT NULL AND work_version>0 AND work_generation>0 AND expires_at IS NOT NULL)),
 work_scope_kind text GENERATED ALWAYS AS ('personal') STORED,
 FOREIGN KEY(work_owner,work_scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
CREATE INDEX business_grants_resource ON business_resource_grants(owner_id,kind,resource_id) WHERE revoked_at IS NULL;
-- statement-breakpoint
CREATE TABLE business_effect_decisions (
 id uuid PRIMARY KEY, work_owner text NOT NULL, work_id uuid NOT NULL,
 work_version integer NOT NULL, work_generation integer NOT NULL,
 partnership_revision integer NOT NULL,
 effect jsonb NOT NULL CHECK(jsonb_typeof(effect)='object'),
 effect_hash text NOT NULL CHECK(effect_hash ~ '^[a-f0-9]{64}$'),
 policy text NOT NULL CHECK(policy IN ('OWNER_A','OWNER_B','EITHER_OWNER','BOTH_OWNERS')),
 approved_a boolean NOT NULL DEFAULT false, approved_b boolean NOT NULL DEFAULT false,
 denied boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(work_owner,work_id,work_version,work_generation,effect_hash),
 work_scope_kind text GENERATED ALWAYS AS ('personal') STORED,
 FOREIGN KEY(work_owner,work_scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
REVOKE ALL ON business_partnership,business_resource_projection,business_resource_revision,business_resource_grants,business_effect_decisions FROM PUBLIC;
