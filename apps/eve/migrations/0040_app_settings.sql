-- Relay reads reply policy directly so database failures cannot silently disable
-- replies. Fresh installations must not depend on a different screen lazily
-- creating this shared table first. Match the existing settings store schema.
CREATE TABLE IF NOT EXISTS app_settings (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
