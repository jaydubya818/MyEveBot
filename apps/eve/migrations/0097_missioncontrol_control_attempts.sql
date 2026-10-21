-- Scheduling observations only: never authority, cleanup proof, or accounting.
CREATE TABLE missioncontrol_control_attempts (
 owner_id text NOT NULL, permit_id text NOT NULL,
 attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,permit_id),
 FOREIGN KEY(owner_id,permit_id) REFERENCES missioncontrol_execution_permits(owner_id,permit_id)
);
ALTER TABLE missioncontrol_control_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE missioncontrol_control_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY missioncontrol_owner ON missioncontrol_control_attempts
 USING(owner_id=current_setting('myeve.missioncontrol_owner',true))
 WITH CHECK(owner_id=current_setting('myeve.missioncontrol_owner',true));
REVOKE ALL ON missioncontrol_control_attempts FROM PUBLIC;
