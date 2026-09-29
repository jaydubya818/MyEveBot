// Disposable local UI qualification. Do not inherit provider or database credentials.
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
    "3196",
  ],
  {
    cwd: path.resolve(__dirname, "../.."),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      MYEVE_OWNER_ID: "alpha-fixture-owner",
      MYEVE_ACCESS_PASSWORD: "local-alpha-fixture-password",
      MYEVE_SESSION_SECRET:
        "local-alpha-fixture-session-secret-no-production-2026",
    },
    stdio: "inherit",
  },
);
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
