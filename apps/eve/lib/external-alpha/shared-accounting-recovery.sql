-- Standalone shared-accounting upgrade; apply only with separately authorized installation.
-- No reservations are refunded or UNKNOWN/legacy exposure reclassified.
ALTER TABLE external_alpha_cohort_dispatch DROP CONSTRAINT external_alpha_cohort_dispatch_state_check;
ALTER TABLE external_alpha_cohort_dispatch ADD CONSTRAINT external_alpha_cohort_dispatch_state_check CHECK(state IN('DISPATCHED','RUNNING','FENCED','SETTLED','UNKNOWN','NOT_DISPATCHED'));
CREATE OR REPLACE FUNCTION external_alpha_cohort_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External alpha accounting history is immutable'; END IF;
 IF TG_TABLE_NAME='external_alpha_cohort_dispatch' THEN
  IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')
   OR (NEW.state IS DISTINCT FROM OLD.state AND NOT((OLD.state='DISPATCHED' AND NEW.state IN('RUNNING','FENCED','SETTLED','UNKNOWN','NOT_DISPATCHED')) OR (OLD.state='RUNNING' AND NEW.state IN('FENCED','SETTLED','UNKNOWN')) OR (OLD.state='FENCED' AND NEW.state IN('SETTLED','UNKNOWN'))))
  THEN RAISE EXCEPTION 'External alpha accounting dispatch is immutable'; END IF;
 ELSIF TG_TABLE_NAME='external_alpha_cohort_admission' THEN
  IF (to_jsonb(NEW)-ARRAY['state','local_allowance_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','local_allowance_id'])
   OR (OLD.local_allowance_id IS NOT NULL AND NEW.local_allowance_id IS DISTINCT FROM OLD.local_allowance_id)
   OR (NEW.state IS DISTINCT FROM OLD.state AND NOT((OLD.state,NEW.state) IN (VALUES ('RESERVED','BOUND'),('RESERVED','UNKNOWN'),('BOUND','UNKNOWN'))))
  THEN RAISE EXCEPTION 'External alpha accounting history is immutable'; END IF;
 ELSIF TG_TABLE_NAME='external_alpha_cohort_member' THEN RAISE EXCEPTION 'External alpha accounting membership is immutable';
 ELSE
  IF NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR OLD.revoked_at IS NOT NULL
   OR (OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at)
   OR (NEW.activated_at IS DISTINCT FROM OLD.activated_at AND (NEW.activated_at IS NULL OR abs(extract(epoch FROM NEW.activated_at-clock_timestamp()))>5))
  THEN RAISE EXCEPTION 'External alpha accounting activation is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION external_alpha_cohort_call(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c external_alpha_cohort%ROWTYPE; m external_alpha_cohort_member%ROWTYPE; prior external_alpha_cohort_admission%ROWTYPE;
 n timestamptz; day integer; amount bigint; owner_day bigint; owner_total bigint; global_day bigint; global_total bigint; kinds integer; mode text;
BEGIN
 SELECT * INTO m FROM external_alpha_cohort_member
 WHERE owner_id=(p->>'ownerId')::uuid AND cohort_id=(p->>'cohortId')::uuid AND slot=p->>'slot'
  AND policy_sha256=p->>'policySha256'
  AND credential_sha256=encode(sha256(convert_to(p->>'credential','UTF8')),'hex');
 IF NOT FOUND THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
 SELECT * INTO STRICT c FROM external_alpha_cohort WHERE id=m.cohort_id FOR UPDATE;
 mode=p->>'mode'; n=clock_timestamp();
 -- RUNNING is an authenticated known Work observation, never an allocation
 -- retry. Initial dispatch, cancellation, expired observation and UNKNOWN fence.
 IF mode IN('running_work','hold_work') THEN
  SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid;
  IF NOT FOUND OR prior.kind<>'WORK' OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid
   OR p->>'operationSha256' IS NULL OR p->>'operationSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  IF mode='running_work' THEN
   IF prior.state<>'BOUND' OR prior.deadline<=n OR c.activated_at IS NULL OR c.revoked_at IS NOT NULL
    OR n>=c.activated_at+interval '120 hours' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
   UPDATE external_alpha_cohort_dispatch SET state='RUNNING' WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state='DISPATCHED';
   IF NOT EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state='RUNNING') THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
  ELSE
   UPDATE external_alpha_cohort_dispatch SET state='FENCED' WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state IN('DISPATCHED','RUNNING');
   IF NOT EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state IN('FENCED','SETTLED','UNKNOWN')) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF mode='fence' THEN
  UPDATE external_alpha_cohort_admission SET state='UNKNOWN' WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid RETURNING * INTO prior;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  UPDATE external_alpha_cohort_dispatch SET state='UNKNOWN' WHERE admission_id=prior.id AND state IN('DISPATCHED','RUNNING','FENCED');
  RETURN to_jsonb(prior);
 END IF;
 -- Proven local settlement can be recorded after revocation/deadline. Expiry
 -- itself never settles a dispatch and UNKNOWN is never changed back to known.
 -- An exact no-send tombstone also rejects a late shared lease request whose
 -- acknowledgment was lost. UNKNOWN and measured settlement remain immutable.
 IF mode='cancel_unsent' THEN
  SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid;
  IF NOT FOUND OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid
   OR p->>'operationSha256' IS NULL OR p->>'operationSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  INSERT INTO external_alpha_cohort_dispatch(admission_id,operation_sha256,state)
   VALUES(prior.id,p->>'operationSha256','NOT_DISPATCHED') ON CONFLICT DO NOTHING;
  UPDATE external_alpha_cohort_dispatch SET state='NOT_DISPATCHED' WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state='DISPATCHED';
  IF NOT EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state='NOT_DISPATCHED') THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF mode='settle' THEN
  SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid;
  IF NOT FOUND OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  UPDATE external_alpha_cohort_dispatch SET state='SETTLED' WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state IN('DISPATCHED','RUNNING','FENCED');
  IF NOT EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state='SETTLED')
   THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF c.activated_at IS NULL OR c.revoked_at IS NOT NULL OR n<c.activated_at OR n>=c.activated_at+interval '120 hours'
  OR EXISTS(SELECT 1 FROM external_alpha_cohort_admission WHERE cohort_id=c.id AND state='UNKNOWN')
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
 IF mode IN('bind','assert','dispatch') THEN
  SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR prior.policy_sha256<>m.policy_sha256 OR prior.deadline<=n THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  IF mode='bind' AND prior.state='RESERVED' THEN
   UPDATE external_alpha_cohort_admission SET state='BOUND',local_allowance_id=(p->>'allowanceId')::uuid WHERE id=prior.id RETURNING * INTO prior;
  END IF;
  IF prior.state<>'BOUND' OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  IF mode='dispatch' THEN
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state='NOT_DISPATCHED') THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_NOT_DISPATCHED'; END IF;
   IF p->>'operationSha256' IS NULL OR p->>'operationSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state IN('DISPATCHED','RUNNING','FENCED','SETTLED')) THEN RETURN to_jsonb(prior); END IF;
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.cohort_id=c.id AND (d.state IN('UNKNOWN','FENCED') OR (d.state='DISPATCHED' AND a.id<>prior.id) OR (d.state='RUNNING' AND a.deadline<=n))) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
   INSERT INTO external_alpha_cohort_dispatch(admission_id,operation_sha256,state) VALUES(prior.id,p->>'operationSha256','DISPATCHED');
  END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF mode IS DISTINCT FROM 'reserve' OR p->>'kind' IS NULL OR p->>'kind' NOT IN('CHAT','WORK')
  OR p->>'bindingSha256' IS NULL OR p->>'requestSha256' IS NULL THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
 SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND binding_sha256=p->>'bindingSha256';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.kind IS DISTINCT FROM p->>'kind' OR prior.policy_sha256<>m.policy_sha256
   THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_BINDING_CHANGED'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.cohort_id=c.id AND (d.state IN('UNKNOWN','DISPATCHED','FENCED') OR (d.state='RUNNING' AND a.deadline<=n))) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
 -- Only authenticated RUNNING Work can coexist with chat, while its full
 -- ceiling stays charged. Initial dispatch, held cancellation, expired Work
 -- observation and UNKNOWN fence the cohort; no reservation is refunded.
 day=floor(extract(epoch FROM n)/86400); amount=CASE WHEN p->>'kind'='CHAT' THEN 100000 ELSE 1300000 END;
 SELECT COALESCE(sum(ceiling_microusd) FILTER(WHERE owner_id=m.owner_id AND day_index=day),0),
  COALESCE(sum(ceiling_microusd) FILTER(WHERE owner_id=m.owner_id),0),
  COALESCE(sum(ceiling_microusd) FILTER(WHERE day_index=day),0),COALESCE(sum(ceiling_microusd),0),
  count(*) FILTER(WHERE owner_id=m.owner_id AND day_index=day AND kind=p->>'kind')
 INTO owner_day,owner_total,global_day,global_total,kinds FROM external_alpha_cohort_admission WHERE cohort_id=c.id;
 IF owner_day+amount>2300000 OR owner_total+amount>11500000 OR global_day+amount>4600000 OR global_total+amount>23000000
  OR kinds>=(CASE WHEN p->>'kind'='CHAT' THEN 10 ELSE 1 END) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_EXHAUSTED'; END IF;
 INSERT INTO external_alpha_cohort_admission(id,cohort_id,owner_id,policy_sha256,kind,binding_sha256,request_sha256,day_index,ceiling_microusd,deadline)
 VALUES((p->>'id')::uuid,c.id,m.owner_id,m.policy_sha256,p->>'kind',p->>'bindingSha256',p->>'requestSha256',day,amount,
  LEAST(n+(CASE WHEN p->>'kind'='CHAT' THEN interval '180 seconds' ELSE interval '300 seconds' END),c.activated_at+interval '120 hours')) RETURNING * INTO prior;
 RETURN to_jsonb(prior);
END $$;
