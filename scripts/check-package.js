#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check with npm run check:package");
const result = spawnSync(
  process.execPath,
  [npm, "pack", "--dry-run", "--json", "--ignore-scripts"],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);
if (result.status !== 0) throw new Error(result.stderr || "npm pack failed");
const [pack] = JSON.parse(result.stdout);
const paths = new Set(pack.files.map((file) => file.path));
if (
  [...paths].some((name) => /^dist\/(?:[^/]+\/)*\.[^/]+-backup-/.test(name))
) {
  throw new Error("Package must not include pre-manifest output backups");
}
for (const required of [
  "dist/api/v1/manifest.json",
  "src/data-processor.js",
  "src/config.js",
  "src/utils/path-safety.js",
  "src/utils/build-fingerprint.js",
  "scripts/verify.js",
  "scripts/check-cloudflare-assets.js",
  "types/index.d.ts",
  "schemas/geo-data.schema.json",
  "openapi.json",
]) {
  if (!paths.has(required)) throw new Error(`Package is missing ${required}`);
}
console.log(
  `Package includes ${paths.size} files (${pack.size} compressed bytes) and all required entry points.`,
);
