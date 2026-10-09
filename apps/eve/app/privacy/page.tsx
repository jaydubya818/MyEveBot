import Link from "next/link";
import { ProductShell } from "@/components/owner/product-shell";
import { Card } from "@/components/owner/primitives";
export default function Page() {
  return <ProductShell title="Privacy & boundaries" description="Your workspace belongs to you.">
    <div className="owner-stack">
      <Card title="Private by default"><p>Your conversations, Work, decisions and Files are private unless you explicitly share them. Signing out removes access from this browser.</p></Card>
      <Card title="You decide what happens next"><p>A completed result does not mean it has been published. Review what was verified and any proposed effects before making a decision.</p><Link href="/needs-you">Review Needs You →</Link></Card>
      <Card title="Proof stays with your Work"><p>Open a Work to inspect its result and the evidence behind it. When an outcome cannot be confirmed, MyEve shows the uncertainty.</p><Link href="/work">View Work →</Link></Card>
    </div>
  </ProductShell>;
}
