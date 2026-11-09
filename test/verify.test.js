const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const verifier = path.resolve(__dirname, "../scripts/verify.js");

// These deliberately small files represent the public API, including the
// shared city ID 30 in the detail, list, search, and shard endpoints.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-data-verify-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const list = (data, type, extra = {}) => ({
    data,
    meta: { type, count: data.length, ...extra },
  });
  const city = {
    id: 30,
    name: "Example City",
    state_id: 20,
    country_id: 10,
    country_code: "EX",
  };
  const country = { id: 10, name: "Example", iso2: "EX" };
  const state = { id: 20, name: "Example State", iso3166_2: "EX-AA" };
  const combined = {
    data: { countries: [country], states: [state], cities: [city] },
    meta: {
      type: "combined_search",
      count: 1,
      complete: true,
      counts: {
        countries: { returned: 1, total: 1, complete: true },
        states: { returned: 1, total: 1, complete: true },
        cities: { returned: 1, total: 1, complete: true },
      },
    },
  };
  const routes = {
    countries: {
      list: "countries.json",
      individual: "countries/{iso2}.json",
      by_region: "countries/region/{region-name}.json",
      by_subregion: "countries/subregion/{subregion-name}.json",
      regions_index: "countries/regions.json",
    },
    states: {
      all: "states/all.json",
      individual: "states/{iso3166_2}.json",
      by_country: "states/country/{country_iso2}.json",
      by_type: "states/type/{type-name}.json",
      by_timezone: "states/timezone/{timezone-name}.json",
      types_index: "states/types.json",
      timezones_index: "states/timezones.json",
    },
    cities: {
      individual: "cities/{id}.json",
      by_country: "cities/country/{country_iso2}.json",
      by_state: "cities/state/{state_iso3166_2}.json",
      batches: "cities/batches.json",
      batch: "cities/batch/{filename}",
    },
    search: {
      countries: "search/countries.json",
      states: "search/states.json",
      cities: "search/cities.json",
      city_shards_index: "search/cities/index.json",
      cities_by_country: "search/cities/country/{iso2}.json",
      combined_sample: "search/combined-sample.json",
      combined: "search/combined.json",
    },
  };
  const docs = {
    countries: [
      "GET /countries.json",
      "GET /countries/{iso2}.json",
      "GET /countries/regions.json",
      "GET /countries/region/{region}.json",
      "GET /countries/subregion/{subregion}.json",
    ],
    states: [
      "GET /states/all.json",
      "GET /states/{iso3166_2}.json",
      "GET /states/country/{country_iso2}.json",
      "GET /states/type/{type}.json",
      "GET /states/timezone/{timezone}.json",
      "GET /states/types.json",
      "GET /states/timezones.json",
    ],
    cities: [
      "GET /cities/{id}.json",
      "GET /cities/country/{country_iso2}.json",
      "GET /cities/state/{state_iso3166_2}.json",
      "GET /cities/batches.json",
      "GET /cities/batch/{filename}",
    ],
    search: [
      "GET /search/countries.json",
      "GET /search/states.json",
      "GET /search/cities.json",
      "GET /search/cities/index.json",
      "GET /search/cities/country/{iso2}.json",
      "GET /search/combined-sample.json",
      "GET /search/combined.json",
    ],
  };
  const files = {
    "cities/30.json": {
      data: city,
      meta: { type: "city", count: 1, city_id: 30 },
    },
    "countries.json": list([country], "countries", { total_countries: 1 }),
    "countries/ex.json": {
      data: country,
      meta: { type: "country", country_id: 10 },
    },
    "countries/regions.json": list([], "regions_index"),
    "states/all.json": list([state], "all_states", { total_states: 1 }),
    "states/ex-aa.json": {
      data: {
        ...state,
        country_id: 10,
        country_code: "EX",
        timezone: "Etc/GMT-12",
      },
      meta: { type: "state" },
    },
    "states/country/ex.json": list([state], "states", {
      country_id: 10,
      total_states: 1,
    }),
    "states/types.json": list([], "state_types_index"),
    "states/timezones.json": list(
      [
        {
          timezone: "Etc/GMT-12",
          state_count: 1,
          endpoint: "states/timezone/Etc-GMT-12.json",
        },
      ],
      "state_timezones_index",
    ),
    "states/timezone/Etc-GMT-12.json": list([state], "states_by_timezone", {
      timezone: "Etc/GMT-12",
      total_states: 1,
    }),
    "cities/country/ex.json": list(
      [{ id: 30, name: "Example City" }],
      "cities",
      { country_id: 10, total_cities: 1 },
    ),
    "cities/state/ex-aa.json": list(
      [{ id: 30, name: "Example City" }],
      "cities",
      { state_id: 20, total_cities: 1 },
    ),
    "cities/batches.json": {
      data: [
        {
          filename: "cities/batch/batch-30-30.json",
          start_id: 30,
          end_id: 30,
          count: 1,
        },
      ],
      meta: { type: "batch_index", total_batches: 1, total_cities: 1 },
    },
    "cities/batch/batch-30-30.json": {
      data: { 30: city },
      meta: { type: "cities_batch", batch_range: "30-30", cities_count: 1 },
    },
    "search/countries.json": list([country], "countries_search", {
      total_countries: 1,
    }),
    "search/states.json": list([state], "states_search", { total_states: 1 }),
    "search/cities.json": list([city], "cities_search", { total_cities: 1 }),
    "search/combined.json": structuredClone(combined),
    "search/combined-sample.json": structuredClone(combined),
    "search/cities/index.json": list(
      [
        {
          country_code: "EX",
          country_name: "Example",
          count: 1,
          filename: "search/cities/country/ex.json",
        },
      ],
      "city_search_shard_index",
      { total_cities: 1 },
    ),
    "search/cities/country/ex.json": list([city], "cities_search_by_country", {
      country_code: "EX",
      total_cities: 1,
    }),
    "api-info.json": {
      statistics: { total_countries: 1, total_states: 1, total_cities: 1 },
      endpoints: routes,
    },
    "documentation.json": {
      endpoints: Object.fromEntries(
        Object.entries(docs).map(([group, entries]) => [
          group,
          Object.fromEntries(entries.map((entry) => [entry, {}])),
        ]),
      ),
    },
  };
  const write = (name, data) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(data));
  };
  for (const [name, data] of Object.entries(files)) write(name, data);
  return { root, write, files };
}

function run(root) {
  return spawnSync(process.execPath, [verifier, root], { encoding: "utf8" });
}

function rejects(root, pattern) {
  const result = run(root);
  assert.notEqual(result.status, 0, "invalid output should fail verification");
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

function addManifest(root) {
  const paths = [];
  function collect(directory, prefix = "") {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) collect(path.join(directory, item.name), name);
      else if (name !== "manifest.json") paths.push(name);
    }
  }
  collect(root);
  const entries = paths.sort().map((name) => {
    const bytes = fs.readFileSync(path.join(root, name));
    return {
      path: name,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  const manifest = {
    schema_version: 1,
    api_version: "v1",
    dataset_version: `sha256:${"a".repeat(64)}`,
    generator_version: "1.0.0",
    generated_at: "2026-01-01T00:00:00.000Z",
    counts: { countries: 1, states: 1, cities: 1 },
    file_count: entries.length + 1,
    checksum_algorithm: "sha256",
    files: entries,
  };
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  return manifest;
}

test("accepts a complete output and exposes a callable verifier", (t) => {
  const { root } = fixture(t);
  const result = run(root);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const { verifyOutput } = require("../scripts/verify");
  const report = verifyOutput(root);
  assert.deepEqual(report.errors, []);
  assert.ok(report.filesChecked > 0);
});

test("rejects a missing individual city file", (t) => {
  const { root } = fixture(t);
  fs.rmSync(path.join(root, "cities/30.json"));
  rejects(root, /missing cities\/30\.json/i);
});

test("rejects an individual city whose details differ from its batch", (t) => {
  const { root, files, write } = fixture(t);
  files["cities/30.json"].data = {
    ...files["cities/30.json"].data,
    name: "Wrong city",
  };
  write("cities/30.json", files["cities/30.json"]);
  rejects(root, /cities\/30\.json.*differ from.*batch/i);
});

test("enforces a configurable byte budget for city search shards", (t) => {
  const { root } = fixture(t);
  const result = spawnSync(
    process.execPath,
    [verifier, root, "--max-search-shard-bytes", "1"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /search.*shard.*(budget|bytes)/i);
});

test("rejects malformed JSON anywhere in the output", (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, "orphan.json"), "{");
  rejects(root, /orphan\.json.*JSON/i);
});

test("rejects missing expected files and catalog routes", (t) => {
  const { root, files, write } = fixture(t);
  fs.rmSync(path.join(root, "states/ex-aa.json"));
  delete files["api-info.json"].endpoints.search.cities;
  write("api-info.json", files["api-info.json"]);
  rejects(root, /states[\\/]ex-aa\.json|search\.cities/i);
});

test("rejects inconsistent catalog and list counts", (t) => {
  const { root, files, write } = fixture(t);
  files["api-info.json"].statistics.total_cities = 2;
  write("api-info.json", files["api-info.json"]);
  files["countries.json"].meta.count = 2;
  write("countries.json", files["countries.json"]);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /total_cities/i);
  assert.match(result.stderr, /countries\.json.*count/i);
});

test("rejects a list whose count metadata was removed", (t) => {
  const { root, files, write } = fixture(t);
  delete files["countries.json"].meta.count;
  write("countries.json", files["countries.json"]);
  rejects(root, /countries\.json.*count/i);
});

test("requires a subregion endpoint named by country detail data", (t) => {
  const { root, files, write } = fixture(t);
  files["countries/ex.json"].data = {
    ...files["countries/ex.json"].data,
    subregion: "Southern Example",
  };
  write("countries/ex.json", files["countries/ex.json"]);
  rejects(root, /countries[\\/]subregion[\\/]southern-example\.json/i);
});

test("rejects incorrect batch counts, IDs, and coverage", (t) => {
  const { root, files, write } = fixture(t);
  files["cities/batch/batch-30-30.json"].data = { 31: { id: 32 } };
  files["cities/batches.json"].data[0].count = 2;
  write("cities/batches.json", files["cities/batches.json"]);
  write(
    "cities/batch/batch-30-30.json",
    files["cities/batch/batch-30-30.json"],
  );
  rejects(root, /batch.*(count|id|coverage)/i);
});

test("rejects overlapping batch ranges and duplicate IDs", (t) => {
  const { root, files, write } = fixture(t);
  files["cities/batches.json"].data.push({
    filename: "cities/batch/duplicate.json",
    start_id: 30,
    end_id: 30,
    count: 1,
  });
  files["cities/batches.json"].meta.total_batches = 2;
  files["cities/batches.json"].meta.total_cities = 2;
  write("cities/batches.json", files["cities/batches.json"]);
  write("cities/batch/duplicate.json", files["cities/batch/batch-30-30.json"]);
  rejects(root, /(overlap|duplicate)/i);
});

test("rejects shard omissions and replacement records even when counts match", (t) => {
  const { root, files, write } = fixture(t);
  files["search/cities/country/ex.json"].data[0] = {
    id: 999,
    name: "Wrong city",
  };
  write(
    "search/cities/country/ex.json",
    files["search/cities/country/ex.json"],
  );
  rejects(root, /shard.*(999|coverage|missing)/i);
});

test("checks country city shard indexes against the complete country list", (t) => {
  const { root, write } = fixture(t);
  write("cities/country/ex/index.json", {
    data: [{ filename: "cities/country/ex/1.json", count: 1 }],
    meta: {
      type: "cities_country_shard_index",
      count: 1,
      city_count: 1,
      shard_size: 1,
    },
  });
  write("cities/country/ex/1.json", {
    data: [{ id: 999, name: "Wrong" }],
    meta: { type: "cities_country_shard", count: 1, country_id: 10 },
  });
  rejects(root, /country.*shard|shard.*country/i);
});

test("requires the combined search sample endpoint", (t) => {
  const { root } = fixture(t);
  fs.rmSync(path.join(root, "search/combined-sample.json"));
  rejects(root, /search[\\/]combined-sample\.json/i);
});

test("rejects a combined search alias that disagrees with its sample", (t) => {
  const { root, files, write } = fixture(t);
  files["search/combined.json"].data.cities = [];
  write("search/combined.json", files["search/combined.json"]);
  rejects(root, /combined\.json.*(combined-sample|alias|sample)/i);
});

test("rejects incorrect combined sample counts even if the alias matches", (t) => {
  const { root, files, write } = fixture(t);
  for (const name of ["search/combined.json", "search/combined-sample.json"]) {
    files[name].meta.counts.cities.total = 2;
    write(name, files[name]);
  }
  rejects(root, /combined-sample\.json.*(cities|count)/i);
});

test("accepts a complete manifest including non-JSON files", (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(
    path.join(root, "search/countries.json.gz"),
    Buffer.from([0, 1, 2]),
  );
  addManifest(root);
  const result = run(root);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("rejects a file with a changed checksum even when its byte length is unchanged", (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(
    path.join(root, "search/countries.json.gz"),
    Buffer.from([0, 1, 2]),
  );
  addManifest(root);
  fs.writeFileSync(
    path.join(root, "search/countries.json.gz"),
    Buffer.from([0, 1, 3]),
  );
  rejects(root, /countries\.json\.gz.*(sha256|checksum)/i);
});

test("rejects missing manifest entries and unlisted output files", (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, "search/old.gz"), "old");
  addManifest(root);
  fs.rmSync(path.join(root, "search/old.gz"));
  fs.writeFileSync(path.join(root, "search/new.br"), "new");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /search[\\/]old\.gz/i);
  assert.match(result.stderr, /search[\\/]new\.br/i);
});

test("rejects duplicate and unsafe manifest file paths", (t) => {
  const { root } = fixture(t);
  const manifest = addManifest(root);
  manifest.files.push(
    { ...manifest.files[0] },
    { path: "../outside", bytes: 0, sha256: "0".repeat(64) },
  );
  manifest.file_count += 2;
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate/i);
  assert.match(result.stderr, /(unsafe|invalid).*path/i);
});

test("rejects incorrect manifest byte lengths, totals, and file counts", (t) => {
  const { root } = fixture(t);
  const manifest = addManifest(root);
  manifest.files[0].bytes += 1;
  manifest.file_count += 1;
  manifest.counts.cities += 1;
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bytes/i);
  assert.match(result.stderr, /file_count/i);
  assert.match(result.stderr, /counts\.cities/i);
});

test("rejects an invalid manifest generated-file marker", (t) => {
  const { root } = fixture(t);
  const manifest = addManifest(root);
  manifest.files[0].generated = "yes";
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  rejects(root, /manifest\.json.*generated/i);
});

test("rejects a shard with changed search data for an existing ID", (t) => {
  const { root, files, write } = fixture(t);
  files["search/cities/country/ex.json"].data[0] = {
    id: 30,
    name: "Wrong name",
  };
  write(
    "search/cities/country/ex.json",
    files["search/cities/country/ex.json"],
  );
  rejects(root, /shard.*(30|differ|mismatch)/i);
});

test("rejects references that escape the API root", (t) => {
  const { root, files, write } = fixture(t);
  files["cities/batches.json"].data[0].filename = "../outside.json";
  files["search/cities/index.json"].data[0].filename = "C:\\outside.json";
  write("cities/batches.json", files["cities/batches.json"]);
  write("search/cities/index.json", files["search/cities/index.json"]);
  rejects(root, /(unsafe|outside|escape|invalid).*path/i);
});

test("detects the Etc/GMT sign collision and verifies timezone metadata", (t) => {
  const { root, files, write } = fixture(t);
  files["states/timezones.json"].data.push({
    timezone: "Etc/GMT+12",
    state_count: 1,
    endpoint: "states/timezone/Etc-GMT-12.json",
  });
  files["states/timezones.json"].meta.count = 2;
  write("states/timezones.json", files["states/timezones.json"]);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Etc\/GMT-12/);
  assert.match(result.stderr, /Etc\/GMT\+12/);
  assert.match(result.stderr, /(collision|timezone)/i);
});

test("rejects a state timezone omitted from its index", (t) => {
  const { root, files, write } = fixture(t);
  files["states/timezones.json"].data = [];
  files["states/timezones.json"].meta.count = 0;
  write("states/timezones.json", files["states/timezones.json"]);
  rejects(root, /states[\\/]timezones\.json.*(missing|coverage).*Etc\/GMT-12/i);
});

test("follows city timezone index paths instead of guessing legacy filenames", (t) => {
  const { root, files, write } = fixture(t);
  const city = {
    ...files["cities/batch/batch-30-30.json"].data[30],
    timezone: "Etc/GMT+12",
  };
  files["cities/batch/batch-30-30.json"].data[30] = city;
  files["cities/30.json"].data = city;
  write("cities/30.json", files["cities/30.json"]);
  write(
    "cities/batch/batch-30-30.json",
    files["cities/batch/batch-30-30.json"],
  );
  write("cities/timezones.json", {
    data: [
      {
        timezone: "Etc/GMT+12",
        city_count: 1,
        endpoint: "cities/timezone/Etc-GMT-12--unique.json",
      },
    ],
    meta: { type: "city_timezones_index", count: 1 },
  });
  write("cities/timezone/Etc-GMT-12--unique.json", {
    data: [{ id: 30 }],
    meta: {
      type: "cities_by_timezone",
      timezone: "Etc/GMT+12",
      count: 1,
      total_cities: 1,
    },
  });
  const result = run(root);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("rejects city timezone index targets with a different timezone", (t) => {
  const { root, files, write } = fixture(t);
  files["cities/batch/batch-30-30.json"].data[30].timezone = "Etc/GMT+12";
  write(
    "cities/batch/batch-30-30.json",
    files["cities/batch/batch-30-30.json"],
  );
  write("cities/timezones.json", {
    data: [
      {
        timezone: "Etc/GMT+12",
        city_count: 1,
        endpoint: "cities/timezone/Etc-GMT-12.json",
      },
    ],
    meta: { type: "city_timezones_index", count: 1 },
  });
  write("cities/timezone/Etc-GMT-12.json", {
    data: [{ id: 30 }],
    meta: {
      type: "cities_by_timezone",
      timezone: "Etc/GMT-12",
      count: 1,
      total_cities: 1,
    },
  });
  rejects(root, /cities[\\/]timezone.*timezone.*Etc\/GMT\+12/i);
});

test("rejects a mismatched country detail even when its filename exists", (t) => {
  const { root, files, write } = fixture(t);
  files["countries/ex.json"].data.id = 11;
  write("countries/ex.json", files["countries/ex.json"]);
  rejects(root, /countries[\\/]ex\.json.*(id|10)/i);
});

test("accepts a real build with collision-safe timezone indexes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-data-verify-build-"));
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
  const countries = [{ id: 10, name: "Example", iso2: "EX", iso3: "EXP" }];
  const states = [
    {
      id: 20,
      name: "East",
      iso2: "EE",
      iso3166_2: "EX-EE",
      country_id: 10,
      country_code: "EX",
      country_name: "Example",
      timezone: "Etc/GMT+12",
    },
    {
      id: 21,
      name: "West",
      iso2: "WW",
      iso3166_2: "EX-WW",
      country_id: 10,
      country_code: "EX",
      country_name: "Example",
      timezone: "Etc/GMT-12",
    },
  ];
  const cities = [
    {
      id: 30,
      name: "East City",
      state_id: 20,
      state_name: "East",
      country_id: 10,
      country_name: "Example",
      country_code: "EX",
      timezone: "Etc/GMT+12",
    },
    {
      id: 31,
      name: "West City",
      state_id: 21,
      state_name: "West",
      country_id: 10,
      country_name: "Example",
      country_code: "EX",
      timezone: "Etc/GMT-12",
    },
  ];
  for (const [name, value] of Object.entries({ countries, states, cities })) {
    fs.writeFileSync(
      path.join(root, "db", `${name}.json`),
      JSON.stringify(value),
    );
  }
  const nodePath = [
    path.resolve(__dirname, "../node_modules"),
    process.env.NODE_PATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);
  const build = spawnSync(process.execPath, ["src/data-processor.js"], {
    cwd: root,
    env: { ...process.env, NODE_PATH: nodePath },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  const result = run(path.join(root, "dist/api/v1"));
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
