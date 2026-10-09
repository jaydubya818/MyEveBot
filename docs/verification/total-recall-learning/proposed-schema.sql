-- NOT AN APPLIED MIGRATION. The active integration owner controls the shared
-- migration sequence/registry. Qualification uses this only in a disposable DB.
-- Reuses Work identity and stores one bounded version history per exact scope.
CREATE TABLE recall_learning (
  owner_id text NOT NULL,
  id text NOT NULL,
  repository text NOT NULL,
  work_type text NOT NULL,
  work_id uuid,
  revision integer NOT NULL CHECK (revision > 0),
  document jsonb NOT NULL CHECK (jsonb_typeof(document)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,id),
  CHECK (document->>'id'=id),
  CHECK ((document->>'revision')::integer=revision),
  CHECK (document->'scope'->>'ownerId'=owner_id),
  CHECK (document->'scope'->>'repository'=repository),
  CHECK (document->'scope'->>'workType'=work_type),
  CHECK ((document->'scope'->>'workId') IS NOT DISTINCT FROM work_id::text)
);
CREATE INDEX recall_learning_scope ON recall_learning(owner_id,repository,work_type);
CREATE TABLE recall_learning_uses (
  owner_id text NOT NULL,
  work_id uuid NOT NULL,
  family_id text NOT NULL,
  version integer NOT NULL,
  candidate_hash text NOT NULL,
  context_ref text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,work_id,family_id,version,context_ref),
  FOREIGN KEY(owner_id,family_id) REFERENCES recall_learning(owner_id,id)
);
