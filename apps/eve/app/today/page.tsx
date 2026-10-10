import type { Metadata } from "next";
export const metadata: Metadata = { title: "Today — MyEve" };
import { OwnerExperience } from "@/components/owner/experience";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <OwnerExperience view="today" selectedId={id} />;
}
