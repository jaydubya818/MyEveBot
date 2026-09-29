-- UNNUMBERED INTEGRATION PROPOSAL. Apply only through the canonical migration
-- owner after allocation. This file is used directly ONLY in disposable tests.
CREATE TABLE recall_learning (
  owner_id text NOT NULL,
  id text NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  repository text NOT NULL CHECK (repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  work_type text NOT NULL CHECK (work_type IN ('research','implementation','review')),
  scope_kind text NOT NULL DEFAULT 'personal' CHECK (scope_kind='personal'),
  work_id uuid,
  revision integer NOT NULL CHECK (revision > 0),
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id),
  CHECK (jsonb_typeof(document)='object' AND document ?& ARRAY['id','revision','scope','versions','events']),
  CHECK ((document->>'id'=id AND (document->>'revision')::integer=revision) IS TRUE),
  CHECK (document->'scope' ?& ARRAY['ownerId','repository','workType','workId']),
  CHECK ((document->'scope'->>'ownerId'=owner_id AND document->'scope'->>'repository'=repository AND document->'scope'->>'workType'=work_type) IS TRUE),
  CHECK ((document->'scope'->>'workId') IS NOT DISTINCT FROM work_id::text),
  CHECK (jsonb_typeof(document->'versions')='array' AND jsonb_array_length(document->'versions') BETWEEN 1 AND 40),
  CHECK (jsonb_typeof(document->'events')='array' AND jsonb_array_length(document->'events') BETWEEN 1 AND 400)
);
CREATE INDEX recall_learning_scope ON recall_learning(owner_id,repository,work_type,work_id);
CREATE TABLE recall_learning_events (
  owner_id text NOT NULL,
  event_id uuid NOT NULL,
  family_id text NOT NULL,
  PRIMARY KEY(owner_id,event_id),
  FOREIGN KEY(owner_id,family_id) REFERENCES recall_learning(owner_id,id)
);
CREATE TABLE recall_learning_uses (
  owner_id text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'personal' CHECK (scope_kind='personal'),
  work_id uuid NOT NULL,
  family_id text NOT NULL,
  version integer NOT NULL CHECK (version>0),
  candidate_hash text NOT NULL CHECK (candidate_hash ~ '^[a-f0-9]{64}$'),
  context_ref text NOT NULL CHECK (length(context_ref) BETWEEN 1 AND 255),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,work_id,family_id,version,context_ref),
  FOREIGN KEY(owner_id,family_id) REFERENCES recall_learning(owner_id,id),
  FOREIGN KEY(owner_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
CREATE INDEX recall_learning_uses_work ON recall_learning_uses(owner_id,work_id,recorded_at DESC);

CREATE FUNCTION recall_validate_family() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v jsonb; e jsonb; previous jsonb; n integer:=0; active_count integer:=0; evidence_count integer:=0;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.owner_id<>OLD.owner_id OR NEW.id<>OLD.id OR NEW.repository<>OLD.repository OR NEW.work_type<>OLD.work_type
       OR NEW.work_id IS DISTINCT FROM OLD.work_id OR NEW.revision<>OLD.revision+1
       OR jsonb_array_length(NEW.document->'versions')<jsonb_array_length(OLD.document->'versions')
       OR jsonb_array_length(NEW.document->'events')<=jsonb_array_length(OLD.document->'events') THEN
      RAISE EXCEPTION 'learning scope, version history and revision are immutable';
    END IF;
    FOR n IN 0..jsonb_array_length(OLD.document->'events')-1 LOOP
      IF NEW.document->'events'->n IS DISTINCT FROM OLD.document->'events'->n THEN RAISE EXCEPTION 'event history changed'; END IF;
    END LOOP;
  END IF;
  n:=0;
  FOR v IN SELECT value FROM jsonb_array_elements(NEW.document->'versions') LOOP
    n:=n+1;
    IF NOT (v ?& ARRAY['version','behavior','status','hash','evidence','evaluation','reason','correctionOf','createdAt'])
       OR (v->>'version')::integer IS DISTINCT FROM n OR coalesce(v->>'hash','') !~ '^[a-f0-9]{64}$'
       OR coalesce(v->>'behavior','') NOT IN ('cite_sources','state_uncertainty')
       OR coalesce(v->>'status','') NOT IN ('CANDIDATE','EVALUATING','PROMOTED','REJECTED','SUPERSEDED','ROLLED_BACK')
       OR jsonb_typeof(v->'evidence')<>'array' OR jsonb_array_length(v->'evidence')=0 THEN RAISE EXCEPTION 'invalid learning version'; END IF;
    IF TG_OP='UPDATE' AND n<=jsonb_array_length(OLD.document->'versions') THEN
      previous:=OLD.document->'versions'->(n-1);
      IF (v-'status'-'reason'-'evaluation'-'evidence') IS DISTINCT FROM (previous-'status'-'reason'-'evaluation'-'evidence') THEN RAISE EXCEPTION 'version identity changed'; END IF;
      IF previous->'evaluation'<>'null'::jsonb AND (v->'evaluation' IS DISTINCT FROM previous->'evaluation' OR v->'evidence' IS DISTINCT FROM previous->'evidence') THEN RAISE EXCEPTION 'qualified evidence changed'; END IF;
      IF jsonb_array_length(v->'evidence')<jsonb_array_length(previous->'evidence') THEN RAISE EXCEPTION 'evidence removed'; END IF;
      IF NOT ((v->'evidence') @> (previous->'evidence')) THEN RAISE EXCEPTION 'evidence changed'; END IF;
    END IF;
    IF v->>'status'='PROMOTED' THEN
      active_count:=active_count+1;
      IF v->'evaluation'->>'result' IS DISTINCT FROM 'PASS' OR v->'evaluation'->>'candidateHash' IS DISTINCT FROM v->>'hash' THEN RAISE EXCEPTION 'promotion lacks exact evaluation'; END IF;
    END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(v->'evidence') LOOP
      evidence_count:=evidence_count+1;
      IF e->>'actorId' IS DISTINCT FROM NEW.owner_id OR e->>'provenance' IS DISTINCT FROM 'authenticated_owner_feedback' OR
        NOT EXISTS(SELECT 1 FROM engineering_work w WHERE w.scope_id=NEW.owner_id AND w.scope_kind='personal'
          AND w.id=(e->>'workId')::uuid AND w.repository=NEW.repository AND w.version >= (e->>'workVersion')::integer
          AND (NEW.work_id IS NULL OR NEW.work_id=w.id)) THEN RAISE EXCEPTION 'feedback provenance scope mismatch'; END IF;
    END LOOP;
  END LOOP;
  IF active_count>1 OR evidence_count>100 THEN RAISE EXCEPTION 'learning active/evidence limit'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recall_family_integrity BEFORE INSERT OR UPDATE ON recall_learning FOR EACH ROW EXECUTE FUNCTION recall_validate_family();

CREATE FUNCTION recall_claim_events() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e jsonb; claimed text;
BEGIN
  FOR e IN SELECT value FROM jsonb_array_elements(NEW.document->'events') LOOP
    IF e->>'actorId' IS DISTINCT FROM NEW.owner_id THEN RAISE EXCEPTION 'event owner mismatch'; END IF;
    INSERT INTO recall_learning_events(owner_id,event_id,family_id) VALUES(NEW.owner_id,(e->>'id')::uuid,NEW.id) ON CONFLICT DO NOTHING;
    SELECT family_id INTO claimed FROM recall_learning_events WHERE owner_id=NEW.owner_id AND event_id=(e->>'id')::uuid;
    IF claimed IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'event identity already belongs to another scope'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER recall_event_identity AFTER INSERT OR UPDATE ON recall_learning FOR EACH ROW EXECUTE FUNCTION recall_claim_events();

CREATE FUNCTION recall_validate_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM recall_learning l JOIN engineering_work w ON w.scope_id=l.owner_id AND w.scope_kind='personal' AND w.id=NEW.work_id,
    jsonb_array_elements(l.document->'versions') v
    WHERE l.owner_id=NEW.owner_id AND l.id=NEW.family_id AND w.repository=l.repository AND (l.work_id IS NULL OR l.work_id=w.id)
      AND (v->>'version')::integer=NEW.version AND v->>'hash'=NEW.candidate_hash AND v->>'status'='PROMOTED')
    THEN RAISE EXCEPTION 'usage scope or active version mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recall_use_integrity BEFORE INSERT ON recall_learning_uses FOR EACH ROW EXECUTE FUNCTION recall_validate_use();

-- No ambient permissions. Restricted SQL readers see only a role-bound owner.
-- The existing trusted application connection retains application-level scope
-- checks; no user-controlled session variable is treated as an owner grant.
REVOKE ALL ON recall_learning,recall_learning_events,recall_learning_uses FROM PUBLIC;
ALTER TABLE recall_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_learning_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY recall_owner_read ON recall_learning FOR SELECT USING(owner_id=current_user);
CREATE POLICY recall_events_owner_read ON recall_learning_events FOR SELECT USING(owner_id=current_user);
CREATE POLICY recall_uses_owner_read ON recall_learning_uses FOR SELECT USING(owner_id=current_user);
REVOKE ALL ON FUNCTION recall_validate_family(),recall_claim_events(),recall_validate_use() FROM PUBLIC;
