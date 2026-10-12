-- Inert owner enrollment and approval evidence. No policies, credentials or spending grants are installed.
CREATE TABLE missioncontrol_owner_enrollments (
 owner_id text PRIMARY KEY, installation_id text NOT NULL UNIQUE, revision integer NOT NULL CHECK(revision>0),
 document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,installation_id),
 CHECK(document->>'schema' IS NOT DISTINCT FROM 'mc-owner-enrollment/v1'),
 CHECK(document->>'ownerId' IS NOT DISTINCT FROM owner_id),
 CHECK(document->>'installationId' IS NOT DISTINCT FROM installation_id),
 CHECK((document->>'revision')::integer IS NOT DISTINCT FROM revision)
);
CREATE UNIQUE INDEX missioncontrol_subject_binding ON missioncontrol_owner_enrollments((document->>'clerkIssuer'),(document->>'ownerSubject'));
CREATE TABLE missioncontrol_work_bindings (
 owner_id text NOT NULL, installation_id text NOT NULL, work_id uuid NOT NULL, work_version integer NOT NULL CHECK(work_version>0),
 work_generation integer NOT NULL CHECK(work_generation>0), connection_id text NOT NULL, mission_id text NOT NULL,
 work_order_id text NOT NULL, work_order_revision_id text NOT NULL, binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 binding jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), scope_kind text NOT NULL DEFAULT 'personal' CHECK(scope_kind='personal'),
 PRIMARY KEY(owner_id,work_id,work_version,work_generation), UNIQUE(owner_id,connection_id,work_order_id,work_order_revision_id),
 FOREIGN KEY(owner_id,installation_id) REFERENCES missioncontrol_owner_enrollments(owner_id,installation_id),
 FOREIGN KEY(owner_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
CREATE TABLE missioncontrol_execution_permits (
 owner_id text NOT NULL, permit_id text NOT NULL, work_id uuid NOT NULL, work_version integer NOT NULL, work_generation integer NOT NULL,
 permit_sha256 text NOT NULL CHECK(permit_sha256 ~ '^[a-f0-9]{64}$'), envelope jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(owner_id,permit_id),
 FOREIGN KEY(owner_id,work_id,work_version,work_generation) REFERENCES missioncontrol_work_bindings(owner_id,work_id,work_version,work_generation)
);
CREATE TABLE missioncontrol_admission_receipts (
 owner_id text NOT NULL, command_id text NOT NULL, permit_id text NOT NULL, envelope jsonb NOT NULL,
 receipt_sha256 text NOT NULL CHECK(receipt_sha256 ~ '^[a-f0-9]{64}$'), issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 capability_agent text NOT NULL, capability_backend text NOT NULL,
 capability_snapshot_sha256 text NOT NULL CHECK(capability_snapshot_sha256 ~ '^[a-f0-9]{64}$'), capability_expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(owner_id,command_id),
 FOREIGN KEY(owner_id,permit_id) REFERENCES missioncontrol_execution_permits(owner_id,permit_id),
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '10 seconds')
);
CREATE INDEX missioncontrol_admission_current ON missioncontrol_admission_receipts(owner_id,permit_id,expires_at DESC);
CREATE TABLE missioncontrol_permit_controls (
 owner_id text NOT NULL,permit_id text NOT NULL,sequence integer NOT NULL CHECK(sequence>0),
 operation text NOT NULL CHECK(operation IN('revoke','disable_new')),control_digest text NOT NULL CHECK(control_digest ~ '^[a-f0-9]{64}$'),
 envelope jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_id,permit_id,sequence),
 FOREIGN KEY(owner_id,permit_id) REFERENCES missioncontrol_execution_permits(owner_id,permit_id)
);
CREATE TABLE missioncontrol_factory_readbacks (
 owner_id text NOT NULL,authority_id uuid NOT NULL REFERENCES external_alpha_work_authority(id),
 readback_sha256 text NOT NULL CHECK(readback_sha256 ~ '^[a-f0-9]{64}$'),
 readback jsonb NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,authority_id,readback_sha256)
);
-- statement-breakpoint
CREATE FUNCTION missioncontrol_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='missioncontrol_owner_enrollments' AND TG_OP='UPDATE' THEN
  IF NEW.owner_id=OLD.owner_id AND NEW.installation_id=OLD.installation_id AND NEW.revision=OLD.revision+1
   AND NEW.document->>'ownerSubject' IS NOT DISTINCT FROM OLD.document->>'ownerSubject'
   AND NEW.document->>'clerkIssuer' IS NOT DISTINCT FROM OLD.document->>'clerkIssuer'
   AND NEW.document->>'missionControlOwnerId' IS NOT DISTINCT FROM OLD.document->>'missionControlOwnerId'
  THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'MISSIONCONTROL_BINDING_IMMUTABLE';
END $$;
-- statement-breakpoint
CREATE TRIGGER missioncontrol_enrollment_guard BEFORE UPDATE OR DELETE ON missioncontrol_owner_enrollments FOR EACH ROW EXECUTE FUNCTION missioncontrol_binding_guard();
CREATE TRIGGER missioncontrol_work_guard BEFORE UPDATE OR DELETE ON missioncontrol_work_bindings FOR EACH ROW EXECUTE FUNCTION missioncontrol_binding_guard();
CREATE TRIGGER missioncontrol_permit_guard BEFORE UPDATE OR DELETE ON missioncontrol_execution_permits FOR EACH ROW EXECUTE FUNCTION missioncontrol_binding_guard();
CREATE TRIGGER missioncontrol_receipt_guard BEFORE UPDATE OR DELETE ON missioncontrol_admission_receipts FOR EACH ROW EXECUTE FUNCTION missioncontrol_binding_guard();
CREATE TRIGGER missioncontrol_control_guard BEFORE UPDATE OR DELETE ON missioncontrol_permit_controls FOR EACH ROW EXECUTE FUNCTION missioncontrol_binding_guard();
CREATE TRIGGER missioncontrol_readback_guard BEFORE UPDATE OR DELETE ON missioncontrol_factory_readbacks FOR EACH ROW EXECUTE FUNCTION missioncontrol_binding_guard();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['missioncontrol_owner_enrollments','missioncontrol_work_bindings','missioncontrol_execution_permits','missioncontrol_admission_receipts','missioncontrol_permit_controls','missioncontrol_factory_readbacks'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY missioncontrol_owner ON %I USING(owner_id=current_setting(''myeve.missioncontrol_owner'',true)) WITH CHECK(owner_id=current_setting(''myeve.missioncontrol_owner'',true))',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
-- statement-breakpoint
CREATE FUNCTION missioncontrol_enrollment_document(p_owner text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE document jsonb;
BEGIN
 IF p_owner IS DISTINCT FROM current_setting('myeve.missioncontrol_owner',true) THEN RAISE EXCEPTION 'MISSIONCONTROL_BINDING_DENIED'; END IF;
 SELECT e.document INTO document FROM missioncontrol_owner_enrollments e WHERE owner_id=p_owner FOR SHARE;
 RETURN document;
END $$;
REVOKE ALL ON FUNCTION missioncontrol_enrollment_document(text) FROM PUBLIC;
-- statement-breakpoint
-- Digest of canonical policy inputs after the TypeScript resolver has authorized
-- this admission. This is a freshness fence, never a second policy resolver.
CREATE FUNCTION missioncontrol_capability_snapshot(p_owner text,p_installation text,p_agent text,p_backend text)
 RETURNS TABLE(snapshot_sha256 text,expires_at timestamptz,backend_incarnation text,backend_enrollment_version integer,policy_id text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r record;
BEGIN
 PERFORM set_config('myeve.capability_owner',p_owner,true),set_config('myeve.capability_installation',p_installation,true);
 PERFORM capability_control.lock_admission_policy(p_installation,p_owner,p_agent);
 SELECT jsonb_build_object('installation',to_jsonb(i),'owner',to_jsonb(s),'binding',to_jsonb(b),
   'evidence',to_jsonb(e),'agent',to_jsonb(a),'destination',to_jsonb(d),'policy',to_jsonb(c)) AS material,
   LEAST(e.expires_at,a.expires_at,CASE WHEN b.status='ACTIVE' THEN b.expires_at ELSE e.expires_at END) AS expires
 INTO r FROM capability_control.installations i
 JOIN capability_control.owner_state s ON s.installation_id=i.id AND s.owner_id=p_owner
 LEFT JOIN capability_control.platform_owner_bindings b ON b.installation_id=i.id AND b.owner_id=p_owner
 JOIN capability_control.evidence e ON e.installation_id=i.id AND e.owner_id=p_owner
 JOIN capability_control.relay_agent_evidence a ON a.installation_id=i.id AND a.owner_id=p_owner AND a.agent_id=p_agent
 JOIN capability_control.policy_destinations d ON d.installation_id=i.id AND d.owner_id=p_owner AND d.backend_id=p_backend
 JOIN capability_control.policy_changes c ON c.installation_id=i.id AND c.owner_id=p_owner AND c.revision=s.revision
 WHERE i.id=p_installation AND i.active AND c.status='ACKNOWLEDGED' AND a.status='ACTIVE'
 FOR SHARE OF d,c;
 IF NOT FOUND OR r.expires<=clock_timestamp() THEN RAISE EXCEPTION 'MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED'; END IF;
 RETURN QUERY SELECT encode(sha256(convert_to(r.material::text,'UTF8')),'hex'),r.expires,
   r.material#>>'{destination,incarnation}',(r.material#>>'{destination,enrollment_version}')::integer,r.material#>>'{policy,policy_id}';
END $$;
REVOKE ALL ON FUNCTION missioncontrol_capability_snapshot(text,text,text,text) FROM PUBLIC;
-- statement-breakpoint
CREATE FUNCTION missioncontrol_assert_dispatch(p_owner text,p_work uuid,p_version integer,p_generation integer,p_required boolean DEFAULT false,p_factory_version text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e missioncontrol_owner_enrollments%ROWTYPE; n bigint; receipt record; current_policy record;
BEGIN
 PERFORM set_config('myeve.missioncontrol_owner',p_owner,true);
 SELECT * INTO e FROM missioncontrol_owner_enrollments WHERE owner_id=p_owner FOR SHARE;
 IF NOT FOUND THEN
  IF p_required THEN RAISE EXCEPTION 'MISSIONCONTROL_ENROLLMENT_REQUIRED'; END IF;
  RETURN;
 END IF;
 n=floor(extract(epoch FROM clock_timestamp())*1000);
 IF NOT (e.document ?& ARRAY['revokedAt','activeFrom','expiresAt','permitKeys'])
  OR e.document->>'activeFrom' IS NULL OR e.document->>'expiresAt' IS NULL
  OR jsonb_typeof(e.document->'permitKeys') IS DISTINCT FROM 'array'
  OR e.document->>'revokedAt' IS NOT NULL OR (e.document->>'activeFrom')::bigint>n OR (e.document->>'expiresAt')::bigint<=n THEN
  RAISE EXCEPTION 'MISSIONCONTROL_ENROLLMENT_INACTIVE';
 END IF;
 IF p_factory_version IS NOT NULL AND p_factory_version IS DISTINCT FROM e.document->>'factoryVersion' THEN
  RAISE EXCEPTION 'MISSIONCONTROL_FACTORY_VERSION_MISMATCH';
 END IF;
 IF EXISTS(SELECT 1 FROM missioncontrol_permit_controls c JOIN missioncontrol_execution_permits p USING(owner_id,permit_id)
   WHERE p.owner_id=p_owner AND p.work_id=p_work AND p.work_version=p_version AND p.work_generation=p_generation) THEN
  RAISE EXCEPTION 'MISSIONCONTROL_WORK_FENCED';
 END IF;
 SELECT r.* INTO receipt FROM missioncontrol_work_bindings b
  JOIN missioncontrol_execution_permits p USING(owner_id,work_id,work_version,work_generation)
  JOIN missioncontrol_admission_receipts r ON r.owner_id=p.owner_id AND r.permit_id=p.permit_id
  WHERE b.owner_id=p_owner AND b.installation_id=e.installation_id AND b.work_id=p_work AND b.work_version=p_version AND b.work_generation=p_generation
   AND (p.envelope#>>'{document,enrollmentRevision}')::integer=e.revision
   AND p.envelope#>>'{document,admission,factoryVersion}'=e.document->>'factoryVersion'
   AND p.envelope#>>'{document,admission,executionContractSha256}'=e.document->>'executionContractSha256'
   AND p.envelope#>>'{document,admission,capabilityPolicySha256}'=e.document->>'capabilityPolicySha256'
   AND (p.envelope#>>'{document,expiresAt}')::bigint>n
   AND r.issued_at<=clock_timestamp() AND r.expires_at>clock_timestamp()
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.document->'permitKeys') k
    WHERE k->>'keyId'=p.envelope->>'keyId' AND k->>'revokedAt' IS NULL
     AND (k->>'activeFrom')::bigint<=n AND (k->>'notAfter')::bigint>n)
 ORDER BY r.expires_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'MISSIONCONTROL_CURRENT_ADMISSION_REQUIRED'; END IF;
 SELECT * INTO current_policy FROM missioncontrol_capability_snapshot(p_owner,e.installation_id,receipt.capability_agent,receipt.capability_backend);
 IF current_policy.snapshot_sha256 IS DISTINCT FROM receipt.capability_snapshot_sha256
  OR receipt.capability_expires_at<=clock_timestamp() OR receipt.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED';
 END IF;
END $$;
REVOKE ALL ON FUNCTION missioncontrol_assert_dispatch(text,uuid,integer,integer,boolean,text) FROM PUBLIC;
-- statement-breakpoint
CREATE FUNCTION missioncontrol_work_authority_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' OR (NEW.state='DISPATCHING' AND OLD.state='ISSUED') THEN
  PERFORM missioncontrol_assert_dispatch(NEW.owner_id,NEW.work_id,NEW.work_version,NEW.work_generation,false,NEW.document->>'factoryVersion');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER missioncontrol_work_admission BEFORE INSERT OR UPDATE ON external_alpha_work_authority FOR EACH ROW EXECUTE FUNCTION missioncontrol_work_authority_guard();
