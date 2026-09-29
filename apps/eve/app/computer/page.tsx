import Link from "next/link";
import { ComputerWorkspace } from "@/components/computer-workspace";
import { ProductShell } from "@/components/owner/product-shell";
export default function ComputerPage() {
  return (
    <ProductShell
      title="Computer workspace"
      description="Inspect sessions, open the existing viewer, and use owner takeover where the provider supports it."
    >
      <p className="owner-muted">
        Taking control does not grant new authority or resume Work. Session
        activity retains the existing run links.
      </p>
      <div className="owner-actions">
        <Link href="/workspace">Files & artifacts</Link>
        <Link href="/approvals">Approvals</Link>
      </div>
      <div className="product-computer">
        <ComputerWorkspace />
      </div>
    </ProductShell>
  );
}
