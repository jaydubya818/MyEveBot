import { emailConfigured } from "@/agent/lib/agentmail";
import { ownerSlackChannelId } from "@/agent/lib/delivery";
import { imessagePairingState, imessageRouterConfigured } from "@/agent/lib/effect/imessage";
import { runApp } from "@/agent/lib/effect/runtime";
import { ownerSlackUserId, slackConfigured } from "@/agent/lib/slack";
import type { ChannelStatusView } from "@/lib/channels";
import { emailAccount, unreadThreadCount } from "@/lib/email-api";
import { pushAvailability } from "@/lib/push-db";
import { listReviewDeliveries } from "@/lib/review-delivery-db";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

async function emailStatus(): Promise<ChannelStatusView> {
  try {
    if (!(await emailConfigured())) {
      return { id: "email", label: "Email", state: "setup_required", summary: "Inbox not connected", detail: "Connect AgentMail to receive, search, and reply from MyEve.", href: "/email", actionLabel: "Set up email" };
    }
    const [account, unread] = await Promise.all([emailAccount(), unreadThreadCount()]);
    return { id: "email", label: "Email", state: account.inboundReady ? "ready" : "degraded", summary: unread === 0 ? "Inbox clear" : `${unread} unread ${unread === 1 ? "thread" : "threads"}`, detail: account.emailAddress, href: "/email", actionLabel: "Open inbox" };
  } catch {
    return { id: "email", label: "Email", state: "unavailable", summary: "Inbox unavailable", detail: "AgentMail could not be reached. Existing mail remains with the provider.", href: "/email", actionLabel: "Review email" };
  }
}

async function slackStatus(): Promise<ChannelStatusView> {
  if (!slackConfigured()) {
    return { id: "slack", label: "Slack", state: "setup_required", summary: "Workspace not connected", detail: "Connect Slack before using mentions, DMs, and approval buttons.", href: "/manage/slack", actionLabel: "Set up Slack" };
  }
  const ownerConfigured = ownerSlackUserId() !== null;
  const linked = await ownerSlackChannelId().then((value) => value !== null).catch(() => false);
  return {
    id: "slack", label: "Slack", state: ownerConfigured && linked ? "ready" : "degraded",
    summary: linked ? "Owner DM linked" : ownerConfigured ? "Waiting for your first DM" : "Owner identity missing",
    detail: linked ? "Mentions, threaded replies, and private approvals are available." : "Complete Slack setup to enable proactive delivery.",
    href: "/manage/slack", actionLabel: "Review Slack",
  };
}

async function imessageStatus(): Promise<ChannelStatusView> {
  if (!imessageRouterConfigured()) {
    return { id: "imessage", label: "iMessage", state: "setup_required", summary: "Router not connected", detail: "Connect the shared-number router before pairing your handle.", href: "/manage/imessage", actionLabel: "Set up iMessage" };
  }
  try {
    const pairing = await runApp(imessagePairingState());
    return {
      id: "imessage", label: "iMessage", state: pairing.status === "verified" ? "ready" : "degraded",
      summary: pairing.status === "verified" ? "Paired" : pairing.status === "pending" ? "Verification pending" : "Not paired",
      detail: pairing.status === "verified" ? "Private message history remains behind the transcript lock." : "Finish pairing to send and receive messages.",
      href: pairing.status === "verified" ? "/imessage" : "/manage/imessage",
      actionLabel: pairing.status === "verified" ? "Open log" : "Finish setup",
    };
  } catch {
    return { id: "imessage", label: "iMessage", state: "unavailable", summary: "State unavailable", detail: "Pairing state could not be read. Delivery remains fail closed.", href: "/manage/imessage", actionLabel: "Review iMessage" };
  }
}

async function pushStatus(ownerId: string): Promise<ChannelStatusView> {
  const availability = await pushAvailability(ownerId).catch(() => ({ available: false, reason: "Push delivery could not be checked." }));
  return {
    id: "push", label: "Browser push", state: availability.available ? "ready" : "setup_required",
    summary: availability.available ? "Delivery available" : "No active destination",
    detail: availability.available ? "This browser can receive bounded proactive notifications." : availability.reason ?? "Enable notifications on this device.",
    href: "/manage/review-delivery", actionLabel: "Delivery settings",
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  const ownerId = webPrincipal(request)!.id;
  const [email, slack, imessage, push, deliveries] = await Promise.all([
    emailStatus(), slackStatus(), imessageStatus(), pushStatus(ownerId),
    listReviewDeliveries(ownerId, 8).catch(() => []),
  ]);
  return Response.json({ channels: [email, slack, imessage, push], deliveries }, { headers: { "Cache-Control": "no-store" } });
}
