"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useId, useRef } from "react";
import { CommandPalette } from "@/components/command-palette";
import { useDestinationAllowed, useVisibleDestinations,useBetaFeedbackEnabled } from "./destination-gate";
import { DEEP_AGENT_UNAVAILABLE_LABEL } from "@/lib/deep-agent-availability";
import { confirmOwnerSignOut } from "@/lib/owner-sign-out";

const primary = ["/today", "/chat", "/work", "/needs-you", "/workspace"];
export function OwnerNavigation() {
  const pathname = usePathname();
  const id = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const allowed = useDestinationAllowed();
  const destinations = useVisibleDestinations();
  const feedbackEnabled=useBetaFeedbackEnabled();
  const conversation = pathname === "/chat" || pathname === "/sofie";
  useEffect(() => { setMenuOpen(false); setOpen(false); }, [pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
      if (!conversation && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setOpen(value => !value);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [conversation, menuOpen]);
  const go = (href: string) => window.location.assign(href);
  const selected = (href: string) => pathname === href || (href === "/today" && pathname === "/") || (href === "/chat" && pathname === "/sofie") || (href === "/work" && pathname.startsWith("/work/")) || (href === "/workspace" && (pathname === "/files" || pathname.startsWith("/workspace/")));
  async function signOut() {
    setSigningOut(true);
    const ok = await confirmOwnerSignOut();
    if (ok) window.location.assign("/login");
    else setSigningOut(false);
  }
  return <>
    <button ref={menuButton} className="owner-menu-toggle" aria-expanded={menuOpen} aria-controls={id} onClick={() => setMenuOpen(value => !value)}>Menu</button>
    <nav id={id} data-open={menuOpen} aria-label="Primary" className="owner-primary">
      {primary.flatMap(href => destinations.filter(item => item.href === href)).map(({ href, label }) =>
        <Link key={href} href={href} aria-current={selected(href) ? "page" : undefined}>{label}</Link>)}
      <button className="owner-search" onClick={() => conversation ? window.dispatchEvent(new Event("myeve:commands")) : setOpen(true)} aria-label="Search and commands (Command K)">Search <kbd>⌘K</kbd></button>
      <div className="owner-account">
        {feedbackEnabled&&allowed('/feedback')&&<Link href="/feedback" aria-current={selected('/feedback')?'page':undefined}>Beta feedback</Link>}
        {allowed("/results") && <Link href="/results" aria-current={selected("/results") ? "page" : undefined}>Results</Link>}
        {allowed("/memory") && <Link href="/memory" aria-current={selected("/memory") ? "page" : undefined}>Memory</Link>}
        {allowed("/activity") && <Link href="/activity" aria-current={selected("/activity") ? "page" : undefined}>Activity</Link>}
        {allowed("/settings") && <Link href="/settings" aria-current={selected("/settings") ? "page" : undefined}>Settings</Link>}
        {allowed("/privacy") && <Link href="/privacy" aria-current={selected("/privacy") ? "page" : undefined}>Privacy & boundaries</Link>}
        <p data-testid="deep-agent-unavailable">{DEEP_AGENT_UNAVAILABLE_LABEL}</p>
        <button type="button" onClick={() => void signOut()} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </nav>
    {!conversation && <CommandPalette open={open} onClose={() => setOpen(false)} threads={[]}
      onSelectThread={id => go(`/chat?thread=${encodeURIComponent(id)}`)} onNewChat={() => go("/chat")}
      onOpenGoals={() => go("/goals")} onOpenReview={() => go("/weekly")} goalsAvailable={allowed("/goals")}
      onOpenManage={() => go("/settings")} pushStatus="unsupported" onTogglePush={() => {}} />}
  </>;
}
