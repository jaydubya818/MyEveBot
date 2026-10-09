-- Session cookies stay client-side; only irreversible hashes are retained here.
-- Applied by the explicit operator runner, never by login/logout or a build.
CREATE TABLE web_session_revocations (
  owner_id text NOT NULL,
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, token_sha256)
);
CREATE INDEX web_session_revocations_expiry ON web_session_revocations (expires_at);
