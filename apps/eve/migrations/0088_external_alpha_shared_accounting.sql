-- Additive and inert. No external-alpha policy, cohort or activation installed.
CREATE TABLE external_alpha_shared_binding (
 allowance_id uuid PRIMARY KEY REFERENCES external_alpha_allowance(id),
 admission_id uuid NOT NULL UNIQUE,
 cohort_id uuid NOT NULL,
 receipt_sha256 text NOT NULL CHECK(receipt_sha256 ~ '^[a-f0-9]{64}$'),
 deadline timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- statement-breakpoint
CREATE FUNCTION external_alpha_shared_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'External alpha shared binding is immutable'; END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_shared_binding_guard BEFORE UPDATE OR DELETE ON external_alpha_shared_binding FOR EACH ROW EXECUTE FUNCTION external_alpha_shared_binding_guard();
-- statement-breakpoint
REVOKE ALL ON external_alpha_shared_binding FROM PUBLIC;
-- statement-breakpoint
-- An earlier UNKNOWN already holds the full remaining Factory envelope.
-- Later reports must reference that charge instead of reserving it twice.
ALTER TABLE external_alpha_operation DROP CONSTRAINT external_alpha_operation_reserved_microusd_check;
-- statement-breakpoint
ALTER TABLE external_alpha_operation ADD COLUMN covered_by_operation_id uuid,
 ADD CONSTRAINT external_alpha_operation_cover_identity UNIQUE(id,allowance_id),
 ADD CONSTRAINT external_alpha_operation_cover_fk FOREIGN KEY(covered_by_operation_id,allowance_id) REFERENCES external_alpha_operation(id,allowance_id),
 ADD CONSTRAINT external_alpha_operation_reservation CHECK(reserved_microusd>0 OR (reserved_microusd=0 AND state='UNKNOWN' AND source IN('FACTORY_PRODUCTIVE','FACTORY_COMPLETION') AND covered_by_operation_id IS NOT NULL));
-- statement-breakpoint
CREATE FUNCTION external_alpha_operation_cover_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.covered_by_operation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM external_alpha_operation o WHERE o.id=NEW.covered_by_operation_id AND o.allowance_id=NEW.allowance_id AND o.state='UNKNOWN' AND o.source LIKE 'FACTORY%' AND o.reserved_microusd>0 AND o.covered_by_operation_id IS NULL)
 THEN RAISE EXCEPTION 'External alpha UNKNOWN coverage required'; END IF;
 IF TG_OP='UPDATE' AND NEW.covered_by_operation_id IS DISTINCT FROM OLD.covered_by_operation_id THEN RAISE EXCEPTION 'External alpha UNKNOWN coverage is immutable'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER external_alpha_operation_cover_guard BEFORE INSERT OR UPDATE ON external_alpha_operation FOR EACH ROW EXECUTE FUNCTION external_alpha_operation_cover_guard();
-- statement-breakpoint
CREATE OR REPLACE FUNCTION external_alpha_factory_record(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy external_alpha_policy%ROWTYPE; a external_alpha_allowance%ROWTYPE; au external_alpha_work_authority%ROWTYPE; prior external_alpha_operation%ROWTYPE; row external_alpha_operation%ROWTYPE;
 f_ops integer; f_exposure bigint; t_ops integer; t_exposure bigint; m bigint; reserved bigint; st text; over boolean=false; src text; cover uuid;
BEGIN
 SELECT * INTO STRICT policy FROM external_alpha_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM external_alpha_allowance WHERE id=(p->>'allowanceId')::uuid FOR UPDATE;
 SELECT * INTO STRICT au FROM external_alpha_work_authority WHERE allowance_id=a.id FOR UPDATE;
 src=p->>'source'; st=p->>'state';
 IF a.owner_id IS DISTINCT FROM p->>'ownerId' OR policy.owner_id<>a.owner_id OR a.kind<>'WORK' OR au.id IS DISTINCT FROM (p->>'authorityId')::uuid
 OR au.state NOT IN('CONSUMED','COMPLETED','CANCELLED','UNKNOWN') OR src NOT IN('FACTORY_PRODUCTIVE','FACTORY_COMPLETION') OR st NOT IN('SETTLED','UNKNOWN')
 OR p->>'stepKey' !~ '^factory:.+:\d+$' OR p->>'requestSha256' !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Exact consumed Work authority and Factory operation required'; END IF;
 m=NULLIF(p->>'microusd','')::bigint;
 IF st='SETTLED' AND (m IS NULL OR m<0) THEN RAISE EXCEPTION 'Settled Factory operation requires a measured cost'; END IF;
 SELECT * INTO prior FROM external_alpha_operation WHERE allowance_id=a.id AND step_key=p->>'stepKey';
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM p->>'requestSha256' OR prior.source<>src THEN RAISE EXCEPTION 'Factory operation identity changed'; END IF;
  -- exact-once: a replay never changes recorded exposure, and UNKNOWN is never released.
  RETURN to_jsonb(prior);
 END IF;
 SELECT count(*) FILTER(WHERE source LIKE 'FACTORY%'),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)) FILTER(WHERE source LIKE 'FACTORY%'),0),count(*),COALESCE(sum(COALESCE(spent_microusd,reserved_microusd)),0)
 INTO f_ops,f_exposure,t_ops,t_exposure FROM external_alpha_operation WHERE allowance_id=a.id;
 -- An UNKNOWN measurement is not an upper bound. Keep the whole remaining
 -- Factory envelope, even when a partial/provider estimate reports a tiny cost.
 SELECT id INTO cover FROM external_alpha_operation WHERE allowance_id=a.id AND source LIKE 'FACTORY%' AND state='UNKNOWN' AND covered_by_operation_id IS NULL AND reserved_microusd>0 ORDER BY created_at,id LIMIT 1;
 reserved=CASE WHEN cover IS NOT NULL THEN 0 WHEN st='UNKNOWN' THEN GREATEST(COALESCE(m,0),1000000-f_exposure,1) ELSE GREATEST(m,1) END;
 IF f_ops+1>3 OR f_exposure+reserved>1000000 OR t_ops+1>a.max_operations OR t_exposure+reserved>a.ceiling_microusd THEN over=true; END IF;
 IF over OR st='UNKNOWN' OR cover IS NOT NULL THEN
  INSERT INTO external_alpha_operation(id,allowance_id,step_key,request_sha256,reserved_microusd,state,source,result,covered_by_operation_id)
  VALUES((p->>'id')::uuid,a.id,p->>'stepKey',p->>'requestSha256',reserved,'UNKNOWN',src,jsonb_build_object('overBound',over)||(CASE WHEN cover IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('coveredBy',cover,'reportedMicrousd',m) END),cover) RETURNING * INTO row;
  UPDATE external_alpha_allowance SET state='UNKNOWN' WHERE id=a.id;
 ELSE
  INSERT INTO external_alpha_operation(id,allowance_id,step_key,request_sha256,reserved_microusd,spent_microusd,state,source,result)
  VALUES((p->>'id')::uuid,a.id,p->>'stepKey',p->>'requestSha256',reserved,m,'SETTLED',src,COALESCE(p->'result','{}'::jsonb)) RETURNING * INTO row;
 END IF;
 RETURN to_jsonb(row);
END $$;
