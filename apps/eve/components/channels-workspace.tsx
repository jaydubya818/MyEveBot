"use client";

import { Badge, Button, Input, Loader } from "@cloudflare/kumo";
import {
  ArrowRightIcon,
  BellIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  HashIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  PaperclipIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { PushStatus } from "@/components/use-push";
import type { ChannelId, ChannelSearchResult, ChannelSearchSource, ChannelStatusView } from "@/lib/channels";
import type { ReviewDeliveryView } from "@/lib/review-schedule-types";
import { cn } from "@/lib/utils";

interface ChannelsState {
  channels: ChannelStatusView[];
  deliveries: ReviewDeliveryView[];
}

interface SearchState {
  query: string;
  results: ChannelSearchResult[];
  sources: ChannelSearchSource[];
}

const ICONS: Record<ChannelId, React.ElementType> = {
  email: EnvelopeIcon,
  slack: HashIcon,
  imessage: ChatCircleDotsIcon,
  push: BellIcon,
};

function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusVariant(state: ChannelStatusView["state"]): "success" | "secondary" | "destructive" {
  if (state === "ready") return "success";
  if (state === "unavailable") return "destructive";
  return "secondary";
}

function ChannelCard({ channel, pushStatus, onTogglePush }: { channel: ChannelStatusView; pushStatus: PushStatus; onTogglePush: () => void }) {
  const Icon = ICONS[channel.id];
  const devicePush = channel.id === "push" && pushStatus !== "unsupported" && pushStatus !== "loading";
  return (
    <article className="flex min-h-52 flex-col rounded-2xl border border-kumo-hairline bg-kumo-base p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-kumo-tint"><Icon className="size-4.5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{channel.label}</h2><Badge variant={statusVariant(channel.state)}>{channel.state.replace("_", " ")}</Badge></div>
          <p className="mt-2 text-sm font-medium">{channel.summary}</p>
          <p className="mt-1 text-xs leading-5 text-kumo-subtle">{channel.detail}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <a href={channel.href} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-kumo-hairline px-3 text-xs font-medium hover:bg-kumo-tint">{channel.actionLabel}<ArrowRightIcon className="size-3.5" /></a>
        {devicePush && <Button size="sm" variant={pushStatus === "on" ? "secondary" : "primary"} onClick={onTogglePush}>{pushStatus === "on" ? "Disable on this device" : pushStatus === "denied" ? "Blocked by browser" : "Enable on this device"}</Button>}
      </div>
    </article>
  );
}

function SearchResult({ result }: { result: ChannelSearchResult }) {
  const Icon = ICONS[result.channel];
  return (
    <li>
      <a href={result.href} className="grid gap-2 rounded-xl border border-kumo-hairline px-4 py-3 hover:bg-kumo-tint sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
        <span className="mt-0.5 flex size-7 items-center justify-center rounded-lg bg-kumo-recessed"><Icon className="size-3.5" /></span>
        <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{result.title}</span>{result.status && <Badge variant={result.status === "failed" ? "destructive" : "secondary"}>{result.status}</Badge>}</span><span className="mt-1 block text-xs leading-5 text-kumo-subtle line-clamp-2">{result.preview}</span>{result.attachmentCount > 0 && <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-kumo-subtle"><PaperclipIcon />{result.attachmentCount}</span>}</span>
        <time className="text-[11px] tabular-nums text-kumo-subtle" dateTime={result.timestamp}>{when(result.timestamp)}</time>
      </a>
    </li>
  );
}

export function ChannelsWorkspace({ pushStatus, onTogglePush }: { pushStatus: PushStatus; onTogglePush: () => void }) {
  const [state, setState] = useState<ChannelsState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState<SearchState | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/channels")
      .then(async (response) => { if (!response.ok) throw new Error("Channels could not be loaded."); return response.json() as Promise<ChannelsState>; })
      .then(setState)
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : "Channels could not be loaded."));
  }, []);

  function runSearch() {
    const query = draft.trim();
    if (query.length < 2 || searching) return;
    setSearching(true);
    setSearchFailed(null);
    const token = window.sessionStorage.getItem("eve:imessage-admin-token");
    const headers = new Headers();
    if (token) headers.set("x-imessage-admin-token", token);
    void fetch(`/api/channels/search?q=${encodeURIComponent(query)}`, { headers })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as SearchState & { error?: string } | null;
        if (!response.ok || body === null) throw new Error(body?.error ?? "Search failed.");
        return body;
      })
      .then(setSearch)
      .catch((error: unknown) => setSearchFailed(error instanceof Error ? error.message : "Search failed."))
      .finally(() => setSearching(false));
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2 border-b border-kumo-hairline pb-5">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-kumo-subtle uppercase">Communication control plane</p>
        <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
        <p className="max-w-3xl text-sm leading-6 text-kumo-subtle">One place to check reachability, search the history MyEve is allowed to read, and understand where every provider keeps your data.</p>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-kumo-hairline bg-kumo-tint p-4">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
        <div><p className="text-sm font-semibold">Provider history stays with its provider</p><p className="mt-1 text-xs leading-5 text-kumo-subtle">MyEve searches Email in AgentMail and the protected iMessage log in place. Slack history is not copied. Search results are not retained in a second index.</p></div>
      </div>

      {failed !== null ? <p role="alert" className="rounded-xl border border-kumo-danger/30 bg-kumo-danger/5 p-4 text-sm text-kumo-danger">{failed}</p> : state === null ? <div className="flex justify-center py-12"><Loader size={20} /></div> : <section aria-label="Channel status" className="grid gap-4 md:grid-cols-2">{state.channels.map((channel) => <ChannelCard key={channel.id} channel={channel} pushStatus={pushStatus} onTogglePush={onTogglePush} />)}</section>}

      <section className="rounded-2xl border border-kumo-hairline p-5" aria-labelledby="channel-search-title">
        <div className="max-w-2xl"><h2 id="channel-search-title" className="text-base font-semibold">Search connected history</h2><p className="mt-1 text-xs leading-5 text-kumo-subtle">Searches Email and, when unlocked, iMessage. Slack remains provider-only by design.</p><form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); runSearch(); }}><Input value={draft} aria-label="Search connected channel history" placeholder="Sender, subject, message, or attachment" className="flex-1" onChange={(event) => setDraft(event.target.value)} /><Button type="submit" variant="primary" disabled={draft.trim().length < 2 || searching}>{searching ? <Loader size={14} /> : <MagnifyingGlassIcon />}Search</Button></form></div>
        {searchFailed && <p className="mt-4 text-sm text-kumo-danger" role="alert">{searchFailed}</p>}
        {search && <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]"><div>{search.results.length === 0 ? <p className="rounded-xl bg-kumo-tint px-4 py-5 text-sm text-kumo-subtle">No connected history matches “{search.query}”.</p> : <ul className="space-y-2">{search.results.map((result) => <SearchResult key={result.id} result={result} />)}</ul>}</div><aside className="rounded-xl bg-kumo-tint p-4"><p className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle">Search coverage</p><ul className="mt-3 space-y-3">{search.sources.map((source) => <li key={source.channel} className="flex gap-2 text-xs"><span className={cn("mt-0.5", source.searched ? "text-kumo-success" : "text-kumo-subtle")}>{source.searched ? <CheckCircleIcon /> : source.channel === "imessage" ? <LockKeyIcon /> : <WarningCircleIcon />}</span><span><span className="font-medium capitalize text-kumo-default">{source.channel}</span>{source.reason && <span className="mt-0.5 block leading-4 text-kumo-subtle">{source.reason}</span>}</span></li>)}</ul>{search.sources.some((source) => source.channel === "imessage" && !source.searched) && <a href="/imessage" className="mt-4 inline-flex text-xs font-medium underline">Unlock iMessage log</a>}</aside></div>}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-2xl border border-kumo-hairline p-5"><h2 className="text-base font-semibold">Recent proactive delivery</h2><p className="mt-1 text-xs text-kumo-subtle">Audited Daily Brief and Weekly Review attempts, including retries and fallback.</p>{state?.deliveries.length ? <ol className="mt-4 divide-y divide-kumo-hairline">{state.deliveries.map((delivery) => <li key={delivery.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-xs"><span className="font-medium capitalize">{delivery.reviewKind} review</span><Badge variant={delivery.status === "delivered" ? "success" : delivery.status === "failed" ? "destructive" : "secondary"}>{delivery.status}</Badge><span className="text-kumo-subtle">via {delivery.channel.replace("_", " ")}</span><time className="ms-auto tabular-nums text-kumo-subtle">{when(delivery.updatedAt)}</time>{delivery.failureSummary && <p className="w-full text-kumo-danger">{delivery.failureSummary}</p>}</li>)}</ol> : <p className="mt-4 rounded-xl bg-kumo-tint px-4 py-5 text-sm text-kumo-subtle">No proactive delivery attempts yet.</p>}</div>
        <aside className="rounded-2xl border border-kumo-hairline p-5"><h2 className="text-base font-semibold">Data controls</h2><dl className="mt-4 space-y-4 text-xs"><div><dt className="font-medium">Email</dt><dd className="mt-1 leading-5 text-kumo-subtle">AgentMail stores content and attachments. Archive, trash, and deletion happen in the inbox.</dd></div><div><dt className="font-medium">Slack</dt><dd className="mt-1 leading-5 text-kumo-subtle">Slack owns message history and workspace retention. MyEve stores only routing configuration.</dd></div><div><dt className="font-medium">iMessage</dt><dd className="mt-1 leading-5 text-kumo-subtle">The protected diagnostic log is separately locked and exposes delivery failures without revealing credentials.</dd></div><div><dt className="font-medium">Push</dt><dd className="mt-1 leading-5 text-kumo-subtle">Only the browser subscription and bounded delivery audit are stored. Disable per device at any time.</dd></div></dl></aside>
      </section>
    </div>
  );
}
