"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, BookOpenIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { ADMIN_GUIDES } from "@/lib/admin-guides";
import { cn } from "@/lib/utils";

export function DocumentationPanel() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("start");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.slice(1);
      setSelected(ADMIN_GUIDES.some((guide) => guide.id === id) ? id : "start");
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = ADMIN_GUIDES.filter((guide) => {
    const text = [guide.title, guide.summary, ...guide.sections.flatMap((section) => [section.title, section.body, ...(section.steps ?? [])])].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const guide = ADMIN_GUIDES.find((item) => item.id === selected) ?? ADMIN_GUIDES[0]!;
  function openGuide(id: string) {
    setSelected(id);
    window.history.pushState(null, "", `${window.location.pathname}#${id}`);
    requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); });
  }
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-kumo-hairline bg-kumo-tint p-5">
        <BookOpenIcon className="mb-3 size-6 text-kumo-subtle" aria-hidden />
        <h3 className="text-lg font-semibold">A clear place to start</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-kumo-subtle">Set up your workspace, give Sofie a useful task, and understand what happens next. These guides explain the controls; reading them changes no settings.</p>
      </div>
      <div>
        <label htmlFor="guide-search" className="mb-2 block text-sm font-medium">Search documentation</label>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute start-3 top-3 size-4 text-kumo-subtle" aria-hidden />
          <input id="guide-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try approvals, Jev, backup, or connect…" className="w-full rounded-lg border border-kumo-hairline bg-kumo-canvas py-2.5 pe-3 ps-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-interact" />
        </div>
        <p role="status" className="mt-2 text-xs text-kumo-subtle">{matches.length} {matches.length === 1 ? "guide" : "guides"}{query.trim() ? " match your search" : " for setup and everyday use"}</p>
      </div>
      <nav aria-label="Documentation topics" className="grid gap-2 sm:grid-cols-2">
        {matches.map((item) => <button key={item.id} type="button" aria-current={item.id === selected ? "page" : undefined} onClick={() => openGuide(item.id)} className={cn("rounded-xl border p-4 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-interact", item.id === selected ? "border-kumo-interact bg-kumo-tint" : "border-kumo-hairline hover:bg-kumo-tint")}>
          <span className="block text-sm font-semibold">{item.title}</span>
          <span className="mt-1 block text-xs leading-5 text-kumo-subtle">{item.summary}</span>
        </button>)}
      </nav>
      {matches.length === 0 && <div className="rounded-xl border border-dashed border-kumo-hairline p-5"><p className="font-medium">No matching guides</p><p className="mt-1 text-sm text-kumo-subtle">Try a shorter search, or return to the full guide list.</p><button type="button" onClick={() => setQuery("")} className="mt-3 text-sm font-medium text-kumo-interact underline">Clear search</button></div>}
      <article aria-labelledby="guide-title" className="border-t border-kumo-hairline pt-6">
        <p className="mb-2 text-xs font-medium text-kumo-subtle">OWNER GUIDE</p>
        <h3 id="guide-title" ref={heading} tabIndex={-1} className="scroll-mt-6 text-xl font-semibold tracking-tight focus:outline-none">{guide.title}</h3>
        <p className="mt-2 text-sm leading-6 text-kumo-subtle">{guide.summary}</p>
        <div className="mt-6 space-y-6">{guide.sections.map((section) => <section key={section.title}>
          <h4 className="text-sm font-semibold">{section.title}</h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-7 text-kumo-subtle">{section.body}</p>
          {section.steps && <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm leading-6">{section.steps.map((step) => <li key={step} className="ps-1">{step}</li>)}</ol>}
        </section>)}</div>
        <nav aria-label="Related settings" className="mt-7 flex flex-wrap gap-2 border-t border-kumo-hairline pt-5">{guide.links.map((link) => <a key={link.href} href={link.href} className="inline-flex items-center gap-2 rounded-lg border border-kumo-hairline px-3 py-2 text-sm font-medium hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-interact">{link.label}<ArrowRightIcon className="size-3.5" aria-hidden /></a>)}</nav>
      </article>
    </div>
  );
}
