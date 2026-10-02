import { CollaborationActivity } from "@/components/owner/collaboration";
import Link from "next/link";
import { ProductShell } from "@/components/owner/product-shell";
import { Card } from "@/components/owner/primitives";
export default function Page() {
  return (
    <ProductShell
      title="Agent collaboration"
      description="Retained handoffs between agents, with their current status and evidence."
    >
      <CollaborationActivity />
      <Card title="Persistent Groups are not enabled">
        <p>
          Persistent Group membership and per-agent Relay identity are not yet integrated. Shared Work and artifact access require explicit scope. Adding names to a room must not grant access to
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
