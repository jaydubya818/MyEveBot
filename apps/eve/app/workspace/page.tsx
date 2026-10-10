import { ArtifactHub } from "@/components/owner/artifact-hub";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Files — MyEve" };

export default function Page() {
  return <ArtifactHub />;
}
