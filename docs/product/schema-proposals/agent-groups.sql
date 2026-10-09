-- PROPOSAL ONLY. No migration allocated; never run against shared/staging/production DB.
-- Tests install this in an isolated schema in the task-owned disposable PostgreSQL.
-- Group membership/reference metadata is one bounded, versioned aggregate. Content,
-- Results, Work, capabilities and Relay transport remain in their canonical stores.
CREATE TABLE agent_groups (
 owner_id text NOT NULL,
 id text NOT NULL,
 version integer NOT NULL CHECK (version > 0),
 document jsonb NOT NULL CHECK (jsonb_typeof(document)='object' AND octet_length(document::text)<65536),
 PRIMARY KEY(owner_id,id),
 CHECK(document->>'ownerId'=owner_id AND document->>'id'=id AND (document->>'version')::int=version)
);
CREATE TABLE agent_group_audit (
 owner_id text NOT NULL,
 group_id text NOT NULL,
 version integer NOT NULL,
 event text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,group_id,version),
 FOREIGN KEY(owner_id,group_id) REFERENCES agent_groups(owner_id,id)
);
