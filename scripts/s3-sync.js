#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

function commandsFor(source, destination) {
  if (!/^s3:\/\/[^/]+(?:\/.*)?$/.test(destination || ""))
    throw new Error("Destination must be an s3:// bucket URL");
  const cache = "public, max-age=0, must-revalidate";
  return [["*.json"], ["*.json.gz", "gzip"], ["*.json.br", "br"]].map(
    ([pattern, encoding]) => [
      "s3",
      "sync",
      source,
      destination,
      "--exclude",
      "*",
      "--include",
      pattern,
      "--content-type",
      "application/json",
      "--cache-control",
      cache,
      ...(encoding ? ["--content-encoding", encoding] : []),
    ],
  );
}

if (require.main === module) {
  try {
    const [destination, source = "dist/api/v2"] = process.argv.slice(2);
    if (!fs.statSync(source).isDirectory())
      throw new Error("Source must be an existing API directory");
    for (const args of commandsFor(source, destination)) {
      const result = spawnSync("aws", args, { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        process.exitCode = result.status || 1;
        break;
      }
    }
  } catch (error) {
    console.error(
      `${error.message}\nUsage: node scripts/s3-sync.js s3://bucket/api/v2 [source-directory]`,
    );
    process.exitCode = 1;
  }
}
module.exports = { commandsFor };
