import Link from "next/link";
import { ProductShell } from "@/components/owner/product-shell";
import { RouteTitle } from "@/components/owner/route-title";
import { AppearancePanel } from "@/components/appearance-panel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings — MyEve" };

export default function SettingsPage() {
  return <ProductShell title="Settings" description="Make MyEve feel at home.">
    <RouteTitle title="Settings — MyEve" />
    <AppearancePanel />
    <div className="owner-settings-links"><Link href="/privacy">Privacy & boundaries →</Link></div>
  </ProductShell>;
}
