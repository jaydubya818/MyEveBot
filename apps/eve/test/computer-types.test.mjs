import assert from "node:assert/strict";
import test from "node:test";

import { canTransitionComputerSession, clampComputerLimits, isAllowedTerminalCommand, isComputerSessionExpired, normalizeAllowedDomains } from "../lib/computer-types.ts";
import { computerActionTypeForTool, summarizeComputerActionInput } from "../lib/computer-sessions.ts";

test("computer lifecycle is deterministic and terminal states stay terminal", () => {
  assert.equal(canTransitionComputerSession("provisioning", "ready"), true);
  assert.equal(canTransitionComputerSession("ready", "running"), true);
  assert.equal(canTransitionComputerSession("running", "completed"), true);
  for (const status of ["completed", "failed", "expired", "stopped"]) {
    assert.equal(canTransitionComputerSession(status, "running"), false, status);
  }
});

test("computer limits are bounded by Agent runtime and platform ceilings", () => {
  assert.deepEqual(clampComputerLimits({ maxRuntimeSeconds: 600 }, {
    maxRuntimeSeconds: 900, maxBrowserActions: 900, maxFileBytes: 500_000_000, terminalTimeoutSeconds: 500,
  }), {
    maxRuntimeSeconds: 600, maxBrowserActions: 500, maxFileBytes: 100 * 1024 * 1024, terminalTimeoutSeconds: 120,
  });
  assert.equal(isComputerSessionExpired("2026-09-13T00:00:00.000Z", Date.parse("2026-09-13T00:00:01.000Z")), true);
  assert.equal(isComputerSessionExpired("2026-09-13T00:00:02.000Z", Date.parse("2026-09-13T00:00:01.000Z")), false);
});

test("supported tools map to canonical action types", () => {
  assert.equal(computerActionTypeForTool("browser__navigate"), "browser.navigate");
  assert.equal(computerActionTypeForTool("browser__fill"), "browser.type");
  assert.equal(computerActionTypeForTool("read_file"), "file.read");
  assert.equal(computerActionTypeForTool("write_file"), "file.write");
  assert.equal(computerActionTypeForTool("bash"), "terminal.command");
  assert.equal(computerActionTypeForTool("send_email"), null);
});

test("Phase 6 terminal allows read-only diagnostics and rejects shell/network execution", () => {
  for (const command of ["pwd", "ls -la workspace", "head -n 20 report.md", "wc -l report.md", "sort report.txt"]) {
    assert.equal(isAllowedTerminalCommand(command), true, command);
  }
  for (const command of ["curl https://example.com", "node script.js", "ls; whoami", "head $(env)", "cat .env", "find . -exec pwd {} ;"]) {
    assert.equal(isAllowedTerminalCommand(command), false, command);
  }
});

test("computer audit summaries omit typed values and file contents", () => {
  const typed = summarizeComputerActionInput("browser__fill", { selector: "#email", text: "private@example.com" });
  const written = summarizeComputerActionInput("write_file", { path: "report.txt", content: "private report body" });
  assert.match(typed, /typed value omitted/);
  assert.doesNotMatch(typed, /private@example\.com/);
  assert.match(written, /file content omitted/);
  assert.doesNotMatch(written, /private report body/);
});

test("computer network domains are explicit, normalized, and public hostnames", () => {
  assert.deepEqual(normalizeAllowedDomains(["Example.COM", "example.com", "*.cdn.example.com"]), ["example.com", "*.cdn.example.com"]);
  for (const domain of ["*", "localhost", "127.0.0.1", "[::1]", "service.local", "https://example.com/path"]) {
    assert.throws(() => normalizeAllowedDomains([domain]), /Invalid public network domain/, domain);
  }
});
