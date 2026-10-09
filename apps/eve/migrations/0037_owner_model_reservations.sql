-- Durable reservations extend the admitted canonical Run budget; not a billing system.
ALTER TABLE owner_channel_requests
 ADD COLUMN model_reserved_microusd bigint NOT NULL DEFAULT 0 CHECK(model_reserved_microusd>=0),
 ADD COLUMN model_spent_microusd bigint NOT NULL DEFAULT 0 CHECK(model_spent_microusd>=0),
 ADD COLUMN tokens_reserved integer NOT NULL DEFAULT 0 CHECK(tokens_reserved>=0),
 ADD COLUMN model_calls_started integer NOT NULL DEFAULT 0 CHECK(model_calls_started>=0),
 ADD COLUMN tools_requested integer NOT NULL DEFAULT 0 CHECK(tools_requested BETWEEN 0 AND 12);
-- statement-breakpoint
CREATE TABLE owner_model_calls (
 owner_id text NOT NULL,
 run_id text NOT NULL,
 step_key text NOT NULL,
 request_hash text NOT NULL,
 model_id text NOT NULL,
 reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0),
 reserved_tokens integer NOT NULL CHECK(reserved_tokens>0),
 status text NOT NULL CHECK(status IN ('inflight','completed','unknown')),
 spent_microusd bigint,
 used_tokens integer,
 result jsonb,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(owner_id,run_id,step_key),
 FOREIGN KEY(owner_id,run_id) REFERENCES owner_channel_requests(owner_id,run_id)
);
