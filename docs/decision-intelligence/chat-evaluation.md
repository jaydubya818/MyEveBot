# Explicit Jev chat evaluation

`evaluate_with_jev` makes the existing Jev evaluator available for an explicitly
requested, direct-owner classification. Jev is a model provider, not a contact
or Relay peer. The tool does not retrieve owner records or save classifications.
The historical synthetic-only ShadowEvaluator and benchmark evidence are unchanged.

Example owner prompt:

> Use Jev to classify these statements. Show its actual labels and probabilities,
> distinguish your interpretation from Jev's result, and do not save anything:
> 1. I prefer concise answers.
> 2. Yesterday I observed three abandoned checkouts.
> 3. Shipping costs may explain checkout abandonment.

The tool presents the exact statements for native approval before transmission.
Only these statements are submitted to Vercel AI Gateway; they may be metered by
that provider. The existing adapter does not expose billed cost, so no free-price
or actual-cost claim is made. At most five statements of 2,000 characters each
are accepted, sequentially, with the existing three-second provider timeout,
no retries, and no automatic fallback. A failure stops remaining submissions.
The normal conversation/tool trace records the interaction; the tool does not
write separate evaluation artifacts or canonical Knowledge.

Configuration uses the existing `MYEVE_DECISION_INTELLIGENCE_ENABLED=true` flag
and process-scoped Gateway authentication (`VERCEL_OIDC_TOKEN` or
`AI_GATEWAY_API_KEY`). No credentials are accepted as tool input. A status call
checks configuration only, not successful authentication. Disabled or unavailable
states must be reported honestly. No runtime configuration is changed by this patch.

The current contract is the preserved six-class `knowledge.classification:v1`.
Insight is excluded. Goals and procedures have no dedicated class; the returned
forced choice must not be presented as evidence that the taxonomy fits. Jev
returns labels/probabilities, not an explanation. Any explanation supplied by
Sofie must be identified as Sofie's interpretation. These results confer no
permission to save Knowledge or execute an action.

Source qualification: mocked provider/transport tests, explicit owner/privacy/
approval/failure tests, Knowledge isolation tests, TypeScript, capability and
executor governance, Builder manifest, and Eve discovery. Live chat/provider
qualification and activation are pending coordination with the task that owns
the shared local runtime. No live Jev calls are part of these tests.
