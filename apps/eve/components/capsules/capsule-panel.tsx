"use client";

import { useEffect, useRef, useState } from "react";
import type { exportPreview } from "@/lib/capsules/format";
import type { ImportDecision, previewImport } from "@/lib/capsules/import";
import styles from "./capsule-panel.module.css";

type ExportPreview = ReturnType<typeof exportPreview>;
type ImportPreview = ReturnType<typeof previewImport>;
interface Catalog {
  mode: "qualification" | "staging";
  candidates: Array<{ id: string; title: string; kind: string; scope: string; eligible: boolean; reason: string }>;
  exclusions: string[];
  reviews: Array<{ id: string; count: number; createdAt: string }>;
}
async function api<T>(body?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/capsules", { method: body ? method : "GET", signal, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : value.error?.message ?? "Capsule review is unavailable.");
  return value as T;
}
function download(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "sofie.memory-capsule.json";
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const size = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;

export function CapsulePanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tab, setTab] = useState<"export" | "import">("export");
  const [selected, setSelected] = useState<string[]>([]);
  const [exportReview, setExportReview] = useState<ExportPreview | null>(null);
  const [exported, setExported] = useState<{ raw: string; bytes: number; digest: string } | null>(null);
  const [raw, setRaw] = useState("");
  const [importReview, setImportReview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<ImportDecision[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    api<Catalog>(undefined, "GET", controller.signal).then(setCatalog).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  useEffect(() => {
    if (tab === "export" ? exportReview : importReview) reviewHeading.current?.focus();
  }, [exportReview, importReview, tab]);
  useEffect(() => { if (error || message) status.current?.focus(); }, [error, message]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { if (mounted.current) { setError(e instanceof Error ? e.message : "The operation failed. Try again."); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function inspect(rawValue: string) {
    setImportReview(null);
    const review = await api<ImportPreview>({ action: "import_preview", raw: rawValue });
    setImportReview(review);
    setDecisions(review.items.map(row => ({ id: row.item.id, choice: row.status === "duplicate" || row.status === "conflict" ? "keep_existing" : "skip" })));
  }
  function choose(id: string, choice: ImportDecision["choice"]) { setDecisions(values => values.map(value => value.id === id ? { id, choice } : value)); }
  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.top} aria-label="Capsule navigation"><a href="/knowledge">← Knowledge</a><span>MYEVE / MEMORY CAPSULES</span></nav>
      <header className={styles.header}><p className={styles.eyebrow}>A considered head start</p><h1>Take experience <br />with you.</h1><p className={styles.intro}>Choose the context that helps another Eve understand you. Keep account access where it belongs.</p></header>
      <aside className={styles.boundary} aria-label="Authority exclusions"><strong>This transfers selected experience, not access.</strong><p>Credentials, connected apps, permissions, and active Work are not included. The destination Eve needs its own connections and permissions.</p></aside>
      {catalog?.mode === "qualification" && <p className={styles.notice}>Local qualification · Synthetic Sofie A → independent Sofie B. This workspace tests the full review journey without using your live Memory.</p>}
      {catalog?.mode === "staging" && <p className={styles.notice}>Integration status · Export requires canonical source portability policy. Imports can be reviewed and saved privately; activation awaits the Memory integration. Your Current Truth stays unchanged.</p>}
      <div ref={status} tabIndex={-1} className={styles.status}>
        {error && <div role="alert" className={styles.error}><strong>Unable to continue</strong><p>{error}</p><button disabled={busy} onClick={() => perform(async () => { setCatalog(await api<Catalog>()); })}>Reload workspace</button></div>}
        {message && <p role="status" className={styles.success}>{message}</p>}
        {busy && <p role="status">Preparing your review…</p>}
      </div>
      {!catalog && !error && <p role="status">Loading portable sources…</p>}
      <div className={styles.tabs} role="group" aria-label="Capsule operation"><button disabled={busy} aria-pressed={tab === "export"} onClick={() => { setTab("export"); setMessage(""); }}>Create Capsule</button><button disabled={busy} aria-pressed={tab === "import"} onClick={() => { setTab("import"); setMessage(""); }}>Import Capsule</button></div>
      {tab === "export" ? <section className={styles.content} aria-label="Capsule builder" aria-busy={busy}>
        <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>01 / Choose what travels</p><h2>Your portable experience</h2></div><span role="status" aria-live="polite" aria-atomic="true">{selected.length} selected</span></div>
        <p>Choose Knowledge and preferences for useful context, or procedures and Skills for later destination qualification. Nothing is selected automatically. Only policy-approved personal sources are eligible.</p>
        {catalog?.candidates.length === 0 && <div className={styles.empty}>No portable sources yet. Approved personal experience will appear here when its source policy allows export.</div>}
        <fieldset disabled={busy} className={styles.items}><legend className={styles.srOnly}>Select experience to export</legend>{catalog?.candidates.map(item => <label className={styles.selection} key={item.id}>
          <input type="checkbox" disabled={!item.eligible} checked={selected.includes(item.id)} onChange={event => { setSelected(values => event.target.checked ? [...values, item.id] : values.filter(id => id !== item.id)); setExportReview(null); setExported(null); }} />
          <span><strong>{item.title}</strong><small>{item.kind} · {item.scope} scope · private</small><span className={styles.reason}>{item.reason}</span></span>
        </label>)}</fieldset>
        <button className={styles.primary} disabled={busy || !selected.length} onClick={() => perform(async () => { setExported(null); setExportReview(await api<ExportPreview>({ action: "export_preview", selectedIds: selected })); })}>Preview selected experience</button>
        {exportReview && <section className={styles.review} aria-label="Export preview"><p className={styles.eyebrow}>02 / Review before export</p><h2 tabIndex={-1} ref={reviewHeading}>What will transfer</h2><p>{exportReview.items.length} items · {size(exportReview.payloadBytes)} of selected content · Capsule reader 1.1</p>
          {exportReview.items.map(item => <article className={styles.reviewItem} key={item.id}><div className={styles.sectionTitle}><h3>{item.title}</h3><button disabled={busy} onClick={() => { setSelected(values => values.filter(id => id !== item.id)); setExportReview(null); setExported(null); }}>Deselect {item.title}</button></div><p className={styles.text}>{item.text}</p><small>{item.scope.type === "owner" ? "Owner-private" : `${item.scope.type}: ${item.scope.id}`} · v{item.version}</small><p className={styles.meta}>Included by your selection · Source: {item.provenance.sourceRef} · revision {item.provenance.revision}</p></article>)}
          <p>{exportReview.excluded.length} sources excluded. Credentials and authority are always excluded.</p>
          {exportReview.warnings.map(warning => <p className={styles.meta} key={warning}>{warning}</p>)}
          <button className={styles.primary} disabled={busy} onClick={() => perform(async () => { const result = await api<{ raw: string; bytes: number; digest: string }>({ action: "export", selectedIds: selected, reviewedDigest: exportReview.reviewDigest }); setExported(result); download(result.raw); setMessage(`Capsule prepared: ${size(result.bytes)}. Save the download privately. Source experience is unchanged.`); })}>Create and download Capsule</button>
          {exported && <div className={styles.download}><p>Ready · {size(exported.bytes)} including manifest and integrity data</p><button disabled={busy} onClick={() => download(exported.raw)}>Download again</button>{catalog?.mode === "qualification" && <button disabled={busy} onClick={() => perform(async () => { setTab("import"); setRaw(exported.raw); await inspect(exported.raw); })}>Review for Sofie B</button>}</div>}
        </section>}
      </section> : <section className={styles.content} aria-label="Capsule import" aria-busy={busy}>
        <p className={styles.eyebrow}>01 / Inspect a Capsule</p><h2>A fresh start, with context</h2><p>Choose a Capsule from an owner you trust. Its checksum detects changes; it does not authenticate the sender.</p>
        <label className={styles.upload}>Capsule file <input disabled={busy} type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; setRaw(""); setImportReview(null); setDecisions([]); if (!file) return; void perform(async () => { if (file.size > 1_048_576) throw new Error("Capsules must be no larger than 1 MiB."); const value = await file.text(); setRaw(value); await inspect(value); }); }} /><small>Up to 1 MiB · formats 1.0 and 1.1 · text-only content</small></label>
        {raw && !importReview && <button disabled={busy} onClick={() => perform(() => inspect(raw))}>Inspect again</button>}
        {importReview && <section className={styles.review} aria-label="Import preview"><p className={styles.eyebrow}>02 / Choose what to retain</p><h2 tabIndex={-1} ref={reviewHeading}>Review incoming experience</h2><p>Source: {importReview.source.eveRef} (unverified) · format {importReview.formatVersion}<br />Destination: {importReview.destinationEveRef} · private</p>
          <div className={styles.counts}>{["new", "duplicate", "conflict", "unsupported"].map(kind => <span key={kind}><strong>{importReview.items.filter(row => row.status === kind).length}</strong> {kind}</span>)}</div>
          <fieldset disabled={busy} className={styles.items}><legend className={styles.srOnly}>Import decisions</legend>{importReview.items.map(row => <article className={styles.reviewItem} key={row.item.id}><div className={styles.sectionTitle}><h3>{row.item.title}</h3><span className={styles.badge}>{row.status}</span></div><p id={`incoming-state-${row.item.id}`}>{row.reason}</p>
            {row.existing && <div className={styles.existing}><strong>Existing · v{row.existing.version}</strong><p>{row.existing.text}</p></div>}
            <strong>Incoming · v{row.item.version}</strong><p className={styles.text}>{row.item.text}</p>
            <p className={styles.meta}>Scope: {row.item.scope.type} → {row.targetScope.type}: {row.targetScope.id}<br />Source: {row.item.provenance.sourceRef} · revision {row.item.provenance.revision}<br />{row.qualificationRequired ? "Destination qualification required. No automatic activation." : "Retained as untrusted imported context."}</p>
            <label className={styles.decision}>Decision for {row.item.title}<select value={decisions.find(d => d.id === row.item.id)?.choice ?? "skip"} aria-describedby={`incoming-state-${row.item.id}`} onChange={event => choose(row.item.id, event.target.value as ImportDecision["choice"])}>
              {row.status === "new" && <><option value="skip">Do not import</option><option value="include">Include in reviewed import</option></>}
              {row.status === "duplicate" && <><option value="keep_existing">Keep existing duplicate</option><option value="skip">Skip</option></>}
              {row.status === "conflict" && <><option value="keep_existing">Keep destination information</option><option value="stage_incoming">Retain incoming for correction review</option><option value="skip">Skip</option></>}
              {row.status === "unsupported" && <option value="skip">Skip unsupported item</option>}
            </select></label>
          </article>)}</fieldset>
          <p className={styles.notice} role="note" aria-label="Activation state">Saving a review does not replace Current Truth, install Skills, activate Roles or Packs, or promote learning.</p>
          <button className={styles.primary} disabled={busy || !decisions.some(d => d.choice === "include" || d.choice === "stage_incoming")} onClick={() => perform(async () => { const result = await api<{ count: number; message: string }>({ action: "import", raw, reviewedDigest: importReview.reviewDigest, decisions }); setMessage(`${result.count} items retained. ${result.message}`); setImportReview(null); setCatalog(await api<Catalog>()); })}>Save reviewed import</button>
        </section>}
      </section>}
      {catalog && catalog.reviews.length > 0 && <section className={styles.content}><h2>Saved import reviews</h2><p>Private staging is retained for 30 days. Delete a review to discard its staged content; downloaded copies remain under your control.</p>{catalog.reviews.map(review => <div key={review.id} className={styles.sectionTitle}><span>{review.count} items · {new Date(review.createdAt).toLocaleDateString()}</span><button disabled={busy} onClick={() => perform(async () => { await api({ id: review.id }, "DELETE"); setCatalog(await api<Catalog>()); setMessage("Saved review deleted. Active Memory is unchanged."); })}>Delete saved review</button></div>)}</section>}
      <footer className={styles.footer}>Experience can transfer. Authority cannot. <br /><span>Private by default · Explicit selection · No automatic activation</span></footer>
    </div>
  </main>;
}
