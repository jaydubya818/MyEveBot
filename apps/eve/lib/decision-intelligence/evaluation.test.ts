import { describe, expect, it } from "vitest";
import { dataset, validateDataset } from "./dataset.ts";
import { evaluateDataset, runSchema } from "./evaluation.ts";
import { FakeDecisionProvider } from "./fixtures.ts";
import { knowledgeRequest, OUTCOMES } from "./contract.ts";

describe("synthetic benchmark integrity", () => {
  it("has 210 unique, privacy-checked examples balanced across six canonical types", () => {
    const rows = validateDataset(dataset);
    expect(rows).toHaveLength(210);
    expect(
      OUTCOMES.map(
        (label) => rows.filter((row) => row.expected === label).length,
      ),
    ).toEqual([35, 35, 35, 35, 35, 35]);
  });
  it("rejects empty, duplicate, Insight, and unknown labels before provider use", () => {
    expect(() => validateDataset([])).toThrow();
    expect(() => validateDataset([dataset[0], dataset[0]])).toThrow();
    expect(() =>
      validateDataset([{ ...dataset[0], expected: "insight" }]),
    ).toThrow("Insight is outside");
    expect(() =>
      validateDataset([{ ...dataset[0], expected: "authorization" }]),
    ).toThrow();
  });
  it("never serializes fixture labels or IDs into the provider state", () => {
    for (const example of dataset) {
      const request = knowledgeRequest(example.text);
      expect(request.state).toBe(example.text);
      expect(JSON.stringify(request)).not.toContain(example.id);
      expect(request).not.toHaveProperty("expected");
      expect(request).not.toHaveProperty("canonical");
    }
  });
  it("rejects normalized duplicates and credential markers", () => {
    expect(() =>
      validateDataset([
        dataset[0],
        {
          ...dataset[0],
          id: "distinct-id",
          text: ` ${dataset[0]!.text.toUpperCase()}! `,
        },
      ]),
    ).toThrow();
    expect(() =>
      validateDataset([
        { ...dataset[0], text: "Authorization: Bearer synthetic-token" },
      ]),
    ).toThrow();
  });
  it("produces reproducible normalized fixture evidence without modifying the dataset", async () => {
    const before = JSON.stringify(dataset);
    const run = await evaluateDataset(new FakeDecisionProvider(), {
      environment: "local-fixture",
    });
    expect(run.rows).toHaveLength(210);
    expect(
      run.rows.every((row) => row.result?.provider === "Local fixture"),
    ).toBe(true);
    expect(run.rows.every((row) => row.canonical === null)).toBe(true);
    expect(JSON.stringify(dataset)).toBe(before);
    expect(() =>
      runSchema.parse({ ...run, ownerId: "private-owner" }),
    ).toThrow();
    expect(() =>
      runSchema.parse({
        ...run,
        rows: [{ ...run.rows[0], statement: "SYNTHETIC_SECRET_MARKER" }],
      }),
    ).toThrow();
    expect(() =>
      runSchema.parse({ ...run, rows: [run.rows[0], run.rows[0]] }),
    ).toThrow();
  });
});
