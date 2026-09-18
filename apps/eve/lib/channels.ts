export const CHANNEL_IDS = ["email", "slack", "imessage", "push"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];
export type ChannelState = "ready" | "setup_required" | "degraded" | "unavailable";

export interface ChannelStatusView {
  id: ChannelId;
  label: string;
  state: ChannelState;
  summary: string;
  detail: string;
  href: string;
  actionLabel: string;
}

export interface ChannelSearchResult {
  id: string;
  channel: "email" | "imessage";
  title: string;
  preview: string;
  timestamp: string;
  attachmentCount: number;
  status: string | null;
  href: string;
}

export interface ChannelSearchSource {
  channel: ChannelId;
  searched: boolean;
  reason: string | null;
}

export function channelSearchQuery(value: string | null): string | null {
  const query = value?.replace(/\s+/g, " ").trim() ?? "";
  return query.length >= 2 && query.length <= 120 ? query : null;
}

export function matchesChannelSearch(
  query: string,
  values: readonly (string | null | undefined)[],
): boolean {
  const needle = query.toLocaleLowerCase();
  return values.some((value) => value?.toLocaleLowerCase().includes(needle) === true);
}
