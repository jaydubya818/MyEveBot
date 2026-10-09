CREATE TABLE IF NOT EXISTS web_chat_threads (
  id text PRIMARY KEY,
  title text NOT NULL,
  updated_at bigint NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  renamed boolean NOT NULL DEFAULT false,
  origin text NOT NULL DEFAULT 'web',
  chat jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- statement-breakpoint
ALTER TABLE web_chat_threads
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- statement-breakpoint
ALTER TABLE web_chat_threads
  ADD COLUMN IF NOT EXISTS renamed boolean NOT NULL DEFAULT false;

-- statement-breakpoint
ALTER TABLE web_chat_threads
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'web';

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reminders (
  id serial PRIMARY KEY,
  prompt text NOT NULL,
  cron text,
  timezone text NOT NULL,
  next_fire_at timestamptz NOT NULL,
  chat_id text,
  status text NOT NULL DEFAULT 'active',
  claimed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS webhooks (
  id text PRIMARY KEY,
  secret text NOT NULL,
  name text NOT NULL,
  prompt text NOT NULL,
  chat_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz,
  fire_count integer NOT NULL DEFAULT 0
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS automation_runs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  automation_id text NOT NULL,
  fired_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  error text,
  thread_id text
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS automation_runs_by_automation
  ON automation_runs (kind, automation_id, fired_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS receipts (
  id bigserial PRIMARY KEY,
  merchant text NOT NULL,
  total_cents bigint NOT NULL,
  currency text NOT NULL,
  category text NOT NULL,
  purchased_at date NOT NULL,
  items jsonb,
  notes text,
  logged_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS receipts_by_purchase_date
  ON receipts (purchased_at DESC, id DESC);
