// Local UI qualification only. Never inherit provider credentials or database URLs.
const { spawn } = require("node:child_process");
const path = require("node:path");
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3091",
  ],
  {
    cwd: path.resolve(__dirname, "../.."),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      MYEVE_OWNER_ID: "beta-ui-fixture",
      MYEVE_ACCESS_PASSWORD: "local-beta-ui-fixture-only",
      MYEVE_SESSION_SECRET:
        "local-beta-ui-fixture-secret-not-for-deployment-2026",
    },
    stdio: "inherit",
  },
);
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
