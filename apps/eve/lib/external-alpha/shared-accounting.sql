-- Standalone accounting-database schema. NOT an application migration.
-- Installing schema creates no cohort, member, activation or spending authority.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE TABLE external_alpha_cohort (
 id uuid PRIMARY KEY,
 singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
 activated_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE external_alpha_cohort_member (
 cohort_id uuid NOT NULL REFERENCES external_alpha_cohort(id),
 slot text NOT NULL CHECK(slot IN('1','2')),
 owner_id uuid NOT NULL UNIQUE,
 policy_sha256 text NOT NULL CHECK(policy_sha256 ~ '^[a-f0-9]{64}$'),
 credential_sha256 text NOT NULL UNIQUE CHECK(credential_sha256 ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(cohort_id,slot), UNIQUE(cohort_id,owner_id)
);
CREATE TABLE external_alpha_cohort_admission (
 id uuid PRIMARY KEY,
 cohort_id uuid NOT NULL REFERENCES external_alpha_cohort(id),
 owner_id uuid NOT NULL,
 policy_sha256 text NOT NULL,
 kind text NOT NULL CHECK(kind IN('CHAT','WORK')),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 day_index integer NOT NULL,
 ceiling_microusd bigint NOT NULL CHECK((kind='CHAT' AND ceiling_microusd=100000) OR (kind='WORK' AND ceiling_microusd=1300000)),
 state text NOT NULL DEFAULT 'RESERVED' CHECK(state IN('RESERVED','BOUND','UNKNOWN')),
 local_allowance_id uuid,
 deadline timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,binding_sha256), UNIQUE(owner_id,local_allowance_id),
 FOREIGN KEY(cohort_id,owner_id) REFERENCES external_alpha_cohort_member(cohort_id,owner_id),
 CHECK((state='RESERVED' AND local_allowance_id IS NULL) OR state='UNKNOWN' OR (state='BOUND' AND local_allowance_id IS NOT NULL))
);
CREATE TABLE external_alpha_cohort_dispatch (
 admission_id uuid NOT NULL REFERENCES external_alpha_cohort_admission(id),
 operation_sha256 text NOT NULL CHECK(operation_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN('DISPATCHED','SETTLED','UNKNOWN')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(admission_id,operation_sha256)
);
CREATE FUNCTION external_alpha_cohort_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External alpha accounting history is immutable'; END IF;
 IF TG_TABLE_NAME='external_alpha_cohort_dispatch' THEN
  IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')
   OR (NEW.state IS DISTINCT FROM OLD.state AND NOT(OLD.state='DISPATCHED' AND NEW.state IN('SETTLED','UNKNOWN')))
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
CREATE TRIGGER external_alpha_cohort_guard BEFORE UPDATE OR DELETE ON external_alpha_cohort FOR EACH ROW EXECUTE FUNCTION external_alpha_cohort_guard();
CREATE TRIGGER external_alpha_cohort_member_guard BEFORE UPDATE OR DELETE ON external_alpha_cohort_member FOR EACH ROW EXECUTE FUNCTION external_alpha_cohort_guard();
CREATE TRIGGER external_alpha_cohort_admission_guard BEFORE UPDATE OR DELETE ON external_alpha_cohort_admission FOR EACH ROW EXECUTE FUNCTION external_alpha_cohort_guard();
CREATE TRIGGER external_alpha_cohort_dispatch_guard BEFORE UPDATE OR DELETE ON external_alpha_cohort_dispatch FOR EACH ROW EXECUTE FUNCTION external_alpha_cohort_guard();

-- Both installations call these functions through restricted roles. The shared
-- cohort row serializes every owner/day/global/trial check with its insertion.
-- Whole allowance stays charged forever: cancellation/expiry/settlement cannot
-- prove that a cross-database reservation was unused and never recycle it.
CREATE FUNCTION external_alpha_cohort_call(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
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
 IF mode='fence' THEN
  UPDATE external_alpha_cohort_admission SET state='UNKNOWN' WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid RETURNING * INTO prior;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  UPDATE external_alpha_cohort_dispatch SET state='UNKNOWN' WHERE admission_id=prior.id AND state='DISPATCHED';
  RETURN to_jsonb(prior);
 END IF;
 -- Proven local settlement can be recorded after revocation/deadline. Expiry
 -- itself never settles a dispatch and UNKNOWN is never changed back to known.
 IF mode='settle' THEN
  SELECT * INTO prior FROM external_alpha_cohort_admission WHERE owner_id=m.owner_id AND id=(p->>'id')::uuid;
  IF NOT FOUND OR prior.local_allowance_id IS DISTINCT FROM (p->>'allowanceId')::uuid THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
  UPDATE external_alpha_cohort_dispatch SET state='SETTLED' WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state='DISPATCHED';
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
   IF p->>'operationSha256' IS NULL OR p->>'operationSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_DENIED'; END IF;
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch WHERE admission_id=prior.id AND operation_sha256=p->>'operationSha256' AND state IN('DISPATCHED','SETTLED')) THEN RETURN to_jsonb(prior); END IF;
   IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.cohort_id=c.id AND (d.state='UNKNOWN' OR (d.state='DISPATCHED' AND a.id<>prior.id))) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
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
 IF EXISTS(SELECT 1 FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.cohort_id=c.id AND d.state IN('DISPATCHED','UNKNOWN')) THEN RAISE EXCEPTION 'EXTERNAL_ALPHA_SHARED_FENCED'; END IF;
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
REVOKE ALL ON external_alpha_cohort,external_alpha_cohort_member,external_alpha_cohort_admission,external_alpha_cohort_dispatch FROM PUBLIC;
REVOKE ALL ON FUNCTION external_alpha_cohort_call(jsonb),external_alpha_cohort_guard() FROM PUBLIC;
