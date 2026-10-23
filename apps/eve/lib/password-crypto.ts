import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 128;
const COST = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.normalize("NFC").length >= MIN_PASSWORD_LENGTH
    && value.length <= MAX_PASSWORD_LENGTH && Buffer.byteLength(value) <= 512;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, 64, COST, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH || Buffer.byteLength(password) > 512) return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$131072$8$1"
    || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const actual = await derive(password, Buffer.from(parts[4], "hex"));
  return timingSafeEqual(actual, Buffer.from(parts[5], "hex"));
}

export const tokenDigest = (token: string): string => createHash("sha256").update(token).digest("hex");
