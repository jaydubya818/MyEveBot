-- Additive only: no existing table, column, index or row is changed.
-- Hosted private beta: the outbound-only Factory mailbox (hosted/MAILBOX-CONTRACT.md v1), Mac-side static builds and private verified previews.

-- One poller credential per installation. Only its sha256 is stored; the credential itself lives on the owner's Mac (0600).
CREATE TABLE factory_mailbox_pollers (
  installation_id text PRIMARY KEY CHECK (length(installation_id) BETWEEN 1 AND 160),
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 160),
  credential_sha256 text NOT NULL UNIQUE CHECK (credential_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Transport envelopes. The mailbox is untrusted: every end-to-end signature is verified by the endpoints, never here.
-- A request is leased at most once (QUEUED -> LEASED -> ANSWERED); it never returns to QUEUED, so nothing is ever resent.
CREATE TABLE factory_mailbox_requests (
  id uuid PRIMARY KEY,
  installation_id text NOT NULL REFERENCES factory_mailbox_pollers (installation_id),
  owner_id text NOT NULL,
  target text NOT NULL CHECK (target IN ('factory', 'verifier')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  method text NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 2048 AND left(path, 1) = '/'),
  headers jsonb NOT NULL,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
  body_base64 text NOT NULL CHECK (length(body_base64) <= 1398104),
  state text NOT NULL CHECK (state IN ('QUEUED', 'LEASED', 'ANSWERED')),
  leased_at timestamptz,
  lease_id text UNIQUE CHECK (lease_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  lease_expires_at timestamptz,
  response_status integer CHECK (response_status BETWEEN 100 AND 599),
  response_headers jsonb,
  response_body_sha256 text CHECK (response_body_sha256 ~ '^[a-f0-9]{64}$'),
  response_body_base64 text CHECK (length(response_body_base64) <= 1398104),
  answered_at timestamptz,
  CHECK (deadline > created_at AND deadline <= created_at + interval '1 hour'),
  CHECK ((state = 'QUEUED') = (leased_at IS NULL AND lease_id IS NULL)),
  CHECK ((state = 'ANSWERED') = (answered_at IS NOT NULL AND response_status IS NOT NULL))
);
CREATE INDEX factory_mailbox_requests_queue ON factory_mailbox_requests (installation_id, state, created_at);
CREATE INDEX factory_mailbox_requests_deadline ON factory_mailbox_requests (deadline);

-- Private verified previews: the signed PASS verdict and the release manifest it binds. File bytes live in a PRIVATE Blob store,
-- content-addressed by sha256; serving re-verifies the verdict, the manifest digest and each file's sha256 on every response.
CREATE TABLE hosted_verified_previews (
  installation_id text NOT NULL REFERENCES factory_mailbox_pollers (installation_id),
  owner_id text NOT NULL,
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  verdict jsonb NOT NULL,
  verdict_sha256 text NOT NULL CHECK (verdict_sha256 ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('UPLOADING', 'READY')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  PRIMARY KEY (installation_id, artifact_sha256),
  CHECK ((state = 'READY') = (ready_at IS NOT NULL))
);
CREATE INDEX hosted_verified_previews_owner ON hosted_verified_previews (owner_id, verdict_sha256);

-- Mac-side static builds. Hosted MyEve never builds: it records the accepted stage-3 candidate and the EXPECTED build binding it derives
-- from its own retained admission (REQUESTED); the Mac builds, signs the build claim with its Mac-only issuer key, stages the bytes to its
-- local verifier and uploads inventory, claim and bytes (private Blob, content-addressed). Hosted re-retains the bytes and verifies the
-- claim against the expected binding and the pinned issuer before the row becomes VERIFIED.
CREATE TABLE hosted_mac_builds (
  installation_id text NOT NULL REFERENCES factory_mailbox_pollers (installation_id),
  owner_id text NOT NULL,
  candidate_commit text NOT NULL CHECK (candidate_commit ~ '^[a-f0-9]{40}$'),
  candidate_tree text NOT NULL CHECK (candidate_tree ~ '^[a-f0-9]{40}$'),
  request jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('REQUESTED', 'UPLOADING', 'VERIFIED')),
  submission jsonb,
  artifact_sha256 text CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  PRIMARY KEY (installation_id, candidate_commit, candidate_tree),
  CHECK ((state = 'REQUESTED') = (submission IS NULL)),
  CHECK ((state = 'VERIFIED') = (verified_at IS NOT NULL AND artifact_sha256 IS NOT NULL))
);
