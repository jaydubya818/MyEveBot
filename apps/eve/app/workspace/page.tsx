import { ArtifactHub } from "@/components/owner/artifact-hub";
import { RouteTitle } from "@/components/owner/route-title";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Files — MyEve" };

export default function Page() {
  return <><RouteTitle title="Files — MyEve" /><ArtifactHub /></>;
}
