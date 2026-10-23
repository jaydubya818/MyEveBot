import { open } from "node:fs/promises";
import { issuePasswordReset } from "../lib/password-store.ts";

// Run with the intended installation's DATABASE_URL loaded into the environment.
// Credentials and reset tokens are never printed or accepted as command-line arguments.
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const i = arg.indexOf("=");
  return [arg.slice(0, i), arg.slice(i + 1)];
}));
const owner = args["--owner"];
const installation = args["--installation"];
const origin = new URL(args["--origin"] || "https://invalid.invalid");
const output = args["--output"];
if (!owner || !installation?.startsWith("prj_") || !output || !process.env.DATABASE_URL
  || origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/"
  || origin.search || origin.hash || origin.hostname === "invalid.invalid")
  throw new Error("Required: DATABASE_URL and --owner=ID --installation=prj_ID --origin=https://HOST --output=PRIVATE_FILE");
process.env.VERCEL_PROJECT_ID = installation;
// Validate the private output destination before invalidating any earlier link.
const file = await open(output, "wx", 0o600);
try {
  const token = await issuePasswordReset(owner);
  await file.writeFile(`${origin.origin}/reset-password#token=${token}\n`);
} finally { await file.close(); }
console.log("Single-use reset link saved to the private output file. Expires in 15 minutes. Verify the recipient before sharing.");
