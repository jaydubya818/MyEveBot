-- Owner: Q37 MyFactory Gate C. Receipt custody only; no writer/Ready authority.
CREATE TABLE engineering_factory_requests (
 id uuid PRIMARY KEY,
 scope_id text NOT NULL, scope_kind text NOT NULL,
 work_id uuid NOT NULL, actor_id text NOT NULL, agent_id text NOT NULL,
 factory_id text NOT NULL, operation_id text NOT NULL CHECK(operation_id ~ '^[a-f0-9]{64}$'),
 binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
 verified_manifest_digest text CHECK(verified_manifest_digest ~ '^[a-f0-9]{64}$'),
 current boolean NOT NULL DEFAULT true, cancelled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(scope_id,scope_kind,factory_id,operation_id),
 FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
CREATE UNIQUE INDEX engineering_factory_current_request ON engineering_factory_requests(scope_id,scope_kind,work_id) WHERE current;
-- statement-breakpoint
CREATE TABLE engineering_factory_receipts (
 id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES engineering_factory_requests(id),
 envelope_digest text NOT NULL CHECK(envelope_digest ~ '^[a-f0-9]{64}$'),
 envelope text NOT NULL CHECK(octet_length(envelope)<=12582912),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'RECEIVED' CHECK(state IN ('RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED','REJECTED','STALE','CONFLICT')),
 history jsonb NOT NULL DEFAULT '[{"state":"RECEIVED"}]',
 provenance jsonb, reason text,
 UNIQUE(request_id,envelope_digest),
 UNIQUE(request_id,id)
);
-- statement-breakpoint
CREATE TABLE engineering_factory_admissions (
 request_id uuid PRIMARY KEY REFERENCES engineering_factory_requests(id),
 receipt_id uuid NOT NULL UNIQUE,
 manifest_digest text NOT NULL CHECK(manifest_digest ~ '^[a-f0-9]{64}$'),
 key_policy jsonb NOT NULL CHECK(jsonb_typeof(key_policy)='object'),
 admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(request_id,receipt_id) REFERENCES engineering_factory_receipts(request_id,id)
);
-- statement-breakpoint
-- This narrow trusted backend function is the only mutation boundary. Runtime
-- roles receive EXECUTE explicitly at provisioning; no PUBLIC grants, DDL,
-- execution-state writes, candidate writer leases, budget or publication effects.
CREATE FUNCTION engineering_factory_receipt(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE q engineering_factory_requests%ROWTYPE; r engineering_factory_receipts%ROWTYPE;
 w engineering_work%ROWTYPE; a engineering_factory_admissions%ROWTYPE;
 b jsonb:=p->'binding'; op text:=p->>'action'; target text; why text;
BEGIN
 IF op='register' THEN
  SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=p->>'scopeId' AND scope_kind=p->>'scopeKind' AND id=(b->>'workId')::uuid FOR UPDATE;
  IF w.version<>(b->>'workVersion')::integer OR w.generation<>(b->>'workGeneration')::integer OR w.criteria_version<>(b->>'criteriaVersion')::integer
    OR w.lifecycle<>'active' OR w.control<>'agent' THEN RAISE EXCEPTION 'Factory request Work changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM agents WHERE id=b->>'agentId' AND owner_id=w.scope_id AND status='active') THEN RAISE EXCEPTION 'Factory request Agent mismatch'; END IF;
  SELECT * INTO q FROM engineering_factory_requests WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND factory_id=b->>'factoryId' AND operation_id=b->>'operationId';
  IF FOUND THEN
   IF q.binding<>b OR q.actor_id<>p->>'actorId' THEN RAISE EXCEPTION 'Factory request binding conflict'; END IF;
   RETURN to_jsonb(q);
  END IF;
  UPDATE engineering_factory_requests SET current=false WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id AND current;
  INSERT INTO engineering_factory_requests(id,scope_id,scope_kind,work_id,actor_id,agent_id,factory_id,operation_id,binding)
   VALUES((p->>'id')::uuid,w.scope_id,w.scope_kind,w.id,p->>'actorId',b->>'agentId',b->>'factoryId',b->>'operationId',b) RETURNING * INTO q;
  RETURN to_jsonb(q);
 END IF;
 -- All operations lock Work then request, matching registration and owner Work
 -- changes. Current generation cannot change between policy check and admission.
 SELECT * INTO STRICT q FROM engineering_factory_requests WHERE id=(p->>'requestId')::uuid AND scope_id=p->>'scopeId' AND scope_kind=p->>'scopeKind' AND actor_id=p->>'actorId';
 SELECT * INTO STRICT w FROM engineering_work WHERE scope_id=q.scope_id AND scope_kind=q.scope_kind AND id=q.work_id FOR UPDATE;
 SELECT * INTO STRICT q FROM engineering_factory_requests WHERE id=q.id FOR UPDATE;
 IF op='cancel' THEN
  UPDATE engineering_factory_requests SET cancelled=true WHERE id=q.id RETURNING * INTO q; RETURN to_jsonb(q);
 END IF;
 IF op='receive' THEN
  INSERT INTO engineering_factory_receipts(id,request_id,envelope_digest,envelope)
   VALUES((p->>'id')::uuid,q.id,p->>'envelopeDigest',p->>'envelope') ON CONFLICT(request_id,envelope_digest) DO NOTHING;
  SELECT * INTO STRICT r FROM engineering_factory_receipts WHERE request_id=q.id AND envelope_digest=p->>'envelopeDigest';
  IF r.envelope<>p->>'envelope' THEN RAISE EXCEPTION 'Envelope digest collision'; END IF;
  RETURN to_jsonb(r);
 END IF;
 IF op<>'transition' THEN RAISE EXCEPTION 'Unknown Factory receipt operation'; END IF;
 SELECT * INTO STRICT r FROM engineering_factory_receipts WHERE id=(p->>'receiptId')::uuid AND request_id=q.id FOR UPDATE;
 IF r.state IN ('ADMITTED','STALE','REJECTED','CONFLICT') THEN RETURN to_jsonb(r); END IF;
 target:=p->>'state'; why:=p->>'reason';
 IF target='REJECTED' THEN NULL;
 ELSIF target='AUTHENTICATED' AND r.state='RECEIVED' THEN NULL;
 ELSIF target='ATTESTED' AND r.state='AUTHENTICATED' THEN NULL;
 ELSIF target='INTEGRITY_VERIFIED' AND r.state='ATTESTED' THEN
  IF q.verified_manifest_digest IS NOT NULL AND q.verified_manifest_digest<>r.provenance->>'manifestDigest' THEN
   target:='CONFLICT'; why:='OPERATION_MANIFEST_CONFLICT';
  ELSE UPDATE engineering_factory_requests SET verified_manifest_digest=r.provenance->>'manifestDigest' WHERE id=q.id; END IF;
 ELSIF target='ADMITTED' AND r.state='INTEGRITY_VERIFIED' THEN
  SELECT * INTO a FROM engineering_factory_admissions WHERE request_id=q.id;
  IF FOUND AND a.manifest_digest<>r.provenance->>'manifestDigest' THEN target:='CONFLICT'; why:='OPERATION_MANIFEST_CONFLICT';
  ELSIF NOT q.current OR q.cancelled OR w.lifecycle<>'active' OR w.control<>'agent'
   OR w.version<>(q.binding->>'workVersion')::integer OR w.generation<>(q.binding->>'workGeneration')::integer
   OR w.criteria_version<>(q.binding->>'criteriaVersion')::integer
   OR NOT EXISTS(SELECT 1 FROM agents WHERE id=q.agent_id AND owner_id=q.scope_id AND status='active')
   OR COALESCE((p->>'keyCurrent')::boolean,false)=false
   OR COALESCE((p#>>'{key,notAfter}')::timestamptz>clock_timestamp(),false)=false
   OR p->'key' ? 'retiredAt' OR p->'key' ? 'revokedAt'
   OR r.provenance#>>'{manifest,status}' IS DISTINCT FROM 'COMPLETED' THEN target:='STALE'; why:='HISTORICAL_NOT_CURRENT';
  ELSE
   INSERT INTO engineering_factory_admissions(request_id,receipt_id,manifest_digest,key_policy)
    VALUES(q.id,r.id,r.provenance->>'manifestDigest',p->'key') ON CONFLICT(request_id) DO NOTHING;
  END IF;
 ELSE
  -- A concurrent worker may already have committed this stage. Never regress.
  IF array_position(ARRAY['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED'],r.state)>=array_position(ARRAY['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED'],target) THEN RETURN to_jsonb(r); END IF;
  RAISE EXCEPTION 'Invalid Factory receipt transition';
 END IF;
 UPDATE engineering_factory_receipts SET state=target,reason=why,
  provenance=COALESCE(provenance,p->'provenance'),
  history=history||jsonb_build_array(jsonb_build_object('state',target,'at',clock_timestamp(),'reason',why))
  WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION engineering_factory_receipt(jsonb) FROM PUBLIC;
REVOKE ALL ON engineering_factory_requests,engineering_factory_receipts,engineering_factory_admissions FROM PUBLIC;
