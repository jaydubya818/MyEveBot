"use client";
import type { PublicationReadback } from '@/lib/engineering/publication-contract';
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
import { useDestinationAllowed } from "./destination-gate";
import { WorkInbox } from "./work-inbox";
import { WorkSummary } from "./work-summary";
import { ProductShell } from "./product-shell";

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
  publicationReadback?: PublicationReadback | null;
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
  const destinationAllowed = useDestinationAllowed();
  const advancedAvailable = destinationAllowed("/manage");
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
    if (["brief", "activity", "memory"].includes(view)) jobs.push(read<{ changes: typeof activity }>("/api/beta/activity", "Activity", (d) => setActivity(d.changes)));
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
  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { window.removeEventListener("online", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [refresh]);
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
            {advancedAvailable && r.route === "MYFACTORY" && r.proof.evidence.every(e => e.state === "PASS") && <p><Link href={`/work/${r.work_id}/decision`}>Review owner decision</Link></p>}
            <p>
              Work revision {r.proof.workVersion} · Criteria revision{" "}
              {r.proof.criteriaVersion}
            </p>
            <details>
              <summary>Proof of Work</summary>
              {r.journeyAccounting && <p>{journeyCostText(r.journeyAccounting)}</p>}
              {r.publicationReadback && <p>Current publication: PASS · GitHub CI: {r.publicationReadback.ci.status} · Independent review: {r.publicationReadback.review.status}. {r.publicationReadback.review.summary} Owner acceptance: NOT_RUN. Current Result: PARTIAL.</p>}
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
                {[...new Set(r.proof.artifactRefs)].map((ref) => (
                  <li key={ref}>{ref.startsWith("factory-evidence:sha256:") ? <a href={`/api/beta/evidence?workId=${encodeURIComponent(r.work_id)}&resultId=${encodeURIComponent(r.id)}&reference=${encodeURIComponent(ref)}`}>Download retained Factory evidence</a> : ref}{r.proof.artifactRefs.filter(value=>value===ref).length>1?` — referenced by ${r.proof.artifactRefs.filter(value=>value===ref).length} checks`:''}</li>
                ))}
              </ul>
              {r.proof.limitations.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </details>
            <div className="owner-actions">
              <Link href={`/work?kind=work&id=${r.work_id}`}>Open Work</Link>
              {destinationAllowed("/memory") && <><label>
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
              <Link href={`/memory?workId=${r.work_id}`}>Review learning</Link></>}
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
    <ProductShell title={titles[view]} description={view === "today" ? "A little clarity for your day." : view === "work" ? "What Sofie is doing, and what happened." : view === "needs-you" ? "Decisions that need your judgment." : "Your work, in context."}>
        {loading && <p role="status">Checking your current state…</p>}
        {!!errors.length && (
          <div className="owner-notice" role="alert">
            <h2>Some information is unavailable</h2>
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
            <button onClick={refresh}>Try again</button>
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
                <section className="owner-today-welcome" aria-label="Ask Sofie">
                  <h2>{!works.length && !goals.length && !needs.length && !errors.length ? "Welcome to MyEve" : "What would you like to accomplish?"}</h2>
                  <p className="owner-muted">Sofie is ready. Bring her an idea, a question, or something you need done.</p>
                  <Link className="owner-ask" href="/chat"><span>Ask Sofie…</span><span aria-hidden="true">↗</span></Link>
                </section>
                <WorkInbox overview />
                {needs.length>0&&<Card title="Owner attention"><ul className="owner-list">{needs.slice(0,3).map(item=><li key={item.id}><strong>{item.title}</strong><p>{item.summary}</p></li>)}</ul><Link href="/needs-you">Review all decisions and approvals</Link></Card>}

                {goals.length > 0 && <div className="owner-grid">
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
                </div>}
              </>
            )}
            {view === "brief" && (
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
                    {canonical?.projection ? <WorkSummary work={canonical.projection} /> : <Card title={selectedWork.title}><p>{selectedWork.objective}</p><p role="status">Detailed progress is unavailable.</p><button onClick={refresh}>Try again</button></Card>}

                  </>
                ) : (
                  <>
                    <WorkInbox />
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
                <Empty title="You’re all caught up">
                  Sofie will bring decisions here when she needs you.
                </Empty>
              ))}
            {view === "needs-you" && inboxCursor && (
              <button disabled={busy} onClick={() => void more("inbox")}>
                Load more Inbox items
              </button>
            )}
            {advancedAvailable && view === "needs-you" && results.filter(r => r.route === "MYFACTORY" && r.proof.evidence.every(e => e.state === "PASS")).map(r => <Card key={r.id} title="Verified work needs your decision"><p>Review the retained candidate and choose whether to publish it, keep it private or reject it.</p><Link href={`/work/${r.work_id}/decision`}>Review owner decision</Link></Card>)}
            {view === "results" && resultCards()}
            {["brief", "activity"].includes(view) && (
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
    </ProductShell>
  );
}
