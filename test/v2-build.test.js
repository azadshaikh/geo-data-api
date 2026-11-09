const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const project = path.resolve(__dirname, "..");

test("the CLI builds v2 city pages and details while preserving an existing v1 tree", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-v2-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["src", "scripts", "schemas"]) {
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
      },
      {
        id: 4,
        name: "Second City",
        state_id: 2,
        state_name: "Example State",
        country_id: 1,
        country_name: "Example",
      },
    ],
  };
  for (const [name, value] of Object.entries(data))
    fs.writeFileSync(
      path.join(root, "db", `${name}.json`),
      JSON.stringify(value),
    );
  const oldFile = path.join(root, "dist/api/v1/keep.json");
  fs.mkdirSync(path.dirname(oldFile), { recursive: true });
  fs.writeFileSync(oldFile, '{"keep":true}');
  const result = spawnSync(
    process.execPath,
    ["src/data-processor.js", "--country-shard-size", "1"],
    { cwd: root, encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.readFileSync(oldFile, "utf8"), '{"keep":true}');

  const output = path.join(root, "dist/api/v2");
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  const catalog = read("search/cities/index.json");
  assert.deepEqual(catalog.data, [
    {
      country_code: "EX",
      filename: "countries/ex/cities/index.json",
      count: 2,
    },
  ]);
  const index = read(catalog.data[0].filename);
  assert.deepEqual(
    index.data.map((page) => page.count),
    [1, 1],
  );
  const cities = index.data.flatMap((page) => read(page.filename).data);
  assert.deepEqual(cities.map((city) => city.id).sort(), [3, 4]);
  assert.equal(
    cities.find((city) => city.id === 3).name_normalized,
    "sao example",
  );
  assert.equal(read("cities/3.json").data.name, "São Example");
  for (const removed of [
    "search/cities.json",
    "search/combined.json",
    "cities/batches.json",
  ])
    assert.equal(fs.existsSync(path.join(output, removed)), false);

  const verification = spawnSync(
    process.execPath,
    ["scripts/verify.js", output],
    { cwd: root, encoding: "utf8", timeout: 30000 },
  );
  assert.equal(
    verification.status,
    0,
    `${verification.stdout}\n${verification.stderr}`,
  );
  assert.match(verification.stdout, /Verified .* JSON files/i);
});
