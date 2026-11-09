const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { test } = require("node:test");
const config = require("../src/config");

test("optional compression produces deterministic gzip and Brotli siblings", async (t) => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "geo-compress-"));
  const previous = config.OUTPUT_DIR;
  config.OUTPUT_DIR = output;
  t.after(async () => {
    config.OUTPUT_DIR = previous;
    await fs.rm(output, { recursive: true, force: true });
  });
  const source = Buffer.from(
    JSON.stringify({ data: "geographic data ".repeat(100) }),
  );
  await fs.writeFile(path.join(output, "large.json"), source);
  await fs.writeFile(path.join(output, "small.json"), "{}");
  const { compressJsonFiles } = require("../src/utils/compression");
  const count = await compressJsonFiles(output, { thresholdBytes: 100 });
  assert.equal(count, 2);
  const gzip = await fs.readFile(path.join(output, "large.json.gz"));
  const brotli = await fs.readFile(path.join(output, "large.json.br"));
  assert.deepEqual(zlib.gunzipSync(gzip), source);
  assert.deepEqual(zlib.brotliDecompressSync(brotli), source);
  await assert.rejects(fs.access(path.join(output, "small.json.gz")), {
    code: "ENOENT",
  });
  await compressJsonFiles(output, { thresholdBytes: 100 });
  assert.deepEqual(await fs.readFile(path.join(output, "large.json.gz")), gzip);
  assert.deepEqual(
    await fs.readFile(path.join(output, "large.json.br")),
    brotli,
  );
});
