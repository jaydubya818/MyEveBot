"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AGENT_NAME } from "@/lib/identity";
import type { GoalDetailView } from "@/lib/goal-types";
import type { OutcomeView } from "@/lib/outcome-types";
import type { ApprovalRequestView } from "@/lib/approvals";
import {
  activityItems,
  pendingApprovals,
  projectWork,
  recoveryMessage,
  taskState,
  workPrompt,
  type WorkItem,
} from "@/components/owner/projection";
import { emptyPreview, exampleSnapshot } from "@/components/owner/preview";
import { NewWork } from "./new-work";
import { OwnerNavigation } from "./navigation";
import { ownerRequest, useOwnerData } from "./data";
import { Card, Empty, State, date } from "./primitives";
import { DecisionCard } from "./decisions";
import { Proof, ResultCard } from "./proof";
import "./owner.css";

export type OwnerView =
  | "today"
  | "work"
  | "needs-you"
  | "brief"
  | "results"
  | "activity"
  | "welcome"
  | "new";
const titles: Record<OwnerView, string> = {
  today: "Today",
  work: "Work",
  "needs-you": "Needs you",
  brief: "Daily Brief",
  results: "Results",
  activity: "Activity",
  welcome: `Meet ${AGENT_NAME}`,
  new: "Give Sofie an outcome",
};

export function OwnerExperience({
  view = "today",
  selectedId,
  preview = false,
}: {
  view?: OwnerView;
  selectedId?: string;
  preview?: boolean;
}) {
  const {
    snapshot,
    errors,
    loading,
    checkedAt,
    refresh,
    details,
    updatePreview,
  } = useOwnerData(preview);
  const [detail, setDetail] = useState<GoalDetailView | null>(null),
    [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [retry, setRetry] = useState(0);
  const work = projectWork(snapshot);
  const exceptions = [
    ...work.filter((item) =>
      ["Needs you", "Blocked", "Recovery"].includes(item.state),
    ),
    ...projectWork({ ...snapshot, goals: [] }).filter(
      (item) =>
        ["Needs you", "Blocked", "Recovery"].includes(item.state) &&
        !work.some((existing) => existing.id === item.id),
    ),
  ];
  const approvals = pendingApprovals(snapshot.approvals);
  const selected =
    work.find((item) => item.id === selectedId) ??
    projectWork({ ...snapshot, goals: [] }).find(
      (item) => item.id === selectedId,
    );
  const result = snapshot.outcomes.find((item) => item.id === selectedId);
  function href(destination: OwnerView, id?: string) {
    const query = new URLSearchParams();
    if (preview) query.set("view", destination);
    if (id) query.set("id", id);
    return `${preview ? "/beta-preview" : destination === "new" ? "/work/new" : destination === "welcome" ? "/welcome" : `/${destination}`}${query.size ? `?${query}` : ""}`;
  }
  useEffect(() => {
    if (preview || view !== "today" || loading || Object.keys(errors).length)
      return;
    try {
      setLastVisit(sessionStorage.getItem("myeve-today-last-visit"));
      sessionStorage.setItem(
        "myeve-today-last-visit",
        new Date().toISOString(),
      );
    } catch {
      /* An unavailable browser timestamp never blocks live reads. */
    }
    // Only capture the prior visit after the first complete read on this visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, view, loading]);
  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (view !== "work" || !selectedId || selected?.kind !== "goal") return;
    if (preview) {
      setDetail(details[selectedId] ?? null);
      return;
    }
    const abort = new AbortController();
    void ownerRequest<{ goal: GoalDetailView }>(
      `/api/goals/${encodeURIComponent(selectedId)}`,
      { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) },
    )
      .then((body) => {
        if (!abort.signal.aborted) setDetail(body.goal);
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setDetailError(
            cause instanceof Error
              ? cause.message
              : "Work detail is unavailable.",
          );
      });
    return () => abort.abort();
  }, [
    view,
    selectedId,
    selected?.kind,
    selected?.updatedAt,
    preview,
    details,
    retry,
  ]);
  function saveResult(saved: OutcomeView) {
    if (preview)
      updatePreview({
        ...snapshot,
        details,
        outcomes: snapshot.outcomes.map((item) =>
          item.id === saved.id ? saved : item,
        ),
      });
    else void refresh();
  }
  function saveDecision(saved: ApprovalRequestView) {
    if (preview)
      updatePreview({
        ...snapshot,
        details,
        approvals: snapshot.approvals.map((item) =>
          item.id === saved.id ? saved : item,
        ),
      });
    else void refresh();
    setNotice(
      preview
        ? "Sample decision recorded. No external action was taken."
        : "Decision recorded. Execution is subject to the current service checks.",
    );
  }
  function discuss(text: string) {
    if (preview) {
      setNotice(
        "Preview handoff prepared. In the live experience, this context opens as a draft in Sofie’s conversation for you to review and send.",
      );
      return;
    }
    try {
      sessionStorage.setItem("myeve-owner-conversation-draft", text);
      window.location.assign("/sofie");
    } catch {
      setNotice(
        "Your browser could not prepare the conversation draft. Allow session storage and try again; no message was sent.",
      );
    }
  }
  function WorkList({
    items,
    empty = "No work in this view",
    limit,
  }: {
    items: WorkItem[];
    empty?: string;
    limit?: number;
  }) {
    if ((errors.goals || errors.tasks) && items.length === 0)
      return (
        <p className="owner-muted">
          Work could not be fully checked. Try again to see the current state.
        </p>
      );
    return items.length ? (
      <ul className="owner-list">
        {items.slice(0, limit).map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            <div className="owner-row">
              <Link className="owner-work-link" href={href("work", item.id)}>
                {item.title}
              </Link>
              <State value={item.state} />
            </div>
            <p className="owner-muted">
              {item.objective || "Open this work to review the objective."}
            </p>
            {item.progress !== null && (
              <progress
                value={item.progress}
                max={100}
                aria-label={`${item.title}: ${item.progress}% of tasks complete`}
              />
            )}
            <p className="owner-muted">
              {item.kind === "goal" ? "Objective status" : "Execution status"} ·
              Updated {date(item.updatedAt)}
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <Empty title={empty}>
        Give Sofie a useful outcome. Progress, decisions, and results will stay
        connected here.
      </Empty>
    );
  }
  const relatedTasks = selected
    ? snapshot.tasks.filter(
        (task) => task.id === selected.id || task.goalId === selected.id,
      )
    : [];
  const relatedResults = selected
    ? snapshot.outcomes.filter(
        (item) =>
          item.goalId === selected.id ||
          (item.runId !== null &&
            relatedTasks.some((task) => task.id === item.runId)),
      )
    : [];
  const changed = lastVisit
    ? work.filter((item) => Date.parse(item.updatedAt) > Date.parse(lastVisit))
    : [];
  const events = activityItems(snapshot, detail);
  return (
    <div className="owner-shell">
      <a className="owner-skip" href="#owner-content">
        Skip to content
      </a>
      <header className="owner-top">
        <Link href={href("today")} className="owner-brand">
          MyEve<span className="owner-muted"> / {AGENT_NAME}</span>
        </Link>
        {preview ? (
          <nav className="owner-primary" aria-label="Primary preview">
            {(["today", "work", "needs-you", "results"] as OwnerView[]).map(
              (item) => (
                <Link
                  key={item}
                  href={href(item)}
                  aria-current={view === item ? "page" : undefined}
                >
                  {titles[item]}
                </Link>
              ),
            )}
          </nav>
        ) : (
          <OwnerNavigation />
        )}
      </header>
      <main id="owner-content" tabIndex={-1} className="owner-content">
        {preview && (
          <aside className="owner-notice" aria-label="Preview boundary">
            <strong>Design partner preview · Sample data</strong>
            <p>
              Nothing here runs work, contacts anyone, or changes your live
              account. Preview decisions and feedback stay in this browser tab.
            </p>
            <div className="owner-actions">
              <button
                onClick={() => {
                  updatePreview(emptyPreview());
                  setNotice("Preview reset to a new owner.");
                }}
              >
                Try a new owner
              </button>
              <button
                onClick={() => {
                  updatePreview(exampleSnapshot());
                  setNotice("Example journey loaded.");
                }}
              >
                Load example journey
              </button>
              <Link href="/today">Exit preview</Link>
            </div>
          </aside>
        )}
        <header className="owner-heading">
          <div>
            <span className="owner-eyebrow">Your outcomes, in focus</span>
            <h1>
              {selected?.title ?? (result ? "Your result" : titles[view])}
            </h1>
            <p className="owner-muted">
              {view === "today"
                ? "A clear view of what is moving, what changed, and where you’re needed."
                : view === "work"
                  ? "Keep the objective, decisions, and evidence together."
                  : view === "needs-you"
                    ? "Your judgment, only where it’s needed."
                    : view === "brief"
                      ? "The useful changes and next steps, without the noise."
                      : view === "results"
                        ? "What was accomplished, what supports it, and what comes next."
                        : "A useful next step starts with a clear outcome."}
            </p>
          </div>
          <div className="owner-actions">
            <Link className="owner-button primary" href={href("new")}>
              New work
            </Link>
            <button
              onClick={() => {
                void refresh();
                setRetry((value) => value + 1);
              }}
            >
              Refresh
            </button>
          </div>
        </header>
        <nav className="owner-tabs" aria-label="Work overview">
          {(
            [
              "today",
              "work",
              "needs-you",
              "results",
              "brief",
              "activity",
            ] as OwnerView[]
          ).map((item) => (
            <Link
              key={item}
              href={href(item)}
              aria-current={view === item ? "page" : undefined}
            >
              {titles[item]}
              {item === "needs-you" &&
              !loading &&
              !errors.approvals &&
              approvals.length > 0
                ? ` (${approvals.length})`
                : ""}
            </Link>
          ))}
        </nav>
        {notice && (
          <div className="owner-success" role="status">
            {notice}
          </div>
        )}
        {Object.keys(errors).length > 0 && (
          <section className="owner-notice" role="alert">
            <strong>Some information is unavailable</strong>
            <ul>
              {Object.values(errors).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <div className="owner-actions">
              <button onClick={() => void refresh()}>Try again</button>
              <a href="/login?returnTo=%2Ftoday">Sign in</a>
            </div>
          </section>
        )}
        {loading ? (
          <p role="status" aria-live="polite">
            Loading your work and decisions…
          </p>
        ) : (
          <>
            {view === "today" && (
              <div className="owner-grid owner-today">
                <div className="owner-stack">
                  {work.length === 0 && !errors.goals && !errors.tasks && (
                    <section className="owner-card owner-welcome">
                      <span className="owner-eyebrow">
                        Start with one useful thing
                      </span>
                      <h2 style={{ marginTop: 12 }}>
                        What would you like off your plate?
                      </h2>
                      <p className="owner-muted">
                        Give {AGENT_NAME} an outcome and what a good result
                        looks like. You can review the plan before deciding what
                        happens next.
                      </p>
                      <div className="owner-actions">
                        <Link
                          href={href("new")}
                          className="owner-button primary"
                        >
                          Give Sofie your first work
                        </Link>
                        <Link href={href("welcome")} className="owner-button">
                          Meet Sofie
                        </Link>
                      </div>
                    </section>
                  )}
                  <Card title="Moving forward">
                    <WorkList
                      items={work.filter((item) =>
                        ["Working", "Verifying", "Waiting"].includes(
                          item.state,
                        ),
                      )}
                      empty="Ready for your first outcome"
                      limit={5}
                    />
                  </Card>
                  <Card title="Recent results">
                    {errors.outcomes ? (
                      <p>Results are unavailable.</p>
                    ) : snapshot.outcomes.length ? (
                      <ul className="owner-list">
                        {snapshot.outcomes.slice(0, 3).map((item) => (
                          <li key={item.id}>
                            <Link
                              className="owner-work-link"
                              href={href("results", item.id)}
                            >
                              {item.summary}
                            </Link>
                            <p className="owner-muted">
                              {date(item.occurredAt)} ·{" "}
                              {item.agentName ?? "Producer not recorded"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty title="Your first result will appear here">
                        You’ll be able to inspect evidence and tell Sofie what
                        was useful.
                      </Empty>
                    )}
                  </Card>
                  <Card title="Completed work">
                    <WorkList
                      items={work.filter((item) => item.state === "Complete")}
                      empty="No completed work yet"
                      limit={3}
                    />
                  </Card>
                </div>
                <div className="owner-stack">
                  <Card title="Needs you" highlight>
                    {errors.approvals ? (
                      <p>
                        Decisions could not be checked. Refresh before
                        authorizing anything.
                      </p>
                    ) : approvals.length ? (
                      <>
                        <p>
                          {approvals.length} exact action
                          {approvals.length === 1 ? " is" : "s are"} waiting for
                          your decision.
                        </p>
                        <Link href={href("needs-you")} className="owner-button">
                          Review decisions →
                        </Link>
                      </>
                    ) : (
                      <Empty title="No approvals waiting">
                        {exceptions.some((item) => item.state === "Needs you")
                          ? "Some work still needs your input. Open Needs you to review it."
                          : "No approval request is pending in the available records."}
                      </Empty>
                    )}
                  </Card>
                  <Card title="Daily Brief">
                    <p className="owner-muted">
                      {snapshot.brief
                        ? `${snapshot.brief.completed.length} completed items · ${snapshot.brief.blocked.length} blockers in this brief.`
                        : "Your brief brings completed work, priorities, and blockers into one review."}
                    </p>
                    <Link href={href("brief")} className="owner-button">
                      Read your brief →
                    </Link>
                  </Card>
                  <Card title="Blocked or recovering">
                    <WorkList
                      items={exceptions.filter((item) =>
                        ["Blocked", "Recovery"].includes(item.state),
                      )}
                      empty="No blockers reported"
                      limit={3}
                    />
                  </Card>
                  <Card title="Since your last visit">
                    <p className="owner-muted">
                      {lastVisit
                        ? `${changed.length} work items changed since ${date(lastVisit)} on this browser tab.`
                        : "Your next complete visit in this browser tab will show which work changed."}
                    </p>
                    {changed.slice(0, 3).map((item) => (
                      <p key={item.id}>
                        <Link href={href("work", item.id)}>{item.title}</Link>
                      </p>
                    ))}
                  </Card>
                </div>
              </div>
            )}
            {view === "welcome" && (
              <section className="owner-card owner-welcome">
                <span className="owner-eyebrow">Your personal agent</span>
                <h2 style={{ marginTop: 16 }}>
                  One outcome. A plan you can understand.
                </h2>
                <p>
                  I’m {AGENT_NAME}. I can help you investigate a question,
                  prepare a document, or work through a project using the tools
                  available in your account.
                </p>
                <div className="owner-proof">
                  <div>
                    <h3>Work means an outcome</h3>
                    <p className="owner-muted">
                      Describe what you want, how you’ll judge success, and the
                      context that matters. Start small.
                    </p>
                  </div>
                  <div>
                    <h3>You keep the decisions</h3>
                    <p className="owner-muted">
                      Configured approval policies control consequential
                      actions. Inspect the exact scope of each request in Needs
                      you before deciding.
                    </p>
                  </div>
                  <div>
                    <h3>Memory you can inspect</h3>
                    <p className="owner-muted">
                      Knowledge holds retained context and sources. Review and
                      correct it as your priorities change.
                    </p>
                  </div>
                  <div>
                    <h3>Results with context</h3>
                    <p className="owner-muted">
                      Check what changed, read the evidence, and give feedback.
                      A successful status alone is not proof of verification.
                    </p>
                  </div>
                </div>
                <div className="owner-actions" style={{ marginTop: 24 }}>
                  <Link href={href("new")} className="owner-button primary">
                    Choose your first outcome
                  </Link>
                  {!preview && (
                    <Link href="/chat" className="owner-button">
                      Talk to Sofie
                    </Link>
                  )}
                </div>
              </section>
            )}
            {view === "new" && (
              <NewWork
                preview={preview}
                onCreated={(goal) => {
                  if (preview)
                    updatePreview({
                      ...snapshot,
                      goals: [goal, ...snapshot.goals],
                      details: { ...details, [goal.id]: goal },
                    });
                  setNotice("Work saved as a draft. No execution has started.");
                }}
                onDiscuss={discuss}
              />
            )}
            {view === "work" && !selectedId && (
              <>
                <div
                  className="owner-actions"
                  style={{ marginBottom: 24 }}
                  aria-label="Filter work"
                >
                  {[
                    "All",
                    "Working",
                    "Waiting",
                    "Needs you",
                    "Blocked",
                    "Recovery",
                    "Complete",
                  ].map((value) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <Card title={filter === "All" ? "Your work" : filter}>
                  <WorkList
                    items={work.filter(
                      (item) => filter === "All" || item.state === filter,
                    )}
                  />
                </Card>
              </>
            )}
            {view === "work" && selectedId && !selected && (
              <Empty title="This work could not be found">
                The list may be unavailable, or this record is no longer
                included. <Link href={href("work")}>Return to Work</Link>.
              </Empty>
            )}
            {view === "work" && selected && (
              <div className="owner-grid">
                <div className="owner-stack">
                  <Card title="Objective">
                    <State value={selected.state} />
                    <p>{selected.objective || selected.title}</p>
                    <p className="owner-muted">
                      {selected.kind === "goal"
                        ? "This is the saved objective status. It does not prove that an execution is currently running."
                        : "Status from the recorded execution."}
                    </p>
                    {selected.progress !== null && (
                      <>
                        <progress
                          max={100}
                          value={selected.progress}
                          aria-label="Work task completion"
                        />
                        <p className="owner-muted">
                          {selected.progress}% of recorded tasks complete
                        </p>
                      </>
                    )}
                    <button
                      onClick={() => discuss(workPrompt(selected.source))}
                    >
                      Discuss next step with Sofie
                    </button>
                  </Card>
                  {selected.kind === "goal" && (
                    <Card title="Acceptance criteria & plan">
                      {detailError ? (
                        <p role="alert">
                          {detailError}{" "}
                          <button
                            onClick={() => setRetry((value) => value + 1)}
                          >
                            Retry detail
                          </button>
                        </p>
                      ) : !detail ? (
                        <p role="status">Loading the saved plan…</p>
                      ) : (
                        <>
                          <h3>What a good result looks like</h3>
                          {detail.successCriteria.length ? (
                            <ul>
                              {detail.successCriteria.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="owner-muted">
                              No acceptance criteria recorded. Clarify success
                              with Sofie before starting.
                            </p>
                          )}
                          <h3 style={{ marginTop: 24 }}>Current plan</h3>
                          {detail.plans
                            .filter((plan) => plan.status === "active")
                            .map((plan) => (
                              <div key={plan.id}>
                                <p>{plan.summary}</p>
                                <p className="owner-muted">{plan.strategy}</p>
                              </div>
                            ))}
                          {!detail.plans.some(
                            (plan) => plan.status === "active",
                          ) && (
                            <p className="owner-muted">
                              No plan recorded yet. Ask Sofie to propose one.
                            </p>
                          )}
                          {detail.tasks.length > 0 && (
                            <ul className="owner-list">
                              {detail.tasks.map((task) => (
                                <li key={task.id}>
                                  <div className="owner-row">
                                    <strong>{task.title}</strong>
                                    <State
                                      value={taskState(
                                        task.status === "in_progress"
                                          ? "running"
                                          : task.status,
                                      )}
                                    />
                                  </div>
                                  <p className="owner-muted">
                                    {task.description}
                                  </p>
                                  {task.unavailableCapabilities.length > 0 && (
                                    <p>
                                      Required capability unavailable:{" "}
                                      {task.unavailableCapabilities.join(", ")}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </Card>
                  )}
                  <Card title="Who is working & current phase">
                    {relatedTasks.length ? (
                      relatedTasks.map((task) => (
                        <div key={task.id}>
                          <div className="owner-row">
                            <h3>{task.title}</h3>
                            <State value={taskState(task.status)} />
                          </div>
                          <p>
                            {["failed", "paused"].includes(task.status)
                              ? recoveryMessage(task)
                              : (task.statusReason ??
                                "No additional phase is recorded.")}
                          </p>
                          <p className="owner-muted">
                            {preview
                              ? "Sample execution. Any handoff described in its recorded milestones is illustrative; no live delegation is confirmed."
                              : "The current contract does not identify an execution provider. No MyFactory or Relay delegation is inferred."}
                          </p>

                          <p className="owner-muted">
                            Reported estimate: $
                            {task.usage.estimatedCostUsd.toFixed(2)} used · $
                            {task.guardrails.maxEstimatedCostUsd.toFixed(2)}{" "}
                            configured limit. This is not a billing balance.
                          </p>
                          <details>
                            <summary>Execution details</summary>
                            <p className="owner-muted">
                              Reported reason:{" "}
                              {task.statusReason ?? "Not supplied"}. Reference:{" "}
                              {task.id} · {task.kind} · Updated{" "}
                              {date(task.updatedAt)}
                            </p>
                          </details>
                        </div>
                      ))
                    ) : (
                      <Empty title="No execution is linked">
                        A saved objective does not start execution. Discuss the
                        plan and available capabilities with Sofie.
                      </Empty>
                    )}
                  </Card>
                  {relatedResults.map((item) => (
                    <ResultCard
                      key={item.id}
                      result={item}
                      preview={preview}
                      href={href("results", item.id)}
                      onSaved={saveResult}
                      onCorrect={() =>
                        discuss(
                          `Correct result ${item.id}, linked to Work ${selected.id}.\n${item.summary}\nRead its evidence and ask what needs to change before proceeding.`,
                        )
                      }
                    />
                  ))}
                  <Proof
                    task={relatedTasks[0]}
                    result={relatedResults[0]}
                    preview={preview}
                  />
                </div>
                <div className="owner-stack">
                  <Card title="Decisions">
                    {errors.approvals ? (
                      <p>Decision status unavailable.</p>
                    ) : approvals.filter(
                        (item) =>
                          item.goalId === selected.id ||
                          item.taskId === selected.id,
                      ).length ? (
                      <Link className="owner-button" href={href("needs-you")}>
                        Review pending decisions
                      </Link>
                    ) : (
                      <p className="owner-muted">
                        No pending approval is linked to this work.
                      </p>
                    )}
                  </Card>
                  <Card title="Next action">
                    <p className="owner-muted">
                      {detail?.nextAction
                        ? `${detail.nextAction.taskTitle}. ${detail.nextAction.whyNow.join(" ")}`
                        : selected.state === "Blocked" ||
                            selected.state === "Recovery"
                          ? "Review the blocker and retained context with Sofie before another attempt. No automatic recovery is confirmed."
                          : selected.state === "Complete"
                            ? "Review the result and evidence, then share feedback."
                            : "Review the current plan and discuss the next safe step with Sofie."}
                    </p>
                  </Card>
                  <Card title="Activity">
                    <ul className="owner-list">
                      {[
                        ...(detail?.events ?? []).map((event) => ({
                          id: event.id,
                          summary: event.summary,
                          at: event.occurredAt,
                        })),
                        ...relatedTasks.flatMap((task) =>
                          task.milestones.map((event) => ({
                            id: `${task.id}:${event.id}`,
                            summary: event.summary,
                            at: event.createdAt,
                          })),
                        ),
                      ]
                        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                        .map((event) => (
                          <li key={event.id}>
                            <p>{event.summary}</p>
                            <p className="owner-muted">{date(event.at)}</p>
                          </li>
                        ))}
                    </ul>
                    <p className="owner-muted">
                      Only recorded milestones are shown.
                    </p>
                  </Card>
                </div>
              </div>
            )}
            {view === "needs-you" && (
              <div className="owner-stack">
                {!errors.approvals && approvals.length === 0 && (
                  <Card title="No approval decisions waiting">
                    <p className="owner-muted">
                      There are no unexpired approval requests in the available
                      records.
                    </p>
                  </Card>
                )}
                {approvals.map((item) => (
                  <DecisionCard
                    key={item.id}
                    item={item}
                    preview={preview}
                    onDecision={saveDecision}
                  />
                ))}
                <Card title="Missing information & recovery">
                  <WorkList
                    items={exceptions}
                    empty="No other exceptions reported"
                  />
                  <p className="owner-muted">
                    A blocker is not automatically an approval request. Open the
                    work to inspect the context; do not authorize a new action
                    just to clear a status.
                  </p>
                  {snapshot.brief?.pendingOwnerActions.map((item) => (
                    <p key={`${item.goalId}:${item.taskId}`}>
                      <Link href={href("work", item.goalId)}>
                        {item.taskTitle ?? item.goalTitle}
                      </Link>
                    </p>
                  ))}
                </Card>
                <Card title="Recent decisions">
                  {snapshot.approvals.length === approvals.length && (
                    <p className="owner-muted">No decisions recorded yet.</p>
                  )}
                  <ul className="owner-list">
                    {snapshot.approvals
                      .filter(
                        (item) =>
                          item.status !== "pending" ||
                          Date.parse(item.expiresAt) <= Date.now(),
                      )
                      .map((item) => (
                        <li key={item.id}>
                          <div className="owner-row">
                            <span>{item.action}</span>
                            <State
                              value={
                                item.status === "pending"
                                  ? "Expired"
                                  : item.status
                              }
                            />
                          </div>
                          <p className="owner-muted">
                            {item.effectiveReason ??
                              "Decision retained with its exact action scope."}
                          </p>
                        </li>
                      ))}
                  </ul>
                </Card>
              </div>
            )}
            {view === "results" && (
              <div className="owner-stack">
                {!errors.outcomes && snapshot.outcomes.length === 0 && (
                  <Card title="No results yet">
                    <Empty title="Your first useful result belongs here">
                      When work produces an outcome, review its summary,
                      evidence, and limitations here.
                    </Empty>
                  </Card>
                )}
                {selectedId && !result && (
                  <Empty title="Result unavailable">
                    Return to the results list or refresh to check its current
                    availability.
                  </Empty>
                )}
                {(result ? [result] : selectedId ? [] : snapshot.outcomes).map(
                  (item) => (
                    <ResultCard
                      key={item.id}
                      result={item}
                      preview={preview}
                      href={href("results", item.id)}
                      onSaved={saveResult}
                      onCorrect={() =>
                        discuss(
                          `Help me correct this result.\nResult reference: ${item.id}\nWork reference: ${item.goalId ?? "not supplied"}\nSummary: ${item.summary}\nEvidence references: ${item.evidence.map((ref) => `${ref.type}:${ref.id}`).join(", ")}\nAsk what is incorrect and preserve the original evidence before revising.`,
                        )
                      }
                    />
                  ),
                )}
                {result && (
                  <Proof
                    result={result}
                    task={snapshot.tasks.find(
                      (task) => task.id === result.runId,
                    )}
                    preview={preview}
                  />
                )}
                {result?.goalId && (
                  <Link
                    className="owner-button"
                    href={href("work", result.goalId)}
                  >
                    Open related work
                  </Link>
                )}
              </div>
            )}
            {view === "brief" && (
              <div className="owner-grid">
                <div className="owner-stack">
                  <Card title="Your daily review">
                    {snapshot.brief ? (
                      <>
                        <p className="owner-muted">
                          {date(snapshot.brief.periodStart)} –{" "}
                          {date(snapshot.brief.periodEnd)} · Generated{" "}
                          {date(snapshot.brief.generatedAt)}
                        </p>
                        <h3>Completed in this period</h3>
                        {snapshot.brief.completed.length ? (
                          snapshot.brief.completed.map((item, i) => (
                            <p key={i}>
                              <Link href={href("work", item.goalId)}>
                                {item.taskTitle ?? item.goalTitle}
                              </Link>
                            </p>
                          ))
                        ) : (
                          <p className="owner-muted">
                            No completed work in this brief’s period.
                          </p>
                        )}
                        <h3 style={{ marginTop: 24 }}>Recommended next work</h3>
                        {snapshot.brief.recommendations.length ? (
                          snapshot.brief.recommendations.map((item, i) => (
                            <div key={i}>
                              <p>
                                {item.goalId ? (
                                  <Link href={href("work", item.goalId)}>
                                    {item.title}
                                  </Link>
                                ) : (
                                  item.title
                                )}
                              </p>
                              <p className="owner-muted">
                                {item.whyNow.join(" ")}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="owner-muted">
                            No recommendation recorded. Start with one useful
                            outcome.
                          </p>
                        )}
                      </>
                    ) : (
                      <Empty title="Daily Brief unavailable">
                        Try again when the review service is available. No
                        generated summary has been substituted.
                      </Empty>
                    )}
                  </Card>
                  <Card title="Active work">
                    <WorkList
                      items={work.filter((item) =>
                        ["Working", "Verifying", "Waiting"].includes(
                          item.state,
                        ),
                      )}
                      limit={6}
                    />
                  </Card>
                  <Card title="Important results">
                    {snapshot.outcomes
                      .filter(
                        (item) =>
                          snapshot.brief &&
                          Date.parse(item.occurredAt) >=
                            Date.parse(snapshot.brief.periodStart) &&
                          Date.parse(item.occurredAt) <=
                            Date.parse(snapshot.brief.periodEnd),
                      )
                      .map((item) => (
                        <p key={item.id}>
                          <Link href={href("results", item.id)}>
                            {item.summary}
                          </Link>
                        </p>
                      ))}
                    <Link href={href("results")}>Review all results →</Link>
                  </Card>
                </div>
                <div className="owner-stack">
                  <Card title="Decisions & blockers" highlight>
                    <Link className="owner-button" href={href("needs-you")}>
                      Review Needs you
                    </Link>
                    {snapshot.brief?.blocked.map((item, i) => (
                      <p key={i}>
                        <Link href={href("work", item.goalId)}>
                          {item.taskTitle ?? item.goalTitle}
                        </Link>
                      </p>
                    ))}
                    {snapshot.brief?.atRisk.map((risk, i) => (
                      <p key={i} className="owner-muted">
                        {risk.explanation}
                      </p>
                    ))}
                  </Card>
                  <Card title="Upcoming commitments">
                    {snapshot.brief?.approaching.length ? (
                      snapshot.brief.approaching.map((item, i) => (
                        <p key={i}>
                          <Link href={href("work", item.goalId)}>
                            {item.taskTitle ?? item.goalTitle}
                          </Link>
                          {item.at && ` · ${date(item.at)}`}
                        </p>
                      ))
                    ) : (
                      <p className="owner-muted">
                        {snapshot.brief
                          ? "No approaching commitments in this brief."
                          : "Upcoming commitments are unavailable until the brief can be read."}
                      </p>
                    )}
                    <p className="owner-muted">
                      Scheduled routines have a separate source. This brief does
                      not confirm their next execution time.
                    </p>
                    {!preview && (
                      <Link href="/manage/routines">
                        Review scheduled routines →
                      </Link>
                    )}
                  </Card>
                  <Card title="Memory & Knowledge">
                    <p className="owner-muted">
                      A change summary is not supplied by the current brief
                      contract. Review retained sources in Knowledge.
                    </p>
                    {!preview && (
                      <Link href="/knowledge">Open Knowledge →</Link>
                    )}
                  </Card>
                </div>
              </div>
            )}
            {view === "activity" && (
              <Card title="Important changes">
                {events.length ? (
                  <ol className="owner-list">
                    {events.map((event) => (
                      <li key={event.id}>
                        <span className="owner-eyebrow">{event.source}</span>
                        <p>{event.text}</p>
                        <p className="owner-muted">{date(event.at)}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty title="No result or decision history yet">
                    Work-specific investigation, delegation, and check
                    milestones appear on each Work detail when supplied by the
                    service.
                  </Empty>
                )}
              </Card>
            )}
          </>
        )}
        <footer className="owner-muted" style={{ marginTop: 36 }}>
          <p>
            {checkedAt ? `Checked ${date(checkedAt)}. ` : ""}Lists show the
            records available from each service; they may not include your
            complete history.
          </p>
          <div className="owner-actions">
            {!preview && (
              <>
                <Link href="/manage">Settings & advanced tools</Link>
                <Link href="/files">Files</Link>
                <Link href="/goals">Detailed planning</Link>
                <Link href="/beta-preview">Explore sample journey</Link>
              </>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
