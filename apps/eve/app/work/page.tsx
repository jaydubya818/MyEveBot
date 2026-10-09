import type { Metadata } from "next";
export const metadata: Metadata = { title: "Work — MyEve" };
import { OwnerExperience } from "@/components/owner/experience";
import { WorkDetail } from "@/components/owner/work-detail";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; kind?: string }>;
}) {
  const { id, kind } = await searchParams;
  if (id && kind === "work") return <WorkDetail workId={id}/>;
  return (
    <OwnerExperience
      view="work"
      selectedId={id}
      selectedKind={kind === "goal" || kind === "work" ? kind : undefined}
    />
  );
}
