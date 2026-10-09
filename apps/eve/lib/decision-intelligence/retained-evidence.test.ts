import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readEvaluationRuns } from "./evidence-store";
import { experimentAnalysis } from "./experiment-metrics";

describe("retained public synthetic evidence", () => {
  it("loads the frozen historical runs without configuration or network access", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const runs = await readEvaluationRuns(undefined);
    expect(runs).toHaveLength(6);
    expect(
      runs.every(
        (r) => r.source === "synthetic-benchmark" && r.influence === "NONE",
      ),
    ).toBe(true);
    const seven = runs.find(
      (r) =>
        "experiment" in r &&
        r.experiment === "CHALLENGE_SEVEN" &&
        r.rows.length === 249,
    )!;
    const stress = runs.find(
      (r) => "experiment" in r && r.experiment === "TAXONOMY_STRESS",
    )!;
    if (!("experiment" in seven) || !("experiment" in stress))
      throw new Error("Missing retained experiments");
    const scored = experimentAnalysis(seven);
    expect(scored.kind).toBe("primary");
    if (scored.kind === "primary") expect(scored.metrics.correct).toBe(223);
    const unscored = experimentAnalysis(stress);
    expect(unscored.kind).toBe("stress");
    expect(unscored).not.toHaveProperty("metrics");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("preserves every normalized prediction byte from the qualified live archive", () => {
    const root = resolve(process.cwd(), "../..");
    const manifest = JSON.parse(
      readFileSync(
        resolve(
          root,
          "docs/experiments/decision-intelligence-final/evidence-manifest.json",
        ),
        "utf8",
      ),
    );
    for (const [path, hash] of Object.entries(manifest.sha256)) {
      expect(
        createHash("sha256")
          .update(readFileSync(resolve(root, path)))
          .digest("hex"),
        path,
      ).toBe(hash);
    }
  });
});
