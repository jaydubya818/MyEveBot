import { emailConfigured, parseAddress, searchMessages } from "@/agent/lib/agentmail";
import { listIMessageTranscript } from "@/agent/lib/effect/imessage";
import { runApp } from "@/agent/lib/effect/runtime";
import { channelSearchQuery, matchesChannelSearch, type ChannelSearchResult, type ChannelSearchSource } from "@/lib/channels";
import { requireIMessageTranscriptAdmin } from "@/lib/imessage-auth";
import { requireWebAuth } from "@/lib/web-auth";

function clip(value: string | null | undefined, length = 180): string {
  const singleLine = value?.replace(/\s+/g, " ").trim() ?? "";
  return singleLine.length > length ? `${singleLine.slice(0, length).trimEnd()}…` : singleLine;
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  const query = channelSearchQuery(new URL(request.url).searchParams.get("q"));
  if (query === null) return Response.json({ error: "Search needs between 2 and 120 characters." }, { status: 400 });

  const results: ChannelSearchResult[] = [];
  const sources: ChannelSearchSource[] = [];

  try {
    if (await emailConfigured()) {
      const messages = await searchMessages(query, { limit: 20 });
      const seen = new Set<string>();
      for (const message of messages) {
        if (seen.has(message.thread_id)) continue;
        seen.add(message.thread_id);
        const sender = parseAddress(message.from);
        results.push({
          id: `email:${message.thread_id}`, channel: "email",
          title: message.subject?.trim() || "(no subject)",
          preview: clip(`${sender.name ?? sender.address}: ${message.preview ?? ""}`),
          timestamp: message.timestamp, attachmentCount: message.attachments?.length ?? 0,
          status: message.labels.includes("unread") ? "unread" : null,
          href: `/email?q=${encodeURIComponent(query)}&thread=${encodeURIComponent(message.thread_id)}`,
        });
      }
      sources.push({ channel: "email", searched: true, reason: null });
    } else {
      sources.push({ channel: "email", searched: false, reason: "Email is not connected." });
    }
  } catch {
    sources.push({ channel: "email", searched: false, reason: "Email search is temporarily unavailable." });
  }

  const transcriptDenied = requireIMessageTranscriptAdmin(request);
  if (transcriptDenied === null) {
    try {
      const entries = await runApp(listIMessageTranscript(200));
      for (const entry of entries) {
        if (!matchesChannelSearch(query, [entry.text, entry.handle, entry.kind, ...entry.attachments.map((item) => item.name)])) continue;
        results.push({
          id: `imessage:${entry.id}`, channel: "imessage",
          title: entry.direction === "inbound" ? `From ${entry.role === "owner" ? "you" : entry.handle}` : `To ${entry.handle}`,
          preview: clip(entry.text) || (entry.attachments.length > 0 ? `${entry.attachments.length} attachment${entry.attachments.length === 1 ? "" : "s"}` : "Message content unavailable"),
          timestamp: entry.occurredAt, attachmentCount: entry.attachments.length,
          status: entry.status, href: "/imessage",
        });
      }
      sources.push({ channel: "imessage", searched: true, reason: null });
    } catch {
      sources.push({ channel: "imessage", searched: false, reason: "iMessage search is temporarily unavailable." });
    }
  } else {
    sources.push({ channel: "imessage", searched: false, reason: transcriptDenied.status === 401 ? "Unlock the iMessage log to include it." : "The iMessage log is locked." });
  }
  sources.push({ channel: "slack", searched: false, reason: "Slack history stays in Slack and is not copied into MyEve." });
  sources.push({ channel: "push", searched: false, reason: "Push notifications contain no searchable conversation history." });

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return Response.json({ query, results: results.slice(0, 40), sources }, { headers: { "Cache-Control": "no-store" } });
}
