import { Schema } from "effect";
import { asSchema } from "ai";
import { describe, expect, it } from "vitest";

import { EmptyToolInput, toolSchema } from "./tool-schema";

describe("toolSchema", () => {
  it("exposes a plain Standard Schema object accepted by the public model-schema consumer", async () => {
    const schema = toolSchema(Schema.Struct({ code: Schema.String }));
    expect(typeof schema).toBe("object");
    expect(Object.getPrototypeOf(schema)).toBe(Object.prototype);
    expect(await asSchema(schema).jsonSchema).toEqual({
      type: "object", properties: { code: { type: "string" } },
      required: ["code"], additionalProperties: false,
    });
    expect(await schema["~standard"].validate({ code: 123 })).toHaveProperty("issues");
  });
  it("projects an empty tool input as an object", () => {
    const schema = toolSchema(EmptyToolInput);

    expect(schema["~standard"].jsonSchema.input({ target: "draft-07" })).toEqual({
      type: "object",
      additionalProperties: false,
    });
  });

  it("accepts only an empty object for an empty tool input", async () => {
    const schema = toolSchema(EmptyToolInput);

    expect(await schema["~standard"].validate({})).toEqual({ value: {} });
    expect(await schema["~standard"].validate([])).toHaveProperty("issues");
    expect(await schema["~standard"].validate({ unexpected: true })).toHaveProperty("issues");
  });

  it("leaves non-empty struct projection unchanged", () => {
    const schema = toolSchema(Schema.Struct({ code: Schema.String }));

    expect(schema["~standard"].jsonSchema.input({ target: "draft-07" })).toEqual({
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
      additionalProperties: false,
    });
  });
});
