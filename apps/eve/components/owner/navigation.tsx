"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { productDestinations } from "./destinations";

export function OwnerNavigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (compact) return;
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [compact]);
  const go = (href: string) => {
    window.location.assign(href);
  };
  return (
    <>
      <nav
        aria-label="Primary"
        className={
          compact ? "grid grid-cols-2 gap-1 px-2 pb-3" : "owner-primary"
        }
      >
        {productDestinations.slice(0, 11).map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={
              pathname === href || (href === "/today" && pathname === "/")
                ? "page"
                : undefined
            }
            className={
              compact
                ? "flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-kumo-tint aria-[current=page]:bg-kumo-tint"
                : undefined
            }
          >
            {label}
          </Link>
        ))}
        {!compact && (
          <button
            onClick={() => setOpen(true)}
            aria-label="Search and commands (Command K)"
          >
            Search <kbd>⌘K</kbd>
          </button>
        )}
      </nav>
      {!compact && (
        <CommandPalette
          open={open}
          onClose={() => setOpen(false)}
          threads={[]}
          onSelectThread={(id) => go(`/chat?thread=${encodeURIComponent(id)}`)}
          onNewChat={() => go("/chat")}
          onOpenGoals={() => go("/goals")}
          onOpenReview={() => go("/weekly")}
          goalsAvailable
          onOpenManage={() => go("/manage")}
          pushStatus="unsupported"
          onTogglePush={() => {}}
        />
      )}
    </>
  );
}
