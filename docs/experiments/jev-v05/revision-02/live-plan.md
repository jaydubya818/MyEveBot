# JEV V0.5 LIVE EVALUATION READY — authorization requested, not granted

Source: the qualified commit containing this plan; exact local/remote SHA is in the final external attestation. Provider: Jev via Vercel AI Gateway, `typesafe-ai/jev`. No other model or route is authorized by this proposal.

| Run | Maximum requests | Estimated input tokens | Estimated output tokens |
|---|---:|---:|---:|
| Seven-class canary | 14 | 14,311 | 3,584 |
| V0_REPRODUCTION | 210 | 67,691 | 53,760 |
| CHALLENGE_SIX | 206 | 90,332 | 52,736 |
| CHALLENGE_SEVEN | 249 | 206,606 | 63,744 |
| TAXONOMY_STRESS | 57 | 47,087 | 14,592 |
| **Maximum** | **736** | **426,027** | **188,416** |

The canary is a separate run ID; its repeated examples do not enter full-run metrics twice. It includes all seven labels, seven adversarial cases, six hard cases and one moderate case. Its frozen IDs are challenge_0016, challenge_0018, challenge_0007, challenge_0004, challenge_0013, challenge_0012, challenge_0005, challenge_0028, challenge_0024, challenge_0009, challenge_0037, challenge_0014, challenge_0029 and challenge_0017. It covers 14 boundary tags, includes Insight and excludes Stress. Canary checks contract, complete probability semantics, model/route, privacy and provider stability; it is not an opportunity to revise labels based on model answers.

Standard Six/Seven are omitted from this request. Standard lacks Preference and Insight, is narrower than the Challenge cohort, and adds limited value relative to the preserved V0 baseline. The existing harness supports these runs if separately justified later.

Estimates use serialized request length divided by two characters per token, with the largest 14 inputs used to conservatively bound canary input, plus 256 output tokens per request. These are planning estimates, not measured billing or output-token counts. The evaluation SDK reports input usage but no output-usage/cost field; unavailable observed values must remain unavailable.

Pricing rechecked on **2026-09-21 UTC** against the current [official Vercel Jev model page](https://vercel.com/ai-gateway/models/jev): input and output **Free**, promotional pricing ends **September 25, 2026**. Promotion **ACTIVE** at this check. Maximum estimated model spend under this proposal: **$0.00**. A stale search snippet still showed $0.04/M input; the freshly opened official page showed the active free promotion. Recheck the live page and account availability immediately before starting. If pricing or eligibility changes, STOP and request a revised budget; this proposal does not authorize paid fallback.

Execution must use concurrency 1, SDK retries 0, maximum three-second request timeout, no unbudgeted reruns and distinct immutable run IDs. Stop on schema/contract mismatch, unexpected model/route, invalid probability semantics, leakage, material pricing change, or instability (>10% failures after the first 12 attempted requests). Review canary before the remaining four runs. A canary failure is not permission to change the frozen corpus or contract. Review source and aggregate request count between runs.

The CLI requires a separately approved authorization file with the exact clean source commit, experiment, maximum requests, estimated spend and dated pricing. Those files have not been created. Their per-run counts must sum to at most 736, including canary; neither retries nor repeated invocations create additional authorization.

Owner data: **NONE**. Behavioral influence: **NONE**. Jev calls executed for V0.5 so far: **0**. Ground-truth review activity is separate and is not included in these benchmark counts or spend.

**May I proceed with this bounded live plan?** This question is required by work-order sections 203–205; the earlier V0 authorization does not cover V0.5.
