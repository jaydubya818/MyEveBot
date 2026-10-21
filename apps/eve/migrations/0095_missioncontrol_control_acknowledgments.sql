-- Delivery receipts never replace a denying fence or settle accounting.
CREATE TABLE missioncontrol_control_acknowledgments (
 owner_id text NOT NULL,permit_id text NOT NULL,sequence integer NOT NULL,
 control_digest text NOT NULL CHECK(control_digest ~ '^[a-f0-9]{64}$'),
 cleanup text NOT NULL CHECK(cleanup IN('PENDING_BACKEND','CONFIRMED')),
 response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,permit_id,sequence,cleanup),
 FOREIGN KEY(owner_id,permit_id,sequence) REFERENCES missioncontrol_permit_controls(owner_id,permit_id,sequence)
);
-- statement-breakpoint
ALTER TABLE missioncontrol_control_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE missioncontrol_control_acknowledgments FORCE ROW LEVEL SECURITY;
CREATE POLICY missioncontrol_owner ON missioncontrol_control_acknowledgments
 USING(owner_id=current_setting('myeve.missioncontrol_owner',true))
 WITH CHECK(owner_id=current_setting('myeve.missioncontrol_owner',true));
REVOKE ALL ON missioncontrol_control_acknowledgments FROM PUBLIC;
CREATE TRIGGER missioncontrol_acknowledgment_guard BEFORE UPDATE OR DELETE ON missioncontrol_control_acknowledgments
 FOR EACH ROW EXECUTE FUNCTION missioncontrol_binding_guard();
