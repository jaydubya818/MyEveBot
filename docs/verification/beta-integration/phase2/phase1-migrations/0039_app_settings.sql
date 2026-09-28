-- Relay's owner dashboard reads settings before any write has occurred.
-- Fresh managed Eves therefore need this table in the schema, rather than
-- relying on the settings store's lazy create-on-first-use path.
CREATE TABLE IF NOT EXISTS app_settings (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
