CREATE TABLE IF NOT EXISTS agentphone_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  number_id text,
  phone_number text,
  agent_id text,
  webhook_secret text,
  owner_number text,
  operational_enabled boolean NOT NULL DEFAULT false,
  daily_message_limit integer NOT NULL DEFAULT 25 CHECK (daily_message_limit BETWEEN 1 AND 500),
  daily_call_limit integer NOT NULL DEFAULT 5 CHECK (daily_call_limit BETWEEN 1 AND 50),
  quiet_hours_start smallint NOT NULL DEFAULT 21 CHECK (quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end smallint NOT NULL DEFAULT 8 CHECK (quiet_hours_end BETWEEN 0 AND 23),
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  usage_day date NOT NULL DEFAULT CURRENT_DATE,
  message_segments_used integer NOT NULL DEFAULT 0 CHECK (message_segments_used >= 0),
  calls_used integer NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS owner_number text;
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS operational_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS daily_message_limit integer NOT NULL DEFAULT 25;
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS daily_call_limit integer NOT NULL DEFAULT 5;
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS quiet_hours_start smallint NOT NULL DEFAULT 21;
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS quiet_hours_end smallint NOT NULL DEFAULT 8;
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Los_Angeles';
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS usage_day date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS message_segments_used integer NOT NULL DEFAULT 0;
ALTER TABLE agentphone_config ADD COLUMN IF NOT EXISTS calls_used integer NOT NULL DEFAULT 0;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS agentphone_contact_policy (
  phone_number text PRIMARY KEY,
  consent_status text NOT NULL CHECK (consent_status IN ('allowed', 'blocked')),
  consent_source text NOT NULL,
  first_outbound_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS agentphone_usage_event (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('message_segment', 'call')),
  recipient text NOT NULL,
  units integer NOT NULL CHECK (units > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS agentphone_usage_event_created
  ON agentphone_usage_event (created_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS agentphone_inbound (
  message_id text PRIMARY KEY,
  conversation_id text NOT NULL,
  sender text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'claimed',
  error text,
  text text
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS agentphone_call (
  call_id text PRIMARY KEY,
  cursor integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
