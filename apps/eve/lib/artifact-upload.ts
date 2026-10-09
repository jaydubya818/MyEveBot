"use client";
import { upload } from "@vercel/blob/client";
import type { ArtifactDescriptor } from "@/agent/lib/effect/artifacts";
import { notifyArtifactsChanged } from "@/lib/artifact-client";

export function artifactMime(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "md" || extension === "markdown") return "text/markdown";
  if (extension === "html" || extension === "htm") return "text/html";
  if (extension === "pdf") return "application/pdf";
  if (extension === "csv") return "text/csv";
  if (extension === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (extension === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "application/octet-stream";
}

function acceptedArtifact(file: File): boolean {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  return ["md", "markdown", "html", "htm", "pdf", "csv", "xlsx", "pptx"].includes(
    extension ?? "",
  );
}

function safePathname(filename: string): string {
  return filename
    .normalize("NFKC")
    .replaceAll(/[/\\\u0000-\u001f\u007f]/g, "-")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "artifact";
}

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function uploadArtifactBlob(file: File, artifactId: string, versionId: string) {
    if (!acceptedArtifact(file)) {
      throw new Error("Use Markdown, HTML, PDF, CSV, XLSX, or PPTX.");
    }
    if (file.size > 50 * 1024 * 1024) throw new Error("Artifacts are limited to 50 MB.");
    const pathname = `artifacts/${artifactId}/${versionId}/${safePathname(file.name)}`;
    const [blob, sha256] = await Promise.all([
      upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/artifacts/upload",
        clientPayload: JSON.stringify({ artifactId, versionId }),
        contentType: artifactMime(file),
        multipart: file.size > 5 * 1024 * 1024,
      }),
      fileSha256(file),
    ]);
    return { blob, sha256 };
  }


export async function uploadOwnerArtifact(file: File, threadId?: string): Promise<ArtifactDescriptor> {
  const artifactId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const { blob, sha256 } = await uploadArtifactBlob(file, artifactId, versionId);
  const response = await fetch("/api/artifacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactId, versionId,
      title: file.name.replace(/\.[^.]+$/, "") || file.name,
      filename: file.name, mimeType: artifactMime(file), threadId,
      blob: { url: blob.url, pathname: blob.pathname, size: file.size, sha256 },
    }),
  });
  const body = await response.json() as { artifact?: ArtifactDescriptor; error?: string };
  if (!response.ok || !body.artifact) throw new Error(body.error ?? "Could not save this file.");
  notifyArtifactsChanged({ artifactId: body.artifact.id, versionId: body.artifact.currentVersionId });
  return body.artifact;
}
