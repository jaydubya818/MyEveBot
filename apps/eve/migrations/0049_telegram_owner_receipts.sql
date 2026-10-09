-- The Telegram channel is still release-blocked. These owner-scoped receipts
-- make local qualification at-most-once across webhook retries and restarts.
CREATE TABLE telegram_owner_inbound_receipts (
  owner_id text NOT NULL,
  bot_id text NOT NULL,
  chat_id text NOT NULL,
  message_id text NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'DISPATCH_UNKNOWN'
    CHECK (status IN ('DISPATCH_UNKNOWN','TURN_STARTED','REPLY_UNKNOWN','REPLIED')),
  reply_text_hash text CHECK (reply_text_hash IS NULL OR reply_text_hash ~ '^sha256:[0-9a-f]{64}$'),
  provider_message_id text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id,bot_id,chat_id,message_id),
  CHECK (bot_id ~ '^[0-9]{6,20}$' AND chat_id ~ '^[1-9][0-9]{0,18}$' AND message_id ~ '^[1-9][0-9]{0,18}$'),
  CHECK ((status = 'REPLIED') = (provider_message_id IS NOT NULL)),
  CHECK ((status IN ('REPLY_UNKNOWN','REPLIED')) = (reply_text_hash IS NOT NULL))
);

-- statement-breakpoint
CREATE INDEX telegram_owner_receipts_unresolved
  ON telegram_owner_inbound_receipts(owner_id,updated_at)
  WHERE status IN ('DISPATCH_UNKNOWN','TURN_STARTED','REPLY_UNKNOWN');
