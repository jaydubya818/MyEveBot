"use client";
import Link from "next/link";
import {LiveAgentTile} from "../live-agent-card";
import { useState } from "react";
import type { AgentView } from "@/lib/agents";
import type { ChannelStatusView } from "@/lib/channels";
import type { EmailThreadSummary } from "@/lib/email-api";
import type { WeeklyReviewView } from "@/lib/review-types";
import { Responsibilities } from "./responsibilities";
import { WorkInbox } from "./work-inbox";
import { ProductShell, ResourceState } from "./product-shell";
import { useProductResource } from "./resource";
import { Card, Empty, State, date } from "./primitives";

export function TeamHub() {
  const source = useProductResource<{ agents: AgentView[] }>("/api/agents");
  return (
    <ProductShell
      title="Agents"
      description="Your persisted specialists, their roles, and the capabilities available to them."
    >
      <div className="owner-actions">
        <Link className="owner-button" href="/agents">
          Manage or create a specialist
        </Link>
        <Link href="/rooms">Shared rooms</Link>
      </div>
      <ResourceState {...source} />
      <div className="owner-grid">
        {source.data?.agents.slice(0,12).map(agent=><LiveAgentTile key={agent.id} agentId={agent.id}/>)}
      </div>
      {!source.loading && !source.error && !source.data?.agents.length && (
        <Empty title="No specialists recorded">
          Create a specialist when you have a recurring role for them.
        </Empty>
      )}
      <p className="owner-muted">Up to 12 agents. <Link href="/agents">Open all agent profiles</Link>. Availability is checked for each request; cloud background execution remains unqualified.</p>
    </ProductShell>
  );
}

export function AppsHub() {
  const source = useProductResource<{
    connections: {
      toolkit: string;
      name: string;
      accounts: { id: string; status: string; label: string | null }[];
    }[];
    catalogComplete: boolean;
  }>("/api/connections");
  return (
    <ProductShell
      title="Apps"
      description="Connections make services reachable. Each action still uses its own capability and approval checks."
    >
      <div className="owner-actions">
        <Link className="owner-button" href="/manage/connections">
          Connect or disconnect apps
        </Link>
        <Link href="/inbox">Channel setup</Link>
        <Link href="/approvals">Review approvals</Link>
      </div>
      <ResourceState {...source} />
      {source.data?.catalogComplete === false && (
        <p className="owner-notice">
          The app catalog is incomplete. Only returned accounts are shown.
        </p>
      )}
      <div className="owner-grid">
        {source.data?.connections.map((connection) => (
          <Card key={connection.toolkit} title={connection.name}>
            <ul>
              {connection.accounts.map((account) => (
                <li key={account.id}>
                  {account.label ?? "Account"} · {account.status}
                </li>
              ))}
            </ul>
            <p>
              Read / write scope: inspect the connection’s granted permissions.
            </p>
            <p className="owner-muted">
              Last used is not supplied by this connection source. Connection
              status does not prove write authority.
            </p>
            <Link href="/manage/connections">Inspect access</Link>
          </Card>
        ))}
      </div>
      {!source.loading && !source.error && !source.data?.connections.length && (
        <Empty title="No connected apps">
          Connect only the services you want Sofie to use.
        </Empty>
      )}
    </ProductShell>
  );
}

export function InboxHub() {
  const channels = useProductResource<{ channels: ChannelStatusView[] }>(
    "/api/channels",
  );
  const email = useProductResource<{
    configured: boolean;
    threads: EmailThreadSummary[];
  }>("/api/email?folder=inbox&limit=50");
  const [query, setQuery] = useState("");
  const rows =
    email.data?.threads.filter((row) =>
      `${row.subject} ${row.preview}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <ProductShell
      title="Sofie’s inbox"
      description="Incoming information belongs here. Only decisions and information Sofie needs from you belong in Needs You."
    >
      <div className="owner-actions">
        <Link href="/needs-you">Needs You</Link>
        <Link href="/email">Open email & drafts</Link>
        <Link href="/manage/peers">Relay connections</Link>
      </div>
      <WorkInbox />
      <Responsibilities view="inbox" />
      <ResourceState {...channels} />
      <div className="owner-grid">
        {channels.data?.channels.map((channel) => (
          <Card key={channel.id} title={channel.label}>
            <State value={channel.state} />
            <p>{channel.summary}</p>
            <p>{channel.detail}</p>
            <Link href={channel.href}>{channel.actionLabel}</Link>
          </Card>
        ))}
      </div>
      <Card title="Recent incoming email">
        <label htmlFor="inbox-filter">Filter loaded email threads</label>
        <input
          id="inbox-filter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={120}
        />
        <ResourceState {...email} />
        {email.data?.configured === false && (
          <p>
            Email is not connected.{" "}
            <Link href="/email">Set up Sofie’s address</Link>.
          </p>
        )}
        <ul className="owner-list">
          {rows.map((row) => (
            <li key={row.threadId}>
              <h3>{row.subject || "Untitled email"}</h3>
              <p>{row.preview}</p>
              <p className="owner-muted">
                Email · {date(row.timestamp)} · {row.messageCount} messages
                {row.unread ? " · unread" : ""}
              </p>
              <Link href="/email">Open email inbox</Link>
            </li>
          ))}
        </ul>
        {email.data?.configured && !rows.length && (
          <Empty title="No matching incoming email">
            Sofie’s email inbox has no threads matching this filter.
          </Empty>
        )}
      </Card>
      <Card title="One context across channels">
        <p>
          Email threads are grouped by the provider. Slack and Relay messages
          remain in their existing channels until the canonical Inbox adapter is
          integrated. This view does not create Work or send replies
          automatically.
        </p>
        <details>
          <summary>Integration status</summary>
          <code>WAITING_FOR_CANONICAL_Q37</code>
        </details>
      </Card>
    </ProductShell>
  );
}

export function WeeklyHub() {
  const source = useProductResource<{ review: WeeklyReviewView }>(
    "/api/reviews?kind=weekly",
  );
  const review = source.data?.review;
  return (
    <ProductShell
      title="Weekly Review"
      description="Outcomes delivered, unresolved blockers, and useful priorities for next week."
    >
      <div className="owner-actions">
        <Link href="/brief">Daily Brief</Link>
        <Link href="/manage/review-delivery">Delivery preferences</Link>
        <button onClick={source.refresh}>Refresh review</button>
      </div>
      <ResourceState {...source} />
      {review && (
        <>
          <p className="owner-muted">
            {date(review.periodStart)} – {date(review.periodEnd)} · Generated{" "}
            {date(review.generatedAt)}
          </p>
          <div className="owner-grid">
            <Card title="Goal progress">
              {review.progress.map((goal) => (
                <p key={goal.goalId}>
                  <Link href={`/work?id=${encodeURIComponent(goal.goalId)}`}>
                    {goal.goalTitle}
                  </Link>{" "}
                  · {goal.progress}% of recorded tasks
                </p>
              ))}
              {!review.progress.length && (
                <Empty title="No goal progress recorded" />
              )}
            </Card>
            <Card title="Results delivered">
              {review.outcomes.map((result) => (
                <p key={result.id}>
                  <Link href={`/results?id=${encodeURIComponent(result.id)}`}>
                    {result.runTitle ?? result.summary}
                  </Link>{" "}
                  · {result.status}
                </p>
              ))}
              {!review.outcomes.length && (
                <Empty title="No results in this period" />
              )}
            </Card>
            <Card title="Blockers & stalled work">
              {[...review.blockers, ...review.stalled]
                .filter(
                  (item, i, rows) =>
                    rows.findIndex(
                      (other) =>
                        other.goalId === item.goalId &&
                        other.taskId === item.taskId &&
                        other.reason === item.reason,
                    ) === i,
                )
                .map((risk, i) => (
                  <p key={i}>
                    <Link href={`/work?id=${encodeURIComponent(risk.goalId)}`}>
                      {risk.goalTitle}
                    </Link>{" "}
                    — {risk.explanation}
                  </p>
                ))}
              {!review.blockers.length && !review.stalled.length && (
                <Empty title="No blockers reported" />
              )}
            </Card>
            <Card title="Next priorities">
              {review.proposedPriorities.map((item, i) => (
                <div key={i}>
                  <h3>{item.title}</h3>
                  <p>{item.whyNow.join(" · ")}</p>
                  {item.goalId && (
                    <Link href={`/work?id=${encodeURIComponent(item.goalId)}`}>
                      Open goal
                    </Link>
                  )}
                </div>
              ))}
              {!review.proposedPriorities.length && (
                <Empty title="No proposed priorities" />
              )}
            </Card>
            <Card title="Completed commitments">
              {[...review.completedGoals, ...review.completedTasks].map(
                (item, i) => (
                  <p key={i}>{item.taskTitle ?? item.goalTitle}</p>
                ),
              )}
            </Card>
            <Card title="Missed commitments">
              {review.missedCommitments.map((item, i) => (
                <p key={i}>{item.taskTitle ?? item.goalTitle}</p>
              ))}
              {!review.missedCommitments.length && (
                <p>No missed commitments reported.</p>
              )}
            </Card>
          </div>
          <p className="owner-muted">
            Learning changes, coordination debt, and usage are not supplied by
            this review contract. No improvement claims are inferred.
          </p>
        </>
      )}
    </ProductShell>
  );
}
