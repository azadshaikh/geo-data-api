const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { promisify } = require("node:util");
const { listFiles, safePath } = require("./build-output");
const FileUtils = require("./file-utils");

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

async function compressJsonFiles(root, { thresholdBytes = 1024 } = {}) {
  if (!Number.isSafeInteger(thresholdBytes) || thresholdBytes < 0) {
    throw new Error("Compression threshold must be a non-negative integer");
  }
  let count = 0;
  for (const relative of await listFiles(root)) {
    if (!relative.endsWith(".json") || relative === "manifest.json") continue;
    const input = await fs.readFile(safePath(path.resolve(root), relative));
    if (input.length < thresholdBytes) continue;
    const [gz, br] = await Promise.all([
      gzip(input, { level: 9 }),
      brotli(input, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }),
    ]);
    await FileUtils.writeBinary(`${relative}.gz`, gz);
    await FileUtils.writeBinary(`${relative}.br`, br);
    count += 2;
  }
  return count;
}

module.exports = { compressJsonFiles };
