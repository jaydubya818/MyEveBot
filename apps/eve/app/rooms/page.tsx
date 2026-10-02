import { CollaborationActivity } from "@/components/owner/collaboration";
import Link from "next/link";
import { ProductShell } from "@/components/owner/product-shell";
import { Card } from "@/components/owner/primitives";
export default function Page() {
  return (
    <ProductShell
      title="Rooms"
      description="One shared objective, the right specialists, and their Work and Results."
    >
      <CollaborationActivity />
      <Card title="Rooms are not enabled yet">
        <p>
          Persistent Room membership and per-agent Relay identity are not yet integrated. Shared Work and artifact access require explicit scope. Adding names to a room must not grant access to
          private memory or external actions.
        </p>
        <p>
          Continue with existing specialists and explicitly granted Relay
          connections.
        </p>
        <div className="owner-actions">
          <Link href="/team">Open Agents</Link>
          <Link href="/product-preview#room-preview">Explore the Room interaction preview</Link>
          <Link href="/manage/peers">Relay connections</Link>
          <Link href="/privacy">Private and shared boundaries</Link>
        </div>
      </Card>
    </ProductShell>
  );
}
