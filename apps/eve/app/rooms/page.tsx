import Link from "next/link";
import { ProductShell } from "@/components/owner/product-shell";
import { Card } from "@/components/owner/primitives";
export default function Page() {
  return (
    <ProductShell
      title="Shared rooms"
      description="A room brings a team together around one outcome, with an explicit audience."
    >
      <Card title="Shared rooms are not enabled">
        <p>
          Room membership, shared Work and artifact access need the canonical
          Relay contract. Adding names to a room must not grant access to
          private memory or external actions.
        </p>
        <p>
          Continue with existing specialists and explicitly granted Relay
          connections.
        </p>
        <div className="owner-actions">
          <Link href="/team">Open Team</Link>
          <Link href="/manage/peers">Relay connections</Link>
          <Link href="/privacy">Private and shared boundaries</Link>
        </div>
      </Card>
    </ProductShell>
  );
}
