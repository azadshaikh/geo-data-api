const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { test } = require("node:test");

function filesUnder(root, relative = "") {
  return fs
    .readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const next = path.join(relative, entry.name);
      return entry.isDirectory() ? filesUnder(root, next) : [next];
    })
    .sort();
}

test("builds are reproducible and preserve the previous output on collision", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-repro-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.resolve(__dirname, "../src"), path.join(root, "src"), {
    recursive: true,
  });
  if (fs.existsSync(path.resolve(__dirname, "../scripts"))) {
    fs.cpSync(
      path.resolve(__dirname, "../scripts"),
      path.join(root, "scripts"),
      { recursive: true },
    );
  }
  fs.copyFileSync(
    path.resolve(__dirname, "../package.json"),
    path.join(root, "package.json"),
  );
  fs.mkdirSync(path.join(root, "db"));
  const data = {
    countries: [{ id: 1, name: "Example", iso2: "EX", iso3: "EXP" }],
    states: [
      {
        id: 2,
        name: "State",
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
        name: "City",
        state_id: 2,
        state_name: "State",
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
  const env = {
    ...process.env,
    SOURCE_DATE_EPOCH: "1700000000",
    NODE_PATH: path.resolve(__dirname, "../node_modules"),
  };
  function build() {
    return spawnSync(process.execPath, ["src/data-processor.js"], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 30000,
    });
  }
  const first = build();
  assert.equal(first.status, 0, first.stderr);
  const output = path.join(root, "dist/api/v1");
  const initialFiles = filesUnder(output);
  const initial = new Map(
    initialFiles.map((name) => [
      name,
      fs.readFileSync(path.join(output, name)),
    ]),
  );
  assert.ok(initial.has("manifest.json"), "the build must generate a manifest");
  const manifest = JSON.parse(initial.get("manifest.json"));
  assert.equal(manifest.generated_at, "2023-11-14T22:13:20.000Z");
  assert.match(manifest.dataset_version, /^sha256:[0-9a-f]{64}$/);
  assert.equal(manifest.file_count, manifest.files.length + 1);
  assert.deepEqual(manifest.counts, { countries: 1, states: 1, cities: 1 });
  const known = path.join(output, "countries.json");
  const oldTime = new Date("2020-01-01T00:00:00.000Z");
  fs.utimesSync(known, oldTime, oldTime);
  const second = build();
  assert.equal(second.status, 0, second.stderr);
  assert.doesNotMatch(
    second.stdout,
    /Generating countries endpoints/,
    "unchanged inputs should skip regeneration",
  );
  assert.deepEqual(filesUnder(output), initialFiles);
  for (const [name, bytes] of initial)
    assert.deepEqual(fs.readFileSync(path.join(output, name)), bytes, name);
  assert.equal(fs.statSync(known).mtimeMs, oldTime.getTime());

  fs.writeFileSync(known, "corrupted");
  const repaired = build();
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.match(repaired.stdout, /Generating countries endpoints/);
  assert.deepEqual(fs.readFileSync(known), initial.get("countries.json"));

  const fingerprintBefore = JSON.parse(
    fs.readFileSync(path.join(output, "manifest.json")),
  ).build_fingerprint;
  fs.appendFileSync(
    path.join(root, "src/config.js"),
    "\n// Build fingerprint regression check\n",
  );
  const codeChanged = build();
  assert.equal(codeChanged.status, 0, codeChanged.stderr);
  assert.match(codeChanged.stdout, /Generating countries endpoints/);
  assert.notEqual(
    JSON.parse(fs.readFileSync(path.join(output, "manifest.json")))
      .build_fingerprint,
    fingerprintBefore,
  );

  fs.writeFileSync(path.join(output, "user-note.txt"), "keep this file");
  const withExtra = build();
  assert.equal(withExtra.status, 0, withExtra.stderr);
  let updatedManifest = JSON.parse(
    fs.readFileSync(path.join(output, "manifest.json")),
  );
  assert.equal(
    updatedManifest.files.find((item) => item.path === "user-note.txt")
      .generated,
    false,
  );
  const withExtraAgain = build();
  assert.equal(withExtraAgain.status, 0, withExtraAgain.stderr);
  assert.equal(
    fs.readFileSync(path.join(output, "user-note.txt"), "utf8"),
    "keep this file",
  );

  data.states[0].iso2 = "ZZ";
  data.states[0].iso3166_2 = "EX-ZZ";
  fs.writeFileSync(
    path.join(root, "db/states.json"),
    JSON.stringify(data.states),
  );
  const changed = build();
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(fs.existsSync(path.join(output, "states/ex-es.json")), false);
  assert.equal(fs.existsSync(path.join(output, "states/ex-zz.json")), true);
  assert.equal(
    fs.readFileSync(path.join(output, "user-note.txt"), "utf8"),
    "keep this file",
  );
  const currentFiles = filesUnder(output);
  const current = new Map(
    currentFiles.map((name) => [
      name,
      fs.readFileSync(path.join(output, name)),
    ]),
  );

  data.countries.push({ id: 4, name: "Duplicate", iso2: "EX", iso3: "DUP" });
  fs.writeFileSync(
    path.join(root, "db/countries.json"),
    JSON.stringify(data.countries),
  );
  const failed = build();
  assert.notEqual(
    failed.status,
    0,
    "duplicate output paths should fail the build",
  );
  assert.deepEqual(filesUnder(output), currentFiles);
  for (const [name, bytes] of current)
    assert.deepEqual(fs.readFileSync(path.join(output, name)), bytes, name);

  data.countries.pop();
  fs.writeFileSync(
    path.join(root, "db/countries.json"),
    JSON.stringify(data.countries),
  );
  data.states.push({ ...data.states[0], id: 5, name: "Duplicate State" });
  fs.writeFileSync(
    path.join(root, "db/states.json"),
    JSON.stringify(data.states),
  );
  const stateCollision = build();
  assert.notEqual(
    stateCollision.status,
    0,
    "collisions swallowed by an individual generator must still fail the build",
  );
  assert.deepEqual(filesUnder(output), currentFiles);
  for (const [name, bytes] of current)
    assert.deepEqual(fs.readFileSync(path.join(output, name)), bytes, name);
});

test("manifest dataset hash describes the source bytes actually loaded", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-source-hash-"));
  const config = require("../src/config");
  const { DataProcessor } = require("../src/data-processor");
  const previous = { input: config.INPUT_DIR, output: config.OUTPUT_DIR };
  t.after(() => {
    config.INPUT_DIR = previous.input;
    config.OUTPUT_DIR = previous.output;
    fs.rmSync(root, { recursive: true, force: true });
  });
  config.INPUT_DIR = path.join(root, "db");
  config.OUTPUT_DIR = path.join(root, "api");
  fs.mkdirSync(config.INPUT_DIR);
  const datasets = {
    countries: [{ id: 1, name: "Example", iso2: "EX", iso3: "EXP" }],
    states: [
      {
        id: 2,
        name: "State",
        country_id: 1,
        country_code: "EX",
        country_name: "Example",
      },
    ],
    cities: [
      {
        id: 3,
        name: "City",
        state_id: 2,
        state_name: "State",
        country_id: 1,
        country_name: "Example",
      },
    ],
  };
  const hash = createHash("sha256");
  for (const [name, records] of Object.entries(datasets)) {
    const bytes = Buffer.from(JSON.stringify(records));
    fs.writeFileSync(path.join(config.INPUT_DIR, `${name}.json`), bytes);
    hash.update(`${name}.json\0${bytes.length}\0`).update(bytes);
  }
  const expected = `sha256:${hash.digest("hex")}`;
  const processor = new DataProcessor();
  await processor.loadData();
  datasets.countries[0].name = "Changed after load";
  fs.writeFileSync(
    path.join(config.INPUT_DIR, "countries.json"),
    JSON.stringify(datasets.countries),
  );
  await processor.generateAPI();
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(config.OUTPUT_DIR, "manifest.json")))
      .dataset_version,
    expected,
  );
});
