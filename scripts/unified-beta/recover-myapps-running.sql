\set ON_ERROR_STOP on
-- Operator-only recovery after exact host/container/staging quiescence and authorization.
-- Never install this script or its database credential in the application.
BEGIN;
SELECT set_config('myeve.myapps_owner', :'owner', true),
 set_config('myeve.recovery_app', :'app', true),
 set_config('myeve.recovery_receipt', :'receipt', true),
 set_config('myeve.recovery_operation', :'operation', true),
 set_config('myeve.recovery_request_hash', :'request_hash', true),
 set_config('myeve.recovery_evidence_sha256', :'evidence_sha256', true),
 set_config('myeve.recovery_authorization', :'authorization', true),
 set_config('lock_timeout','5s',true),set_config('statement_timeout','15s',true);
SELECT pg_advisory_xact_lock(hashtextextended(current_setting('myeve.myapps_owner'),821));
CREATE TEMP TABLE myapps_recovery_selected ON COMMIT DROP AS
 SELECT r.*,i.state AS installation_before FROM myapps_receipts r
 JOIN myapps_installations i USING(owner_id,app_id)
 WHERE r.owner_id=current_setting('myeve.myapps_owner') AND r.app_id=current_setting('myeve.recovery_app')
  AND r.id=current_setting('myeve.recovery_receipt') FOR UPDATE OF r,i;
DO $$
BEGIN
 IF (SELECT count(*) FROM myapps_recovery_selected)<>1 THEN RAISE EXCEPTION 'MYAPPS_RECOVERY_EXACT_RECORD_REQUIRED'; END IF;
 IF current_setting('myeve.recovery_operation') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR current_setting('myeve.recovery_evidence_sha256') !~ '^[a-f0-9]{64}$'
  OR length(current_setting('myeve.recovery_authorization')) NOT BETWEEN 1 AND 500
  OR EXISTS(SELECT 1 FROM myapps_recovery_selected WHERE response->>'status' IS DISTINCT FROM 'RUNNING'
   OR response->>'operationId' IS DISTINCT FROM current_setting('myeve.recovery_operation')
   OR request_hash IS DISTINCT FROM current_setting('myeve.recovery_request_hash')
   OR installation_before->>'profile' IS DISTINCT FROM 'alpha-tasks-node-json-v1'
   OR installation_before->>'ownerId' IS DISTINCT FROM owner_id
   OR installation_before->>'appId' IS DISTINCT FROM app_id)
 THEN RAISE EXCEPTION 'MYAPPS_RECOVERY_BINDING_DENIED'; END IF;
END $$;
INSERT INTO myapps_audit(owner_id,app_id,action,actor,evidence)
 SELECT owner_id,app_id,'alpha-tasks.operator-recovery',current_user,
  jsonb_build_object('receiptId',id,'operationId',response->>'operationId','requestHash',request_hash,
   'previousResponse',response,'cleanup','CONFIRMED','outcome','DENIED',
   'evidenceSha256',current_setting('myeve.recovery_evidence_sha256'),
   'authorization',current_setting('myeve.recovery_authorization'),
   'installationSha256',encode(sha256(convert_to(installation_before::text,'UTF8')),'hex'))
 FROM myapps_recovery_selected;
UPDATE myapps_receipts r SET response=jsonb_build_object('status','DENIED','operationId',s.response->>'operationId',
 'cleanup','CONFIRMED','reason','OPERATOR_CONFIRMED_NO_COMMIT','recoveryEvidenceSha256',current_setting('myeve.recovery_evidence_sha256'))
 FROM myapps_recovery_selected s WHERE r.owner_id=s.owner_id AND r.app_id=s.app_id AND r.id=s.id;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM myapps_recovery_selected s JOIN myapps_installations i USING(owner_id,app_id)
  WHERE i.state IS DISTINCT FROM s.installation_before) THEN RAISE EXCEPTION 'MYAPPS_RECOVERY_DATA_CHANGED'; END IF;
END $$;
COMMIT;
