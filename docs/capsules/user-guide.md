# Memory Capsules: owner guide

Open **Knowledge → Memory Capsules**, or visit `/capsules`.

**Current integration status:** canonical source export awaits Memory portability policy. Import reviews can be saved privately, but they do not activate Memory or Skills. The clearly labeled local qualification workspace uses synthetic examples and an independent destination fixture. Do not mistake it for your live Sofie.

## Create a Capsule

Select only experience that should travel. Nothing is selected by default. Sources without an explicit portability policy remain unavailable. Preview the selected contents, scope, version, provenance, size and exclusions. Deselect anything unsuitable; changed selection requires a fresh preview. Create and download the reviewed Capsule, then keep the file private.

A Capsule contains readable experience, not account access. Credentials, sessions, connected apps, grants, approvals, active Work and writer/provider/billing authority are excluded. Another Eve must connect its own apps, providers and repositories independently.

## Import a Capsule

Choose a JSON Capsule from an owner you trust. Supported formats are 1.0 and 1.1; the maximum size is 1 MiB. The same independently configured owner identity is required at both ends. Verify the sender yourself: a checksum detects changes but does not verify identity.

Review each item. New items start skipped. Duplicates keep the existing copy. Conflicts keep destination information by default; you may retain incoming information for later correction review. Unsupported project scopes and item kinds stay skipped. Save the review when your choices are complete.

Saving does not replace Current Truth, downgrade a Skill, activate Role/Pack behavior or promote learning. Imported behavior needs the destination's normal qualification. Scope stays private and is preserved or narrowed. If the Capsule or destination changes during review, inspect again.

Saved production reviews expire from access after 30 days and are physically pruned on the next save. Delete a saved review to remove its staged data immediately. Downloaded files and database backup retention are separate; delete local copies yourself when no longer needed. No permanent public download URL is created.

If validation fails, obtain an unchanged file or remove the sensitive/unsupported material at its source and export again. There is no “ignore integrity” or “import everything” bypass.

## Local design-partner qualification

From the dedicated worktree, without copying a production `.env.local`:

```sh
MYEVE_CAPSULE_FIXTURE_DB=/tmp/sofie-capsule-local.sqlite npm run dev --workspace=eve-agent -- --webpack --port 3217
```

Visit `http://localhost:3217/capsules`. Select the concise-update preference, planning rhythm and SellerFi project convention. Preview, download, then choose **Review for Sofie B**. Include those new items and save the reviewed import. Inspect again to see duplicates. Restarting the server with the same fixture path retains the original provenance. The fixture is rejected in production mode and never connects to canonical Memory.

For reproducible evidence, run from `apps/eve`:

```sh
node --import tsx scripts/qualify-capsules.ts
```

This writes synthetic evidence and a design-partner Capsule under `docs/verification/portable-sofie-capsules`. The benefit result is deterministic scoped retrieval after reopening the destination, not an LLM behavior score.
