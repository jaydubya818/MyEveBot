-- Reconciled after Federation 0027; depends only on task_runs (0002) and
-- action_requests (0023). No Federation table or execution dependency.
-- One terminal email action per initial follow-up Routine. Payload is private
-- owner data, like its saved conversation; never exposed by the Actions API.
CREATE TABLE routine_pending_sends (
  owner_id text NOT NULL,
  run_id text NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  action_id text NOT NULL REFERENCES action_requests(id) ON DELETE CASCADE,
  request jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,run_id),
  UNIQUE(action_id)
);
