const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { listFiles, safePath } = require("./build-output");

async function buildFingerprint({ datasetVersion, config, options, timestamp, generatorVersion }) {
  const settings = { ...config };
  delete settings.INPUT_DIR;
  delete settings.OUTPUT_DIR;
  const hash = createHash("sha256");
  hash.update(JSON.stringify({
    datasetVersion, settings, timestamp, generatorVersion,
    compression: { enabled: !!options.compress, threshold: options.compressionThreshold ?? 1024 },
    omitGlobalCityIndex: !!options.omitGlobalCityIndex,
    runtime: {
      node: process.versions.node, zlib: process.versions.zlib, brotli: process.versions.brotli,
      icu: process.versions.icu, locale: Intl.DateTimeFormat().resolvedOptions().locale,
      platform: process.platform, arch: process.arch,
    },
  }));
  const source = path.resolve(__dirname, "..");
  for (const name of (await listFiles(source)).filter((item) => item.endsWith(".js"))) {
    const contents = await fs.readFile(safePath(source, name));
    hash.update(`${name}\0${contents.length}\0`).update(contents);
  }
  const verifier = await fs.readFile(path.resolve(__dirname, "../../scripts/verify.js"));
  hash.update(`verify.js\0${verifier.length}\0`).update(verifier);
  return `sha256:${hash.digest("hex")}`;
}

module.exports = { buildFingerprint };
