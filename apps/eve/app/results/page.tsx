import { OwnerExperience } from "@/components/owner/experience";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <OwnerExperience view="results" selectedId={id} />;
}
