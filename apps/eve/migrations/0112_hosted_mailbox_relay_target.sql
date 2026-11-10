-- Hosted private beta: the mailbox may also carry the Mac-local Relay's remote capability-lease calls (target 'relay').
-- Widens one CHECK constraint; no data is rewritten (every existing row is 'factory' or 'verifier').
ALTER TABLE factory_mailbox_requests DROP CONSTRAINT factory_mailbox_requests_target_check;
-- statement-breakpoint
ALTER TABLE factory_mailbox_requests ADD CONSTRAINT factory_mailbox_requests_target_check CHECK (target IN ('factory', 'verifier', 'relay'));
