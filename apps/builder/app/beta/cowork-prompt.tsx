"use client";

import { useState } from "react";

const prompt = `Help me set up my managed personal Eve and connect it to the MyEve + Relay private beta. Use the official setup page at https://myeve-builder.vercel.app/beta as the source of truth, and guide me through the live pages one step at a time.

I need a private managed setup link sent to my invited email. Ask me to open that link in my browser; do not ask me to paste the invitation token into chat. The link shows my Relay invitation and provisions an isolated Eve hosted by the beta team. I will enter my password and other secrets into the relevant official forms. Do not copy secrets into chat, files, notes, or a terminal transcript. Do not ask me for a Vercel account or token for the managed path.

If I choose the advanced bring-your-own-Vercel option instead, use the Builder's Keys step and the signing-key fingerprint supplied separately by the beta operator. Stop if the fingerprint is missing or the Builder reports a mismatch. MyFactory is operated by the beta team; I do not need to install it.

After setup, check that my Eve is reachable, that I can sign in, and that Manage → Relay shows the connection steps. Show me Manage → Your data so I know how to export. Help me register and connect the agent with only the permissions I choose. Ask before granting any peer access or sharing any memory. Verify one permitted message and one explicitly approved memory share if the live services support them. If a step is blocked, tell me exactly what failed and what I need from the beta operator. Do not claim setup is complete until the live checks pass.`;

export function CoworkPrompt() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section aria-labelledby="cowork-title" className="mt-12 overflow-hidden rounded-xl border border-gray-a5 bg-gray-2">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-gray-a5 p-6">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-10">Guided setup</p>
          <h2 id="cowork-title" className="mt-2 text-xl font-semibold">Use Claude Cowork</h2>
          <p className="mt-2 text-sm leading-6 text-gray-11">
            Copy this prompt into Claude Cowork. It can guide you through the official pages and check each result while you enter your own credentials.
          </p>
        </div>
        <button
          type="button"
          onClick={copyPrompt}
          className="rounded-lg bg-gray-12 px-5 py-3 text-sm font-semibold text-gray-1 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-12"
        >
          {copyState === "copied" ? "Copied prompt" : "Copy Cowork prompt"}
        </button>
      </div>
      <div className="p-6">
        <label htmlFor="cowork-prompt" className="mb-2 block text-xs font-semibold text-gray-11">Setup prompt</label>
        <textarea
          id="cowork-prompt"
          readOnly
          value={prompt}
          onFocus={(event) => event.currentTarget.select()}
          className="h-56 w-full resize-y rounded-lg border border-gray-a5 bg-gray-1 p-4 font-mono text-xs leading-6 text-gray-11 focus-visible:outline-2 focus-visible:outline-gray-12"
        />
        <p role="status" className="mt-2 min-h-5 text-xs text-gray-10">
          {copyState === "error" ? "Clipboard access failed. Select and copy the prompt above." : copyState === "copied" ? "Ready to paste into Claude Cowork." : "You can also select and copy the text above."}
        </p>
      </div>
    </section>
  );
}
