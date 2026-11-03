"use client";
import Link from "next/link";
import { Card, date } from "./primitives";

export type ActivityChange = {
  id: string;
  kind: string;
  summary: string;
  at: string;
  work_id: string | null;
};

/**
 * Extracted from the integrated view (QA-18).
 *
 * Renders memory and learning changes, OR a "not yet loaded" error state
 * when `changes` is null (backend unavailable), OR an empty state when the
 * array is confirmed empty (no changes recorded).
 *
 * The three rendering branches are exported in a single component so they
 * can be tested independently of the full integrated view.
 */
export function ActivityCard({ changes }: { changes: ActivityChange[] | null }) {
  return (
    <Card title="Memory and learning changes">
      {changes === null ? (
        <p>Memory and learning changes are unavailable right now. Check your connection and reload.</p>
      ) : changes.length === 0 ? (
        <p>No memory or learning changes recorded.</p>
      ) : (
        <ul className="owner-list">
          {changes.map((change) => (
            <li key={change.id}>
              <strong>{change.kind}</strong>
              <p>{change.summary}</p>
              <p className="owner-muted">{date(change.at)}</p>
              <Link
                href={change.work_id ? `/memory?workId=${change.work_id}` : "/memory"}
              >
                Review memory and learning
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
