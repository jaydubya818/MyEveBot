"use client";

import { Button } from "@cloudflare/kumo";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";

import { AGENT_NAME } from "@/lib/identity";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`${AGENT_NAME} page failed`, error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-kumo-canvas px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-kumo-hairline bg-kumo-elevated p-7 text-center shadow-xl shadow-black/5">
        <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-kumo-danger/10 text-kumo-danger">
          <WarningCircleIcon className="size-6" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-kumo-strong">{AGENT_NAME} hit a snag</h1>
        <p className="mt-2 text-sm leading-6 text-kumo-subtle">
          Your work is still here. Try this page again, or return home if the problem continues.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-kumo-subtle">Reference {error.digest}</p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button type="button" variant="secondary" onClick={() => window.location.assign("/")}>Home</Button>
          <Button type="button" variant="primary" onClick={reset}>Try again</Button>
        </div>
      </section>
    </main>
  );
}
