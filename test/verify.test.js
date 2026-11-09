const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { DataProcessor } = require("../src/data-processor");
const { verifyOutput } = require("../scripts/verify");

let fixtureRoot;
let sourceOutput;

before(async () => {
  fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "geo-data-verify-source-"),
  );
  const input = path.join(fixtureRoot, "db");
  sourceOutput = path.join(fixtureRoot, "api");
  fs.mkdirSync(input);
  const data = {
    countries: [
      {
        id: 10,
        name: "Example",
        iso2: "EX",
        iso3: "EXP",
        region: "Example Region",
        subregion: "Example Subregion",
      },
      { id: 11, name: "Empty", iso2: "EM", iso3: "EMP" },
    ],
    states: [
      {
        id: 20,
        name: "East",
        iso2: "AA",
        country_id: 10,
        country_code: "EX",
        country_name: "Example",
        type: "state",
        timezone: "Etc/GMT-12",
      },
      {
        id: 21,
        name: "West",
        iso2: "BB",
        country_id: 10,
        country_code: "EX",
        country_name: "Example",
        type: "state",
        timezone: "Etc/GMT+12",
      },
      {
        id: 22,
        name: "Vacant",
        iso2: "CC",
        country_id: 10,
        country_code: "EX",
        country_name: "Example",
      },
    ],
    cities: [
      {
        id: 30,
        name: "East City",
        state_id: 20,
        state_name: "East",
        country_id: 10,
        country_name: "Example",
        timezone: "Etc/GMT-12",
        latitude: "0",
        longitude: "12.5",
      },
      {
        id: 31,
        name: "Other East City",
        state_id: 20,
        state_name: "East",
        country_id: 10,
        country_name: "Example",
        timezone: "Etc/GMT-12",
      },
      {
        id: 32,
        name: "West City",
        state_id: 21,
        state_name: "West",
        country_id: 10,
        country_name: "Example",
        timezone: "Etc/GMT+12",
      },
    ],
  };
  for (const [name, value] of Object.entries(data))
    fs.writeFileSync(path.join(input, `${name}.json`), JSON.stringify(value));
  await new DataProcessor({
    inputDir: input,
    outputDir: sourceOutput,
    countryShardSize: 1,
  }).run();
});

after(() => {
  if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-data-verify-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(sourceOutput, root, { recursive: true });
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
  const write = (name, value, updateChecksum = true) => {
    const bytes = Buffer.from(JSON.stringify(value));
    fs.writeFileSync(path.join(root, name), bytes);
    if (updateChecksum && name !== "manifest.json") {
      const manifest = read("manifest.json");
      const entry = manifest.files.find((item) => item.path === name);
      assert.ok(entry, `missing manifest entry for ${name}`);
      entry.bytes = bytes.length;
      entry.sha256 = createHash("sha256").update(bytes).digest("hex");
      fs.writeFileSync(
        path.join(root, "manifest.json"),
        JSON.stringify(manifest),
      );
    }
  };
  return { root, read, write };
}

function rejects(root, pattern) {
  const errors = verifyOutput(root).errors;
  assert.notEqual(
    errors.length,
    0,
    "verification should reject corrupted output",
  );
  assert.match(errors.join("\n"), pattern);
}

test("accepts a complete v2 output and collision-safe timezone indexes", (t) => {
  const { root } = fixture(t);
  assert.deepEqual(verifyOutput(root).errors, []);
});

test("rejects an incorrect machine-readable discovery route even with a valid checksum", (t) => {
  const { root, read, write } = fixture(t);
  const info = read("api-info.json");
  info.endpoints.cities.individual = "cities/wrong/{id}.json";
  write("api-info.json", info);
  rejects(root, /api-info\.json.*(?:cities|individual)/i);
});

test("rejects a missing documented city route even with a valid checksum", (t) => {
  const { root, read, write } = fixture(t);
  const documentation = read("documentation.json");
  delete documentation.endpoints.cities["GET /cities/{id}.json"];
  write("documentation.json", documentation);
  rejects(root, /documentation\.json.*cities/i);
});

test("rejects a missing city detail", (t) => {
  const { root } = fixture(t);
  fs.rmSync(path.join(root, "cities/30.json"));
  rejects(root, /missing cities\/30\.json/i);
});

test("rejects a city detail that disagrees with its state list", (t) => {
  const { root, read, write } = fixture(t);
  const detail = read("cities/30.json");
  detail.data.name = "Incorrect city";
  write("cities/30.json", detail);
  rejects(root, /cities\/30\.json.*name differs from city list/i);
});

test("rejects a schema-invalid city detail even when its checksum is updated", (t) => {
  const { root, read, write } = fixture(t);
  const detail = read("cities/30.json");
  detail.data.wikidata_id = 123;
  write("cities/30.json", detail);
  rejects(root, /cities\/30\.json.*schema.*wikidata_id/i);
});

test("reports schema-invalid country data without throwing", (t) => {
  const { root, read, write } = fixture(t);
  const countries = read("countries.json");
  countries.data[0].subregion = 12;
  write("countries.json", countries);
  let report;
  assert.doesNotThrow(() => {
    report = verifyOutput(root);
  });
  assert.match(report.errors.join("\n"), /countries\.json.*schema.*subregion/i);
});

test("rejects an ungenerated country route even if it is a valid preserved extra", (t) => {
  const { root, read } = fixture(t);
  const bytes = fs.readFileSync(path.join(root, "countries/ex.json"));
  fs.writeFileSync(path.join(root, "countries/zz.json"), bytes);
  const manifest = read("manifest.json");
  manifest.files.push({
    path: "countries/zz.json",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    generated: false,
  });
  manifest.file_count++;
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  rejects(root, /countries\/zz\.json.*(?:unexpected|unrecognized|route)/i);
});

test("rejects missing state details and malformed JSON", (t) => {
  const { root } = fixture(t);
  fs.rmSync(path.join(root, "countries/ex/states/aa.json"));
  fs.writeFileSync(path.join(root, "search/countries.json"), "{invalid");
  const errors = verifyOutput(root).errors.join("\n");
  assert.match(errors, /missing countries\/ex\/states\/aa\.json/i);
  assert.match(errors, /search\/countries\.json.*invalid JSON/i);
});

test("enforces a configurable byte budget for country city pages", (t) => {
  const { root } = fixture(t);
  const bytes = fs.statSync(path.join(root, "countries/ex/cities/1.json")).size;
  assert.deepEqual(
    verifyOutput(root, { maxSearchShardBytes: bytes + 1000 }).errors,
    [],
  );
  assert.match(
    verifyOutput(root, { maxSearchShardBytes: bytes - 1 }).errors.join("\n"),
    /city page exceeds byte budget/i,
  );
});

test("rejects missing and inconsistent list counts", (t) => {
  const { root, read, write } = fixture(t);
  const countries = read("countries.json");
  delete countries.meta.count;
  write("countries.json", countries);
  const states = read("states/all.json");
  states.meta.count = 99;
  write("states/all.json", states);
  const errors = verifyOutput(root).errors.join("\n");
  assert.match(errors, /countries\.json.*count/i);
  assert.match(errors, /states\/all\.json.*count/i);
});

test("requires the subregion file named by the country data", (t) => {
  const { root } = fixture(t);
  fs.rmSync(path.join(root, "countries/subregion/example-subregion.json"));
  rejects(root, /missing countries\/subregion\/example-subregion\.json/i);
});

test("rejects a missing page from a country page index", (t) => {
  const { root, read, write } = fixture(t);
  const index = read("countries/ex/cities/index.json");
  index.data.pop();
  index.meta.count = index.data.length;
  write("countries/ex/cities/index.json", index);
  rejects(
    root,
    /countries\/ex\/cities\/index\.json.*(?:total_cities|coverage)/i,
  );
});

test("rejects a page index that points outside the expected numbered pages", (t) => {
  const { root, read, write } = fixture(t);
  const index = read("countries/ex/cities/index.json");
  index.data[0].filename = "../outside.json";
  write("countries/ex/cities/index.json", index);
  rejects(root, /countries\/ex\/cities\/index\.json.*invalid page path/i);
});

test("rejects page count mismatches and duplicate city IDs across pages", (t) => {
  const { root, read, write } = fixture(t);
  const index = read("countries/ex/cities/index.json");
  index.data[0].count = 2;
  write("countries/ex/cities/index.json", index);
  const page1 = read(index.data[0].filename);
  const page2 = read(index.data[1].filename);
  page2.data[0] = page1.data[0];
  write(index.data[1].filename, page2);
  const errors = verifyOutput(root).errors.join("\n");
  assert.match(errors, /page count/i);
  assert.match(errors, /duplicate city ID/i);
});

test("rejects replacement city summaries even when page counts still match", (t) => {
  const { root, read, write } = fixture(t);
  const page = read("countries/ex/cities/1.json");
  page.data[0].id = 999;
  write("countries/ex/cities/1.json", page);
  rejects(root, /countries\/ex\/cities\/index\.json.*coverage.*mismatch/i);
});

test("rejects altered city summary data for an existing ID", (t) => {
  const { root, read, write } = fixture(t);
  const page = read("countries/ex/cities/1.json");
  page.data[0].name = "Incorrect city";
  write("countries/ex/cities/1.json", page);
  rejects(root, /countries\/ex\/cities\/index\.json.*record.*differs/i);
});

test("rejects missing countries and unsafe paths in the global city catalog", (t) => {
  const { root, read, write } = fixture(t);
  const catalog = read("search/cities/index.json");
  catalog.data = catalog.data.filter((entry) => entry.country_code !== "EM");
  catalog.meta.count = catalog.data.length;
  catalog.data[0].filename = "C:\\outside.json";
  write("search/cities/index.json", catalog);
  const errors = verifyOutput(root).errors.join("\n");
  assert.match(
    errors,
    /search\/cities\/index\.json.*invalid country index path/i,
  );
  assert.match(errors, /search\/cities\/index\.json.*missing country EM/i);
});

test("rejects a changed checksum even when the file length stays the same", (t) => {
  const { root, read } = fixture(t);
  const name = "search/countries.json.gz";
  const file = path.join(root, name);
  fs.writeFileSync(file, Buffer.from([0, 1, 2]));
  const manifest = read("manifest.json");
  manifest.files.push({
    path: name,
    bytes: 3,
    sha256: createHash("sha256")
      .update(Buffer.from([0, 1, 2]))
      .digest("hex"),
    generated: true,
  });
  manifest.file_count++;
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  assert.deepEqual(verifyOutput(root).errors, []);
  fs.writeFileSync(file, Buffer.from([0, 1, 3]));
  rejects(root, /countries\.json\.gz.*sha256 checksum mismatch/i);
});

test("rejects missing manifest entries and unlisted output files", (t) => {
  const { root, read, write } = fixture(t);
  const manifest = read("manifest.json");
  const removed = manifest.files.pop();
  manifest.files.push({
    path: "search/missing.gz",
    bytes: 0,
    sha256: "0".repeat(64),
  });
  write("manifest.json", manifest);
  const errors = verifyOutput(root).errors.join("\n");
  assert.match(errors, /missing listed file search\/missing\.gz/i);
  assert.match(
    errors,
    new RegExp(
      `unlisted output file ${removed.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    ),
  );
});

test("rejects duplicate and unsafe manifest paths", (t) => {
  const { root, read, write } = fixture(t);
  const manifest = read("manifest.json");
  manifest.files.push(
    { ...manifest.files[0] },
    { path: "../outside", bytes: 0, sha256: "0".repeat(64) },
  );
  manifest.file_count += 2;
  write("manifest.json", manifest);
  const errors = verifyOutput(root).errors.join("\n");
  assert.match(errors, /duplicate file path/i);
  assert.match(errors, /unsafe or invalid path/i);
});

test("rejects invalid manifest bytes, counts, generated markers, and release timestamps", (t) => {
  const { root, read, write } = fixture(t);
  const manifest = read("manifest.json");
  manifest.files[0].bytes++;
  manifest.files[0].generated = "yes";
  manifest.file_count++;
  manifest.counts.cities++;
  manifest.generated_at = "2025-01-01T00:00:00.000Z";
  write("manifest.json", manifest);
  const errors = verifyOutput(root).errors.join("\n");
  for (const pattern of [
    /bytes/i,
    /generated/i,
    /file_count/i,
    /counts\.cities/i,
    /inconsistent release timestamps/i,
  ])
    assert.match(errors, pattern);
});

test("rejects timezone groups omitted from their indexes or pointing outside the API root", (t) => {
  const { root, read, write } = fixture(t);
  const stateIndex = read("states/timezones.json");
  stateIndex.data.pop();
  stateIndex.meta.count = stateIndex.data.length;
  write("states/timezones.json", stateIndex);
  const cityIndex = read("cities/timezones.json");
  cityIndex.data[0].endpoint = "../outside.json";
  write("cities/timezones.json", cityIndex);
  const errors = verifyOutput(root).errors.join("\n");
  assert.match(errors, /states\/timezones\.json.*missing timezone/i);
  assert.match(errors, /cities\/timezones\.json.*unsafe or invalid path/i);
});

test("rejects timezone targets whose metadata disagrees with their indexes", (t) => {
  const { root, read, write } = fixture(t);
  const index = read("cities/timezones.json");
  const endpoint = index.data[0].endpoint;
  const group = read(endpoint);
  group.meta.timezone = "Wrong/Timezone";
  write(endpoint, group);
  rejects(root, /cities\/timezone\/.*mismatched timezone/i);
});

test("rejects a country detail that differs from its list", (t) => {
  const { root, read, write } = fixture(t);
  const detail = read("countries/ex.json");
  detail.data.id = 999;
  write("countries/ex.json", detail);
  rejects(root, /countries\/ex\.json.*country differs from list/i);
});
