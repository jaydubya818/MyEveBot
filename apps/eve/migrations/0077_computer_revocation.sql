-- Immutable revocation is scoped to the exact pairing. A new token is a new pairing.
CREATE TABLE local_computer_revocations (
  owner_id text NOT NULL,
  device_id text NOT NULL,
  pairing_hash text NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, device_id, pairing_hash)
);
