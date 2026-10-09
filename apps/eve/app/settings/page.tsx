import Link from "next/link";
import { ProductShell } from "@/components/owner/product-shell";
import { AppearancePanel } from "@/components/appearance-panel";
export default function SettingsPage() {
  return <ProductShell title="Settings" description="Make MyEve feel at home.">
    <AppearancePanel />
    <div className="owner-settings-links"><Link href="/privacy">Privacy & boundaries →</Link></div>
  </ProductShell>;
}
