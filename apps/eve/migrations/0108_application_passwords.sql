-- Additive only: existing owners, sessions and application data are unchanged.
CREATE TABLE web_password_credentials (
  installation_id text NOT NULL,
  owner_id text NOT NULL,
  password_hash text NOT NULL,
  password_fingerprint text NOT NULL CHECK (password_fingerprint ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (installation_id, owner_id),
  UNIQUE (installation_id, password_fingerprint)
);

CREATE TABLE web_password_resets (
  installation_id text NOT NULL,
  owner_id text NOT NULL,
  token_hash text NOT NULL,
  credential_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (installation_id, token_hash),
  UNIQUE (installation_id, owner_id),
  FOREIGN KEY (installation_id, owner_id)
    REFERENCES web_password_credentials (installation_id, owner_id) ON DELETE CASCADE
);

CREATE TABLE web_auth_attempts (
  installation_id text NOT NULL,
  scope text NOT NULL,
  key_hash text NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (installation_id, scope, key_hash)
);
CREATE INDEX web_auth_attempts_expiry ON web_auth_attempts (expires_at);
