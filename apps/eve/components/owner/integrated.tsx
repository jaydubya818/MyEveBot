"use client";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import Link from "next/link";
import { journeyCostText, type JourneyAccounting } from "@/lib/digital-worker/model-accounting";
import { ownerRequest, OwnerRequestError } from "./data";
import { Card, Empty, State, date } from "./primitives";
import type { GoalWorkQueries } from "@/lib/goal-work/projections";
import type { Work } from "@/lib/engineering/types";
import type { EngineeringFact } from "@/lib/engineering/knowledge";
import type { ProofOfWork } from "@/lib/digital-worker/contracts";
import type { LearningFamily } from "@/lib/total-recall/learning";
import type { AttentionView } from "@/lib/universal-inbox/contracts";
import "./owner.css";
import { Responsibilities } from "./responsibilities";
import { OwnerNavigation } from "./navigation";

type CanonicalWork = Awaited<
  ReturnType<
    import("@/lib/beta-integration/canonical-work").CanonicalBetaWork["projection"]
  >
>;
type Today = Awaited<ReturnType<GoalWorkQueries["today"]>>;
type Brief = Awaited<ReturnType<GoalWorkQueries["brief"]>>;
type Result = {
  id: string;
  work_id: string;
  proof: ProofOfWork;
  journeyAccounting?: JourneyAccounting;
  content_hash: string;
  source: "LOCAL_FIXTURE" | "CANONICAL";
  created_at: string;
  candidate_sha: string;
  route: "DIRECT_SOFIE" | "MYFACTORY" | "HUMAN" | null;
  verification_mode: "CONTROLLED_LOCAL_FIXTURE" | "NOT_LIVE_QUALIFIED";
};
type View =
  | "today"
  | "work"
  | "needs-you"
  | "brief"
  | "results"
  | "activity"
  | "welcome"
  | "new"
  | "memory";
const titles: Record<View, string> = {
  today: "Today",
  work: "Work",
  "needs-you": "Needs you",
  brief: "Daily Brief",
  results: "Results",
  activity: "Activity",
  welcome: "Meet Sofie",
  new: "Give Sofie an outcome",
  memory: "Memory and learning",
};
const post = (resource: string, body: unknown) =>
  ownerRequest<Record<string, unknown>>(`/api/beta/${resource}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export function IntegratedExperience({
  view = "today",
  selectedId,
  selectedKind,
}: {
  view?: View;
  selectedId?: string;
  selectedKind?: "goal" | "work";
}) {
  const [today, setToday] = useState<Today | null>(null),
    [works, setWorks] = useState<Work[]>([]),
    [results, setResults] = useState<Result[]>([]),
    [inbox, setInbox] = useState<AttentionView[]>([]),
    [brief, setBrief] = useState<Brief | null>(null),
    [facts, setFacts] = useState<EngineeringFact[]>([]),
    [families, setFamilies] = useState<LearningFamily[]>([]);
  const [canonical, setCanonical] = useState<CanonicalWork | null>(null);
  const [activity, setActivity] = useState<
    Array<{
      id: string;
      kind: string;
      summary: string;
      at: string;
      work_id: string | null;
    }>
  >([]);
  const [feedbackScope, setFeedbackScope] = useState<"WORK" | "REPOSITORY">(
    "WORK",
  );
  const [loading, setLoading] = useState(true),
    [errors, setErrors] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [inboxCursor, setInboxCursor] = useState<string | null>(null);
  const [memoryWork, setMemoryWork] = useState(selectedId ?? "");
  const pending = useRef(false),
    intent = useRef<{
      id: string;
      taskId: string;
      planCommandId: string;
    } | null>(null);
  const feedbackIds = useRef(new Map<string, string>()),
    decisionIds = useRef(new Map<string, string>());
  const interval = useRef({
    since: new Date(Date.now() - 86400000).toISOString(),
    until: new Date().toISOString(),
  });
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let authenticationLost = false;
    setLoading(true);
    setErrors([]);
    const read = async <T,>(
      path: string,
      label: string,
      apply: (data: T) => void,
    ) => {
      try {
        const value = await ownerRequest<T>(path, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted && !authenticationLost) apply(value);
      } catch (e) {
        if (!controller.signal.aborted) {
          if (e instanceof OwnerRequestError && [401, 403].includes(e.status)) {
            authenticationLost = true;
            setToday(null);
            setWorks([]);
            setCanonical(null);
            setResults([]);
            setInbox([]);
            setFacts([]);
            setFamilies([]);
            setBrief(null);
            setActivity([]);
          }
          setErrors((old) => [
            ...old,
            `${label}: ${e instanceof Error ? e.message : "Unavailable"}`,
          ]);
        }
      }
    };
    const jobs = [
      read<{ changes: typeof activity }>(
        "/api/beta/activity",
        "Memory and learning changes",
        (d) => setActivity(d.changes),
      ),
      selectedKind === "goal" && selectedId
        ? read<{ goal: Today["goals"][number] }>(
            `/api/beta/goals?goalId=${encodeURIComponent(selectedId)}`,
            "Goals",
            (d) =>
              setToday({
                contractVersion: 1,
                goals: [d.goal],
                nextCursor: null,
                canProceed: [],
                doing: [],
                blocked: [],
                needsYou: [],
                recentlyCompleted: [],
              }),
          )
        : read<Today>("/api/beta/goals?limit=20", "Goals", setToday),
      read<{ works: Work[]; canonical?: CanonicalWork }>(
        `/api/beta/work${view === "work" && selectedKind === "work" && selectedId ? `?workId=${encodeURIComponent(selectedId)}` : ""}`,
        "Work",
        (d) => {
          setWorks(d.works);
          setCanonical(d.canonical ?? null);
        },
      ),
      read<{ results: Result[] }>("/api/beta/results", "Results", (d) =>
        setResults(d.results),
      ),
      read<{ items: AttentionView[]; nextCursor: string | null }>(
        "/api/beta/inbox?limit=100",
        "Needs you",
        (d) => {
          setInbox(d.items);
          setInboxCursor(d.nextCursor);
        },
      ),
    ];
    if (view === "brief" || view === "activity")
      jobs.push(
        read<Brief>(
          `/api/beta/goals?view=brief&since=${encodeURIComponent(interval.current.since)}&until=${encodeURIComponent(interval.current.until)}`,
          "Daily Brief",
          setBrief,
        ),
      );
    if (view === "memory")
      jobs.push(
        read<{ facts: EngineeringFact[]; families: LearningFamily[] }>(
          `/api/beta/memory${memoryWork ? `?workId=${encodeURIComponent(memoryWork)}` : ""}`,
          "Memory",
          (d) => {
            setFacts(d.facts);
            setFamilies(d.families);
          },
        ),
      );
    Promise.all(jobs).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [view, revision, memoryWork, selectedId, selectedKind]);
  async function mutate(action: () => Promise<unknown>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
      setNotice(success);
      refresh();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "The change was not confirmed. Refresh before retrying.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    intent.current ??= {
      id: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      planCommandId: crypto.randomUUID(),
    };
    const ids = intent.current;
    await mutate(async () => {
      await post("start", {
        goal: {
          id: ids.id,
          objective: String(data.get("objective")),
          criteria: String(data.get("criteria"))
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          priority: "normal",
        },
        taskId: ids.taskId,
        planCommandId: ids.planCommandId,
      });
      intent.current = null;
    }, "Goal and initial Task saved. Work intent is awaiting admission.");
  }
  const goals = today?.goals ?? [],
    selectedGoal =
      selectedKind !== "work"
        ? goals.find((g) => g.id === selectedId)
        : undefined,
    selectedWork =
      selectedKind !== "goal"
        ? works.find((w) => w.id === selectedId)
        : undefined;
  const needs = inbox.filter((i) => i.needsYou),
    completed = goals.filter((g) => g.status === "completed");
  async function more(kind: "goals" | "inbox" | "brief") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (kind === "goals" && today?.nextCursor) {
        const next = await ownerRequest<Today>(
          `/api/beta/goals?limit=20&cursor=${encodeURIComponent(today.nextCursor)}`,
        );
        setToday({
          ...next,
          goals: [
            ...today.goals,
            ...next.goals.filter(
              (g) => !today.goals.some((p) => p.id === g.id),
            ),
          ],
        });
      }
      if (kind === "inbox" && inboxCursor) {
        const next = await ownerRequest<{
          items: AttentionView[];
          nextCursor: string | null;
        }>(
          `/api/beta/inbox?limit=100&cursor=${encodeURIComponent(inboxCursor)}`,
        );
        setInbox((old) => [
          ...old,
          ...next.items.filter((i) => !old.some((p) => p.id === i.id)),
        ]);
        setInboxCursor(next.nextCursor);
      }
      if (kind === "brief" && brief?.nextCursor) {
        const next = await ownerRequest<Brief>(
          `/api/beta/goals?view=brief&since=${encodeURIComponent(brief.since)}&until=${encodeURIComponent(brief.until)}&cursorAt=${encodeURIComponent(brief.nextCursor.at)}&cursorId=${encodeURIComponent(brief.nextCursor.id)}`,
        );
        setBrief({
          ...next,
          changes: [
            ...brief.changes,
            ...next.changes.filter(
              (e) => !brief.changes.some((p) => p.id === e.id),
            ),
          ],
        });
      }
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "The next page is unavailable.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function goalList() {
    return goals.length ? (
      <ul className="owner-list">
        {goals.map((g) => (
          <li key={g.id}>
            <div className="owner-row">
              <Link
                className="owner-work-link"
                href={`/work?kind=goal&id=${encodeURIComponent(g.id)}`}
              >
                {g.objective}
              </Link>
              <State value={g.status} />
            </div>
            <p className="owner-muted">
              {g.progress.completedOutcomes} of {g.progress.requiredOutcomes}{" "}
              outcomes verified · {g.progress.completedTasks} of{" "}
              {g.progress.requiredTasks} Tasks complete
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <Empty title="No Goals yet">
        Start with one useful outcome for Sofie.
      </Empty>
    );
  }
  function resultCards() {
    return results.length ? (
      results
        .filter(
          (r) => !selectedId || r.id === selectedId || r.work_id === selectedId,
        )
        .map((r) => (
          <Card
            key={r.id}
            title={
              works.find((w) => w.id === r.work_id)?.title ?? "Retained Result"
            }
          >
            <p>
              <State value={r.proof.outcome} />
            </p>
            <p className="owner-muted">
              {r.source === "LOCAL_FIXTURE"
                ? "Local fixture Result · No external provider ran"
                : "Canonical Result"}{" "}
              · {date(r.created_at)}
            </p>
            <p>
              {r.route ? `Route: ${r.route}` : "Route not recorded"} ·{" "}
              {r.verification_mode === "CONTROLLED_LOCAL_FIXTURE"
                ? "Controlled local verification fixture · No live verification"
                : "Live verification not qualified"}
            </p>
            <p className="owner-muted">
              Candidate: {r.candidate_sha ?? r.proof.resultRevision}
            </p>
            {r.route === "MYFACTORY" && r.proof.evidence.every(e => e.state === "PASS") && <p><Link href={`/work/${r.work_id}/decision`}>Review owner decision</Link></p>}
            <p>
              Work revision {r.proof.workVersion} · Criteria revision{" "}
              {r.proof.criteriaVersion}
            </p>
            <details>
              <summary>Proof of Work</summary>
              {r.journeyAccounting && <p>{journeyCostText(r.journeyAccounting)}</p>}
              <ul className="owner-list">
                {r.proof.evidence.map((e) => (
                  <li key={e.criterionId}>
                    <strong>{e.state}</strong> · {e.producer}
                    <p className="owner-muted">{e.sourceRef}</p>
                  </li>
                ))}
              </ul>
              <p className="owner-muted">Result digest: {r.content_hash}</p>
              <ul className="owner-list">
                {r.proof.artifactRefs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
              {r.proof.limitations.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </details>
            <div className="owner-actions">
              <Link href={`/work?kind=work&id=${r.work_id}`}>Open Work</Link>
              <label>
                Learning scope
                <select
                  value={feedbackScope}
                  onChange={(e) =>
                    setFeedbackScope(e.target.value as "WORK" | "REPOSITORY")
                  }
                  disabled={busy}
                >
                  <option value="WORK">This Work only</option>
                  <option value="REPOSITORY">
                    Comparable Work in this repository
                  </option>
                </select>
              </label>
              <button
                disabled={busy}
                onClick={() => {
                  const feedbackKey = r.id + ":" + feedbackScope;
                  let eventId = feedbackIds.current.get(feedbackKey);
                  if (!eventId) {
                    eventId = crypto.randomUUID();
                    feedbackIds.current.set(feedbackKey, eventId);
                  }
                  void mutate(
                    () =>
                      post("feedback", {
                        resultHash: r.content_hash,
                        feedback: {
                          eventId,
                          workId: r.work_id,
                          workVersion: r.proof.workVersion,
                          workType: "implementation",
                          type: "prefer_this",
                          target: "result",
                          targetRef: r.id,
                          note: "Cite original sources in this Work.",
                          behavior: "cite_sources",
                          scope: feedbackScope,
                        },
                      }),
                    "Feedback saved as a learning candidate. Evaluation and promotion require review.",
                  );
                }}
              >
                Prefer source citations
              </button>
              <Link href={`/memory?workId=${r.work_id}`}>Review learning</Link>
            </div>
          </Card>
        ))
    ) : (
      <Empty title="No retained Results">
        Verified outputs and their evidence will appear here.
      </Empty>
    );
  }
  return (
    <div className="owner-shell">
      <a className="owner-skip" href="#owner-content">
        Skip to content
      </a>
      <header className="owner-top">
        <Link href="/today" className="owner-brand">
          MyEve<span className="owner-muted"> / Sofie</span>
        </Link>
        <OwnerNavigation />
      </header>
      <main id="owner-content" tabIndex={-1} className="owner-content">
        <header className="owner-heading">
          <div>
            <span className="owner-eyebrow">Your outcomes, in focus</span>
            <h1>{titles[view]}</h1>
            <p className="owner-muted">
              Goals, decisions, evidence, and progress in one place.
            </p>
          </div>
          <div className="owner-actions">
            <button onClick={refresh} disabled={loading}>
              Refresh
            </button>
            <Link href="/work/new">New Goal</Link>
          </div>
        </header>
        <p className="owner-muted">
          Private alpha integration · Local execution only · Live Relay
          unavailable
        </p>
        {loading && <p role="status">Checking your current state…</p>}
        {!!errors.length && (
          <div className="owner-notice" role="alert">
            <h2>Some information is unavailable</h2>
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
            <Link href="/login">Sign in</Link>
          </div>
        )}
        {notice && (
          <p className="owner-notice" role="status">
            {notice}
          </p>
        )}
        {!loading && (
          <>
            {(view === "welcome" || view === "new") && (
              <Card
                title={
                  view === "welcome"
                    ? "Start with one outcome"
                    : "What should Sofie help accomplish?"
                }
              >
                <p>
                  Set the outcome and how you will know it is done. Sofie keeps
                  the Goal, initial Task, and Work intent connected.
                </p>
                <form onSubmit={createGoal} className="owner-form">
                  <label>
                    Outcome
                    <input
                      name="objective"
                      required
                      maxLength={200}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Success criteria, one per line
                    <textarea
                      name="criteria"
                      required
                      maxLength={4000}
                      disabled={busy}
                    />
                  </label>
                  <button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Create Goal"}
                  </button>
                </form>
              </Card>
            )}
            {view === "today" && (
              <>
                <Responsibilities />
                <div className="owner-grid">
                  <Card title="Current Goals">
                    {goalList()}
                    {today?.nextCursor && (
                      <button
                        disabled={busy}
                        onClick={() => void more("goals")}
                      >
                        Load more Goals
                      </button>
                    )}
                  </Card>
                  <Card title="Needs you">
                    <p>
                      {needs.length
                        ? `${needs.length} decisions need your judgment.`
                        : "No decisions need your attention in this page."}
                    </p>
                    <Link href="/needs-you">Review decisions</Link>
                  </Card>
                  <Card title="Verified outcomes">
                    <p>{completed.length} Goals complete in this page.</p>
                    <Link href="/results">Review Results and proof</Link>
                  </Card>
                </div>
              </>
            )}
            {["today", "brief"].includes(view) && (
              <>
                <Card title="Active Work">
                  {works.filter((w) => w.lifecycle === "active").length ? (
                    <ul className="owner-list">
                      {works
                        .filter((w) => w.lifecycle === "active")
                        .slice(0, 10)
                        .map((w) => (
                          <li key={w.id}>
                            <Link href={`/work?kind=work&id=${w.id}`}>
                              {w.title}
                            </Link>
                            <p>
                              Control: {w.control} · Revision {w.version}
                            </p>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p>No active Work recorded.</p>
                  )}
                </Card>
                <Card title="Recent Results">
                  {results.length ? (
                    <ul className="owner-list">
                      {results.slice(0, 5).map((r) => (
                        <li key={r.id}>
                          <Link href={`/work?kind=work&id=${r.work_id}`}>
                            {works.find((w) => w.id === r.work_id)?.title ??
                              "Retained Result"}
                          </Link>
                          <p>
                            {r.proof.outcome} ·{" "}
                            {r.route ?? "Route not recorded"} ·{" "}
                            {date(r.created_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No retained Results recorded.</p>
                  )}
                </Card>
              </>
            )}
            {view === "brief" && (
              <>
                <Card title="Goal progress">{goalList()}</Card>
                <Card title="Needs your judgment">
                  <p>{needs.length} current decisions on this page.</p>
                  <Link href="/needs-you">Review decisions and blockers</Link>
                </Card>
              </>
            )}
            {view === "work" && (
              <>
                {selectedGoal ? (
                  <Card title={selectedGoal.objective}>
                    <p>
                      <State value={selectedGoal.status} />
                    </p>
                    <p>
                      {selectedGoal.progress.completedOutcomes} of{" "}
                      {selectedGoal.progress.requiredOutcomes} outcomes verified
                    </p>
                    {selectedGoal.plan && (
                      <p>Plan: {selectedGoal.plan.summary}</p>
                    )}
                    <ul className="owner-list">
                      {selectedGoal.tasks.map((t) => (
                        <li key={t.id}>
                          <h3>{t.objective}</h3>
                          <State value={t.status} />
                          <p>{t.nextAction}</p>
                          {t.currentWork && (
                            <Link href={`/work?kind=work&id=${t.currentWork}`}>
                              Open Work
                            </Link>
                          )}
                          {t.dependencies.map((d) => (
                            <p key={d.id}>
                              {d.label} · {d.satisfied ? "Resolved" : "Waiting"}
                            </p>
                          ))}
                        </li>
                      ))}
                    </ul>
                    {selectedGoal.truncated && (
                      <p>Details are limited to the current bounded page.</p>
                    )}
                  </Card>
                ) : selectedWork ? (
                  <>
                    <Card title={selectedWork.title}>
                      <p>{selectedWork.objective}</p>
                      <p>
                        Control: {selectedWork.control} ·{" "}
                        {selectedWork.lifecycle}
                      </p>
                      <p>
                        Revision {selectedWork.version} ·{" "}
                        {selectedWork.repository}
                      </p>
                      <p>
                        Generation {selectedWork.generation}. Creating Work does
                        not authorize execution.
                      </p>
                      {canonical?.admission && (
                        <p role="status">
                          {canonical.admission.current
                            ? "Admission"
                            : "Historical admission"}
                          : {String(canonical.admission.status)} ·{" "}
                          {String(canonical.admission.reason)}
                        </p>
                      )}
                      <div className="owner-actions">
                        {selectedWork.lifecycle === "active" &&
                          ["start", "reconcile", "stop", "takeover"].map(
                            (operation) => (
                              <button
                                key={"factory-" + operation}
                                disabled={busy}
                                onClick={() =>
                                  void mutate(
                                    () =>
                                      post("factory", {
                                        workId: selectedWork.id,
                                        operation,
                                        expectedWorkVersion:
                                          selectedWork.version,
                                        expectedWorkGeneration:
                                          selectedWork.generation,
                                      }),
                                    "Factory request saved. Review Current Truth; execution requires qualified admission.",
                                  )
                                }
                              >
                                {operation === "start"
                                  ? "Start MyFactory"
                                  : operation === "reconcile"
                                    ? "Refresh MyFactory"
                                    : operation === "stop"
                                      ? "Stop MyFactory"
                                      : "Take over MyFactory"}
                              </button>
                            ),
                          )}
                      </div>
                      <div className="owner-actions">
                        {selectedWork.lifecycle === "active" &&
                          (selectedWork.control === "paused"
                            ? ["resume", "admit"]
                            : ["pause", "admit"]
                          ).map((operation) => (
                            <button
                              key={operation}
                              disabled={busy}
                              onClick={() =>
                                void mutate(
                                  () =>
                                    post("work", {
                                      operation,
                                      workId: selectedWork.id,
                                      expectedVersion: selectedWork.version,
                                      expectedGeneration:
                                        selectedWork.generation,
                                    }),
                                  operation === "admit"
                                    ? "Admission evaluated. Review the retained outcome."
                                    : "Work control saved. Review current admission before proceeding.",
                                )
                              }
                            >
                              {operation === "admit"
                                ? "Check admission"
                                : operation === "resume"
                                  ? "Resume Work"
                                  : "Pause Work"}
                            </button>
                          ))}
                        {selectedWork.lifecycle === "active" &&
                          selectedWork.control === "paused" &&
                          canonical?.continuations
                            .filter(
                              (c) =>
                                c.status === "ELIGIBLE" &&
                                c.work_version === selectedWork.version &&
                                c.work_generation === selectedWork.generation,
                            )
                            .map((c) => (
                              <button
                                key={String(c.response_id)}
                                disabled={busy}
                                onClick={() =>
                                  void mutate(
                                    () =>
                                      post("work", {
                                        operation: "continue",
                                        workId: selectedWork.id,
                                        expectedVersion: selectedWork.version,
                                        expectedGeneration:
                                          selectedWork.generation,
                                        responseId: c.response_id,
                                      }),
                                    "Decision applied to Work control. Current admission is evaluated separately.",
                                  )
                                }
                              >
                                Continue from decision
                              </button>
                            ))}
                      </div>
                      <ul>
                        {selectedWork.criteria.map((c) => (
                          <li key={c.id}>{c.statement}</li>
                        ))}
                      </ul>
                      <Link href={`/memory?workId=${selectedWork.id}`}>
                        Memory used for this Work
                      </Link>
                    </Card>
                    {resultCards()}
                  </>
                ) : (
                  <>
                    <Card title="Goals">
                      {goalList()}
                      {today?.nextCursor && (
                        <button
                          disabled={busy}
                          onClick={() => void more("goals")}
                        >
                          Load more Goals
                        </button>
                      )}
                    </Card>
                    <Card title="Work intents">
                      {works.length ? (
                        <ul className="owner-list">
                          {works.map((w) => (
                            <li key={w.id}>
                              <Link href={`/work?kind=work&id=${w.id}`}>
                                {w.title}
                              </Link>
                              <p className="owner-muted">
                                {w.lifecycle} ·{" "}
                                {w.control === "paused"
                                  ? "Awaiting admission"
                                  : w.control}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Empty title="No Work yet">
                          A Goal and Task create a durable Work intent.
                        </Empty>
                      )}
                    </Card>
                  </>
                )}
              </>
            )}
            {view === "needs-you" &&
              (needs.length ? (
                needs.map((i) => (
                  <Card key={i.id} title={i.action?.prompt ?? i.title}>
                    <p>{i.summary}</p>
                    {i.workId && (
                      <Link href={`/work?kind=work&id=${i.workId}`}>
                        Open Work
                      </Link>
                    )}
                    <div className="owner-actions">
                      {i.action?.options.map((answer) => (
                        <button
                          disabled={busy}
                          key={answer}
                          onClick={() => {
                            let key = decisionIds.current.get(i.id);
                            if (!key) {
                              key = crypto.randomUUID();
                              decisionIds.current.set(i.id, key);
                            }
                            void mutate(
                              () =>
                                post("goals", {
                                  operation: "decision",
                                  response: {
                                    itemId: i.id,
                                    actionId: i.action!.id,
                                    actionBinding: i.actionBinding,
                                    expectedRevision: i.revision,
                                    idempotencyKey: key,
                                    answer,
                                  },
                                }),
                              "Decision saved. Its continuation receipt is retained.",
                            );
                          }}
                        >
                          {answer}
                        </button>
                      ))}
                    </div>
                  </Card>
                ))
              ) : (
                <Empty title="Nothing needs your judgment">
                  Resolved decisions remain in the durable Inbox history.
                </Empty>
              ))}
            {view === "needs-you" && inboxCursor && (
              <button disabled={busy} onClick={() => void more("inbox")}>
                Load more Inbox items
              </button>
            )}
            {view === "needs-you" && results.filter(r => r.route === "MYFACTORY" && r.proof.evidence.every(e => e.state === "PASS")).map(r => <Card key={r.id} title="Verified work needs your decision"><p>Review the retained candidate and choose whether to publish it, keep it private or reject it.</p><Link href={`/work/${r.work_id}/decision`}>Review owner decision</Link></Card>)}
            {view === "results" && resultCards()}
            {["today", "brief", "activity"].includes(view) && (
              <Card title="Memory and learning changes">
                {activity.length ? (
                  <ul className="owner-list">
                    {activity.map((change) => (
                      <li key={change.id}>
                        <strong>{change.kind}</strong>
                        <p>{change.summary}</p>
                        <p className="owner-muted">{date(change.at)}</p>
                        <Link
                          href={
                            change.work_id
                              ? `/memory?workId=${change.work_id}`
                              : "/memory"
                          }
                        >
                          Review memory and learning
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No memory or learning changes recorded.</p>
                )}
              </Card>
            )}
            {(view === "brief" || view === "activity") && brief && (
              <>
                <Card title="Since your last daily window">
                  <p>
                    {date(brief.since)} – {date(brief.until)}
                  </p>
                  {brief.changes.length ? (
                    <ul className="owner-list">
                      {brief.changes.map((e) => (
                        <li key={e.id}>
                          <Link
                            href={`/work?kind=goal&id=${encodeURIComponent(e.goalId ?? "")}`}
                          >
                            {e.summary}
                          </Link>
                          <p className="owner-muted">{date(e.at)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty title="No changes recorded">
                      There are no Goal events in this time window.
                    </Empty>
                  )}
                  {brief.nextCursor && (
                    <button disabled={busy} onClick={() => void more("brief")}>
                      Load more changes
                    </button>
                  )}
                </Card>
                <Card title="Upcoming dependencies">
                  {brief.upcoming.length ? (
                    brief.upcoming.map((d, i) => (
                      <p key={i}>
                        {d.label} ·{" "}
                        {d.dueAt ? date(d.dueAt) : "Time unconfirmed"} ·
                        Commitment time, execution unconfirmed
                      </p>
                    ))
                  ) : (
                    <p>No upcoming scheduled dependencies recorded.</p>
                  )}
                </Card>
              </>
            )}
            {view === "memory" && (
              <>
                <Card title="Work memory">
                  <label>
                    Work
                    <select
                      value={memoryWork}
                      onChange={(e) => setMemoryWork(e.target.value)}
                    >
                      <option value="">Choose Work</option>
                      {works.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {facts.length ? (
                    <ul className="owner-list">
                      {facts.map((f) => (
                        <li key={f.id}>
                          <h3>{f.statement}</h3>
                          <p>
                            {f.status === "active"
                              ? "Current Truth"
                              : `History · ${f.status}`}{" "}
                            · Work-scoped
                          </p>
                          <p className="owner-muted">
                            Source: {f.source.referenceUri ?? f.source.id}
                          </p>
                          {f.status === "active" && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const statement = String(
                                  new FormData(e.currentTarget).get(
                                    "statement",
                                  ),
                                );
                                void mutate(
                                  () =>
                                    post("memory", {
                                      workId: memoryWork,
                                      knowledgeId: f.id,
                                      statement,
                                    }),
                                  "Correction saved. The previous fact remains in history.",
                                );
                              }}
                            >
                              <label>
                                Correct this fact
                                <input
                                  name="statement"
                                  required
                                  maxLength={4000}
                                  disabled={busy}
                                />
                              </label>
                              <button disabled={busy}>Save correction</button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty
                      title={
                        memoryWork
                          ? "No facts recorded for this Work"
                          : "No Work memory selected"
                      }
                    >
                      {memoryWork
                        ? "Facts and their sources will appear here when recorded."
                        : "Choose Work to inspect its facts, sources, and correction history."}
                    </Empty>
                  )}
                  <Link href="/knowledge">Open owner Knowledge</Link>
                </Card>
                <Card title="Governed learning">
                  {families.length ? (
                    families.map((f) => (
                      <article key={f.id}>
                        <h3>
                          {f.scope.repository} · {f.scope.workType}
                        </h3>
                        <p>
                          {f.scope.workId
                            ? `Work only: ${works.find((w) => w.id === f.scope.workId)?.title ?? f.scope.workId}`
                            : "Repository scope · applies to comparable Work"}
                        </p>
                        {f.versions.map((v) => (
                          <div key={v.version}>
                            <p>
                              {v.behavior.replaceAll("_", " ")} · Version{" "}
                              {v.version} · <strong>{v.status}</strong>
                            </p>
                            <p>
                              {v.evaluation
                                ? `Evaluation: ${v.evaluation.result}`
                                : "Evaluation has not run"}
                            </p>
                            <div className="owner-actions">
                              {(
                                [
                                  ...(v.status === "CANDIDATE" && !v.evaluation
                                    ? ["evaluate"]
                                    : []),
                                  ...(v.evaluation?.result === "PASS" &&
                                  v.status === "CANDIDATE"
                                    ? ["promote"]
                                    : []),
                                  ...(v.status === "PROMOTED"
                                    ? ["rollback"]
                                    : []),
                                ] as Array<"evaluate" | "promote" | "rollback">
                              ).map((action) => (
                                <button
                                  key={action}
                                  disabled={busy}
                                  onClick={() => {
                                    const w = works.find(
                                      (w) =>
                                        w.id ===
                                        (f.scope.workId ??
                                          v.evidence[0]?.workId),
                                    );
                                    if (!w) return;
                                    void mutate(
                                      () =>
                                        post("learning", {
                                          workId: w.id,
                                          workVersion: w.version,
                                          workType: f.scope.workType,
                                          familyId: f.id,
                                          revision: f.revision,
                                          command: {
                                            eventId: crypto.randomUUID(),
                                            action,
                                            version: v.version,
                                            hash: v.hash,
                                            reason: `Owner selected ${action}`,
                                          },
                                        }),
                                      `Learning ${action} confirmed.`,
                                    );
                                  }}
                                >
                                  {action[0].toUpperCase() + action.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </article>
                    ))
                  ) : (
                    <Empty title="No learning candidates">
                      Result feedback can become a candidate. Promotion requires
                      evaluation and your decision.
                    </Empty>
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
