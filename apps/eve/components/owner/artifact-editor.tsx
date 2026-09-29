"use client";
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
      title="Artifact workspace"
      description="Review an exact revision, leave comments, and explicitly control sharing."
    >
      <ResourceState {...source} />
      {source.data && (
        <div className="product-artifact-editor">
          <ArtifactWorkspace
            threadId={source.data.artifact.originThreadId ?? undefined}
            initialArtifactId={id}
          />
        </div>
      )}
    </ProductShell>
  );
}
