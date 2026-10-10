"use client";

import { useLayoutEffect } from "react";

/** Keep the tab title aligned with the mounted page before paint. Next's
 * streamed metadata can briefly remove a title during client navigation.
 * Static server metadata remains the initial-document title. */
export function RouteTitle({ title }: { title: string }) {
  useLayoutEffect(() => {
    const synchronize = () => {
      if (document.title !== title) document.title = title;
    };
    synchronize();
    const observer = new MutationObserver(synchronize);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
  return null;
}
