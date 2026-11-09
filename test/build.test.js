const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { test } = require("node:test");

test("the build generates the machine-readable API catalogs", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-data-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.resolve(__dirname, "../src"), path.join(root, "src"), {
    recursive: true,
  });
  fs.cpSync(path.resolve(__dirname, "../scripts"), path.join(root, "scripts"), {
    recursive: true,
  });
  fs.copyFileSync(
    path.resolve(__dirname, "../package.json"),
    path.join(root, "package.json"),
  );
  fs.mkdirSync(path.join(root, "db"));
  const fixtures = {
    countries: [{ id: 1, name: "Example", iso2: "EX", iso3: "EXP" }],
    states: [
      {
        id: 2,
        name: "Example State",
        iso2: "ES",
        iso3166_2: "EX-ES",
        country_id: 1,
        country_code: "EX",
        country_name: "Example",
      },
    ],
    cities: [
      {
        id: 3,
        name: "Example City",
        state_id: 2,
        state_name: "Example State",
        country_id: 1,
        country_name: "Example",
      },
    ],
  };
  for (const [name, data] of Object.entries(fixtures)) {
    fs.writeFileSync(
      path.join(root, "db", `${name}.json`),
      JSON.stringify(data),
    );
  }
  const nodePath = [
    path.resolve(__dirname, "../node_modules"),
    process.env.NODE_PATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);
  const result = spawnSync(process.execPath, ["src/data-processor.js"], {
    cwd: root,
    env: { ...process.env, NODE_PATH: nodePath },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = path.join(root, "dist", "api", "v1");
  const infoPath = path.join(output, "api-info.json");
  const documentationPath = path.join(output, "documentation.json");
  assert.ok(
    fs.existsSync(infoPath),
    "api-info.json should be produced by the build",
  );
  assert.ok(
    fs.existsSync(documentationPath),
    "documentation.json should be produced by the build",
  );
  const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
  const documentation = JSON.parse(fs.readFileSync(documentationPath, "utf8"));
  assert.equal(info.endpoints.cities.batches, "cities/batches.json");
  assert.ok(documentation.endpoints.cities["GET /cities/batches.json"]);
  const shardIndex = JSON.parse(
    fs.readFileSync(path.join(output, "search/cities/index.json"), "utf8"),
  );
  assert.equal(shardIndex.data[0].filename, "search/cities/country/ex.json");
  const shard = JSON.parse(
    fs.readFileSync(path.join(output, shardIndex.data[0].filename), "utf8"),
  );
  assert.equal(shard.data[0].id, 3);

  const compressed = spawnSync(
    process.execPath,
    [
      "src/data-processor.js",
      "--input",
      "db",
      "--output",
      "custom-api",
      "--compress",
      "--compression-threshold",
      "0",
    ],
    {
      cwd: root,
      env: { ...process.env, NODE_PATH: nodePath },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(compressed.status, 0, compressed.stderr);
  const customOutput = path.join(root, "custom-api");
  const original = fs.readFileSync(path.join(customOutput, "countries.json"));
  assert.deepEqual(
    zlib.gunzipSync(
      fs.readFileSync(path.join(customOutput, "countries.json.gz")),
    ),
    original,
  );
  assert.deepEqual(
    zlib.brotliDecompressSync(
      fs.readFileSync(path.join(customOutput, "countries.json.br")),
    ),
    original,
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(customOutput, "manifest.json")),
  );
  assert.ok(
    manifest.files.some(
      (file) => file.path === "countries.json.gz" && file.generated,
    ),
  );
});
