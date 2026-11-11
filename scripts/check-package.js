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
if ([...paths].some((name) => /^dist\/api\/(?!v2\/)/i.test(name))) {
  throw new Error("Package must contain only the v2 API output");
}
if (
  [...paths].some((name) => /^dist\/(?:[^/]+\/)*\.[^/]+-backup-/.test(name))
) {
  throw new Error("Package must not include pre-manifest output backups");
}
for (const required of [
  "dist/404.html",
  "dist/api/v2/manifest.json",
  "ATTRIBUTION.md",
  "LICENSE",
  "LICENSE-DATA",
  "NOTICE-SOURCES.txt",
  "NOTICE-Unicode-3.0.txt",
  "NOTICE-flag-icons.txt",
  "src/data-processor.js",
  "src/config.js",
  "src/api-contract.js",
  "src/generated/validators.js",
  "src/utils/v2-model.js",
  "src/utils/path-safety.js",
  "src/utils/build-fingerprint.js",
  "scripts/verify.js",
  "types/index.d.ts",
  "schemas/geo-data.schema.json",
  "openapi.json",
]) {
  if (!paths.has(required)) throw new Error(`Package is missing ${required}`);
}
const manifest = require("../dist/api/v2/manifest.json");
const cityFiles = [...paths].filter((name) =>
  /^dist\/api\/v2\/cities\/\d+\.json$/.test(name),
);
if (cityFiles.length !== manifest.counts.cities) {
  throw new Error(
    `Package contains ${cityFiles.length} individual city files; expected ${manifest.counts.cities}`,
  );
}
console.log(
  `Package includes ${paths.size} files (${pack.size} compressed bytes) and all required entry points.`,
);
