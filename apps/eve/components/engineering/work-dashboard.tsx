"use client";

import { useEffect, useRef, useState } from "react";
import { ExecutionDetail } from "./execution-detail";
import type { Execution, manifest } from "../../lib/engineering/execution";
import type {
  Criterion,
  Work,
  WorkCommand,
  WorkEvent,
  CriteriaRevision,
} from "../../lib/engineering/types";

const field =
  "w-full rounded-lg border border-kumo-line bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-kumo-ring";
const button =
  "min-h-11 rounded-lg border border-kumo-line px-4 py-2 text-sm font-medium hover:bg-kumo-tint disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
const primary =
  "min-h-11 rounded-lg bg-kumo-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
const label = "grid gap-2 text-sm font-medium";
type Detail = {
  work: Work;
  events: WorkEvent[];
  criteriaHistory: CriteriaRevision[];
  execution: Execution | null;
  manifest: ReturnType<typeof manifest> | null;
};
async function api(path = "", init?: RequestInit) {
  const response = await fetch(`/api/engineering/work${path}`, {
    cache: "no-store",
    ...init,
  });
  const body = await response.json().catch(() => ({
    error: "The server returned an unreadable response. Try reloading.",
  }));
  if (!response.ok) throw new Error(body.error || "Work is unavailable.");
  return body;
}
function status(work: Work) {
  if (work.lifecycle !== "active")
    return work.lifecycle[0].toUpperCase() + work.lifecycle.slice(1);
  if (work.control === "human") return "You have control";
  if (work.control === "paused") return "Paused";
  if (work.control === "stopping") return "Stopping";
  return "Needs setup";
}

export function WorkDashboard() {
  const [items, setItems] = useState<Work[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [criteriaEdit, setCriteriaEdit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [query, setQuery] = useState("");
  const [executionReason, setExecutionReason] = useState("");
  const [manifests,setManifests]=useState<ReturnType<typeof manifest>[]>([]);
  const [executionAvailable,setExecutionAvailable]=useState(false);
  const [intake,setIntake]=useState(false);
  const [statusFilter,setStatusFilter]=useState("");
  const intakeKey=useRef("");
  const createKey = useRef("");
  const selection = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  async function refresh() {
    const data = await api();
    setItems(data.work);
    setManifests((data.manifests??[]).filter(Boolean));
    setExecutionAvailable(data.execution.available);
    setExecutionReason(data.execution.reason);
    setLoading(false);
  }
  useEffect(() => {
    void refresh().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, []);
  useEffect(()=>{
    if(!detail?.execution || busy || criteriaEdit)return;
    const id=detail.work.id,version=selection.current;
    const timer=setInterval(()=>{void api(`/${id}`).then(data=>{if(selection.current===version){setDetail(data);if(data.manifest)setManifests(current=>current.map(m=>m.workId===id?data.manifest:m));}}).catch(()=>{
      if(selection.current===version)setDetail(current=>current?.manifest?{...current,manifest:{...current.manifest,status:"Waiting",readiness:{ready:false,reasons:["Current state could not be refreshed; readiness is unconfirmed."]}}}:current);
    });},5000);
    return ()=>clearInterval(timer);
  },[detail?.work.id,!!detail?.execution,busy,criteriaEdit]);
  async function delegate(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");const form=new FormData(event.currentTarget);
    try {const response=await fetch("/api/engineering/intake",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({issue:Number(form.get("issue")),maxCostUsd:Number(form.get("budget")),maxDurationSeconds:Number(form.get("minutes"))*60,idempotencyKey:intakeKey.current})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);setIntake(false);await refresh();await open(data.work.id);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function open(id: string) {
    const version = ++selection.current;
    setError("");
    setNotice("");
    setCreating(false);
    setCriteriaEdit(false);
    setConfirmCancel(false);
    setBusy(true);
    try {
      const data = await api(`/${id}`);
      if (version === selection.current) {
        setDetail(data);
        setItems((current) =>
          current.map((item) => (item.id === data.work.id ? data.work : item)),
        );
        requestAnimationFrame(() => heading.current?.focus());
      }
    } catch (e) {
      if (version === selection.current) setError((e as Error).message);
    } finally {
      if (version === selection.current) setBusy(false);
    }
  }
  async function mutate(id: string, command: WorkCommand) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      setDetail(await api(`/${id}`));
      await refresh();
      setCriteriaEdit(false);
      setConfirmCancel(false);
      setNotice(
        command.operation === "revise"
          ? "Criteria saved as a new version. Earlier evidence cannot satisfy these revised criteria."
          : "Work updated. Its history is preserved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Preserve the same request identity and payload on a network retry.
    const statements = String(data.get("criteria"))
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const raw = {
      title: String(data.get("title")),
      objective: String(data.get("objective")),
      repository: String(data.get("repository")),
      criteria: statements.map((statement, index) => ({
        id: stableCriterionId(createKey.current, index),
        statement,
        method: "test",
      })),
      maxCostUsd: Number(data.get("maxCostUsd")),
      maxDurationSeconds: Number(data.get("minutes")) * 60,
      idempotencyKey: createKey.current,
    };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api("", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(raw),
      });
      await refresh();
      await open(saved.work.id);
      setCreating(false);
      setNotice("Work saved and paused. No execution has started.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = items.filter((w) =>
    `${w.title} ${w.repository}`.toLowerCase().includes(query.toLowerCase()) && (!statusFilter||manifests.find(m=>m.workId===w.id)?.status===statusFilter),
  );
  return (
    <main className="min-h-screen bg-kumo-base text-kumo-default">
      <header className="border-b border-kumo-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-8">
          <a href="/work" className="text-lg font-semibold tracking-tight">
            MyEve <span className="font-normal text-kumo-subtle">/ Work</span>
          </a>
          <nav
            aria-label="Engineering navigation"
            className="flex gap-5 text-sm"
          >
            <a className="underline-offset-4 hover:underline" href="/chat">
              Chat
            </a>
            <a
              className="underline-offset-4 hover:underline"
              href="/manage/relay"
            >
              Agent connections
            </a>
            <a className="underline-offset-4 hover:underline" href="/manage">
              Settings
            </a>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-kumo-subtle">
              Engineering · internal pilot
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Work, with a clear finish.
            </h1>
            <p className="mt-2 text-sm text-kumo-subtle">
              Define the outcome, keep its history, and inspect the evidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">{executionAvailable&&<button className={button} disabled={busy} onClick={()=>{intakeKey.current=crypto.randomUUID();setIntake(!intake);}}>Delegate issue</button>}<button
            className={primary}
            disabled={busy || loading}
            onClick={() => {
              createKey.current = crypto.randomUUID();
              setCreating(true);
              setDetail(null);
              setError("");
              setNotice("");
            }}
          >
            New Work
          </button></div>
        </div>
        <nav aria-label="Work status" className="flex flex-wrap gap-2">{["Working","Waiting","Needs You","Ready for Review","Failed"].map(name=><button key={name} className={button} aria-pressed={statusFilter===name} onClick={()=>setStatusFilter(statusFilter===name?"":name)}>{name} · {manifests.filter(m=>m.status===name).length}</button>)}</nav>
        {intake&&<form className="grid gap-4 rounded-xl border border-kumo-line p-5 sm:grid-cols-3" onSubmit={delegate} aria-label="Delegate GitHub issue"><label className={label}>Issue number<input className={field} type="number" name="issue" min="1" required/></label><label className={label}>Maximum model cost (USD)<input className={field} name="budget" type="number" min="0.1" max="20" step="0.1" defaultValue="5" required/></label><label className={label}>Deadline (minutes)<input className={field} name="minutes" type="number" min="5" max="60" defaultValue="30" required/></label><p className="text-sm text-kumo-subtle sm:col-span-3">Uses the owner-configured private qualification repository, acceptance criteria and protected checks. Publication requires a separate exact-candidate approval.</p><button className={primary} disabled={busy}>Admit Work</button></form>}
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 p-4 text-sm"
          >
            <span>{error}</span>
            <button
              className={button}
              disabled={busy}
              onClick={() => {
                setError("");
                void (detail ? open(detail.work.id) : refresh()).catch((e) =>
                  setError(e.message),
                );
              }}
            >
              Reload
            </button>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-kumo-line bg-kumo-tint p-4 text-sm"
          >
            {notice}
          </p>
        )}
        {executionReason && (
          <aside className="rounded-xl border border-kumo-line p-4 text-sm">
            <strong>Execution setup required</strong>
            <p className="mt-1 text-kumo-subtle">{executionReason}</p>
          </aside>
        )}
        {loading ? (
          <p role="status">Loading Work…</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
            <section aria-label="Work list" className="min-w-0 space-y-3">
              <label className="sr-only" htmlFor="search-work">
                Find Work
              </label>
              <input
                id="search-work"
                className={field}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find Work or repository"
              />
              {visible.length === 0 ? (
                <p className="rounded-xl border border-dashed border-kumo-line p-6 text-sm text-kumo-subtle">
                  {query
                    ? "No matching Work."
                    : error
                      ? "Reload Work to view saved items."
                      : "No Work yet. Start with one bounded engineering task."}
                </p>
              ) : (
                visible.map((w) => (
                  <button
                    key={w.id}
                    disabled={busy}
                    onClick={() => void open(w.id)}
                    aria-pressed={detail?.work.id === w.id}
                    className={`w-full rounded-xl border p-4 text-left ${detail?.work.id === w.id ? "border-kumo-strong bg-kumo-tint" : "border-kumo-line"}`}
                  >
                    <span className="block break-words font-medium">
                      {w.title}
                    </span>
                    <span className="mt-1 block break-all text-xs text-kumo-subtle">
                      {w.repository}
                    </span>
                    <span className="mt-3 block text-xs">{manifests.find(m=>m.workId===w.id)?.status??status(w)}</span>
                  </button>
                ))
              )}
            </section>
            <section
              aria-label="Work detail"
              className="min-w-0 rounded-2xl border border-kumo-line p-5 md:p-7"
            >
              {creating ? (
                <form onSubmit={create} className="space-y-5">
                  <h2 className="text-xl font-semibold">New Work</h2>
                  <label className={label}>
                    Title
                    <input
                      autoFocus
                      name="title"
                      className={field}
                      required
                      maxLength={160}
                    />
                  </label>
                  <label className={label}>
                    Objective
                    <textarea
                      name="objective"
                      className={field}
                      required
                      maxLength={4000}
                      rows={3}
                    />
                  </label>
                  <label className={label}>
                    GitHub repository
                    <input
                      name="repository"
                      className={field}
                      required
                      placeholder="owner/repository"
                      pattern={"[A-Za-z0-9_.\\-]+/[A-Za-z0-9_.\\-]+"}
                    />
                  </label>
                  <label className={label}>
                    Acceptance criteria
                    <textarea
                      name="criteria"
                      className={field}
                      required
                      rows={4}
                      placeholder="One observable requirement per line"
                    />
                  </label>
                  <p className="text-xs text-kumo-subtle">
                    Criteria begin as test requirements. Review their evidence
                    method before execution.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={label}>
                      Cost ceiling (USD)
                      <input
                        name="maxCostUsd"
                        type="number"
                        className={field}
                        required
                        min="0.01"
                        max="100"
                        step="0.01"
                        defaultValue="5"
                      />
                    </label>
                    <label className={label}>
                      Active runtime limit (minutes)
                      <input
                        name="minutes"
                        type="number"
                        className={field}
                        required
                        min="1"
                        max="60"
                        defaultValue="15"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-kumo-subtle">
                    Saving records the intended limits. It does not connect this
                    repository, grant access or spend money.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button className={primary} disabled={busy}>
                      Save Work
                    </button>
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => setCreating(false)}
                    >
                      Discard draft
                    </button>
                  </div>
                </form>
              ) : detail ? (
                <div className="space-y-6">
                  <div>
                    <p className="mb-2 text-sm text-kumo-subtle">
                      {detail.manifest?.status??status(detail.work)} · Version {detail.work.version}
                    </p>
                    <h2
                      ref={heading}
                      tabIndex={-1}
                      className="break-words text-2xl font-semibold outline-none"
                    >
                      {detail.work.title}
                    </h2>
                    <p className="mt-3 whitespace-pre-wrap text-sm">
                      {detail.work.objective}
                    </p>
                    <p className="mt-3 break-all text-xs text-kumo-subtle">
                      {detail.work.repository} · $
                      {detail.work.maxCostUsd.toFixed(2)} ceiling ·{" "}
                      {detail.work.maxDurationSeconds / 60} minutes active
                      runtime
                    </p>
                  </div>
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">
                        Acceptance criteria{" "}
                        <span className="font-normal text-kumo-subtle">
                          v{detail.work.criteriaVersion}
                        </span>
                      </h3>
                      {detail.work.lifecycle === "active" && (
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => setCriteriaEdit(!criteriaEdit)}
                        >
                          {criteriaEdit
                            ? "Keep current criteria"
                            : "Revise criteria"}
                        </button>
                      )}
                    </div>
                    {criteriaEdit ? (
                      <form
                        className="space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          const rows = detail.work.criteria.map((c) => ({
                            ...c,
                            statement: String(f.get(`criterion-${c.id}`)),
                            method: String(
                              f.get(`method-${c.id}`),
                            ) as Criterion["method"],
                          }));
                          void mutate(detail.work.id, {
                            operation: "revise",
                            expectedVersion: detail.work.version,
                            criteria: rows,
                          });
                        }}
                      >
                        {detail.work.criteria.map((c, i) => (
                          <div key={c.id} className="grid gap-2">
                            <label className={label}>
                              Criterion {i + 1}
                              <textarea
                                name={`criterion-${c.id}`}
                                className={field}
                                defaultValue={c.statement}
                                required
                                maxLength={1000}
                              />
                            </label>
                            <label className={label}>
                              Evidence method
                              <select
                                name={`method-${c.id}`}
                                className={field}
                                defaultValue={c.method}
                              >
                                <option value="test">Protected test</option>
                                <option value="human">Human assessment</option>
                              </select>
                            </label>
                          </div>
                        ))}
                        <button className={primary} disabled={busy}>
                          Save new criteria version
                        </button>
                      </form>
                    ) : (
                      <ol className="space-y-3">
                        {detail.work.criteria.map((c, i) => (
                          <li
                            key={c.id}
                            className="flex gap-3 rounded-lg bg-kumo-tint p-3 text-sm"
                          >
                            <span className="text-kumo-subtle">{i + 1}.</span>
                            <div className="min-w-0">
                              <p className="break-words">{c.statement}</p>
                              <p className="mt-1 text-xs text-kumo-subtle">
                                {c.method === "test"
                                  ? "Protected test required"
                                  : "Human assessment required"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                  {detail.execution&&detail.manifest?<ExecutionDetail state={detail.execution} current={detail.manifest} onReload={()=>open(detail.work.id)}/>:<section className="rounded-xl border border-kumo-line p-4">
                    <h3 className="font-semibold">Evidence & readiness</h3>
                    <p className="mt-2 text-sm text-kumo-subtle">
                      Not ready for review. No qualified executor or verified
                      candidate is attached. A description of success does not
                      count as evidence.
                    </p>
                  </section>}
                  {detail.criteriaHistory?.length > 1 && (
                    <details className="rounded-xl border border-kumo-line p-4 text-sm">
                      <summary className="cursor-pointer font-medium">
                        Earlier criteria
                      </summary>
                      <p className="mt-3 text-kumo-subtle">
                        These versions are retained for review. Only the current
                        criteria apply to new evidence.
                      </p>
                      {detail.criteriaHistory
                        .filter(
                          (revision) =>
                            revision.version < detail.work.criteriaVersion,
                        )
                        .map((revision) => (
                          <section
                            key={revision.version}
                            className="mt-4 border-t border-kumo-line pt-3"
                          >
                            <h4 className="font-medium">
                              Criteria v{revision.version}
                            </h4>
                            <ol className="mt-2 list-decimal space-y-2 pl-5">
                              {revision.criteria.map((criterion) => (
                                <li key={criterion.id} className="break-words">
                                  {criterion.statement}{" "}
                                  <span className="text-kumo-subtle">
                                    (
                                    {criterion.method === "human"
                                      ? "human assessment"
                                      : "protected test"}
                                    )
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </section>
                        ))}
                    </details>
                  )}
                  <section className="space-y-3">
                    <h3 className="font-semibold">Control</h3>
                    <div className="flex flex-wrap gap-2">
                      {detail.work.lifecycle === "active" ? (
                        <>
                          {detail.work.control !== "paused" && (
                            <button
                              className={button}
                              disabled={busy}
                              onClick={() =>
                                void mutate(detail.work.id, {
                                  operation: "pause",
                                  expectedVersion: detail.work.version,
                                })
                              }
                            >
                              Stop
                            </button>
                          )}
                          {detail.work.control !== "human" && (
                            <button
                              className={button}
                              disabled={busy}
                              onClick={() =>
                                void mutate(detail.work.id, {
                                  operation: "takeover",
                                  expectedVersion: detail.work.version,
                                })
                              }
                            >
                              Take over
                            </button>
                          )}
                          {detail.work.control !== "agent" && (
                            <button
                              className={button}
                              disabled={busy}
                              onClick={() =>
                                void mutate(detail.work.id, {
                                  operation: "resume",
                                  expectedVersion: detail.work.version,
                                })
                              }
                            >
                              Give back to Sofie
                            </button>
                          )}
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() => setConfirmCancel(true)}
                          >
                            Cancel Work
                          </button>
                        </>
                      ) : (
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() =>
                            void mutate(detail.work.id, {
                              operation: "reopen",
                              expectedVersion: detail.work.version,
                            })
                          }
                        >
                          Reopen paused
                        </button>
                      )}
                    </div>
                    {confirmCancel && (
                      <div
                        role="group"
                        aria-label="Confirm cancellation"
                        className="rounded-lg border border-kumo-line p-4 text-sm"
                      >
                        <p>
                          Cancel this Work? Its criteria and history will be
                          retained. No execution is currently attached.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() =>
                              void mutate(detail.work.id, {
                                operation: "cancel",
                                expectedVersion: detail.work.version,
                              })
                            }
                          >
                            Confirm cancellation
                          </button>
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() => setConfirmCancel(false)}
                          >
                            Keep Work active
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                  <section>
                    <h3 className="mb-3 font-semibold">Activity</h3>
                    <ol className="space-y-2 text-sm">
                      {detail.events.map((e) => (
                        <li
                          key={e.id}
                          className="flex flex-wrap justify-between gap-2 border-t border-kumo-line pt-2"
                        >
                          <span>
                            {e.kind === "created"
                              ? "Work created"
                              : e.kind === "revise"
                                ? "Criteria revised"
                                : e.kind}{" "}
                            · v{e.version}
                          </span>
                          <time
                            className="text-xs text-kumo-subtle"
                            dateTime={e.createdAt}
                          >
                            {new Date(e.createdAt).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <h2 className="text-xl font-medium">
                    One responsibility. A durable history.
                  </h2>
                  <p className="mx-auto mt-3 max-w-sm text-sm text-kumo-subtle">
                    Select Work to inspect its objective, criteria and next
                    step, or create your first bounded task.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

// Deterministic UUIDs within a draft make lost-response retries byte-identical.
function stableCriterionId(key: string, index: number) {
  return `${key.slice(0, 24)}${index.toString(16).padStart(12, "0")}`;
}
