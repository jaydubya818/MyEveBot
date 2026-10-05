import type { Metadata } from "next";
import { Suspense } from "react";
import { lookupManagedInvite } from "@/managed/invites";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Join MyEve private beta",
  description: "Create your invited Relay account and a managed, isolated Eve.",
};
async function JoinContent({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const token = (await searchParams).invite ?? "";
  const enabled = process.env.MANAGED_EVE_PROVISIONING_ENABLED === "true";
  const invite = enabled ? await lookupManagedInvite(token).catch(() => null) : null;
  return (
    <main className="min-h-dvh bg-gray-1 text-gray-12">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-10">MyEve private beta</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Your own Eve, set up for you.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-gray-11">MyEve operates your isolated project and storage. Relay connects agents only with the permissions you choose. MyFactory runs behind the scenes for the beta team.</p>
        {!enabled ? (
          <div className="mt-10 rounded-xl border border-gray-a5 bg-gray-2 p-6 text-sm leading-6 text-gray-11">Managed beta invitations are being prepared. This link cannot start setup yet.</div>
        ) : !invite ? (
          <div className="mt-10 rounded-xl border border-gray-a5 bg-gray-2 p-6 text-sm leading-6 text-gray-11">This invitation is invalid or expired. Ask the beta operator for a new link.</div>
        ) : (
          <JoinForm token={token} email={invite.email} relayInviteUrl={invite.relayInviteUrl} claimed={invite.claimed} />
        )}
      </div>
    </main>
  );
}

export default function JoinPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  return <Suspense fallback={<main className="min-h-dvh bg-gray-1 p-16 text-gray-11">Loading your invitation…</main>}><JoinContent searchParams={searchParams} /></Suspense>;
}
