-- Private declarative apps. Additive; never applied on import or to production by qualification.
CREATE TABLE myapps_installations (
 owner_id text NOT NULL, app_id text NOT NULL, creation_intent text NOT NULL,
 state jsonb NOT NULL, PRIMARY KEY(owner_id,app_id), UNIQUE(owner_id,creation_intent),
 CHECK(state->>'ownerId'=owner_id AND state->>'appId'=app_id)
);
CREATE TABLE myapps_candidates (
 owner_id text NOT NULL, app_id text NOT NULL, version integer NOT NULL CHECK(version>0),
 digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'), package jsonb NOT NULL,
 proof jsonb NOT NULL, revoked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(owner_id,app_id,version), FOREIGN KEY(owner_id,app_id) REFERENCES myapps_installations(owner_id,app_id),
 CHECK(package->>'appId'=app_id AND package#>>'{spec,ownerId}'=owner_id AND (package->>'version')::integer=version)
);
CREATE TABLE myapps_previews (
 owner_id text NOT NULL, app_id text NOT NULL, id text NOT NULL, binding jsonb NOT NULL,
 expires_at timestamptz NOT NULL, ended boolean NOT NULL DEFAULT false,
 PRIMARY KEY(owner_id,app_id,id), FOREIGN KEY(owner_id,app_id) REFERENCES myapps_installations(owner_id,app_id)
);
CREATE TABLE myapps_install_requests (
 owner_id text NOT NULL, app_id text NOT NULL, id text NOT NULL, binding jsonb NOT NULL,
 event jsonb NOT NULL, response_id text, outcome text CHECK(outcome IN ('INSTALLED','DENIED')),
 PRIMARY KEY(owner_id,app_id,id), FOREIGN KEY(owner_id,app_id) REFERENCES myapps_installations(owner_id,app_id)
);
CREATE TABLE myapps_receipts (
 owner_id text NOT NULL, app_id text NOT NULL, id text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY(owner_id,app_id,id), FOREIGN KEY(owner_id,app_id) REFERENCES myapps_installations(owner_id,app_id)
);
CREATE TABLE myapps_audit (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, owner_id text NOT NULL, app_id text NOT NULL,
 action text NOT NULL, actor text NOT NULL, evidence jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,app_id) REFERENCES myapps_installations(owner_id,app_id)
);
-- statement-breakpoint
CREATE FUNCTION myapps_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='myapps_candidates' AND TG_OP='UPDATE' THEN
 IF
   NEW.owner_id=OLD.owner_id AND NEW.app_id=OLD.app_id AND NEW.version=OLD.version AND
   NEW.digest=OLD.digest AND NEW.package=OLD.package AND NEW.proof=OLD.proof AND NEW.revoked THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'MyApps evidence is immutable';
END $$;
-- statement-breakpoint
CREATE TRIGGER myapps_candidate_immutable BEFORE UPDATE OR DELETE ON myapps_candidates FOR EACH ROW EXECUTE FUNCTION myapps_immutable();
CREATE TRIGGER myapps_audit_immutable BEFORE UPDATE OR DELETE ON myapps_audit FOR EACH ROW EXECUTE FUNCTION myapps_immutable();
-- statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['myapps_installations','myapps_candidates','myapps_previews','myapps_install_requests','myapps_receipts','myapps_audit'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY myapps_owner ON %I USING (owner_id=current_setting(''myeve.myapps_owner'',true)) WITH CHECK (owner_id=current_setting(''myeve.myapps_owner'',true))',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
-- Exact deterministic Factory admission, subordinate to canonical Work. Not a paid execution grant.
CREATE TABLE myapps_admissions (
 owner_id text NOT NULL, work_id uuid NOT NULL, app_id text NOT NULL, version integer NOT NULL,
 binding jsonb NOT NULL, package jsonb, creation_intent text, PRIMARY KEY(owner_id,work_id),
 CHECK(binding#>>'{work,ownerId}'=owner_id AND binding->>'appId'=app_id)
);
ALTER TABLE myapps_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE myapps_admissions FORCE ROW LEVEL SECURITY;
CREATE POLICY myapps_owner ON myapps_admissions USING(owner_id=current_setting('myeve.myapps_owner',true)) WITH CHECK(owner_id=current_setting('myeve.myapps_owner',true));
REVOKE ALL ON myapps_admissions FROM PUBLIC;
