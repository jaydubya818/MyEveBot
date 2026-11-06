-- Forward-only, owner-approved cohort access extension (default off) for the
-- shared accounting DB. Apply AFTER shared-accounting.sql, -recovery.sql,
-- -zero-gap.sql and -chat-only.sql; those hash-pinned files are unchanged.
-- No enrollment, activation, refund, row rewrite or new role privilege.
-- extended_until stays NULL until external_alpha_cohort_approve_access_extension()
-- records an append-only audit row (who, when, reason) in the same transaction.
-- activated_at stays immutable; admission/dispatch history and every daily and
-- lifetime cap ($1/$5 per owner, $2/$10 per cohort) are untouched.
-- Effective expiry = GREATEST(activated_at+120h, COALESCE(extended_until, activated_at+120h)),
-- extended_until capped at activated_at+120h+14 days.
-- Withdraw an extension: set external_alpha_cohort.revoked_at (immediate, permanent).
-- Schema rollback: re-apply the hash-pinned shared-accounting-chat-only.sql, which restores
-- the fixed 120-hour external_alpha_cohort_call; the column, audit rows and stricter guard
-- remain and are inert.
-- Re-applying this exact file is a no-op (no row is changed; recorded extensions are kept).
ALTER TABLE external_alpha_cohort ADD COLUMN IF NOT EXISTS extended_until timestamptz DEFAULT NULL;
ALTER TABLE external_alpha_cohort DROP CONSTRAINT IF EXISTS external_alpha_cohort_extension_cap;
ALTER TABLE external_alpha_cohort ADD CONSTRAINT external_alpha_cohort_extension_cap CHECK(extended_until IS NULL OR (activated_at IS NOT NULL
 AND extended_until>activated_at+interval '120 hours' AND extended_until<=activated_at+interval '120 hours'+interval '14 days'));
CREATE OR REPLACE FUNCTION external_alpha_cohort_access_until(activated timestamptz, extended timestamptz) RETURNS timestamptz LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT GREATEST(activated+interval '120 hours',COALESCE(extended,activated+interval '120 hours'))
$$;
CREATE TABLE IF NOT EXISTS external_alpha_cohort_access_extension (
 id uuid PRIMARY KEY,
 cohort_id uuid NOT NULL REFERENCES external_alpha_cohort(id),
 activated_at timestamptz NOT NULL,
 previous_extended_until timestamptz,
 extended_until timestamptz NOT NULL CHECK(extended_until>activated_at+interval '120 hours' AND extended_until<=activated_at+interval '120 hours'+interval '14 days'),
 approved_by text NOT NULL CHECK(length(btrim(approved_by)) BETWEEN 1 AND 200),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approval_txid bigint NOT NULL DEFAULT txid_current(),
 CHECK(previous_extended_until IS NULL OR previous_extended_until<extended_until)
);
CREATE OR REPLACE FUNCTION external_alpha_cohort_access_extension_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'EXTERNAL_ALPHA_ACCESS_EXTENSION_IMMUTABLE';
END $$;
DROP TRIGGER IF EXISTS external_alpha_cohort_access_extension_immutable ON external_alpha_cohort_access_extension;
CREATE TRIGGER external_alpha_cohort_access_extension_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON external_alpha_cohort_access_extension FOR EACH STATEMENT EXECUTE FUNCTION external_alpha_cohort_access_extension_immutable();
-- Body from shared-accounting-recovery.sql plus the extension rule on the cohort row.
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
  IF NEW.extended_until IS DISTINCT FROM OLD.extended_until AND (NEW.extended_until IS NULL OR OLD.activated_at IS NULL OR NEW.revoked_at IS NOT NULL
   OR (OLD.extended_until IS NOT NULL AND NEW.extended_until<=OLD.extended_until)
   OR NOT EXISTS(SELECT 1 FROM external_alpha_cohort_access_extension x WHERE x.cohort_id=NEW.id AND x.activated_at=NEW.activated_at
    AND x.extended_until=NEW.extended_until AND x.previous_extended_until IS NOT DISTINCT FROM OLD.extended_until AND x.approval_txid=txid_current()))
  THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_REQUIRES_OWNER_APPROVAL'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- The only supported way to set extended_until. Operator-run (no PUBLIC grant).
CREATE OR REPLACE FUNCTION external_alpha_cohort_approve_access_extension(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c external_alpha_cohort%ROWTYPE; prior external_alpha_cohort_access_extension%ROWTYPE; until timestamptz;
BEGIN
 SELECT * INTO STRICT c FROM external_alpha_cohort WHERE id=(p->>'cohortId')::uuid FOR UPDATE;
 until=(p->>'extendedUntil')::timestamptz;
 SELECT * INTO prior FROM external_alpha_cohort_access_extension WHERE id=(p->>'approvalId')::uuid;
 IF FOUND THEN
  IF prior.cohort_id IS DISTINCT FROM c.id OR prior.extended_until IS DISTINCT FROM until
   OR prior.approved_by IS DISTINCT FROM p->>'approvedBy' OR prior.reason IS DISTINCT FROM p->>'reason'
  THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_APPROVAL_REUSED'; END IF;
  RETURN to_jsonb(prior)||jsonb_build_object('replayed',true,'accessUntil',external_alpha_cohort_access_until(c.activated_at,c.extended_until));
 END IF;
 IF c.activated_at IS NULL OR c.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_NOT_ACTIVE'; END IF;
 IF until IS NULL OR until<=c.activated_at+interval '120 hours' OR until>c.activated_at+interval '120 hours'+interval '14 days'
  OR until<=clock_timestamp() OR (c.extended_until IS NOT NULL AND until<=c.extended_until)
 THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_EXTENSION_OUT_OF_BOUNDS'; END IF;
 INSERT INTO external_alpha_cohort_access_extension(id,cohort_id,activated_at,previous_extended_until,extended_until,approved_by,reason)
 VALUES((p->>'approvalId')::uuid,c.id,c.activated_at,c.extended_until,until,p->>'approvedBy',p->>'reason') RETURNING * INTO prior;
 UPDATE external_alpha_cohort SET extended_until=until WHERE id=c.id;
 RETURN to_jsonb(prior)||jsonb_build_object('replayed',false,'accessUntil',external_alpha_cohort_access_until(c.activated_at,until));
END $$;
REVOKE ALL ON external_alpha_cohort_access_extension FROM PUBLIC;
REVOKE ALL ON FUNCTION external_alpha_cohort_approve_access_extension(jsonb),external_alpha_cohort_access_extension_immutable(),external_alpha_cohort_access_until(timestamptz,timestamptz) FROM PUBLIC;
-- Body from shared-accounting-chat-only.sql; only the 120-hour expiry expression is replaced.
CREATE OR REPLACE FUNCTION external_alpha_cohort_call(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c external_alpha_cohort%ROWTYPE; m external_alpha_cohort_member%ROWTYPE; prior external_alpha_cohort_admission%ROWTYPE;
 n timestamptz; day integer; amount bigint; owner_day bigint; owner_total bigint; global_day bigint; global_total bigint; kinds integer; mode text;
BEGIN
 SELECT * INTO m FROM external_alpha_cohort_member
 WHERE owner_id=(p->>'ownerId')::uuid AND cohort_id=(p->>'cohortId')::uuid AND slot=p->>'slot'
  AND policy_sha256=p->>'policySha256'
  AND credential_sha256=encode(sha256(convert_to(p->>'credential','UTF8')),'hex');
 IF NOT FOUND THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
 -- Observational only: no row locks, writes, reconciliation, or authority.
 -- One statement snapshot includes central-only reservations after a lost
 -- local acknowledgment. Never expose the other tester's totals or identity.
 IF p->>'mode'='status' THEN
  RETURN (WITH timing AS (SELECT statement_timestamp() AS now), totals AS (
   SELECT count(*) FILTER(WHERE a.owner_id=m.owner_id AND a.day_index=floor(extract(epoch FROM t.now)/86400) AND a.kind='CHAT') AS turns,
    COALESCE(sum(a.ceiling_microusd) FILTER(WHERE a.owner_id=m.owner_id AND a.day_index=floor(extract(epoch FROM t.now)/86400)),0) AS owner_day,
    COALESCE(sum(a.ceiling_microusd) FILTER(WHERE a.owner_id=m.owner_id),0) AS owner_total,
    COALESCE(sum(a.ceiling_microusd) FILTER(WHERE a.day_index=floor(extract(epoch FROM t.now)/86400)),0) AS cohort_day,
    COALESCE(sum(a.ceiling_microusd),0) AS cohort_total
   FROM external_alpha_cohort_admission a CROSS JOIN timing t WHERE a.cohort_id=m.cohort_id
  ) SELECT jsonb_build_object(
   'version',1,'checkedAt',t.now,'dayIndex',floor(extract(epoch FROM t.now)/86400),
   'resetsAt',to_timestamp((floor(extract(epoch FROM t.now)/86400)+1)*86400),
   'activatedAt',co.activated_at,'expiresAt',external_alpha_cohort_access_until(co.activated_at,co.extended_until),
   'state',CASE WHEN co.revoked_at IS NOT NULL THEN 'revoked' WHEN co.activated_at IS NULL OR t.now<co.activated_at THEN 'inactive'
    WHEN t.now>=external_alpha_cohort_access_until(co.activated_at,co.extended_until) THEN 'expired'
    WHEN EXISTS(SELECT 1 FROM external_alpha_cohort_admission a WHERE a.cohort_id=co.id AND a.state='UNKNOWN')
     OR EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.cohort_id=co.id AND d.state IN('UNKNOWN','DISPATCHED','RUNNING','FENCED'))
     OR EXISTS(SELECT 1 FROM external_alpha_cohort_admission a WHERE a.cohort_id=co.id AND a.kind='WORK' AND a.state IN('RESERVED','BOUND') AND a.deadline>t.now AND NOT EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d WHERE d.admission_id=a.id)) THEN 'paused'
    ELSE 'active' END,
   'dailyTurnsUsed',x.turns,'dailyReservedMicrousd',x.owner_day,'trialReservedMicrousd',x.owner_total,
   'quotaRemaining',greatest(0,least(10-x.turns,(1000000-x.owner_day)/100000,(5000000-x.owner_total)/100000,(2000000-x.cohort_day)/100000,(10000000-x.cohort_total)/100000)),
   'limits',jsonb_build_object('dailyTurns',10,'perTurnMicrousd',100000,'dailyMicrousd',1000000,'trialMicrousd',5000000,'sharedDailyMicrousd',2000000,'sharedTrialMicrousd',10000000)
  ) FROM external_alpha_cohort co CROSS JOIN timing t CROSS JOIN totals x WHERE co.id=m.cohort_id);
 END IF;
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
 IF c.activated_at IS NULL OR c.revoked_at IS NOT NULL OR n<c.activated_at OR n>=external_alpha_cohort_access_until(c.activated_at,c.extended_until)
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
  LEAST(n+interval '180 seconds',external_alpha_cohort_access_until(c.activated_at,c.extended_until))) RETURNING * INTO prior;
 RETURN to_jsonb(prior);
END $$;
