-- Standalone qualification-accounting schema for proposal qdev-20261029-01.
-- NOT an application migration. Installing this schema creates no charter, member,
-- project, activation or spending authority; those rows are operator-issued only
-- after the owners approve an immutable charter. It never touches the
-- external_alpha_* tester ledgers and cannot read, import or reset them.
--
-- Contract (enforced here, not by callers):
--  * Q1 may reserve paid Works; Q2 is an isolation control and has zero paid Works.
--  * One dashboard project (the parent) per owner. Every charged child binds the
--    same approved parent and source tuple before it may dispatch.
--  * At most four Works, strictly sequential (concurrency one), each with a full
--    nonrefundable ceiling charged at reservation; aggregate <= journey ceiling.
--  * No automatic retry, replacement Work, top-up or refund. A lost
--    acknowledgment, UNKNOWN or unfinished predecessor fences the cohort.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE TABLE qdev_charter (
 id uuid PRIMARY KEY,
 singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
 proposal_id text NOT NULL CHECK(proposal_id='qdev-20261029-01'),
 charter_sha256 text NOT NULL UNIQUE CHECK(charter_sha256 ~ '^[a-f0-9]{64}$'),
 funding_sha256 text NOT NULL CHECK(funding_sha256 ~ '^[a-f0-9]{64}$'),
 hold_disposition_sha256 text NOT NULL CHECK(hold_disposition_sha256 ~ '^[a-f0-9]{64}$'),
 price_revision_sha256 text NOT NULL CHECK(price_revision_sha256 ~ '^[a-f0-9]{64}$'),
 journey_ceiling_microusd bigint NOT NULL CHECK(journey_ceiling_microusd BETWEEN 1 AND 5200000),
 max_works integer NOT NULL CHECK(max_works BETWEEN 1 AND 4),
 per_work_ceiling_microusd bigint NOT NULL CHECK(per_work_ceiling_microusd BETWEEN 1 AND 1300000),
 concurrency integer NOT NULL CHECK(concurrency=1),
 valid_until timestamptz NOT NULL,
 activated_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(per_work_ceiling_microusd<=journey_ceiling_microusd)
);
CREATE TABLE qdev_member (
 cohort_id uuid NOT NULL REFERENCES qdev_charter(id),
 slot text NOT NULL CHECK(slot IN('Q1','Q2')),
 owner_id uuid NOT NULL UNIQUE,
 policy_sha256 text NOT NULL CHECK(policy_sha256 ~ '^[a-f0-9]{64}$'),
 credential_sha256 text NOT NULL UNIQUE CHECK(credential_sha256 ~ '^[a-f0-9]{64}$'),
 paid_works integer NOT NULL CHECK((slot='Q1' AND paid_works BETWEEN 0 AND 4) OR (slot='Q2' AND paid_works=0)),
 PRIMARY KEY(cohort_id,slot), UNIQUE(cohort_id,owner_id)
);
-- The approved parent: one dashboard project per owner. project_sha256 binds the
-- repository, exact input commit/tree, output branch and operating profile;
-- source_sha256 binds the frozen MyEve/Factory/Relay/MissionControl commits and
-- the FactoryVersion. Both are supplied by the operator from independently
-- computed values; this database only compares them, byte for byte.
CREATE TABLE qdev_project (
 id uuid PRIMARY KEY,
 cohort_id uuid NOT NULL REFERENCES qdev_charter(id),
 owner_id uuid NOT NULL UNIQUE,
 project_sha256 text NOT NULL CHECK(project_sha256 ~ '^[a-f0-9]{64}$'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cohort_id,owner_id) REFERENCES qdev_member(cohort_id,owner_id)
);
CREATE TABLE qdev_work (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES qdev_project(id),
 cohort_id uuid NOT NULL REFERENCES qdev_charter(id),
 owner_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 4),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 ceiling_microusd bigint NOT NULL CHECK(ceiling_microusd BETWEEN 1 AND 1300000),
 state text NOT NULL DEFAULT 'RESERVED' CHECK(state IN('RESERVED','BOUND','UNKNOWN')),
 local_allowance_id uuid,
 deadline timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(project_id,ordinal), UNIQUE(owner_id,binding_sha256), UNIQUE(owner_id,local_allowance_id),
 FOREIGN KEY(cohort_id,owner_id) REFERENCES qdev_member(cohort_id,owner_id),
 CHECK((state='RESERVED' AND local_allowance_id IS NULL) OR state='UNKNOWN' OR (state='BOUND' AND local_allowance_id IS NOT NULL))
);
CREATE TABLE qdev_dispatch (
 work_id uuid NOT NULL REFERENCES qdev_work(id),
 operation_sha256 text NOT NULL CHECK(operation_sha256 ~ '^[a-f0-9]{64}$'),
 purpose text NOT NULL CHECK(purpose IN('SOFIE','CODING','FACTORY','VERIFIER')),
 reserve_microusd bigint NOT NULL CHECK(reserve_microusd BETWEEN 1 AND 1300000),
 state text NOT NULL CHECK(state IN('DISPATCHED','RUNNING','FENCED','SETTLED','UNKNOWN','NOT_DISPATCHED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(work_id,operation_sha256)
);
CREATE FUNCTION qdev_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'QDEV_HISTORY_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='qdev_dispatch' THEN
  IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')
   OR (NEW.state IS DISTINCT FROM OLD.state AND NOT((OLD.state='DISPATCHED' AND NEW.state IN('RUNNING','FENCED','SETTLED','UNKNOWN','NOT_DISPATCHED'))
     OR (OLD.state='RUNNING' AND NEW.state IN('FENCED','SETTLED','UNKNOWN','NOT_DISPATCHED')) OR (OLD.state='FENCED' AND NEW.state IN('SETTLED','UNKNOWN'))))
  THEN RAISE EXCEPTION 'QDEV_HISTORY_IMMUTABLE'; END IF;
 ELSIF TG_TABLE_NAME='qdev_work' THEN
  IF (to_jsonb(NEW)-ARRAY['state','local_allowance_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','local_allowance_id'])
   OR (OLD.local_allowance_id IS NOT NULL AND NEW.local_allowance_id IS DISTINCT FROM OLD.local_allowance_id)
   OR (NEW.state IS DISTINCT FROM OLD.state AND NOT((OLD.state,NEW.state) IN (VALUES ('RESERVED','BOUND'),('RESERVED','UNKNOWN'),('BOUND','UNKNOWN'))))
  THEN RAISE EXCEPTION 'QDEV_HISTORY_IMMUTABLE'; END IF;
 ELSIF TG_TABLE_NAME IN('qdev_member','qdev_project') THEN RAISE EXCEPTION 'QDEV_HISTORY_IMMUTABLE';
 ELSE
  IF (to_jsonb(NEW)-ARRAY['activated_at','revoked_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['activated_at','revoked_at'])
   OR OLD.revoked_at IS NOT NULL
   OR (OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at)
   OR (NEW.activated_at IS DISTINCT FROM OLD.activated_at AND (NEW.activated_at IS NULL OR abs(extract(epoch FROM NEW.activated_at-clock_timestamp()))>5))
   OR (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at AND (NEW.revoked_at IS NULL OR abs(extract(epoch FROM NEW.revoked_at-clock_timestamp()))>5))
  THEN RAISE EXCEPTION 'QDEV_HISTORY_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER qdev_charter_guard BEFORE UPDATE OR DELETE ON qdev_charter FOR EACH ROW EXECUTE FUNCTION qdev_guard();
CREATE TRIGGER qdev_member_guard BEFORE UPDATE OR DELETE ON qdev_member FOR EACH ROW EXECUTE FUNCTION qdev_guard();
CREATE TRIGGER qdev_project_guard BEFORE UPDATE OR DELETE ON qdev_project FOR EACH ROW EXECUTE FUNCTION qdev_guard();
CREATE TRIGGER qdev_work_guard BEFORE UPDATE OR DELETE ON qdev_work FOR EACH ROW EXECUTE FUNCTION qdev_guard();
CREATE TRIGGER qdev_dispatch_guard BEFORE UPDATE OR DELETE ON qdev_dispatch FOR EACH ROW EXECUTE FUNCTION qdev_guard();

-- The single runtime entry point. Every mode authenticates the owner credential,
-- serializes on the charter row, and only ever touches that owner's rows.
CREATE FUNCTION qdev_cohort_call(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c qdev_charter%ROWTYPE; m qdev_member%ROWTYPE; pr qdev_project%ROWTYPE; w qdev_work%ROWTYPE; prior qdev_work%ROWTYPE; prev qdev_work%ROWTYPE;
 d qdev_dispatch%ROWTYPE; n timestamptz; mode text; amount bigint; charged bigint; cohort_works integer; project_works integer; exposure bigint; op text; purpose text;
BEGIN
 SELECT * INTO m FROM qdev_member
 WHERE owner_id=(p->>'ownerId')::uuid AND cohort_id=(p->>'cohortId')::uuid AND slot=p->>'slot'
  AND policy_sha256=p->>'policySha256'
  AND credential_sha256=encode(sha256(convert_to(p->>'credential','UTF8')),'hex');
 IF NOT FOUND THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
 mode=p->>'mode';
 -- Observational only: no locks or writes; only the caller's own totals.
 IF mode='status' THEN
  RETURN (SELECT jsonb_build_object('version',1,'checkedAt',statement_timestamp(),'slot',m.slot,
   'state',CASE WHEN co.revoked_at IS NOT NULL THEN 'revoked' WHEN co.activated_at IS NULL OR statement_timestamp()<co.activated_at THEN 'inactive'
     WHEN statement_timestamp()>=co.valid_until THEN 'expired'
     WHEN EXISTS(SELECT 1 FROM qdev_work x WHERE x.cohort_id=co.id AND x.state='UNKNOWN')
      OR EXISTS(SELECT 1 FROM qdev_dispatch y JOIN qdev_work x ON x.id=y.work_id WHERE x.cohort_id=co.id AND y.state IN('UNKNOWN','FENCED')) THEN 'paused'
     ELSE 'active' END,
   'ownWorks',(SELECT count(*) FROM qdev_work x WHERE x.owner_id=m.owner_id),
   'ownReservedMicrousd',COALESCE((SELECT sum(ceiling_microusd) FROM qdev_work x WHERE x.owner_id=m.owner_id),0),
   'paidWorksAllowed',m.paid_works,'expiresAt',co.valid_until,
   'limits',jsonb_build_object('journeyMicrousd',co.journey_ceiling_microusd,'perWorkMicrousd',co.per_work_ceiling_microusd,'maxWorks',co.max_works,'concurrency',1))
   FROM qdev_charter co WHERE co.id=m.cohort_id);
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'QDEV_ISOLATION'; END IF;
 SELECT * INTO STRICT c FROM qdev_charter WHERE id=m.cohort_id FOR UPDATE;
 n=clock_timestamp();
 -- Fencing and proven-known settlement stay available after revocation/expiry.
 IF mode='fence' THEN
  UPDATE qdev_work SET state='UNKNOWN' WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid RETURNING * INTO prior;
  IF NOT FOUND THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
  UPDATE qdev_dispatch SET state='UNKNOWN' WHERE work_id=prior.id AND state IN('DISPATCHED','RUNNING','FENCED');
  RETURN to_jsonb(prior);
 END IF;
 IF mode IN('hold','settle','cancel_unsent','running') THEN
  SELECT * INTO prior FROM qdev_work WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid;
  IF NOT FOUND OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid
   OR p->>'operationSha256' IS NULL OR p->>'operationSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
  op=p->>'operationSha256';
  IF mode='running' THEN
   -- Authenticated known observation, never an allocation retry.
   IF prior.state<>'BOUND' OR c.activated_at IS NULL OR c.revoked_at IS NOT NULL OR n>=c.valid_until THEN RAISE EXCEPTION 'QDEV_FENCED'; END IF;
   UPDATE qdev_dispatch SET state='RUNNING' WHERE work_id=prior.id AND operation_sha256=op AND state='DISPATCHED';
   IF NOT EXISTS(SELECT 1 FROM qdev_dispatch WHERE work_id=prior.id AND operation_sha256=op AND state='RUNNING') THEN RAISE EXCEPTION 'QDEV_FENCED'; END IF;
  ELSIF mode='hold' THEN
   UPDATE qdev_dispatch SET state='FENCED' WHERE work_id=prior.id AND operation_sha256=op AND state IN('DISPATCHED','RUNNING');
   IF NOT EXISTS(SELECT 1 FROM qdev_dispatch WHERE work_id=prior.id AND operation_sha256=op AND state IN('FENCED','SETTLED','UNKNOWN')) THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
  ELSIF mode='settle' THEN
   UPDATE qdev_dispatch SET state='SETTLED' WHERE work_id=prior.id AND operation_sha256=op AND state IN('DISPATCHED','RUNNING','FENCED');
   IF NOT EXISTS(SELECT 1 FROM qdev_dispatch WHERE work_id=prior.id AND operation_sha256=op AND state='SETTLED') THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
  ELSE
   -- Exact no-send tombstone; the Work ceiling stays charged. UNKNOWN/SETTLED immutable.
   -- RUNNING is only the pre-send marker; an authenticated no-send fact may still tombstone it.
   UPDATE qdev_dispatch SET state='NOT_DISPATCHED' WHERE work_id=prior.id AND operation_sha256=op AND state IN('DISPATCHED','RUNNING');
   IF NOT EXISTS(SELECT 1 FROM qdev_dispatch WHERE work_id=prior.id AND operation_sha256=op AND state='NOT_DISPATCHED') THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
  END IF;
  RETURN to_jsonb(prior);
 END IF;
 -- Everything below needs a live, unrevoked, unexpired charter and a clean cohort.
 IF c.activated_at IS NULL OR c.revoked_at IS NOT NULL OR n<c.activated_at OR n>=c.valid_until
  OR EXISTS(SELECT 1 FROM qdev_work WHERE cohort_id=c.id AND state='UNKNOWN')
  OR EXISTS(SELECT 1 FROM qdev_dispatch y JOIN qdev_work x ON x.id=y.work_id WHERE x.cohort_id=c.id AND y.state IN('UNKNOWN','FENCED'))
 THEN RAISE EXCEPTION 'QDEV_FENCED'; END IF;
 -- The caller must present the exact approved parent and source tuple.
 SELECT * INTO pr FROM qdev_project WHERE owner_id=m.owner_id AND cohort_id=c.id;
 IF NOT FOUND OR pr.project_sha256 IS DISTINCT FROM p->>'projectSha256' OR pr.source_sha256 IS DISTINCT FROM p->>'sourceSha256'
 THEN RAISE EXCEPTION 'QDEV_PARENT_BINDING_MISMATCH'; END IF;
 IF mode IN('bind','assert','dispatch') THEN
  SELECT * INTO prior FROM qdev_work WHERE owner_id=m.owner_id AND project_id=pr.id AND id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
  IF mode='bind' AND prior.state='RESERVED' THEN
   IF prior.deadline<=n THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
   UPDATE qdev_work SET state='BOUND',local_allowance_id=(p->>'allowanceId')::uuid WHERE id=prior.id RETURNING * INTO prior;
  END IF;
  IF prior.state<>'BOUND' OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
  IF mode='dispatch' THEN
   op=p->>'operationSha256'; purpose=p->>'purpose';
   IF op IS NULL OR op !~ '^[a-f0-9]{64}$' OR purpose IS NULL OR purpose NOT IN('SOFIE','CODING','FACTORY','VERIFIER')
    OR p->>'reserveMicrousd' IS NULL OR p->>'reserveMicrousd' !~ '^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
   amount=(p->>'reserveMicrousd')::bigint;
   SELECT * INTO d FROM qdev_dispatch WHERE work_id=prior.id AND operation_sha256=op;
   IF FOUND THEN
    IF d.state='NOT_DISPATCHED' THEN RAISE EXCEPTION 'QDEV_NOT_DISPATCHED'; END IF;
    IF d.purpose<>purpose OR d.reserve_microusd<>amount THEN RAISE EXCEPTION 'QDEV_BINDING_CHANGED'; END IF;
    RETURN to_jsonb(prior);
   END IF;
   -- Strictly sequential operations inside the Work; no overlapping paid calls.
   IF EXISTS(SELECT 1 FROM qdev_dispatch x WHERE x.work_id=prior.id AND x.state IN('DISPATCHED','RUNNING')) THEN RAISE EXCEPTION 'QDEV_FENCED'; END IF;
   SELECT COALESCE(sum(reserve_microusd),0) INTO exposure FROM qdev_dispatch WHERE work_id=prior.id AND state<>'NOT_DISPATCHED';
   IF exposure+amount>prior.ceiling_microusd THEN RAISE EXCEPTION 'QDEV_WORK_CEILING_EXCEEDED'; END IF;
   INSERT INTO qdev_dispatch(work_id,operation_sha256,purpose,reserve_microusd,state) VALUES(prior.id,op,purpose,amount,'DISPATCHED');
  END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF mode IS DISTINCT FROM 'reserve_work' OR p->>'bindingSha256' IS NULL OR p->>'requestSha256' IS NULL
  OR p->>'ceilingMicrousd' IS NULL OR p->>'ceilingMicrousd' !~ '^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'QDEV_DENIED'; END IF;
 IF m.paid_works<1 THEN RAISE EXCEPTION 'QDEV_NO_PAID_WORK'; END IF;
 amount=(p->>'ceilingMicrousd')::bigint;
 SELECT * INTO prior FROM qdev_work WHERE owner_id=m.owner_id AND binding_sha256=p->>'bindingSha256';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.ceiling_microusd<>amount OR prior.project_id<>pr.id
   THEN RAISE EXCEPTION 'QDEV_BINDING_CHANGED'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 IF amount>c.per_work_ceiling_microusd THEN RAISE EXCEPTION 'QDEV_WORK_CEILING_EXCEEDED'; END IF;
 SELECT count(*), COALESCE(sum(ceiling_microusd),0) INTO cohort_works, charged FROM qdev_work WHERE cohort_id=c.id;
 SELECT count(*) INTO project_works FROM qdev_work WHERE project_id=pr.id;
 IF project_works>=m.paid_works OR cohort_works>=c.max_works OR charged+amount>c.journey_ceiling_microusd THEN RAISE EXCEPTION 'QDEV_EXHAUSTED'; END IF;
 -- Concurrency one, no replacement: the predecessor must be bound and fully
 -- accounted. An unbound, unfinished or unobserved predecessor fences the cohort.
 IF project_works>0 THEN
  SELECT * INTO prev FROM qdev_work WHERE project_id=pr.id AND ordinal=project_works;
  IF NOT FOUND OR prev.state<>'BOUND'
   OR NOT EXISTS(SELECT 1 FROM qdev_dispatch WHERE work_id=prev.id)
   OR EXISTS(SELECT 1 FROM qdev_dispatch WHERE work_id=prev.id AND state NOT IN('SETTLED','NOT_DISPATCHED'))
  THEN RAISE EXCEPTION 'QDEV_FENCED'; END IF;
 END IF;
 INSERT INTO qdev_work(id,project_id,cohort_id,owner_id,ordinal,binding_sha256,request_sha256,ceiling_microusd,deadline)
 VALUES((p->>'id')::uuid,pr.id,c.id,m.owner_id,project_works+1,p->>'bindingSha256',p->>'requestSha256',amount,
  LEAST(n+interval '300 seconds',c.valid_until)) RETURNING * INTO prior;
 RETURN to_jsonb(prior);
END $$;
REVOKE ALL ON qdev_charter,qdev_member,qdev_project,qdev_work,qdev_dispatch FROM PUBLIC;
REVOKE ALL ON FUNCTION qdev_cohort_call(jsonb),qdev_guard() FROM PUBLIC;
