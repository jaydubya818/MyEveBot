-- Preserve 0094/0100 historical checksums. Assertions must use an already established
-- owner context; they cannot silently switch a caller from one owner to another.
-- The application sets context explicitly in its authenticated owner transaction.
CREATE OR REPLACE FUNCTION missioncontrol_assert_dispatch(p_owner text,p_work uuid,p_version integer,p_generation integer,p_required boolean DEFAULT false,p_factory_version text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e missioncontrol_owner_enrollments%ROWTYPE; n bigint; receipt record; current_policy record;
BEGIN
 IF p_owner IS DISTINCT FROM current_setting('myeve.missioncontrol_owner',true) THEN
  RAISE EXCEPTION 'MISSIONCONTROL_OWNER_CONTEXT_REQUIRED';
 END IF;
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
CREATE OR REPLACE FUNCTION missioncontrol_assert_alpha_admission(p_owner text,p_work uuid,p_version integer,p_generation integer,
 p_factory text,p_permit text,p_command text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE receipt missioncontrol_admission_receipts%ROWTYPE; snapshot record; n bigint;
BEGIN
 IF p_owner IS DISTINCT FROM current_setting('myeve.missioncontrol_owner',true) THEN
  RAISE EXCEPTION 'MISSIONCONTROL_OWNER_CONTEXT_REQUIRED';
 END IF;
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
