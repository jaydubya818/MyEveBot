import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("qualified V0 preservation", () => {
  it.each([
    [
      "contract.ts",
      "8d1b68b2c50b48993851f04605fface2494b1a21993b0fc622da011b57334617",
    ],
    [
      "dataset.ts",
      "0da75a446843f015695412185aa7e5e0ebf3f0ea4ae20535763ef5bd316a3447",
    ],
    [
      "shadow.ts",
      "24bfb74aa5280095ad33035f46d5b933c677de27ef68fdaa6d2c92872027c01f",
    ],
  ])("keeps %s byte-identical to d54f152", async (file, hash) => {
    expect(
      createHash("sha256")
        .update(await readFile(new URL(file!, import.meta.url)))
        .digest("hex"),
    ).toBe(hash);
  });
});
