import { OwnerExperience } from "@/components/owner/experience";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; kind?: string }>;
}) {
  const { id, kind } = await searchParams;
  return (
    <OwnerExperience
      view="work"
      selectedId={id}
      selectedKind={kind === "goal" || kind === "work" ? kind : undefined}
    />
  );
}
