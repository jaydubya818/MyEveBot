"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AGENT_NAME } from "@/lib/identity";

export function OwnerNavigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const items = [
    ["/today", "Today"],
    ["/work", "Work"],
    ["/chat", AGENT_NAME],
    ["/knowledge", "Knowledge"],
    ["/capsules", "Capsules"],
    ["/manage/connections", "Apps"],
  ];
  return (
    <nav
      aria-label="Primary"
      className={compact ? "grid grid-cols-2 gap-1 px-2 pb-3" : "owner-primary"}
    >
      {items.map(([href, label]) => (
        <Link
          key={href}
          href={href!}
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
    </nav>
  );
}
