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
            Personal Memory, conversations, Inbox, Files, Knowledge, preferences and connections are Private to the signed-in owner.
          </p>
          <p>
            Two partners use separate configured sign-in passwords. Being on the same deployment never grants access to the other person’s information.
          </p>
          <Link href="/knowledge">Inspect and correct memory</Link>
        </Card>
        <Card title="Shared business context">
          <p>
            Both partners must accept business membership. Share exact Goals, Work, Results, Memory, Knowledge or Files explicitly in Our business. Shared for this Work access expires when the Work ends, changes version, reaches its expiry, or is revoked.
          </p>
          <Link href="/business">
            Review private and shared information
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
            Memory Capsules have a separate reviewed import boundary. Credentials,
            sessions, grants, approvals and active Work authority must never
            transfer.
          </p>
          <Link href="/capsules">Review Memory Capsules</Link>
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
