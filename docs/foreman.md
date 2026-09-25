# Foreman usage guide

Foreman is the software factory that turns GitHub and Linear issues for
[jaydubya818/MyEveBot](https://github.com/jaydubya818/MyEveBot) into
independently reviewed **draft** pull requests. This guide explains how
maintainers start work, follow progress, and stay responsible for what ships.

Production service: [https://myeve-foreman.vercel.app](https://myeve-foreman.vercel.app)

## What Foreman does

For each accepted work item, Foreman runs a fixed pipeline:

1. **Classify** — decide whether the issue is actionable and what kind of change it is.
2. **Analyze** — study the repository and produce an implementation plan with acceptance criteria.
3. **Implement** — execute the plan on a feature branch and run the repository's own checks.
4. **Independently review** — a separate reviewer checks the diff against the plan and the issue.
5. **Draft PR** — open a draft pull request linked to the originating issue.

Foreman stops at the draft pull request. It does not mark a PR ready, merge
it, or deploy anything. Those decisions always belong to a human maintainer.

## Starting work from GitHub

Add the `factory` label to a GitHub issue in this repository. Foreman picks up
labeled issues, runs the pipeline above, and opens a draft pull request that
references the issue.

## Delegating a Linear issue

1. Open the issue in Linear.
2. Open the assignee menu and select **myeve-foreman** under **Agents**.
3. Foreman starts an agent session on the issue.

The Linear agent session on the issue shows Foreman's progress — classification,
analysis, implementation, and review updates — and posts the link to the
resulting draft pull request when the run completes.

## Writing a clear issue

Foreman works best when the issue reads like a small, well-scoped work order:

- **Scope** — say exactly what should change, and name anything that must
  *not* change.
- **Acceptance criteria** — list the concrete conditions a correct change must
  satisfy, so the independent review has something objective to check.
- **Verification steps** — name the commands or checks that prove the change
  works (tests, typecheck, build, link checks, and so on).

Vague or open-ended issues may be classified as needing clarification instead
of being implemented.

## Human responsibilities

Foreman's output is a starting point, not a release:

- Review the draft pull request's diff and the results of its checks.
- Mark the PR ready for review only when you are satisfied with it.
- Decide whether to merge; merging to `main` triggers a production deployment
  (see the [Deploy section of the README](../README.md#deploy)), so treat the
  merge decision with the same care as any other release.
