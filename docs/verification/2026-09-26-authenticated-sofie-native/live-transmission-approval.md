# Concrete external model transmission request

**Explicitly approved by the owner in the continuation request; no transmission has occurred.** This is for local qualification, not publishing or deployment.

Destination: **Anthropic Claude Sonnet 5 (`anthropic/claude-sonnet-5`) through Vercel AI Gateway**, using the existing configured provider account.

Data allowed for this proposed run:

- Exact five private fixture files in [source.json](fixture/source.json), pinned to `jaydubya818/myeve-golden-work-qual@db5d95cf3d1dadf04a118f38bd5b388a5a226c31`: README.md, package.json, .gitignore, .github/workflows/quantity-ci.yml, test/quantity.test.mjs. Read-only retrieval matched the previously approved base manifest.
- Synthetic selected Work ID/title/objective/criteria and scoped current/prior-decision facts with provenance from [fixture](fixture/fixture.json) and [SQL evidence](sql-results.json). The unrelated canary fact must stay excluded; the stale fact must not be asserted as current.
- The authored MyEve system/tool instructions necessary for this fixture, role/pack/mode guidance, bounded tool schemas, and the synthetic user prompts/conversation.
- Generated `quantity.mjs` candidates, route/candidate/evidence IDs and hashes, protected-check output, accounting and PARTIAL-result explanations produced within this fixture.

The five source files explicitly contain no customer code, secrets or production configuration. Credentials, unrelated Work/Knowledge, other repositories, real customer data and publisher secrets are excluded. The only writable source path is quantity.mjs; repository tests/workflow remain unchanged. Local Docker verification is independent. No remote GitHub write or PR publication.

Budget: original allowance $2.00; earlier confirmed plus conservatively allocated uncertain attempts $0.686839; this tranche $0.00. **Maximum additional provider spend $1.313161.** Fixture Work ceiling is $1.30, at most 30 model requests, 2,048 output tokens/request and 4 runs. A whole-conversation budget must also cover pre-admission/recovery calls before this is run; no ordinary unmetered model calls are acceptable. Unknown usage/reservations consume allowance until reconciled, never refunded speculatively.

The owner explicitly authorized these data categories and destination for the described authenticated fail/repair/verify/recovery and behavior comparison, within that remaining ceiling. It does not authorize relaxing native writer/budget/gateway guards, adding publication authority or asserting qualification without evidence.

The subsequent automatic review rejection concerns a separate implementation change, not this approved transmission. See [the concrete implementation proposal](conversation-budget-proposal.md). Do not request transmission consent again unless the approved payload, destination, model, resource/Work scope or spend ceiling changes.
