-- Gate C custody only. 0051-0053 are immutable M1/ER1 migrations. This
-- migration does not touch native candidates, verification, budgets or writers.
CREATE TABLE engineering_factory_results (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('personal','organization')),
  work_id uuid NOT NULL,
  work_version integer NOT NULL CHECK (work_version > 0),
  work_generation integer NOT NULL CHECK (work_generation > 0),
  criteria_version integer NOT NULL CHECK (criteria_version > 0),
  agent_id text NOT NULL,
  factory_request_id uuid NOT NULL,
  factory_id text NOT NULL,
  factory_source_commit text NOT NULL,
  factory_source_tree text NOT NULL,
  factory_configuration_digest text NOT NULL CHECK (factory_configuration_digest ~ '^[a-f0-9]{64}$'),
  work_order_id uuid NOT NULL,
  run_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  producer text NOT NULL DEFAULT 'MYFACTORY' CHECK (producer = 'MYFACTORY'),
  producer_status text NOT NULL,
  protocol_version integer NOT NULL CHECK (protocol_version > 0),
  signing_key_id text NOT NULL,
  signing_key_version text NOT NULL,
  operation_id text NOT NULL UNIQUE CHECK (operation_id ~ '^[a-f0-9]{64}$'),
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  candidate_commit text NOT NULL,
  candidate_tree text NOT NULL,
  evidence_manifest_digest text NOT NULL CHECK (evidence_manifest_digest ~ '^[a-f0-9]{64}$'),
  artifact_manifest_digest text NOT NULL CHECK (artifact_manifest_digest ~ '^[a-f0-9]{64}$'),
  signed_envelope text NOT NULL,
  signed_envelope_digest text NOT NULL CHECK (signed_envelope_digest ~ '^[a-f0-9]{64}$'),
  producer_issued_at timestamptz,
  producer_completed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  admission_state text NOT NULL DEFAULT 'RECEIVED' CHECK (admission_state IN (
    'RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED','REJECTED','STALE','CONFLICT')),
  reason text,
  trust_status text NOT NULL DEFAULT 'UNASSESSED' CHECK (trust_status IN (
    'UNASSESSED','CURRENT','ROTATED','REVOKED','LEGACY')),
  cryptographically_valid boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (scope_id,scope_kind,work_id,id),
  UNIQUE (factory_request_id,run_id,attempt_number),
  FOREIGN KEY (scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
CREATE INDEX engineering_factory_results_work ON engineering_factory_results
  (scope_id,scope_kind,work_id,received_at DESC,id);
-- statement-breakpoint
CREATE TABLE engineering_factory_result_conflicts (
  id uuid PRIMARY KEY,
  scope_id text NOT NULL,
  scope_kind text NOT NULL,
  work_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  observed_envelope_digest text NOT NULL CHECK (observed_envelope_digest ~ '^[a-f0-9]{64}$'),
  observed_manifest_digest text NOT NULL CHECK (observed_manifest_digest ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(receipt_id,observed_envelope_digest),
  FOREIGN KEY(scope_id,scope_kind,work_id,receipt_id)
    REFERENCES engineering_factory_results(scope_id,scope_kind,work_id,id)
);
-- statement-breakpoint
-- One SQL call is the receive transaction even for Neon HTTP clients. An
-- operation ID is an idempotency key, never proof of authentication or scope.
CREATE FUNCTION engineering_factory_receive(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r engineering_factory_results%ROWTYPE; w engineering_work%ROWTYPE;
BEGIN
  IF p->>'scopeId' IS NULL OR p->>'scopeKind' IS NULL OR p->>'workId' IS NULL
    OR p->>'operationId' IS NULL OR p->>'manifestDigest' IS NULL
    OR p->>'signedEnvelopeDigest' IS NULL THEN RAISE EXCEPTION 'Incomplete Factory result receipt'; END IF;
  SELECT * INTO w FROM engineering_work WHERE scope_id=p->>'scopeId'
    AND scope_kind=p->>'scopeKind' AND id=(p->>'workId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factory result Work scope denied'; END IF;
  SELECT * INTO r FROM engineering_factory_results WHERE operation_id=p->>'operationId' FOR UPDATE;
  IF FOUND THEN
    IF r.scope_id<>w.scope_id OR r.scope_kind<>w.scope_kind OR r.work_id<>w.id
      THEN RAISE EXCEPTION 'Factory result Work scope denied'; END IF;
    IF r.manifest_digest<>p->>'manifestDigest' OR r.signed_envelope_digest<>p->>'signedEnvelopeDigest'
      OR r.factory_request_id<>(p->>'factoryRequestId')::uuid OR r.run_id<>(p->>'runId')::uuid
      OR r.attempt_number<>(p->>'attemptNumber')::integer THEN
      INSERT INTO engineering_factory_result_conflicts(id,scope_id,scope_kind,work_id,receipt_id,
        observed_envelope_digest,observed_manifest_digest,reason)
      VALUES ((p->>'receiptId')::uuid,w.scope_id,w.scope_kind,w.id,r.id,
        p->>'signedEnvelopeDigest',p->>'manifestDigest','same operation identity, different result')
      ON CONFLICT(receipt_id,observed_envelope_digest) DO NOTHING;
      RETURN jsonb_build_object('state','CONFLICT','receiptId',r.id,'reason','same operation identity, different result');
    END IF;
    RETURN jsonb_build_object('state',r.admission_state,'receiptId',r.id,'replay',true);
  END IF;
  INSERT INTO engineering_factory_results(id,scope_id,scope_kind,work_id,work_version,
    work_generation,criteria_version,agent_id,factory_request_id,factory_id,
    factory_source_commit,factory_source_tree,factory_configuration_digest,
    work_order_id,run_id,attempt_number,producer_status,protocol_version,
    signing_key_id,signing_key_version,operation_id,manifest_digest,
    candidate_commit,candidate_tree,evidence_manifest_digest,artifact_manifest_digest,
    signed_envelope,signed_envelope_digest,producer_issued_at,producer_completed_at)
  VALUES ((p->>'receiptId')::uuid,w.scope_id,w.scope_kind,w.id,(p->>'workVersion')::integer,
    (p->>'workGeneration')::integer,(p->>'criteriaVersion')::integer,p->>'agentId',
    (p->>'factoryRequestId')::uuid,p->>'factoryId',p->>'factorySourceCommit',
    p->>'factorySourceTree',p->>'factoryConfigurationDigest',(p->>'workOrderId')::uuid,
    (p->>'runId')::uuid,(p->>'attemptNumber')::integer,p->>'producerStatus',
    (p->>'protocolVersion')::integer,p->>'signingKeyId',p->>'signingKeyVersion',
    p->>'operationId',p->>'manifestDigest',p->>'candidateCommit',p->>'candidateTree',
    p->>'evidenceManifestDigest',p->>'artifactManifestDigest',p->>'signedEnvelope',
    p->>'signedEnvelopeDigest',nullif(p->>'producerIssuedAt','')::timestamptz,
    nullif(p->>'producerCompletedAt','')::timestamptz) RETURNING * INTO r;
  RETURN jsonb_build_object('state','RECEIVED','receiptId',r.id,'replay',false);
END $$;
-- statement-breakpoint
-- CAS stage transitions serialize with Work cancellation, takeover and
-- supersession. Stale, valid signed results remain historical provenance.
CREATE FUNCTION engineering_factory_advance(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r engineering_factory_results%ROWTYPE; w engineering_work%ROWTYPE;
 target text=p->>'target'; expected text=p->>'expected';
BEGIN
  SELECT * INTO w FROM engineering_work WHERE scope_id=p->>'scopeId'
    AND scope_kind=p->>'scopeKind' AND id=(p->>'workId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factory result Work scope denied'; END IF;
  SELECT * INTO r FROM engineering_factory_results WHERE id=(p->>'receiptId')::uuid
    AND scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factory result Work scope denied'; END IF;
  IF r.admission_state=target THEN RETURN jsonb_build_object('state',target,'replay',true); END IF;
  IF r.admission_state<>expected THEN RAISE EXCEPTION 'Factory result admission transition conflict'; END IF;
  IF NOT ((expected='RECEIVED' AND target IN ('AUTHENTICATED','REJECTED'))
    OR (expected='AUTHENTICATED' AND target IN ('ATTESTED','REJECTED'))
    OR (expected='ATTESTED' AND target IN ('INTEGRITY_VERIFIED','REJECTED'))
    OR (expected='INTEGRITY_VERIFIED' AND target IN ('ADMITTED','STALE','REJECTED')))
    THEN RAISE EXCEPTION 'Factory result admission transition denied'; END IF;
  IF target IN ('AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED')
    AND COALESCE(p->>'proofDigest','')<>r.signed_envelope_digest
    THEN RAISE EXCEPTION 'Factory result signed envelope proof mismatch'; END IF;
  IF target IN ('ATTESTED','INTEGRITY_VERIFIED','ADMITTED') AND NOT r.cryptographically_valid
    THEN RAISE EXCEPTION 'Unauthenticated Factory result cannot advance'; END IF;
  IF target='ADMITTED' AND (w.version<>r.work_version OR w.generation<>r.work_generation
    OR w.criteria_version<>r.criteria_version OR w.lifecycle<>'active' OR w.control<>'agent'
    OR EXISTS(SELECT 1 FROM engineering_factory_results newer
      WHERE newer.scope_id=w.scope_id AND newer.scope_kind=w.scope_kind AND newer.work_id=w.id
        AND ((newer.factory_request_id=r.factory_request_id AND newer.attempt_number>r.attempt_number)
          OR (newer.producer_issued_at>r.producer_issued_at AND newer.admission_state IN ('AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED')))))
    THEN target='STALE'; END IF;
  UPDATE engineering_factory_results SET admission_state=target,
    reason=CASE WHEN target IN ('REJECTED','STALE','CONFLICT') THEN COALESCE(p->>'reason','Work binding changed or newer attempt exists') ELSE NULL END,
    trust_status=CASE WHEN target='AUTHENTICATED' THEN p->>'trustStatus' ELSE trust_status END,
    cryptographically_valid=CASE WHEN target='AUTHENTICATED' THEN true ELSE cryptographically_valid END,
    updated_at=clock_timestamp() WHERE id=r.id;
  RETURN jsonb_build_object('state',target,'receiptId',r.id,'replay',false);
END $$;

-- statement-breakpoint
REVOKE EXECUTE ON FUNCTION engineering_factory_receive(jsonb) FROM PUBLIC;
-- statement-breakpoint
REVOKE EXECUTE ON FUNCTION engineering_factory_advance(jsonb) FROM PUBLIC;
