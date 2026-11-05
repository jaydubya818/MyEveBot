-- Owner-local private beta ONLY (myeve.private-beta.owner/v1). Separately pinned extension; it is applied by the operator to the owner-local
-- journal database and never to a hosted, tester or frozen-qdev database. The hash-pinned cohort accounting SQL is unchanged.
-- Records the operation units of each settled OWNER_SUBSCRIPTION_LOCAL Factory run as read back from MyFactory (the spend authority).
-- There is deliberately NO money column: unmetered subscription usage can never be stored, summed or shown as a currency amount or $0.
CREATE TABLE IF NOT EXISTS qdev_subscription_usage (
  journey_id text NOT NULL CHECK (journey_id ~ '^[a-f0-9]{64}$'),
  request_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  run_id uuid,
  state text NOT NULL CHECK (state IN ('COMPLETED', 'FAILED', 'CANCELLED', 'NOT_DISPATCHED')),
  metering text NOT NULL CHECK (metering = 'SUBSCRIPTION_UNMETERED'),
  operations_used integer NOT NULL CHECK (operations_used >= 0),
  max_operations integer NOT NULL CHECK (max_operations > 0 AND operations_used <= max_operations),
  completion_operations_used integer NOT NULL CHECK (completion_operations_used >= 0 AND completion_operations_used <= operations_used),
  evidence_ref text NOT NULL CHECK (length(evidence_ref) BETWEEN 1 AND 1000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (journey_id, request_id)
);
CREATE OR REPLACE FUNCTION qdev_subscription_usage_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'QDEV_SUBSCRIPTION_USAGE_IMMUTABLE';
END;
$$;
DROP TRIGGER IF EXISTS qdev_subscription_usage_guard ON qdev_subscription_usage;
CREATE TRIGGER qdev_subscription_usage_guard BEFORE UPDATE OR DELETE ON qdev_subscription_usage
  FOR EACH ROW EXECUTE FUNCTION qdev_subscription_usage_guard();
