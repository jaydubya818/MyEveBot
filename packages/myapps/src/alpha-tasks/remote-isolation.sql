-- Dormant host-local delivery custody. Never apply to a canonical application database.
-- No approvals, app state, spending, enrollment or execution grants are stored here.
CREATE TABLE myapps_remote_delivery (
  owner_id text NOT NULL,
  installation_id text NOT NULL,
  host_id text NOT NULL,
  operation_id uuid NOT NULL,
  command_digest text NOT NULL,
  binding_digest text NOT NULL,
  outcome jsonb,
  fence_requested boolean NOT NULL DEFAULT false,
  fence_confirmed boolean NOT NULL DEFAULT false,
  cleanup_confirmed boolean NOT NULL DEFAULT false,
  PRIMARY KEY(owner_id, installation_id, host_id, operation_id),
  CHECK (NOT cleanup_confirmed OR fence_confirmed)
);
