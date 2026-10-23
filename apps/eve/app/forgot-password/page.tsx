import type { Metadata } from "next";
export const metadata: Metadata = { title: "Forgot Password — MyEve", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() {
  return <main className="grid min-h-dvh place-items-center bg-kumo-canvas px-5 py-10"><section className="w-full max-w-md rounded-2xl border border-kumo-hairline bg-kumo-elevated p-7">
    <h1 className="text-2xl font-semibold">Forgot Password</h1>
    <p className="mt-4 text-sm leading-6 text-kumo-subtle">Contact the person who invited you to MyEve and ask for a password reset link for your private workspace.</p>
    <p className="mt-3 text-sm leading-6 text-kumo-subtle">The link works once and expires after 15 minutes. Your conversations and files stay in place. For your security, the owner verifies your identity before sharing the link.</p>
    <p className="mt-3 text-sm leading-6 text-kumo-subtle">If you already received a link, open it to choose your new password. MyEve does not send an automatic recovery email.</p>
    <a href="/login" className="mt-6 inline-block min-h-11 py-3 text-sm font-medium underline">Back to sign in</a>
  </section></main>;
}
