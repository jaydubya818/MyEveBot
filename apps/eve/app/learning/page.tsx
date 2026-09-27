"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LearningFamily, LearningVersion } from "../../lib/total-recall/learning.ts";

const labels = { cite_sources: "Cite original sources", state_uncertainty: "Label uncertainty and conflicts" } as const;
type WorkChoice = { id: string; title: string; version: number; repository: string };
export default function LearningPage() {
  const [families, setFamilies] = useState<LearningFamily[]>([]);
  const [works, setWorks] = useState<WorkChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [correction, setCorrection] = useState<{ version: number; workId: string; scope: "WORK" | "REPOSITORY"; workType: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/learning", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Learning is unavailable.");
      setFamilies(data.families); setWorks(data.works);
    } catch (e) { setError(e instanceof Error ? e.message : "Learning is unavailable."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(body: unknown, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The change could not be saved.");
      await load(); setNotice(message); setCorrection(null);
    } catch (e) { setError(e instanceof Error ? e.message : "The change could not be saved."); }
    finally { setBusy(false); }
  }
  function decide(family: LearningFamily, version: LearningVersion, action: "evaluate" | "promote" | "reject" | "rollback") {
    void save({ operation: "decision", id: family.id, revision: family.revision, command: { eventId: crypto.randomUUID(), version: version.version, hash: version.hash, action, reason: `Owner selected ${action} in Learning review.` } }, action === "rollback" ? "Learning withdrawn. Past Work keeps its version history." : `Learning ${action === "promote" ? "promoted for this scope" : action === "reject" ? "rejected" : "evaluated"}.`);
  }
  const button = "rounded-lg border px-3 py-2 text-sm disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800";
  return <main className="mx-auto max-w-4xl px-6 py-12 text-neutral-900 dark:text-neutral-100">
    <Link href="/knowledge" className="text-sm underline underline-offset-4">← Knowledge</Link>
    <header className="mb-10 mt-8 border-b pb-7"><p className="text-xs uppercase tracking-widest text-neutral-500">Sofie · Learning review</p>
      <h1 className="mt-3 text-3xl font-semibold">What Sofie learns from your Work</h1>
      <p className="mt-3 max-w-2xl text-neutral-500">Review what changed, why it helps, and where it applies. Feedback becomes a candidate. Only evaluated guidance you promote can become available for reuse.</p>
    </header>
    {loading && <p role="status">Loading your learning history…</p>}
    {error && <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-neutral-900"><p>{error}</p><button className={`${button} mt-3`} disabled={loading || busy} onClick={() => void load()}>Reload saved state</button></div>}
    {notice && <p role="status" className="mb-6 rounded-xl border p-4">{notice}</p>}
    {!loading && !error && <>
      <section className="mb-10 rounded-xl border p-6"><h2 className="text-lg font-medium">{correction ? `Correct version ${correction.version}` : "Give feedback on Work"}</h2>
        {!works.length ? <p className="mt-3 text-neutral-500">Create Work before recording feedback. Feedback will keep a reference to its Work and version.</p> : <form className="mt-5 grid gap-4" onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget); const work = works.find(w => w.id === selected); if (!work) return;
          void save({ operation: "feedback", feedback: { eventId: crypto.randomUUID(), workId: work.id, workVersion: work.version, workType: correction?.workType ?? data.get("workType"), type: correction ? "incorrect" : data.get("feedbackType"), target: "work", targetRef: work.id, note: data.get("note"), behavior: data.get("behavior"), scope: correction?.scope ?? data.get("scope"), ...(correction ? { correctionOf: correction.version } : {}) } }, "Feedback saved as a candidate. Evaluate it before promotion.");
        }}>
          <label className="grid gap-1 text-sm">Work<select className="rounded-lg border bg-transparent p-2" required value={selected} disabled={busy || !!correction} onChange={e => setSelected(e.target.value)}><option value="">Choose Work</option>{works.map(w => <option key={w.id} value={w.id}>{w.title} · {w.repository}</option>)}</select></label>
          {correction ? <p className="text-sm text-neutral-500">Saving this correction withdraws the old guidance immediately. The replacement must pass evaluation before you promote it.</p> : <label className="grid gap-1 text-sm">Feedback<select name="feedbackType" className="rounded-lg border bg-transparent p-2" disabled={busy}><option value="prefer_this">Prefer this</option><option value="worked">Worked</option><option value="useful">Useful</option><option value="incorrect">Incorrect</option><option value="did_not_work">Did not work</option><option value="not_relevant">Not relevant</option><option value="do_not_do_this">Do not do this</option></select></label>}
          <label className="grid gap-1 text-sm">What should improve?<select name="behavior" className="rounded-lg border bg-transparent p-2" disabled={busy}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {!correction && <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm">Applies to<select name="scope" className="rounded-lg border bg-transparent p-2" disabled={busy}><option value="WORK">Only this Work</option><option value="REPOSITORY">Comparable Work in this repository</option></select></label><label className="grid gap-1 text-sm">Work type<select name="workType" className="rounded-lg border bg-transparent p-2" disabled={busy}><option value="research">Research</option><option value="implementation">Implementation</option><option value="review">Review</option></select></label></div>}
          <label className="grid gap-1 text-sm">Why would this help?<textarea name="note" className="min-h-24 rounded-lg border bg-transparent p-3" maxLength={2000} required disabled={busy} /></label>
          <div className="flex gap-2"><button className={button} disabled={busy || !selected}>{busy ? "Saving…" : "Save feedback"}</button>{correction && <button type="button" className={button} disabled={busy} onClick={() => setCorrection(null)}>Cancel correction</button>}</div>
        </form>}
      </section>
      {!families.length && <section className="py-8"><h2 className="text-xl font-medium">No learning yet</h2><p className="mt-2 text-neutral-500">Start with feedback on one Work. Its source and evaluation will appear here.</p></section>}
      <div className="space-y-8">{families.map(f => <section key={f.id} className="rounded-xl border p-6"><h2 className="font-medium">{f.scope.repository} · {f.scope.workType}</h2><p className="mt-1 text-sm text-neutral-500">{f.scope.workId ? "Private to one Work" : "Private to your comparable Work in this repository"}</p>
        {f.versions.slice().reverse().map(v => <article className="mt-5 border-t pt-5" key={v.version}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h3>{labels[v.behavior]} <span className="text-sm text-neutral-500">· v{v.version}</span></h3><span className="rounded-md bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">{v.status.replaceAll("_", " ")}</span></div>
          <p className="mt-2 text-sm text-neutral-500">{v.reason ?? "Awaiting evaluation and your review."}</p>
          <details className="mt-3 text-sm"><summary className="cursor-pointer">Why this was proposed · {v.evidence.length} feedback item{v.evidence.length === 1 ? "" : "s"}</summary>{v.evidence.map(e => <div key={e.eventId} className="mt-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900"><p>{e.note}</p><p className="mt-1 text-xs text-neutral-500">Owner feedback · Work {e.workId} · revision {e.workVersion}</p></div>)}</details>
          {v.evaluation && <p className="mt-3 text-sm">Fixture evaluation: {v.evaluation.result}. Coverage {Math.round(v.evaluation.baselineScore * 100)}% → {Math.round(v.evaluation.learnedScore * 100)}%. This measures summary formatting, not a live model outcome.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {v.status === "CANDIDATE" && <>{!v.evaluation && <button className={button} disabled={busy} onClick={() => decide(f,v,"evaluate")}>Evaluate</button>}{v.evaluation?.result === "PASS" && <button className={button} disabled={busy} onClick={() => decide(f,v,"promote")}>Promote for this scope</button>}<button className={button} disabled={busy} onClick={() => decide(f,v,"reject")}>Reject</button></>}
            {v.status === "PROMOTED" && <><button className={button} disabled={busy} onClick={() => decide(f,v,"rollback")}>Roll back</button><button className={button} disabled={busy} onClick={() => { const workId = v.evidence[0].workId; if (!works.some(w => w.id === workId)) { setError("The original Work is outside the recent Work list. Open that Work before recording a correction."); return; } setSelected(workId); setCorrection({ version: v.version, workId, scope: f.scope.workId ? "WORK" : "REPOSITORY", workType: f.scope.workType }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Correct</button></>}
          </div>
        </article>)}
      </section>)}</div>
    </>}
  </main>;
}
