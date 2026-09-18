ALTER TABLE computer_control_leases
  ADD COLUMN IF NOT EXISTS owner_input_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_input_in_flight integer NOT NULL DEFAULT 0;

-- statement-breakpoint
ALTER TABLE computer_control_leases
  DROP CONSTRAINT IF EXISTS computer_control_leases_owner_input_in_flight_check;

-- statement-breakpoint
ALTER TABLE computer_control_leases
  ADD CONSTRAINT computer_control_leases_owner_input_in_flight_check
  CHECK (owner_input_in_flight >= 0);

-- statement-breakpoint
ALTER TABLE computer_control_leases
  DROP CONSTRAINT IF EXISTS computer_control_leases_owner_input_enabled_check;

-- statement-breakpoint
ALTER TABLE computer_control_leases
  ADD CONSTRAINT computer_control_leases_owner_input_enabled_check
  CHECK (NOT owner_input_enabled OR controller = 'OWNER');

-- statement-breakpoint
ALTER TABLE computer_sessions DROP CONSTRAINT IF EXISTS computer_sessions_status_check;

-- statement-breakpoint
ALTER TABLE computer_sessions ADD CONSTRAINT computer_sessions_status_check CHECK (
  status IN ('provisioning','ready','running','paused','completed','failed','lost','expired','stopped')
);

-- statement-breakpoint
ALTER TABLE computer_sessions DROP CONSTRAINT IF EXISTS computer_sessions_check;

-- statement-breakpoint
ALTER TABLE computer_sessions ADD CONSTRAINT computer_sessions_check CHECK (
  (status IN ('completed','failed','lost','expired','stopped')) = (completed_at IS NOT NULL)
);

-- statement-breakpoint
ALTER TABLE computer_sessions DROP CONSTRAINT IF EXISTS computer_sessions_check1;

-- statement-breakpoint
ALTER TABLE computer_sessions ADD CONSTRAINT computer_sessions_check1 CHECK (
  (status IN ('failed','lost')) = (failure_code IS NOT NULL)
);

-- statement-breakpoint
ALTER TABLE browser_sessions DROP CONSTRAINT IF EXISTS browser_sessions_status_check;

-- statement-breakpoint
ALTER TABLE browser_sessions ADD CONSTRAINT browser_sessions_status_check CHECK (
  status IN ('ready','running','paused','completed','failed','lost','expired','stopped')
);
