import { createHash } from "node:crypto";
import { requireValue, keys } from "../contracts.ts";
import { digest, type Hash } from "./contracts.ts";
export interface SourceFile {
  path: string;
  mode: "100644" | "100755";
  base64: string;
}
export interface SourceClosure {
  format: "myapps.source-closure.v1";
  tree: string;
  files: SourceFile[];
}
const objectId = (kind: string, b: Buffer) =>
  createHash("sha1").update(`${kind} ${b.length}\0`).update(b).digest();
/** Rebuild every Git tree/blob from bounded inert bytes; never invokes Git, hooks or candidate code. */
export function verifySourceClosure(
  value: unknown,
  expectedTree: string,
): SourceClosure {
  keys(value, ["format", "tree", "files"]);
  requireValue(
    value.format === "myapps.source-closure.v1" &&
      value.tree === expectedTree &&
      /^[a-f0-9]{40}$/.test(expectedTree) &&
      Array.isArray(value.files) &&
      value.files.length > 0 &&
      value.files.length <= 128,
    "APP_SOURCE_UNAVAILABLE",
  );
  type Tree = {
    children: Map<string, Tree | { file: SourceFile; bytes: Buffer }>;
  };
  const root: Tree = { children: new Map() };
  let total = 0;
  for (const file of value.files) {
    keys(file, ["path", "mode", "base64"]);
    requireValue(
      typeof file.path === "string" &&
        file.path.length <= 240 &&
        file.path
          .split("/")
          .every(
            (s: string) =>
              /^[A-Za-z0-9_.-]+$/.test(s) && ![".", "..", ".git"].includes(s),
          ) &&
        ["100644", "100755"].includes(file.mode) &&
        typeof file.base64 === "string" &&
        file.base64.length <= 1400000,
      "APP_SOURCE_UNSAFE",
    );
    const bytes = Buffer.from(file.base64, "base64");
    total += bytes.length;
    requireValue(
      bytes.toString("base64") === file.base64 &&
        bytes.length <= 1048576 &&
        total <= 4194304,
      "APP_SOURCE_BOUND",
    );
    const parts = file.path.split("/");
    let tree = root;
    for (const part of parts.slice(0, -1)) {
      const child = tree.children.get(part);
      requireValue(!child || "children" in child, "APP_SOURCE_CONFLICT");
      if (!child) tree.children.set(part, { children: new Map() });
      tree = tree.children.get(part) as Tree;
    }
    const name = parts.at(-1)!;
    requireValue(!tree.children.has(name), "APP_SOURCE_CONFLICT");
    tree.children.set(name, { file: file as SourceFile, bytes });
  }
  function hash(tree: Tree): Buffer {
    const entries = [...tree.children].sort(([an, a], [bn, b]) =>
      Buffer.compare(
        Buffer.from(an + ("children" in a ? "/" : "")),
        Buffer.from(bn + ("children" in b ? "/" : "")),
      ),
    );
    return objectId(
      "tree",
      Buffer.concat(
        entries.map(([name, item]) =>
          Buffer.concat([
            Buffer.from(
              `${"children" in item ? "40000" : item.file.mode} ${name}\0`,
            ),
            "children" in item ? hash(item) : objectId("blob", item.bytes),
          ]),
        ),
      ),
    );
  }
  requireValue(
    hash(root).toString("hex") === expectedTree,
    "APP_SOURCE_TREE_MISMATCH",
  );
  return {
    format: "myapps.source-closure.v1",
    tree: expectedTree,
    files: structuredClone(value.files as SourceFile[]).sort((a, b) =>
      Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)),
    ),
  };
}
export function sourceClosureDigest(closure: SourceClosure): Hash {
  // The metadata manifest is bounded; raw bytes were checked against the Git tree above.
  return digest({
    format: closure.format,
    tree: closure.tree,
    files: closure.files.map((f) => ({
      path: f.path,
      mode: f.mode,
      sha256: createHash("sha256")
        .update(Buffer.from(f.base64, "base64"))
        .digest("hex"),
    })),
  }) as Hash;
}
