// Offline verification only. Compare raw export bytes before installing dependencies.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const digest = data => createHash("sha256").update(data).digest("hex");
const [first, second, output] = process.argv.slice(2);
assert.ok(first && second && output && [first, second, output].every(path.isAbsolute), "Provide two export directories and an absent absolute receipt path");
assert.notEqual(path.resolve(first), path.resolve(second), "Exports must be independent directories");

async function inspect(directory) {
  const receiptBytes = await readFile(`${directory}.json`);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.destination, directory);
  assert.match(receipt.source.commit, /^[a-f0-9]{40}$/);
  assert.match(receipt.source.tree, /^[a-f0-9]{40}$/);
  assert.equal(receipt.source.timestampSource, "git-committer-time");
  assert.equal(new Date(receipt.source.assemblyTimestamp).toISOString(), receipt.source.assemblyTimestamp);
  const hashes = {};
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(name);
      else {
        assert.ok(entry.isFile(), `Unexpected non-file export entry: ${name}`);
        hashes[name] = digest(await readFile(path.join(directory, name)));
      }
    }
  }
  await walk();
  assert.equal(Object.keys(hashes).length, receipt.files);
  assert.deepEqual(hashes, receipt.hashes, "Actual raw export bytes must match the complete receipt");
  const metadata = JSON.parse(await readFile(path.join(directory, "eve-builder.json"), "utf8"));
  assert.equal(metadata.deployedAt, receipt.source.assemblyTimestamp);
  return { receipt, receiptHash: digest(receiptBytes) };
}

const left = await inspect(first);
const right = await inspect(second);
assert.deepEqual(left.receipt.source, right.receipt.source, "Exact source identities and assembly timestamps must match");
assert.deepEqual(left.receipt.shared, right.receipt.shared);
assert.equal(left.receipt.files, right.receipt.files);
assert.deepEqual(left.receipt.hashes, right.receipt.hashes, "Every raw exported file must be identical; no timestamp exclusions");
await writeFile(output, JSON.stringify({ result: "PASS", comparison: "all-raw-source-export-bytes", source: left.receipt.source, files: left.receipt.files, exportReceiptSha256: [left.receiptHash, right.receiptHash], metadataSha256: left.receipt.hashes["eve-builder.json"], exclusions: [] }, null, 2) + "\n", { flag: "wx" });
console.log(`PASS: all ${left.receipt.files} raw exported files are identical, including eve-builder.json.`);
