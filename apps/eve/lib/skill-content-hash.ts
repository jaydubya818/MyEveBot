import { createHash } from "node:crypto";

export function personalSkillContentHash(input: {
  description: string;
  markdown: string;
}): string {
  return createHash("sha256")
    .update(input.description)
    .update("\0")
    .update(input.markdown)
    .digest("hex");
}
