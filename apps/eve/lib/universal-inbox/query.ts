import { z } from "zod";
import type { InboxQuery } from "./contracts.ts";
const date = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
export const inboxQuerySchema = z.object({
  view: z.enum(["inbox", "needs_you", "waiting", "archive", "decision_history", "thread"]).default("inbox"),
  limit: z.number().int().min(1).max(100).default(50), cursor: z.string().max(1024).optional(),
  workId: z.string().min(1).max(255).optional(), correlationId: z.string().min(1).max(255).optional(),
  bucket: z.enum(["new_needs_you", "unresolved_important", "important", "resolved", "external_replies", "follow_up", "blocked"]).optional(),
  since: date.optional(), until: date.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.view === "thread" && !value.workId && !value.correlationId) ctx.addIssue({ code: "custom", message: "Thread query requires a Work or correlation identity." });
  if (value.since && value.until && value.since > value.until) ctx.addIssue({ code: "custom", message: "Invalid time window." });
});
/** Shared SQL predicates; all field names below are constants, never user-controlled. */
export function queryPlan(ownerId: string, raw: InboxQuery, now: string, dialect: "sqlite" | "postgres") {
  const query = inboxQuerySchema.parse(raw);
  const params: Array<string | number> = [ownerId];
  const where = ["owner_id=?"];
  const field = (name: string) => dialect === "sqlite" ? `json_extract(data,'$.${name}')` : `(data->>'${name}')`;
  const live = "status NOT IN ('RESOLVED','DISMISSED','SUPERSEDED')";
  const needs = "needs_action=1 AND (expires_at IS NULL OR expires_at>?)";
  const addTime = (name: string, since = query.since, until = query.until) => {
    where.push(`${field(name)} IS NOT NULL`);
    if (since) { where.push(`${field(name)}>?`); params.push(since); }
    if (until) { where.push(`${field(name)}<=?`); params.push(until); }
  };
  if (query.workId) { where.push(`${field("workId") }=?`); params.push(query.workId); }
  if (query.correlationId) { where.push(`${field("correlationId") }=?`); params.push(query.correlationId); }
  if (query.bucket === "resolved") { where.push("status='RESOLVED'"); addTime("resolvedAt"); }
  else if (query.bucket === "external_replies") { where.push("status NOT IN ('DISMISSED','SUPERSEDED')"); addTime("lastExternalReplyAt"); }
  else if (query.bucket === "follow_up") { where.push("status='WAITING'"); addTime("followUpAt", undefined, query.until ?? now); }
  else if (query.bucket === "important") { where.push(`${live} AND score>=100 AND ${field("notification")}='UNREAD'`); addTime("lastMessageAt"); }
  else if (query.bucket === "unresolved_important") { where.push(`${live} AND (score>=100 OR (${needs}))`); params.push(now); }
  else if (query.bucket === "blocked") { where.push(`${live} AND score>=10000`); }
  else if (query.bucket === "new_needs_you") { where.push(needs); params.push(now); addTime("actionRequiredAt"); }
  else if (query.view === "needs_you") { where.push(needs); params.push(now); }
  else if (query.view === "waiting") where.push("status='WAITING'");
  else if (query.view === "archive") where.push("status IN ('RESOLVED','DISMISSED','SUPERSEDED')");
  else if (query.view === "decision_history") {
    where.push(`((kind IN ('DECISION','APPROVAL') AND (status IN ('RESOLVED','DISMISSED','SUPERSEDED') OR expires_at<=?)) OR ${field("responseId")} IS NOT NULL)`);
    params.push(now);
  }
  else if (query.view !== "thread") where.push(`(${live} OR (status='RESOLVED' AND kind='RESULT'))`);
  if (query.cursor) {
    const [score, deadline, id, binding] = z.tuple([z.number().int(), z.string().max(40), z.string().max(255), z.string()]).parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString()));
    if (binding !== JSON.stringify([ownerId, { ...query, cursor: undefined }])) throw new Error("INVALID_CURSOR_SCOPE");
    where.push("(score<? OR (score=? AND deadline>?) OR (score=? AND deadline=? AND id>?))");
    params.push(score, score, deadline, score, deadline, id);
  }
  const binding = JSON.stringify([ownerId, { ...query, cursor: undefined }]);
  params.push(query.limit + 1);
  return { where: where.join(" AND "), params, query, binding };
}
