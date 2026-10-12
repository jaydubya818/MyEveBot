-- Retain the exact approval used by canonical External Alpha admission and claim.
-- Existing history is deliberately not inferred or backfilled. No grants or activation.
CREATE TABLE missioncontrol_alpha_admission_bindings (
 owner_id text NOT NULL, authority_id uuid NOT NULL REFERENCES external_alpha_work_authority(id),
 stage text NOT NULL CHECK(stage IN('ISSUE','DISPATCH')), permit_id text NOT NULL, command_id text NOT NULL,
 receipt_sha256 text NOT NULL CHECK(receipt_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,authority_id,stage),
 FOREIGN KEY(owner_id,permit_id) REFERENCES missioncontrol_execution_permits(owner_id,permit_id),
 FOREIGN KEY(owner_id,command_id) REFERENCES missioncontrol_admission_receipts(owner_id,command_id)
);
ALTER TABLE missioncontrol_alpha_admission_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE missioncontrol_alpha_admission_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY missioncontrol_alpha_binding_owner ON missioncontrol_alpha_admission_bindings
 USING(owner_id=current_setting('myeve.missioncontrol_owner',true))
 WITH CHECK(owner_id=current_setting('myeve.missioncontrol_owner',true));
REVOKE ALL ON missioncontrol_alpha_admission_bindings FROM PUBLIC;
CREATE TRIGGER missioncontrol_alpha_binding_immutable BEFORE UPDATE OR DELETE ON missioncontrol_alpha_admission_bindings
 FOR EACH ROW EXECUTE FUNCTION missioncontrol_binding_guard();
-- statement-breakpoint
CREATE FUNCTION missioncontrol_assert_alpha_admission(p_owner text,p_work uuid,p_version integer,p_generation integer,
 p_factory text,p_permit text,p_command text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE receipt missioncontrol_admission_receipts%ROWTYPE; snapshot record; n bigint;
BEGIN
 PERFORM missioncontrol_assert_dispatch(p_owner,p_work,p_version,p_generation,false,p_factory);
 IF NOT EXISTS(SELECT 1 FROM missioncontrol_owner_enrollments WHERE owner_id=p_owner) THEN
  IF p_permit IS NOT NULL OR p_command IS NOT NULL THEN RAISE EXCEPTION 'MISSIONCONTROL_ENROLLMENT_REQUIRED'; END IF;
  RETURN NULL;
 END IF;
 n=floor(extract(epoch FROM clock_timestamp())*1000);
 SELECT r.* INTO receipt FROM missioncontrol_admission_receipts r
 JOIN missioncontrol_execution_permits p ON p.owner_id=r.owner_id AND p.permit_id=r.permit_id
 JOIN missioncontrol_owner_enrollments e ON e.owner_id=p.owner_id
 WHERE r.owner_id=p_owner AND r.command_id=p_command AND p.permit_id=p_permit
  AND p.work_id=p_work AND p.work_version=p_version AND p.work_generation=p_generation
  AND (p.envelope#>>'{document,enrollmentRevision}')::integer=e.revision
  AND p.envelope#>>'{document,admission,factoryVersion}'=p_factory
  AND p.envelope#>>'{document,admission,executionContractSha256}'=e.document->>'executionContractSha256'
  AND p.envelope#>>'{document,admission,capabilityPolicySha256}'=e.document->>'capabilityPolicySha256'
  AND (p.envelope#>>'{document,issuedAt}')::bigint<=n AND (p.envelope#>>'{document,expiresAt}')::bigint>n
  AND r.envelope#>>'{document,permitId}'=p.permit_id AND r.envelope#>>'{document,commandId}'=r.command_id
  AND r.envelope#>>'{document,permitSha256}'=p.permit_sha256
  AND r.issued_at<=clock_timestamp() AND r.expires_at>clock_timestamp()
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.document->'permitKeys') k
   WHERE k->>'keyId'=p.envelope->>'keyId' AND k->>'revokedAt' IS NULL
    AND (k->>'activeFrom')::bigint<=n AND (k->>'notAfter')::bigint>n);
 IF NOT FOUND THEN RAISE EXCEPTION 'MISSIONCONTROL_EXACT_ADMISSION_REQUIRED'; END IF;
 SELECT * INTO snapshot FROM missioncontrol_capability_snapshot(p_owner,
  (SELECT installation_id FROM missioncontrol_owner_enrollments WHERE owner_id=p_owner),receipt.capability_agent,receipt.capability_backend);
 IF snapshot.snapshot_sha256 IS DISTINCT FROM receipt.capability_snapshot_sha256
  OR receipt.capability_expires_at<=clock_timestamp() OR receipt.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED'; END IF;
 RETURN receipt.receipt_sha256;
END $$;
REVOKE ALL ON FUNCTION missioncontrol_assert_alpha_admission(text,uuid,integer,integer,text,text,text) FROM PUBLIC;
-- statement-breakpoint
CREATE FUNCTION missioncontrol_retain_alpha_admission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE permit text; command text; receipt_hash text; stage_name text;
BEGIN
 IF TG_OP='UPDATE' AND NOT(OLD.state='ISSUED' AND NEW.state='DISPATCHING') THEN RETURN NEW; END IF;
 permit=NULLIF(current_setting('myeve.alpha_permit_id',true),'');
 command=NULLIF(current_setting('myeve.alpha_admission_command',true),'');
 receipt_hash=missioncontrol_assert_alpha_admission(NEW.owner_id,NEW.work_id,NEW.work_version,NEW.work_generation,
  NEW.document->>'factoryVersion',permit,command);
 IF receipt_hash IS NULL THEN RETURN NEW; END IF;
 stage_name=CASE WHEN TG_OP='INSERT' THEN 'ISSUE' ELSE 'DISPATCH' END;
 IF stage_name='DISPATCH' AND NOT EXISTS(SELECT 1 FROM missioncontrol_alpha_admission_bindings b
  WHERE b.owner_id=NEW.owner_id AND b.authority_id=NEW.id AND b.stage='ISSUE' AND b.permit_id=permit)
 THEN RAISE EXCEPTION 'MISSIONCONTROL_ALPHA_PERMIT_CHANGED'; END IF;
 INSERT INTO missioncontrol_alpha_admission_bindings(owner_id,authority_id,stage,permit_id,command_id,receipt_sha256)
 VALUES(NEW.owner_id,NEW.id,stage_name,permit,command,receipt_hash);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION missioncontrol_retain_alpha_admission() FROM PUBLIC;
CREATE TRIGGER missioncontrol_alpha_admission_custody AFTER INSERT OR UPDATE ON external_alpha_work_authority
 FOR EACH ROW EXECUTE FUNCTION missioncontrol_retain_alpha_admission();
-- statement-breakpoint
-- Transaction-local parameters transport only identity, not authority. The receiving
-- trigger verifies the exact immutable receipt and policy under existing canonical locks.
CREATE FUNCTION external_alpha_missioncontrol_work_admit(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('myeve.alpha_permit_id',COALESCE(p#>>'{missionControl,permitId}',''),true),
  set_config('myeve.alpha_admission_command',COALESCE(p#>>'{missionControl,commandId}',''),true);
 result=external_alpha_work_admit(p);
 PERFORM set_config('myeve.alpha_permit_id','',true),set_config('myeve.alpha_admission_command','',true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION external_alpha_missioncontrol_work_admit(jsonb) FROM PUBLIC;
CREATE FUNCTION external_alpha_missioncontrol_work_claim(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('myeve.alpha_permit_id',COALESCE(p#>>'{missionControl,permitId}',''),true),
  set_config('myeve.alpha_admission_command',COALESCE(p#>>'{missionControl,commandId}',''),true);
 result=external_alpha_work_claim(p);
 PERFORM set_config('myeve.alpha_permit_id','',true),set_config('myeve.alpha_admission_command','',true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION external_alpha_missioncontrol_work_claim(jsonb) FROM PUBLIC;
