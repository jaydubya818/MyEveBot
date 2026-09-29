CREATE TABLE myeve_relay_message_delegations (
  owner_id text NOT NULL REFERENCES myeve_relay_connections(owner_id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  grantee_owner_id text NOT NULL,
  grantee_agent_id text NOT NULL,
  relay_delegation_id text NOT NULL,
  credential_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, agent_id, grantee_owner_id, grantee_agent_id)
);
