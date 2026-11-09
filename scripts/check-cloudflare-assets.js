#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const limit = 25 * 1024 * 1024;
const args = process.argv.slice(2);
const conditional = args.includes("--if-cloudflare");
const paths = args.filter((arg) => arg !== "--if-cloudflare");

if (paths.length > 1 || paths.some((arg) => arg.startsWith("-"))) {
  console.error(
    "Usage: node scripts/check-cloudflare-assets.js [directory] [--if-cloudflare]",
  );
  process.exitCode = 2;
} else if (!conditional || process.env.CF_PAGES === "1") {
  const root = path.resolve(paths[0] || "dist");
  let count = 0;
  const errors = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        errors.push(
          `${path.relative(root, file)}: symbolic links are not supported`,
        );
      } else if (entry.isDirectory()) {
        visit(file);
      } else if (entry.isFile()) {
        count++;
        const bytes = fs.statSync(file).size;
        if (bytes > limit) {
          errors.push(
            `${path.relative(root, file)}: ${bytes} bytes exceeds Cloudflare Pages' 25 MiB limit`,
          );
        }
      }
    }
  }
  try {
    visit(root);
    if (errors.length) {
      console.error(
        `Cloudflare asset validation failed:\n${errors.join("\n")}`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `Cloudflare asset validation passed: ${count} files, all at most 25 MiB.`,
      );
    }
  } catch (error) {
    console.error(`Cloudflare asset validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
