import { Button } from "@cloudflare/kumo";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";

import { AGENT_NAME } from "@/lib/identity";

export default function NotFound(): React.ReactElement {
  return (
    <main className="grid min-h-dvh place-items-center bg-kumo-canvas px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-kumo-hairline bg-kumo-elevated p-7 text-center shadow-xl shadow-black/5">
        <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-kumo-tint text-kumo-default">
          <MagnifyingGlassIcon className="size-6" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-kumo-strong">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-kumo-subtle">
          {AGENT_NAME} couldn&apos;t find what you were looking for. It may have been moved or removed.
        </p>
        <div className="mt-6 flex justify-center">
          <a href="/"><Button type="button" variant="primary">Go home</Button></a>
        </div>
      </section>
    </main>
  );
}
