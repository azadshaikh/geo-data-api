const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const config = require("../src/config");
const SearchGenerator = require("../src/generators/search");
const APIInfoGenerator = require("../src/generators/docs/api-info-generator");
const APIDocumentationGenerator = require("../src/generators/docs/api-documentation-generator");
const QuickStartTemplate = require("../src/generators/docs/templates/quick-start-template");

const countries = [
  { id: 1, iso2: "in", name: "India" },
  { id: 2, iso2: "US", name: "United States" },
  { id: 3, iso2: null, name: "Uncoded country" },
];
const cities = [
  {
    id: 1,
    name: "Delhi",
    country_id: 1,
    country_code: "IN",
    country_name: "India",
  },
  {
    id: 2,
    name: "Kochi",
    country_id: 1,
    country_code: null,
    country_name: "India",
  },
  {
    id: 3,
    name: "New York",
    state_id: 10,
    state_name: "New York",
    state_code: "NY",
    country_id: 2,
    country_code: "US",
    country_name: "United States",
    wikiDataId: "Q60",
  },
  {
    id: 4,
    name: "Uncoded",
    country_id: 3,
    country_code: null,
    country_name: "Uncoded country",
  },
  { id: 5, name: "Unmapped", country_id: 999, country_code: "../../private" },
  {
    id: 6,
    name: "Austin",
    country_id: 2,
    country_code: "ZZ",
    country_name: "United States",
  },
];

let outputDir;
let previousOutputDir;
let generationResult;

async function readJSON(file) {
  return JSON.parse(await fs.readFile(path.join(outputDir, file), "utf8"));
}

before(async () => {
  outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "geo-data-shards-"));
  previousOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = outputDir;
  generationResult = await new SearchGenerator(
    countries,
    [],
    cities,
  ).generate();
  await new APIInfoGenerator(countries, [], cities, {}).generate();
  await new APIDocumentationGenerator(countries, [], cities, {}).generate();
});

after(async () => {
  config.OUTPUT_DIR = previousOutputDir;
  if (outputDir) await fs.rm(outputDir, { recursive: true, force: true });
});

test("keeps the existing complete city index available", async () => {
  const full = await readJSON("search/cities.json");
  assert.deepEqual(
    full.data.map((city) => city.id),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(full.meta.type, "cities_search");
  assert.equal(full.meta.total_cities, 6);
  assert.deepEqual(
    full.data.find((city) => city.id === 3),
    {
      id: 3,
      name: "New York",
      name_normalized: "new york",
      state_id: 10,
      state_name: "New York",
      state_code: "NY",
      country_id: 2,
      country_name: "United States",
      country_code: "US",
      wikiDataId: "Q60",
    },
  );
});

test("reports the manifest and country shards in generated file counts", () => {
  assert.equal(generationResult.filesGenerated, 9);
});

test("the manifest points to complete country shards without dropping or duplicating cities", async () => {
  const full = await readJSON("search/cities.json");
  const manifest = await readJSON("search/cities/index.json");
  assert.equal(manifest.meta.total_cities, 6);
  assert.equal(manifest.data.length, 3);
  assert.deepEqual(
    manifest.data.map((item) => item.country_code),
    ["IN", "US", null],
  );
  const all = [];
  for (const item of manifest.data) {
    assert.match(
      item.filename,
      /^search\/cities\/country\/(?:[a-z]{2}|unknown)\.json$/,
    );
    const shard = await readJSON(item.filename);
    assert.equal(shard.meta.country_code, item.country_code);
    assert.equal(shard.data.length, item.count);
    assert.deepEqual(shard.meta.searchable_fields, full.meta.searchable_fields);
    all.push(...shard.data);
  }
  assert.deepEqual(
    all.sort((a, b) => a.id - b.id),
    [...full.data].sort((a, b) => a.id - b.id),
  );
});

test("country shards use canonical country codes with a safe fallback", async () => {
  const india = await readJSON("search/cities/country/in.json");
  const usa = await readJSON("search/cities/country/us.json");
  const unknown = await readJSON("search/cities/country/unknown.json");
  assert.deepEqual(
    india.data.map((city) => city.id),
    [1, 2],
  );
  assert.deepEqual(
    usa.data.map((city) => city.id),
    [3, 6],
  );
  assert.deepEqual(
    unknown.data.map((city) => city.id),
    [4, 5],
  );
});

test("discovery catalogs advertise the manifest and country shard URLs", async () => {
  const info = await readJSON("api-info.json");
  const documentation = await readJSON("documentation.json");
  assert.equal(
    info.endpoints.search.city_shards_index,
    "search/cities/index.json",
  );
  assert.equal(
    info.endpoints.search.cities_by_country,
    "search/cities/country/{iso2}.json",
  );
  assert.ok(documentation.endpoints.search["GET /search/cities/index.json"]);
  assert.ok(
    documentation.endpoints.search["GET /search/cities/country/{iso2}.json"],
  );
});

test("the quick-start search example reads one country shard", async () => {
  const document = new QuickStartTemplate().generate();
  const start = document.indexOf("// Download only the US city-search shard");
  const end = document.indexOf("\n```", start);
  assert.ok(start >= 0 && end > start);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runExample = new AsyncFunction(
    "fetch",
    `${document.slice(start, end)}\nreturn { citiesWithWikiData, newYorkCities };`,
  );
  const fetchShard = async (url) => {
    assert.equal(url, `${config.CDN_BASE_URL}/search/cities/country/us.json`);
    return { ok: true, json: () => readJSON("search/cities/country/us.json") };
  };
  const result = await runExample(fetchShard);
  assert.deepEqual(
    result.citiesWithWikiData.map((city) => city.id),
    [3],
  );
  assert.deepEqual(
    result.newYorkCities.map((city) => city.id),
    [3],
  );
  await assert.rejects(
    runExample(async () => ({ ok: false, status: 404 })),
    /404/,
  );
});

test("an empty dataset still produces an empty shard manifest", async () => {
  const emptyDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-data-empty-shards-"),
  );
  const savedOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = emptyDir;
  try {
    const result = await new SearchGenerator([], [], []).generate();
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(emptyDir, "search/cities/index.json"),
        "utf8",
      ),
    );
    assert.deepEqual(manifest.data, []);
    assert.equal(manifest.meta.total_cities, 0);
    assert.equal(result.filesGenerated, 6);
  } finally {
    config.OUTPUT_DIR = savedOutputDir;
    await fs.rm(emptyDir, { recursive: true, force: true });
  }
});
