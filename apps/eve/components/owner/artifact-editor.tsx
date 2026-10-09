"use client";
import Link from "next/link";
import type { ArtifactDetail } from "@/lib/artifact-client";
import { ArtifactWorkspace } from "@/components/artifact-workspace";
import { ProductShell, ResourceState } from "./product-shell";
import { useProductResource } from "./resource";
export function ArtifactEditor({ id }: { id: string }) {
  const source = useProductResource<ArtifactDetail>(
    `/api/artifacts/${encodeURIComponent(id)}`,
  );
  return (
    <ProductShell
      title={source.data?.artifact.title ?? "File"}
      description="Preview your file, review versions and leave comments."
    >
      <p><Link href="/workspace">← All files</Link></p>
      <ResourceState {...source} />
      {source.data && (
        <div className="product-artifact-editor">
          <ArtifactWorkspace
            hideLibrary
            threadId={source.data.artifact.originThreadId ?? undefined}
            initialArtifactId={id}
          />
        </div>
      )}
    </ProductShell>
  );
}
