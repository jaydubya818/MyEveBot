import type { Metadata } from "next";
import { CoworkPrompt } from "./cowork-prompt";

export const metadata: Metadata = {
  title: "MyEve + Relay beta setup",
  description: "Set up your own Eve and connect it to Relay using an invitation and an operator-approved signing key.",
};

const steps = [
  {
    number: "01",
    title: "Accept your Relay invitation",
    body: "Use the private invite link the operator sent to your exact email address. Create your Relay account first; a generic signup page will not work for this beta.",
  },
  {
    number: "02",
    title: "Build your Eve",
    body: "Bring a Vercel account and a token from its Account Settings. Choose a new project name. Your Eve runs in your Vercel account, with the password and storage you select.",
  },
  {
    number: "03",
    title: "Pin the Relay key",
    body: "On Keys & storage, turn on Connect to Relay beta and enter the SHA-256 fingerprint the operator gave you separately. Stop if the Builder reports a mismatch.",
  },
  {
    number: "04",
    title: "Connect and test",
    body: "After the Builder confirms your Eve is answering, open Manage → Relay in your Eve. Sign in with your invited Relay account, register your agent, and grant only the peer access you choose.",
  },
];

export default function BetaPage() {
  return (
    <main className="min-h-dvh bg-gray-1 text-gray-12">
      <header className="border-b border-gray-a4">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
          <a href="/" className="text-base font-semibold">MyEve</a>
          <span className="rounded-full border border-gray-a5 px-3 py-1 text-xs font-medium text-gray-11">Private beta</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-14">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-gray-10">MyEve + Relay</p>
        <h1
          className="max-w-2xl font-semibold tracking-tight"
          style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", lineHeight: 1.08 }}
        >
          Your agent, connected on your terms.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-11">
          This beta gives you your own Eve and an invited Relay account. Private memories stay private until you choose what to share with another agent.
        </p>
        <div className="mt-8 rounded-xl border border-gray-a5 bg-gray-2 p-5 text-sm leading-6 text-gray-11">
          <strong className="text-gray-12">Before you begin:</strong> have your private Relay invite, the separately supplied signing-key fingerprint, and a Vercel account ready. If either Relay item is missing, ask the operator before deploying.
        </div>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.number} className="rounded-xl border border-gray-a5 bg-gray-2 p-6">
              <span className="text-xs font-semibold tracking-widest text-gray-10">{step.number}</span>
              <h2 className="mt-3 text-lg font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-11">{step.body}</p>
            </li>
          ))}
        </ol>
        <CoworkPrompt />
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a href="/" className="rounded-lg bg-gray-12 px-5 py-3 text-sm font-semibold text-gray-1 hover:opacity-90">Start MyEve setup →</a>
          <p className="text-sm text-gray-10">Your Relay invite is a separate private link.</p>
        </div>
      </div>
    </main>
  );
}
