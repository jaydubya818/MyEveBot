-- UNNUMBERED CANDIDATE: local qualification only. Not discovered by db:migrate.
-- Apply in one transaction after canonical schema ownership approves integration.
CREATE TABLE inbox_attention_items (
  owner_id text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
  status text GENERATED ALWAYS AS (data->>'status') STORED NOT NULL,
  kind text GENERATED ALWAYS AS (data->>'kind') STORED NOT NULL,
  needs_action integer GENERATED ALWAYS AS (CASE WHEN data->>'status'='NEEDS_ACTION'
    AND data#>>'{action,involvement}'='NECESSARY_JUDGMENT' AND data#>>'{action,reason}'<>'internal_coordination' THEN 1 ELSE 0 END) STORED,
  expires_at text GENERATED ALWAYS AS (data#>>'{action,expiresAt}') STORED,
  score integer GENERATED ALWAYS AS ((data->>'priorityScore')::integer) STORED NOT NULL,
  deadline text GENERATED ALWAYS AS (coalesce(data#>>'{priority,deadlineAt}','9999')) STORED NOT NULL,
  PRIMARY KEY(owner_id,id),
  CHECK (jsonb_typeof(data)='object' AND (data->>'version') IS NOT DISTINCT FROM 'myeve.attention.v1'),
  CHECK ((data->>'ownerId') IS NOT DISTINCT FROM owner_id AND (data->>'id') IS NOT DISTINCT FROM id),
  CHECK (status IN ('NEW','SEEN','NEEDS_ACTION','WAITING','RESOLVED','DISMISSED','SUPERSEDED')),
  CHECK (kind IN ('MESSAGE','REQUEST','DECISION','APPROVAL','BLOCKER','FOLLOW_UP','REMINDER','RESULT','EXCEPTION')),
  CHECK ((data->>'revision')::bigint>0 AND (data->>'episode')::integer>0),
  CHECK (data ?& ARRAY['correlationId','workId','workGeneration','workVersion','source','createdAt','updatedAt','action','actionBinding']),
  CHECK (data->'workGeneration'='null'::jsonb OR data->'workId'<>'null'::jsonb),
  CHECK (status<>'NEEDS_ACTION' OR (data->'action'<>'null'::jsonb AND data->>'actionBinding' ~ '^[0-9a-f]{64}$')),
  CHECK ((data->>'createdAt')::timestamptz IS NOT NULL AND (data->>'updatedAt')::timestamptz IS NOT NULL),
  CHECK (status<>'RESOLVED' OR (data->>'resolvedAt')::timestamptz IS NOT NULL),
  CHECK (status<>'SUPERSEDED' OR (data->>'supersededAt')::timestamptz IS NOT NULL)
);
CREATE UNIQUE INDEX inbox_episode_identity ON inbox_attention_items(owner_id,(data->>'correlationId'),((data->>'episode')::integer));
CREATE INDEX inbox_page ON inbox_attention_items(owner_id,score DESC,deadline,id);
CREATE INDEX inbox_needs_you ON inbox_attention_items(owner_id,needs_action,score DESC,deadline,id);
CREATE INDEX inbox_work_thread ON inbox_attention_items(owner_id,(data->>'workId'),score DESC,deadline,id);
CREATE INDEX inbox_correlation_thread ON inbox_attention_items(owner_id,(data->>'correlationId'),score DESC,deadline,id);
CREATE INDEX inbox_resolved_window ON inbox_attention_items(owner_id,(data->>'resolvedAt')) WHERE status='RESOLVED';
CREATE INDEX inbox_replies_window ON inbox_attention_items(owner_id,(data->>'lastExternalReplyAt'));
CREATE INDEX inbox_followup_due ON inbox_attention_items(owner_id,(data->>'followUpAt')) WHERE status='WAITING';
CREATE INDEX inbox_action_window ON inbox_attention_items(owner_id,(data->>'actionRequiredAt')) WHERE needs_action=1;
CREATE TABLE inbox_attention_evidence (
  owner_id text NOT NULL, id text NOT NULL, item_id text NOT NULL, data jsonb NOT NULL,
  system text GENERATED ALWAYS AS (data#>>'{event,source,system}') STORED NOT NULL,
  account_id text GENERATED ALWAYS AS (data#>>'{event,source,accountId}') STORED NOT NULL,
  event_id text GENERATED ALWAYS AS (data#>>'{event,source,eventId}') STORED NOT NULL,
  PRIMARY KEY(owner_id,id), UNIQUE(owner_id,system,account_id,event_id),
  FOREIGN KEY(owner_id,item_id) REFERENCES inbox_attention_items(owner_id,id),
  CHECK ((data->>'ownerId') IS NOT DISTINCT FROM owner_id AND (data->>'id') IS NOT DISTINCT FROM id AND (data->>'itemId') IS NOT DISTINCT FROM item_id),
  CHECK (data->>'digest' ~ '^[0-9a-f]{64}$' AND (data->>'deliveries')::bigint>0)
);
CREATE INDEX inbox_evidence_page ON inbox_attention_evidence(owner_id,item_id,id);
CREATE TABLE inbox_attention_responses (
  owner_id text NOT NULL, id text NOT NULL, item_id text NOT NULL, data jsonb NOT NULL,
  status text GENERATED ALWAYS AS (data->>'status') STORED NOT NULL,
  PRIMARY KEY(owner_id,id), UNIQUE(owner_id,item_id),
  FOREIGN KEY(owner_id,item_id) REFERENCES inbox_attention_items(owner_id,id),
  CHECK ((data->>'ownerId') IS NOT DISTINCT FROM owner_id AND (data->>'id') IS NOT DISTINCT FROM id AND (data->>'itemId') IS NOT DISTINCT FROM item_id),
  CHECK (status IN ('PENDING','DELIVERED','CANCELLED','STALE')),
  CHECK (data ?& ARRAY['workId','workGeneration','workVersion','correlationId','episode','goal','actionBinding','answer','createdAt']),
  CHECK (data->>'actionBinding' ~ '^[0-9a-f]{64}$')
);
CREATE INDEX inbox_response_pending ON inbox_attention_responses(owner_id,status,id);
CREATE FUNCTION inbox_guard_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='inbox_attention_evidence' THEN
    IF OLD.data-'deliveries' IS DISTINCT FROM NEW.data-'deliveries' OR (NEW.data->>'deliveries')::bigint<(OLD.data->>'deliveries')::bigint THEN
      RAISE EXCEPTION 'Immutable source evidence'; END IF;
  ELSIF TG_TABLE_NAME='inbox_attention_responses' THEN
    IF OLD.data-ARRAY['status','receipt'] IS DISTINCT FROM NEW.data-ARRAY['status','receipt'] OR
      (OLD.status<>'PENDING' AND OLD.data IS DISTINCT FROM NEW.data) THEN RAISE EXCEPTION 'Immutable owner response'; END IF;
  ELSE
    IF OLD.data->>'correlationId' IS DISTINCT FROM NEW.data->>'correlationId' OR OLD.data->>'episode' IS DISTINCT FROM NEW.data->>'episode' OR
      (OLD.status IN ('RESOLVED','DISMISSED','SUPERSEDED') AND OLD.status<>NEW.data->>'status') OR
      (OLD.data->>'workId' IS NOT NULL AND OLD.data->>'workId' IS DISTINCT FROM NEW.data->>'workId') OR
      (OLD.data->>'workGeneration' IS NOT NULL AND (OLD.data->'workGeneration' IS DISTINCT FROM NEW.data->'workGeneration' OR OLD.data->'workVersion' IS DISTINCT FROM NEW.data->'workVersion')) OR
      (OLD.data IS DISTINCT FROM NEW.data AND (NEW.data->>'revision')::bigint <= (OLD.data->>'revision')::bigint)
      THEN RAISE EXCEPTION 'Stale or redirected attention state'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inbox_item_history BEFORE UPDATE ON inbox_attention_items FOR EACH ROW EXECUTE FUNCTION inbox_guard_history();
CREATE TRIGGER inbox_evidence_history BEFORE UPDATE ON inbox_attention_evidence FOR EACH ROW EXECUTE FUNCTION inbox_guard_history();
CREATE TRIGGER inbox_response_history BEFORE UPDATE ON inbox_attention_responses FOR EACH ROW EXECUTE FUNCTION inbox_guard_history();
ALTER TABLE inbox_attention_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_items FORCE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_attention_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY inbox_item_owner ON inbox_attention_items USING (owner_id=current_setting('myeve.inbox_owner',true)) WITH CHECK (owner_id=current_setting('myeve.inbox_owner',true));
CREATE POLICY inbox_evidence_owner ON inbox_attention_evidence USING (owner_id=current_setting('myeve.inbox_owner',true)) WITH CHECK (owner_id=current_setting('myeve.inbox_owner',true));
CREATE POLICY inbox_response_owner ON inbox_attention_responses USING (owner_id=current_setting('myeve.inbox_owner',true)) WITH CHECK (owner_id=current_setting('myeve.inbox_owner',true));
REVOKE ALL ON inbox_attention_items,inbox_attention_evidence,inbox_attention_responses FROM PUBLIC;
REVOKE ALL ON FUNCTION inbox_guard_history() FROM PUBLIC;
-- DBA grants SELECT,INSERT,UPDATE only to a non-owner, NOSUPERUSER NOBYPASSRLS runtime role.
-- Runtime receives no CREATE, DELETE, TRUNCATE, role membership or canonical Work/approval table privileges.
