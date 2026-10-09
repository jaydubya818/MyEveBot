-- One outgoing message may authorize at most one approval-free incoming reply.
-- The claim remains after content expiry so a later request cannot reuse it.
CREATE TABLE myeve_relay_reply_claims (
  owner_id text NOT NULL,
  parent_request_id text NOT NULL,
  reply_request_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, parent_request_id),
  UNIQUE (owner_id, reply_request_id),
  FOREIGN KEY (owner_id, parent_request_id)
    REFERENCES myeve_relay_requests (owner_id, request_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_id, reply_request_id)
    REFERENCES myeve_relay_requests (owner_id, request_id) ON DELETE RESTRICT
);
