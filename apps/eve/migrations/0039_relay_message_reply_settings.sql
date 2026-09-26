CREATE TABLE IF NOT EXISTS app_settings (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
