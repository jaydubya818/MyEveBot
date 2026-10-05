import type { Metadata } from "next";
import { CoworkPrompt } from "./cowork-prompt";

export const metadata: Metadata = {
  title: "MyEve + Relay beta setup",
  description: "Join the managed MyEve beta with an isolated Eve and a private Relay invitation.",
};

const steps = [
  {
    number: "01",
    title: "Open your private setup link",
    body: "The beta team sends one link to your invited email. It includes your Relay invitation and your managed Eve setup. Keep the link private.",
  },
  {
    number: "02",
    title: "Create your Eve",
    body: "Choose your Eve's name and sign-in password. The beta team provisions a dedicated Vercel project and data boundary for your Eve. You do not need a Vercel account.",
  },
  {
    number: "03",
    title: "Connect to Relay",
    body: "Accept your Relay invitation, then connect your Eve through Manage → Relay. Choose each agent permission and memory share explicitly.",
  },
  {
    number: "04",
    title: "Test and keep your data",
    body: "Check that your Eve answers and that Relay can exchange an approved message. Export your Eve data from Manage → Your data whenever you need it.",
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
          This beta gives you an isolated Eve and an invited Relay account. Private memories stay private until you choose what to share with another agent.
        </p>
        <div className="mt-8 rounded-xl border border-gray-a5 bg-gray-2 p-5 text-sm leading-6 text-gray-11">
          <strong className="text-gray-12">Before you begin:</strong> request a private setup link from the beta team. Managed setup is invitation only while we qualify the first environments.
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
          <a href="/" className="rounded-lg border border-gray-a5 px-5 py-3 text-sm font-semibold hover:bg-gray-3">Advanced: deploy in your own Vercel account →</a>
          <p className="text-sm text-gray-10">Your invitation link opens managed setup when your beta slot is approved.</p>
        </div>
      </div>
    </main>
  );
}
