import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validPassword } from "./password-crypto";
import { readAuthBody } from "./auth-request";

describe("password hashing and bounded inputs", () => {
  it("uses independent salts and verifies Unicode and significant spaces", async () => {
    const password = "  café correct horse battery  ";
    const [first, second] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password.normalize("NFD"), first)).toBe(true);
    expect(await verifyPassword(password.trim(), first)).toBe(false);
    expect(await verifyPassword("wrong password value", first)).toBe(false);
  });
  it("rejects weak, oversized and malformed hash inputs", async () => {
    expect(validPassword("short")).toBe(false);
    expect(validPassword("a".repeat(15))).toBe(true);
    expect(validPassword("a".repeat(129))).toBe(false);
    expect(await verifyPassword("synthetic password", "scrypt$999999999$8$1$bad$bad")).toBe(false);
  });
  it("bounds chunked request bodies without Content-Length", async () => {
    const request = new Request("https://fixture.example/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "x".repeat(5000) }),
    });
    await expect(readAuthBody(request)).rejects.toThrow("too large");
    for (const body of ["null", "[]", "{broken"]) {
      await expect(readAuthBody(new Request("https://fixture.example", { method: "POST", headers: { "Content-Type": "application/json" }, body }))).rejects.toThrow("Invalid request");
    }
  });
});
