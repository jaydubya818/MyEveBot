import Link from "next/link";
import type { ReactNode } from "react";
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
  return <main className="owner-content owner-page">
    <header className="owner-heading"><div><h1>{title}</h1><p className="owner-muted">{description}</p></div></header>
    {children}
  </main>;
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
