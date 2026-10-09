"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { OwnerNavigation } from "./navigation";
import "./owner.css";

/** The authenticated owner shell lives above pages, so navigation never changes
 * when a conversation or Work is opened. Page components own their content. */
export function ApplicationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (["/login", "/product-preview", "/beta-preview"].includes(pathname) || pathname.startsWith("/share/")) return children;
  const conversation = pathname === "/chat" || pathname === "/sofie";
  return <div className="owner-shell" data-conversation={conversation}>
    <a className="owner-skip" href="#owner-content">Skip to content</a>
    <header className="owner-top">
      <Link className="owner-brand" href="/today" aria-label="MyEve home"><span className="owner-brand-mark" aria-hidden="true">m</span>MyEve</Link>
      <OwnerNavigation />
    </header>
    <div id="owner-content" tabIndex={-1} className="owner-route">{children}</div>
  </div>;
}
