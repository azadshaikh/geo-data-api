const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const project = path.resolve(__dirname, "..");

test("Cloudflare builds use complete country shards and ordinary builds retain the global index", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-cloudflare-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["src", "scripts"]) {
    fs.cpSync(path.join(project, dir), path.join(root, dir), {
      recursive: true,
    });
  }
  fs.copyFileSync(
    path.join(project, "package.json"),
    path.join(root, "package.json"),
  );
  fs.mkdirSync(path.join(root, "db"));
  const data = {
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
        name: "São Example",
        state_id: 2,
        state_name: "Example State",
        country_id: 1,
        country_name: "Example",
        country_code: "EX",
      },
      {
        id: 4,
        name: "Second City",
        state_id: 2,
        state_name: "Example State",
        country_id: 1,
        country_name: "Example",
        country_code: "EX",
      },
    ],
  };
  for (const [name, value] of Object.entries(data)) {
    fs.writeFileSync(
      path.join(root, "db", `${name}.json`),
      JSON.stringify(value),
    );
  }
  const output = path.join(root, "dist/api/v1");
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  const build = (profile) =>
    spawnSync(process.execPath, ["src/data-processor.js"], {
      cwd: root,
      env: { ...process.env, CF_PAGES: profile },
      encoding: "utf8",
      timeout: 30000,
    });

  let result = build("1");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(output, "search/cities.json")), false);
  const index = read("search/cities/index.json");
  assert.equal(index.meta.global_index_available, false);
  assert.equal(index.meta.total_cities, 2);
  assert.deepEqual(
    read(index.data[0].filename).data.map((city) => city.id),
    [3, 4],
  );
  assert.equal(
    read(index.data[0].filename).data[0].name_normalized,
    "sao example",
  );
  assert.equal(
    Object.hasOwn(read("api-info.json").endpoints.search, "cities"),
    false,
  );
  assert.equal(
    Object.hasOwn(
      read("documentation.json").endpoints.search,
      "GET /search/cities.json",
    ),
    false,
  );
  assert.equal(
    read("manifest.json").files.some(
      (file) => file.path === "search/cities.json",
    ),
    false,
  );
  const cloudFingerprint = read("manifest.json").build_fingerprint;

  const shardPath = path.join(output, index.data[0].filename);
  const originalShard = fs.readFileSync(shardPath);
  const alteredShard = JSON.parse(originalShard);
  alteredShard.data[0].name = "Incorrect city";
  fs.writeFileSync(shardPath, JSON.stringify(alteredShard));
  const verification = spawnSync(
    process.execPath,
    ["scripts/verify.js", output],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  assert.notEqual(verification.status, 0);
  assert.match(verification.stderr, /differs from city batch/i);
  fs.writeFileSync(shardPath, originalShard);

  const infoPath = path.join(output, "api-info.json");
  const originalInfo = fs.readFileSync(infoPath);
  const incorrectInfo = JSON.parse(originalInfo);
  incorrectInfo.endpoints.search.cities = "search/cities.json";
  fs.writeFileSync(infoPath, JSON.stringify(incorrectInfo));
  const incorrectCatalog = spawnSync(
    process.execPath,
    ["scripts/verify.js", output],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  assert.notEqual(incorrectCatalog.status, 0);
  assert.match(
    incorrectCatalog.stderr,
    /unavailable global city index must not be advertised/i,
  );
  fs.writeFileSync(infoPath, originalInfo);

  result = build("0");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read("search/cities.json").data.length, 2);
  assert.equal(
    read("search/cities/index.json").meta.global_index_available,
    true,
  );
  assert.notEqual(read("manifest.json").build_fingerprint, cloudFingerprint);

  result = build("1");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(output, "search/cities.json")), false);
  assert.equal(read("manifest.json").build_fingerprint, cloudFingerprint);
});

test("the Cloudflare asset check rejects any file over 25 MiB", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-cloudflare-assets-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oversized = path.join(root, "large.json");
  fs.writeFileSync(oversized, "{}");
  fs.truncateSync(oversized, 25 * 1024 * 1024);
  const run = () =>
    spawnSync(
      process.execPath,
      [path.join(project, "scripts/check-cloudflare-assets.js"), root],
      {
        env: { ...process.env, CF_PAGES: "1" },
        encoding: "utf8",
      },
    );
  assert.equal(run().status, 0);
  fs.truncateSync(oversized, 25 * 1024 * 1024 + 1);
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /large\.json.*25 MiB/i);
  const skipped = spawnSync(
    process.execPath,
    [
      path.join(project, "scripts/check-cloudflare-assets.js"),
      root,
      "--if-cloudflare",
    ],
    {
      env: { ...process.env, CF_PAGES: "0" },
      encoding: "utf8",
    },
  );
  assert.equal(skipped.status, 0);
});
