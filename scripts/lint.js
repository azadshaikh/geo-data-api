#!/usr/bin/env node
// Dependency-free syntax check. Formatting is checked separately by Prettier.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collect(name)
      : entry.isFile() && name.endsWith(".js")
        ? [name]
        : [];
  });
}

let failed = false;
for (const file of ["src", "scripts", "test", "demo", "docs"].flatMap(
  collect,
)) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed = true;
    console.error(result.stderr || `Unable to check ${file}`);
  }
}
if (failed) process.exitCode = 1;
else console.log("JavaScript syntax check passed.");
