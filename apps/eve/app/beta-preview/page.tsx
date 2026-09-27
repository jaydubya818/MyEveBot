import { OwnerExperience, type OwnerView } from "@/components/owner/experience";
const views: OwnerView[] = ["today", "work", "needs-you", "brief", "results", "activity", "welcome", "new"];
export default async function Preview({ searchParams }: { searchParams: Promise<{ view?: string; id?: string }> }) {
  const query = await searchParams;
  const view = views.includes(query.view as OwnerView) ? query.view as OwnerView : "today";
  return <OwnerExperience view={view} selectedId={query.id} preview />;
}
