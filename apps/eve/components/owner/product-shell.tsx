import Link from "next/link";
import type { ReactNode } from "react";
import { OwnerNavigation } from "./navigation";
import "./owner.css";
export function ProductShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="owner-shell">
      <a className="owner-skip" href="#owner-content">
        Skip to content
      </a>
      <header className="owner-top">
        <Link className="owner-brand" href="/today">
          MyEve
        </Link>
        <OwnerNavigation />
      </header>
      <main id="owner-content" tabIndex={-1} className="owner-content">
        <header className="owner-heading">
          <div>
            <Link className="owner-eyebrow" href="/privacy">
              Private unless explicitly shared
            </Link>
            <h1>{title}</h1>
            <p className="owner-muted">{description}</p>
          </div>
        </header>
        {children}
      </main>
      <footer className="owner-content owner-actions">
        <Link href="/brief">Daily Brief</Link>
        <Link href="/weekly">Weekly Review</Link>
        <Link href="/privacy">Privacy & boundaries</Link>
        <Link href="/business">Our business</Link>
        <Link href="/manage">Advanced</Link>
      </footer>
    </div>
  );
}
export function ResourceState({
  loading,
  error,
  refresh,
}: {
  loading: boolean;
  error: string | null;
  refresh: () => void;
}) {
  if (loading) return <p role="status">Loading current records…</p>;
  if (error)
    return (
      <div className="owner-notice" role="alert">
        <p>{error}</p>
        <button onClick={refresh}>Retry</button>{" "}
        <Link href="/login">Sign in</Link>
      </div>
    );
  return null;
}
