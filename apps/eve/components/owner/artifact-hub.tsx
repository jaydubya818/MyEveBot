"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { ArtifactDescriptor } from "@/agent/lib/effect/artifacts";
import type { ChatFileView } from "@/lib/files-api";
import { uploadOwnerArtifact } from "@/lib/artifact-upload";
import { ProductShell, ResourceState } from "./product-shell";
import { useProductResource } from "./resource";
import { Empty, date } from "./primitives";

export function ArtifactHub() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All files");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState<ArtifactDescriptor | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const artifacts = useProductResource<{ artifacts: ArtifactDescriptor[] }>("/api/artifacts", 10000);
  const uploads = useProductResource<{ files: ChatFileView[] }>("/api/files", 10000);
  const files = [
    ...(artifacts.data?.artifacts ?? []).map(item => ({
      id: `artifact:${item.id}`, title: item.title, filename: item.currentVersion.filename,
      type: item.kind, uploaded: item.createdBy === "owner", updatedAt: item.updatedAt,
      provenance: item.createdBy === "owner" ? "Uploaded by you" : item.createdBy.toLowerCase() === "sofie" ? "Created by Sofie" : "Created in your workspace",
      href: `/workspace/${encodeURIComponent(item.id)}`,
      download: `/api/artifacts/${encodeURIComponent(item.id)}/content?versionId=${encodeURIComponent(item.currentVersionId)}&download=1`,
      threadId: item.originThreadId,
    })),
    ...(uploads.data?.files ?? []).map(item => ({
      id: `upload:${item.id}`, title: item.filename, filename: item.filename,
      type: item.mediaType.split("/").at(-1) ?? "file", uploaded: true, updatedAt: item.createdAt,
      provenance: "Uploaded in your conversation", href: item.contentUrl,
      download: item.downloadUrl, threadId: item.threadId,
    })),
  ].filter(item => (filter === "All files" || (filter === "Uploaded" ? item.uploaded : !item.uploaded)) &&
    `${item.title} ${item.filename} ${item.type}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  async function upload(file: File) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setUploaded(null);
    try { const saved = await uploadOwnerArtifact(file); setUploaded(saved); artifacts.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The upload could not be saved. Try again."); }
    finally { lock.current = false; setBusy(false); if (input.current) input.current.value = ""; }
  }
  const ready = !artifacts.loading && !uploads.loading && !artifacts.error && !uploads.error;
  return <ProductShell title="Files" description="Your uploads and documents, together in one place.">
    <div className="owner-actions">
      <button className="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : "Upload file"}</button>
      <Link href="/chat">Create with Sofie →</Link>
      <input ref={input} type="file" hidden aria-label="Upload file" accept=".md,.markdown,.html,.htm,.pdf,.csv,.xlsx,.pptx" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}/>
    </div>
    <p className="owner-muted">Markdown, HTML, PDF, CSV, Excel or PowerPoint · up to 50 MB</p>
    {error && <p role="alert" className="owner-notice">{error}</p>}
    {uploaded && <p role="status">{uploaded.currentVersion.filename} is saved. <Link href={`/workspace/${encodeURIComponent(uploaded.id)}`}>Open file →</Link></p>}
    <div className="owner-file-toolbar">
      <label>Search files<input type="search" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="Find a file by name or type"/></label>
      <div className="owner-actions" role="group" aria-label="File source">{["All files","Uploaded","Created"].map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
    </div>
    <ResourceState {...artifacts}/><ResourceState {...uploads}/>
    {files.length > 0 && <ul className="owner-file-list">{files.map(item => <li key={item.id}>
      <div className="owner-file-mark" aria-hidden="true">{item.type === "markdown" ? "MD" : item.type === "spreadsheet" ? "XLS" : item.type === "presentation" ? "PPT" : item.type === "plain" ? "TXT" : item.type.slice(0,4).toUpperCase()}</div>
      <div className="owner-file-info"><h2><Link href={item.href}>{item.title}</Link></h2><p className="owner-muted">{item.provenance} · {date(item.updatedAt)}</p></div>
      <div className="owner-actions"><a href={item.download} download>Download<span className="sr-only"> {item.filename}</span></a>{item.threadId && <Link href={`/chat?thread=${encodeURIComponent(item.threadId)}`}>Conversation<span className="sr-only"> for {item.title}</span></Link>}</div>
    </li>)}</ul>}
    {ready && !files.length && <Empty title={query || filter !== "All files" ? "No matching files" : "Your files live here"}>{query || filter !== "All files" ? "Try another name or file source." : "Files you upload or Sofie creates will appear here."}</Empty>}
  </ProductShell>;
}
