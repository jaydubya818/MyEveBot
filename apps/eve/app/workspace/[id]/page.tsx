import { ArtifactEditor } from "@/components/owner/artifact-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ArtifactEditor id={id} />;
}
