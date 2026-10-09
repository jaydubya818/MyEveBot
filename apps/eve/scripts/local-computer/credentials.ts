import { execFileSync } from "node:child_process";
export function readPairingToken(helper: string, account: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(account)) throw new Error("Invalid Keychain account.");
  try {
    const token = execFileSync(helper, ["read", account], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (token.length < 32 || token.length > 256) throw new Error();
    return token;
  } catch { throw new Error("Pairing credential unavailable; unlock the login Keychain or pair this Computer again."); }
}
