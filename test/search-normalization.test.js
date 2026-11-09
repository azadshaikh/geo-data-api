const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const config = require("../src/config");
const SearchGenerator = require("../src/generators/search");
const CitiesGenerator = require("../src/generators/cities");
const { normalizeDataset, normalizeName } = require("../src/utils/v2-model");

const sourceCountries = [
  { id: 1, iso2: "BR", name: "BRASIL" },
  { id: 2, iso2: "CI", name: "Côte d’Ivoire" },
  { id: 3, iso2: "TR", name: "Türkiye" },
];
const sourceStates = [
  ...Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1,
    name: index === 0 ? "São Paulo" : `State ${index + 1}`,
    country_id: 1,
  })),
  { id: 1002, name: "Québec", country_id: 2 },
];
const sourceCities = Array.from({ length: 5002 }, (_, index) => ({
  id: index + 1,
  name: ["São Paulo", "Montréal", "Łódź", "東京"][index] || `City ${index + 1}`,
  state_id: index === 1 ? 1002 : 1,
  country_id: index === 1 ? 2 : 1,
}));
const { countries, states, cities } = normalizeDataset(
  sourceCountries,
  sourceStates,
  sourceCities,
);
let outputDir;
let previousOutputDir;

async function readJSON(relativePath) {
  return JSON.parse(
    await fs.readFile(path.join(outputDir, relativePath), "utf8"),
  );
}

before(async () => {
  outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "geo-data-normalized-"));
  previousOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = outputDir;
  await new SearchGenerator(countries, states, cities).generate();
  await new CitiesGenerator(cities, states, countries).generateCountries();
});

after(async () => {
  config.OUTPUT_DIR = previousOutputDir;
  if (outputDir) await fs.rm(outputDir, { recursive: true, force: true });
});

test("search records expose diacritic-folded names for client-side matching", async () => {
  const countrySearch = await readJSON("search/countries.json");
  const stateSearch = await readJSON("search/states.json");
  for (const result of [countrySearch, stateSearch])
    assert.ok(result.meta.searchable_fields.includes("name_normalized"));
  assert.equal(countrySearch.data[1].name_normalized, "cote d’ivoire");
  assert.equal(stateSearch.data[0].name_normalized, "sao paulo");
  const catalog = await readJSON("search/cities/index.json");
  const pages = [];
  for (const entry of catalog.data) {
    const index = await readJSON(entry.filename);
    for (const page of index.data) pages.push(await readJSON(page.filename));
  }
  const all = pages.flatMap((page) => page.data);
  assert.equal(all.find((city) => city.id === 1).name_normalized, "sao paulo");
  assert.equal(all.find((city) => city.id === 2).name_normalized, "montreal");
  assert.equal(all.find((city) => city.id === 3).name_normalized, "łodz");
  assert.equal(all.find((city) => city.id === 4).name_normalized, "東京");
  assert.deepEqual(
    all
      .filter((city) => city.name_normalized.includes("sao paulo"))
      .map((city) => city.id),
    [1],
  );
});

test("missing, null, empty, and non-string names normalize to empty strings", () => {
  for (const value of [undefined, null, "", 123])
    assert.equal(normalizeName(value), "");
});

test("search indexes cover records beyond the old combined sample limits", async () => {
  const stateSearch = await readJSON("search/states.json");
  const catalog = await readJSON("search/cities/index.json");
  assert.equal(stateSearch.data.length, 1002);
  assert.equal(catalog.meta.total_cities, 5002);
  assert.deepEqual(
    catalog.data.map((entry) => [entry.country_code, entry.count]),
    [
      ["BR", 5001],
      ["CI", 1],
      ["TR", 0],
    ],
  );
  const seen = [];
  for (const entry of catalog.data) {
    const index = await readJSON(entry.filename);
    assert.equal(index.meta.total_cities, entry.count);
    if (entry.country_code === "BR")
      assert.deepEqual(
        index.data.map((page) => page.count),
        [5000, 1],
      );
    const pages = await Promise.all(
      index.data.map((page) => readJSON(page.filename)),
    );
    seen.push(...pages.flatMap((page) => page.data.map((city) => city.id)));
  }
  assert.equal(new Set(seen).size, 5002);
  assert.deepEqual(
    seen.sort((a, b) => a - b),
    Array.from({ length: 5002 }, (_, index) => index + 1),
  );
  for (const removed of [
    "search/cities.json",
    "search/combined.json",
    "search/combined-sample.json",
  ]) {
    await assert.rejects(fs.access(path.join(outputDir, removed)), {
      code: "ENOENT",
    });
  }
});

test("empty search indexes remain valid and discoverable", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-data-empty-search-"),
  );
  const savedOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = dir;
  try {
    await new SearchGenerator([], [], []).generate();
    for (const name of [
      "search/countries.json",
      "search/states.json",
      "search/cities/index.json",
    ]) {
      const result = JSON.parse(
        await fs.readFile(path.join(dir, name), "utf8"),
      );
      assert.deepEqual(result.data, []);
      assert.equal(result.meta.count, 0);
    }
    assert.equal(
      JSON.parse(
        await fs.readFile(path.join(dir, "search/cities/index.json"), "utf8"),
      ).meta.total_cities,
      0,
    );
  } finally {
    config.OUTPUT_DIR = savedOutputDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
