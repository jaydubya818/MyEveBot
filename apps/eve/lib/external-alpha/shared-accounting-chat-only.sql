-- Forward-only CHAT ONLY narrowing of shared-accounting-zero-gap.sql.
-- Apply only to the separately approved two-tester accounting installation.
-- No enrollment, activation, refund, row rewrite or new role privilege.
-- CHAT: 10/owner/UTC day, $0.10/turn; owner $1/day and $5 lifetime;
-- cohort $2/day and $10 lifetime, within the original 120-hour expiry.
-- Lifetime bounds matter because 120 hours can intersect SIX UTC dates.
-- Existing authenticated settlement/fencing/no-send cleanup stays available.
-- This replaces the public entry point itself; no callable broad-scope alias.
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
 -- New Work observations cannot keep execution alive in this release.
 IF mode='running_work' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_CHAT_ONLY'; END IF;
 IF mode='hold_work' THEN
  SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid;
  IF NOT FOUND OR prior.kind<>'WORK' OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid
   OR p->>'operationSha256' IS NULL OR p->>'operationSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  UPDATE external_alpha_cohort_dispatch SET state='FENCED' WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state IN('DISPATCHED','RUNNING');
  IF NOT EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state IN('FENCED','SETTLED','UNKNOWN')) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
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
 IF current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_CHAT_ONLY_ISOLATION'; END IF;
 IF c.activated_at IS NULL OR c.revoked_at IS NOT NULL OR n<c.activated_at OR n>=c.activated_at+interval '120 hours'
  OR EXISTS(SELECT 1 FROM external_alpha_cohort_admission WHERE cohort_id=c.id AND state='UNKNOWN')
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
 IF mode='reserve' AND p->>'kind' IS DISTINCT FROM 'CHAT' THEN
  RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_CHAT_ONLY';
 END IF;
 IF mode IN('bind','assert','dispatch') THEN
  SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR prior.kind<>'CHAT' OR prior.policy_sha256<>m.policy_sha256 OR prior.deadline<=n THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  IF mode='bind' AND prior.state='RESERVED' THEN
   UPDATE external_alpha_cohort_admission SET state='BOUND',local_allowance_id=(p->>'allowanceId')::uuid WHERE id=prior.id RETURNING * INTO prior;
  END IF;
  IF prior.state<>'BOUND' OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  IF mode='dispatch' THEN
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state='NOT_DISPATCHED') THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_NOT_DISPATCHED'; END IF;
   IF p->>'operationSha256' IS NULL OR p->>'operationSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state IN('DISPATCHED','RUNNING','FENCED','SETTLED')) THEN RETURN to_jsonb(prior); END IF;
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.cohort_id=c.id AND (d.state IN('UNKNOWN','FENCED') OR (d.state IN('DISPATCHED','RUNNING') AND a.id<>prior.id))) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
   -- An admitted Work that has not dispatched yet is already the active Work: another
   -- admission's paid call cannot slip in between the Work's reservation and its dispatch
   -- (that would fence the Work's own dispatch after it was charged). Ends at dispatch or deadline.
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_admission w WHERE w.cohort_id=c.id AND w.kind='WORK' AND w.id<>prior.id
     AND w.state IN('RESERVED','BOUND') AND w.deadline>n
     AND NOT EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d WHERE d.admission_id=w.id)) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
   INSERT INTO external_alpha_cohort_dispatch(admission_id,operation_sha256,state) VALUES(prior.id,p->>'operationSha256','DISPATCHED');
  END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF mode IS DISTINCT FROM 'reserve' OR p->>'kind' IS NULL OR p->>'kind'<>'CHAT'
  OR p->>'bindingSha256' IS NULL OR p->>'requestSha256' IS NULL THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
 SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND binding_sha256=p->>'bindingSha256';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.kind IS DISTINCT FROM p->>'kind' OR prior.policy_sha256<>m.policy_sha256
   THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_BINDING_CHANGED'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 day=floor(extract(epoch FROM n)/86400); amount=100000;
 SELECT COALESCE(sum(ceiling_microusd) FILTER(WHERE owner_id=m.owner_id AND day_index=day),0),
  COALESCE(sum(ceiling_microusd) FILTER(WHERE owner_id=m.owner_id),0),
  COALESCE(sum(ceiling_microusd) FILTER(WHERE day_index=day),0),COALESCE(sum(ceiling_microusd),0),
  count(*) FILTER(WHERE owner_id=m.owner_id AND day_index=day AND kind=p->>'kind')
 INTO owner_day,owner_total,global_day,global_total,kinds FROM external_alpha_cohort_admission WHERE cohort_id=c.id;
 IF owner_day+amount>1000000 OR owner_total+amount>5000000 OR global_day+amount>2000000 OR global_total+amount>10000000
  OR kinds>=10 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_EXHAUSTED'; END IF;
 -- Zero-gap UNKNOWN fencing: every unresolved lease, including authenticated
 -- RUNNING Work, fences new cohort admission. A RUNNING row is never evidence
 -- that its exposure is still known: the owning app may already hold a local
 -- UNKNOWN whose central record failed or is in flight. Only SETTLED (proven
 -- known) releases the fence; no reservation is refunded. Checked last so a
 -- Work request blocked by the active Work is told CAPACITY; every path denies.
 IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.cohort_id=c.id AND d.state IN('UNKNOWN','DISPATCHED','RUNNING','FENCED')) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
 -- Likewise an admitted, not-yet-dispatched Work fences new admissions, so no owner is
 -- charged for a call that could not dispatch while that Work is active.
 IF EXISTS(SELECT 1 FROM external_alpha_cohort_admission w WHERE w.cohort_id=c.id AND w.kind='WORK'
   AND w.state IN('RESERVED','BOUND') AND w.deadline>n
   AND NOT EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d WHERE d.admission_id=w.id)) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
 INSERT INTO external_alpha_cohort_admission(id,cohort_id,owner_id,policy_sha256,kind,binding_sha256,request_sha256,day_index,ceiling_microusd,deadline)
 VALUES((p->>'id')::uuid,c.id,m.owner_id,m.policy_sha256,p->>'kind',p->>'bindingSha256',p->>'requestSha256',day,amount,
  LEAST(n+interval '180 seconds',c.activated_at+interval '120 hours')) RETURNING * INTO prior;
 RETURN to_jsonb(prior);
END $$;
