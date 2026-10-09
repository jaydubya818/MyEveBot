import { afterEach, describe, expect, it } from "vitest";

import { profileComputerName } from "./orgo";

const originalName = process.env.ORGO_COMPUTER_NAME;
afterEach(() => {
  if (originalName === undefined) delete process.env.ORGO_COMPUTER_NAME;
  else process.env.ORGO_COMPUTER_NAME = originalName;
});

describe("profileComputerName", () => {
  it("keeps the existing primary desktop on generation one", () => {
    process.env.ORGO_COMPUTER_NAME = "sofie";
    expect(profileComputerName({ slug: "sofie", isPrimary: true, generation: 1 })).toBe("sofie");
  });

  it("isolates secondary Agents and reset generations", () => {
    process.env.ORGO_COMPUTER_NAME = "sofie";
    expect(profileComputerName({ slug: "market-research", isPrimary: false, generation: 1 })).toBe("sofie-market-research");
    expect(profileComputerName({ slug: "market-research", isPrimary: false, generation: 2 })).toBe("sofie-market-research-2");
    expect(profileComputerName({ slug: "sofie", isPrimary: true, generation: 2 })).toBe("sofie-sofie-2");
  });

  it("keeps generated profile names bounded", () => {
    process.env.ORGO_COMPUTER_NAME = "primary-agent";
    expect(profileComputerName({ slug: "x".repeat(200), isPrimary: false, generation: 99 }).length).toBeLessThanOrEqual(80);
  });
});
