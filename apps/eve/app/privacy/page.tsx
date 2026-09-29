import Link from "next/link";
import { ProductShell } from "@/components/owner/product-shell";
import { Card } from "@/components/owner/primitives";
export default function Page() {
  return (
    <ProductShell
      title="Private by default"
      description="Know which context you are using before sharing information."
    >
      <div className="owner-grid">
        <Card title="This private instance">
          <p>
            Personal memory and connected accounts belong to this instance’s
            configured owner. Signing in with the same instance password does
            not create a second isolated owner.
          </p>
          <p>
            Use separately configured owner instances for two people’s private
            information.
          </p>
          <Link href="/knowledge">Inspect and correct memory</Link>
        </Card>
        <Card title="Shared business context">
          <p>
            A shared Goal, Result, room, or knowledge space needs an explicit
            membership and audience contract. This product source does not
            enable a shared workspace or copy private memory into one.
          </p>
          <Link href="/manage/peers">
            Review existing Relay connections and grants
          </Link>
        </Card>
        <Card title="You control consequential actions">
          <p>
            Review the exact action, recipient, resource, and expiration in
            Approval Center. A connected app or selected specialist is not a new
            grant.
          </p>
          <Link href="/approvals">Review approvals</Link>
        </Card>
        <Card title="Portable experience">
          <p>
            Memory Capsules await the final durable integration. Credentials,
            sessions, grants, approvals and active Work authority must never
            transfer.
          </p>
          <details>
            <summary>Prepared integration boundary</summary>
            <code>WAITING_FOR_CANONICAL_CAPSULES</code>
          </details>
        </Card>
        <Card title="Learning and corrections">
          <p>
            Current memory can be inspected and corrected. Evaluated learning,
            promotion and rollback will be exposed when the governed lifecycle
            is integrated. Raw feedback is not permission to change standing
            behavior.
          </p>
          <Link href="/knowledge">Review sources and current information</Link>
        </Card>
      </div>
    </ProductShell>
  );
}
