import { NeedsYou } from "@/components/owner/needs-you";
import { externalAlphaInstallation } from "@/lib/external-alpha/policy";
import { externalAlphaCapabilityAllowlist } from "@/lib/external-alpha/features";

export default async function Page({ searchParams }: { searchParams: Promise<{ workId?: string }> }) {
  const { workId } = await searchParams;
  return <NeedsYou workId={workId} allowedCapabilities={externalAlphaInstallation() ? [...externalAlphaCapabilityAllowlist] : null}/>;
}
