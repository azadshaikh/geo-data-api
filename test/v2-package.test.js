const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

test("npm packs only v2 while preserving an existing local v1 tree", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-v2-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.copyFileSync(
    path.resolve(__dirname, "../package.json"),
    path.join(root, "package.json"),
  );
  for (const version of ["v1", "v2"])
    fs.mkdirSync(path.join(root, "dist", "api", version), { recursive: true });
  fs.writeFileSync(path.join(root, "dist/api/v1/old.json"), '{"old":true}');
  fs.writeFileSync(
    path.join(root, "dist/api/v2/manifest.json"),
    '{"api_version":"v2"}',
  );
  const npmCli =
    process.env.npm_execpath ||
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    );
  if (!fs.existsSync(npmCli))
    return t.skip("npm CLI is not available alongside Node");
  const result = spawnSync(
    process.execPath,
    [npmCli, "pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const filenames = JSON.parse(result.stdout)[0].files.map((file) => file.path);
  assert.ok(filenames.includes("dist/api/v2/manifest.json"));
  assert.ok(!filenames.some((name) => name.startsWith("dist/api/v1/")));
  assert.equal(
    fs.readFileSync(path.join(root, "dist/api/v1/old.json"), "utf8"),
    '{"old":true}',
  );
});
