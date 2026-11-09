const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

test("requiring the package exposes the processor without running a build or exiting", (t) => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "geo-import-"));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  const script =
    "const api = require(process.argv[1]); console.log(JSON.stringify({ processor: typeof api.DataProcessor }));";
  const result = spawnSync(
    process.execPath,
    ["-e", script, path.resolve(__dirname, "..")],
    {
      cwd: empty,
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { processor: "function" });
  assert.equal(fs.existsSync(path.join(empty, "dist")), false);
});

test("programmatic build errors reject instead of terminating the host process", (t) => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "geo-import-error-"));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  const script =
    'const { DataProcessor } = require(process.argv[1]); new DataProcessor().run().then(() => console.log("UNEXPECTED"), () => console.log("CAUGHT"));';
  const result = spawnSync(
    process.execPath,
    ["-e", script, path.resolve(__dirname, "..")],
    {
      cwd: empty,
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CAUGHT/);
});
