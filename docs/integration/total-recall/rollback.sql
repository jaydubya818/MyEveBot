-- DISPOSABLE QUALIFICATION / EMPTY UNACTIVATED INSTALL ONLY.
-- Runtime rollback first disables the feature; never drop retained owner history
-- in production. Data-bearing removal requires a separate retention decision.
DROP TABLE recall_learning_uses;
DROP TABLE recall_learning_events;
DROP TABLE recall_learning;
DROP FUNCTION recall_validate_use();
DROP FUNCTION recall_claim_events();
DROP FUNCTION recall_validate_family();
