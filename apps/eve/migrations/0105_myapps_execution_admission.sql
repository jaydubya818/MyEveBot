-- Immutable custody on the existing operation receipt; historical receipts stay unqualified.
ALTER TABLE myapps_receipts ADD COLUMN execution_admission jsonb;
CREATE UNIQUE INDEX myapps_execution_operation_identity ON myapps_receipts
 (owner_id,(execution_admission->>'operationId')) WHERE execution_admission IS NOT NULL;
CREATE FUNCTION myapps_execution_admission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.execution_admission IS NOT NULL THEN RAISE EXCEPTION 'MYAPPS_EXECUTION_ADMISSION_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.execution_admission IS DISTINCT FROM OLD.execution_admission OR
    (OLD.execution_admission IS NOT NULL AND
     (NEW.owner_id,NEW.app_id,NEW.id,NEW.request_hash) IS DISTINCT FROM
     (OLD.owner_id,OLD.app_id,OLD.id,OLD.request_hash))
  THEN RAISE EXCEPTION 'MYAPPS_EXECUTION_ADMISSION_IMMUTABLE'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.execution_admission IS NOT NULL AND (
   jsonb_typeof(NEW.execution_admission) IS DISTINCT FROM 'object' OR
   NEW.execution_admission->>'schema' IS DISTINCT FROM 'myapps.execution-admission/v1' OR
   NEW.execution_admission->>'ownerId' IS DISTINCT FROM NEW.owner_id OR
   NEW.execution_admission->>'appId' IS DISTINCT FROM NEW.app_id OR
   NEW.execution_admission->>'receiptId' IS DISTINCT FROM NEW.id OR
   NEW.execution_admission->>'requestHash' IS DISTINCT FROM NEW.request_hash OR
   NEW.execution_admission->>'operationId' IS NULL OR
   NEW.execution_admission->>'operationId' IS DISTINCT FROM NEW.response->>'operationId' OR
   NEW.response->>'status' IS DISTINCT FROM 'RUNNING')
 THEN RAISE EXCEPTION 'MYAPPS_EXECUTION_ADMISSION_BINDING'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER myapps_execution_admission_guard BEFORE INSERT OR UPDATE OR DELETE ON myapps_receipts
 FOR EACH ROW EXECUTE FUNCTION myapps_execution_admission_guard();
