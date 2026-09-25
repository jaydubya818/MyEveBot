-- One durable allowance for this gated qualification database, across all
-- owners, Runs and process lifetimes. There is intentionally no reset API.
CREATE TABLE owner_qualification_budget (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 reserved_microusd bigint NOT NULL CHECK(reserved_microusd>=0),
 spent_microusd bigint NOT NULL CHECK(spent_microusd>=0),
 CHECK(reserved_microusd+spent_microusd<=5000000)
);
-- statement-breakpoint
-- Preserve pre-migration liability. Incomplete completed-call accounting is
-- charged at its full reservation, rather than silently granting more budget.
INSERT INTO owner_qualification_budget(singleton,reserved_microusd,spent_microusd)
 SELECT true,
  COALESCE(SUM(CASE WHEN status<>'completed' THEN reserved_microusd ELSE 0 END),0),
  COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(spent_microusd,reserved_microusd) ELSE 0 END),0)
 FROM owner_model_calls;
-- statement-breakpoint
CREATE FUNCTION account_owner_qualification_model_call() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'inflight' OR NEW.spent_microusd IS NOT NULL THEN
   RAISE EXCEPTION 'New model calls require an inflight reservation';
  END IF;
  UPDATE owner_qualification_budget
   SET reserved_microusd=reserved_microusd+NEW.reserved_microusd
   WHERE singleton AND reserved_microusd+spent_microusd+NEW.reserved_microusd<=5000000;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Qualification aggregate model budget exhausted or unavailable';
  END IF;
 ELSE
  IF ROW(NEW.owner_id,NEW.run_id,NEW.step_key,NEW.request_hash,NEW.model_id,NEW.reserved_microusd,NEW.reserved_tokens)
     IS DISTINCT FROM ROW(OLD.owner_id,OLD.run_id,OLD.step_key,OLD.request_hash,OLD.model_id,OLD.reserved_microusd,OLD.reserved_tokens)
     OR OLD.status<>'inflight' OR NEW.status NOT IN ('completed','unknown') THEN
   RAISE EXCEPTION 'Model reservation is immutable or already reconciled';
  END IF;
  IF NEW.status='completed' THEN
   IF NEW.spent_microusd IS NULL OR NEW.spent_microusd<0 OR NEW.spent_microusd>OLD.reserved_microusd THEN
    RAISE EXCEPTION 'Model usage outside reservation';
   END IF;
   UPDATE owner_qualification_budget
    SET reserved_microusd=reserved_microusd-OLD.reserved_microusd,
        spent_microusd=spent_microusd+NEW.spent_microusd
    WHERE singleton AND reserved_microusd>=OLD.reserved_microusd;
   IF NOT FOUND THEN RAISE EXCEPTION 'Qualification model accounting unavailable'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
-- statement-breakpoint
-- This runs in the same transaction as the existing Run reservation/settlement.
-- Exhaustion rolls back admission before the application can invoke a provider.
CREATE TRIGGER owner_model_qualification_accounting
 BEFORE INSERT OR UPDATE ON owner_model_calls
 FOR EACH ROW EXECUTE FUNCTION account_owner_qualification_model_call();
-- Deleting/pruning a Run or its receipts never refunds aggregate liability.
