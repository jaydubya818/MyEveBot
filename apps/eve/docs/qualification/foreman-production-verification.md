# Foreman production handoff verification

Operator checklist for verifying a Sofie to Linear to Foreman handoff in production. A verified Linear issue URL proves the issue was created, not that Foreman started: a saved receipt with an `issueUrl` and a `delegated_pending` status means the delegation was recorded but no agent session has been observed yet. Only a confirmed agent session counts as a started handoff.

1. [ ] Confirm Sofie returned a verified Linear issue URL, and check the reported status: `delegated_pending` means the delegation was saved without a confirmed agent start, while a started status requires a real agent session.
2. [ ] Open the Linear issue at the returned URL and confirm `myeve-foreman` is assigned as the delegate.
3. [ ] Use **View progress** on the issue to confirm the Foreman agent session exists and shows activity.
4. [ ] Confirm the resulting GitHub PR is a draft, is linked to the Linear issue, and changes only the requested docs file.
5. [ ] If Sofie reports an uncertain result, inspect the retained Linear issue and its agent session to reconcile. Do not create a replacement issue; the gateway keeps the receipt for reconciliation.
