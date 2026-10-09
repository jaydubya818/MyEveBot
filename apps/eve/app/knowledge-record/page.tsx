import { KnowledgeRecord } from "@/components/owner/search";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string; id?: string }>;
}) {
  const params = await searchParams;
  return (
    <KnowledgeRecord
      repository={params.repository ?? ""}
      id={params.id ?? ""}
    />
  );
}
