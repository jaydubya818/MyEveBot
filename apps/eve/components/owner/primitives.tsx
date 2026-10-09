import type { ReactNode } from "react";
import type { OwnerState } from "@/components/owner/projection";
export function State({ value }: { value: OwnerState | string }) {
  return (
    <span className="owner-state" data-state={value}>
      {value}
    </span>
  );
}
export function Card({
  title,
  children,
  highlight = false,
}: {
  title: string;
  children: ReactNode;
  highlight?: boolean;
}) {
  return (
    <section className={`owner-card${highlight ? " highlight" : ""}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="owner-empty">
      <h3>{title}</h3>
      <div className="owner-muted">{children}</div>
    </div>
  );
}
export function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Time unavailable"
    : parsed.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
