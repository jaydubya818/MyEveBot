import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { managedDb } from "./db";

const sql = await readFile(fileURLToPath(new URL("./001_control_plane.sql", import.meta.url)), "utf8");
try {
  await managedDb().query(sql);
  process.stdout.write("managed control plane schema ready\n");
} finally {
  await managedDb().end();
}
