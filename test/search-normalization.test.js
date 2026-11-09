const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const config = require("../src/config");
const SearchGenerator = require("../src/generators/search");

const countries = [
  { id: 1, iso2: "BR", name: "BRASIL" },
  { id: 2, iso2: "CI", name: "Côte d’Ivoire" },
  { id: 3, iso2: "TR", name: null },
  { id: 4, iso2: "IS" },
  { id: 5, iso2: "WW", name: "" },
];
const states = Array.from({ length: 1001 }, (_, index) => ({
  id: index + 1,
  name: index === 0 ? "São Paulo" : `State ${index + 1}`,
  country_id: 1,
  country_name: "BRASIL",
}));
const cities = Array.from({ length: 5001 }, (_, index) => ({
  id: index + 1,
  name: ["São Paulo", "Montréal", "Łódź", "東京"][index] || `City ${index + 1}`,
  country_id: index === 1 ? 2 : 1,
  country_name: index === 1 ? "Côte d’Ivoire" : "BRASIL",
}));
cities[4] = { id: 5, country_id: 1 };
cities[5] = { id: 6, name: null, country_id: 1 };
cities[6] = { id: 7, name: "", country_id: 1 };
cities[7] = { id: 8, name: 123, country_id: 1 };

let outputDir;
let previousOutputDir;

async function readJSON(relativePath, dir = outputDir) {
  return JSON.parse(await fs.readFile(path.join(dir, relativePath), "utf8"));
}

before(async () => {
  outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "geo-data-normalized-"));
  previousOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = outputDir;
  await new SearchGenerator(countries, states, cities).generate();
});

after(async () => {
  config.OUTPUT_DIR = previousOutputDir;
  if (outputDir) await fs.rm(outputDir, { recursive: true, force: true });
});

test("search indexes expose diacritic-folded names for client-side matching", async () => {
  const countrySearch = await readJSON("search/countries.json");
  const stateSearch = await readJSON("search/states.json");
  const citySearch = await readJSON("search/cities.json");

  for (const result of [countrySearch, stateSearch, citySearch]) {
    assert.ok(result.meta.searchable_fields.includes("name_normalized"));
  }
  assert.equal(countrySearch.data[1].name_normalized, "cote d’ivoire");
  assert.equal(stateSearch.data[0].name_normalized, "sao paulo");
  assert.equal(citySearch.data[0].name_normalized, "sao paulo");
  assert.equal(citySearch.data[1].name_normalized, "montreal");
  assert.equal(citySearch.data[2].name_normalized, "łodz");
  assert.equal(citySearch.data[3].name_normalized, "東京");

  const query = "Sao Paulo"
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  assert.deepEqual(
    citySearch.data
      .filter((city) => city.name_normalized.includes(query))
      .map((city) => city.id),
    [1],
  );
});

test("missing, null, empty, and non-string names produce empty normalized fields", async () => {
  const countrySearch = await readJSON("search/countries.json");
  const citySearch = await readJSON("search/cities.json");
  assert.deepEqual(
    countrySearch.data.slice(2).map((country) => country.name_normalized),
    ["", "", ""],
  );
  assert.deepEqual(
    citySearch.data.slice(4, 8).map((city) => city.name_normalized),
    ["", "", "", ""],
  );
});

test("all city shards reproduce the complete global index, including normalized names", async () => {
  const full = await readJSON("search/cities.json");
  const manifest = await readJSON("search/cities/index.json");
  const shards = await Promise.all(
    manifest.data.map((item) => readJSON(item.filename)),
  );
  assert.equal(full.data.length, 5001);
  assert.equal(manifest.meta.total_cities, 5001);
  assert.deepEqual(
    shards.flatMap((shard) => shard.data).sort((a, b) => a.id - b.id),
    [...full.data].sort((a, b) => a.id - b.id),
  );
  const brazil = await readJSON("search/cities/country/br.json");
  assert.equal(brazil.data[0].name_normalized, "sao paulo");
  assert.ok(brazil.meta.searchable_fields.includes("name_normalized"));
});

test("the combined sample and legacy alias agree and report truncation honestly", async () => {
  const samplePath = path.join(outputDir, "search/combined-sample.json");
  const sampleExists = await fs.access(samplePath).then(
    () => true,
    () => false,
  );
  assert.ok(sampleExists, "the combined-sample endpoint must be generated");
  const sampleText = await fs.readFile(samplePath, "utf8");
  const aliasText = await fs.readFile(
    path.join(outputDir, "search/combined.json"),
    "utf8",
  );
  assert.equal(sampleText, aliasText);
  const sample = JSON.parse(sampleText);
  assert.equal(sample.meta.type, "combined_search");
  assert.equal(sample.meta.complete, false);
  assert.deepEqual(sample.meta.counts, {
    countries: { returned: 5, total: 5, complete: true },
    states: { returned: 1000, total: 1001, complete: false },
    cities: { returned: 5000, total: 5001, complete: false },
  });
  assert.equal(sample.data.countries.length, 5);
  assert.equal(sample.data.states.length, 1000);
  assert.equal(sample.data.cities.length, 5000);
  assert.equal(sample.data.countries[1].name_normalized, "cote d’ivoire");
  assert.equal(sample.data.states[0].name_normalized, "sao paulo");
  assert.equal(sample.data.cities[0].name_normalized, "sao paulo");
  assert.equal(sample.data.cities[4].name_normalized, "");
});

test("a sample at the limits is complete and reports all returned records", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-data-sample-limits-"),
  );
  const savedOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = dir;
  try {
    await new SearchGenerator(
      countries.slice(0, 1),
      states.slice(0, 1000),
      cities.slice(0, 5000),
    ).generateCombinedSearch();
    const alias = await readJSON("search/combined.json", dir);
    assert.equal(alias.meta.complete, true);
    assert.deepEqual(alias.meta.counts, {
      countries: { returned: 1, total: 1, complete: true },
      states: { returned: 1000, total: 1000, complete: true },
      cities: { returned: 5000, total: 5000, complete: true },
    });
  } finally {
    config.OUTPUT_DIR = savedOutputDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("an empty dataset produces a complete empty sample and alias", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-data-empty-sample-"),
  );
  const savedOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = dir;
  try {
    await new SearchGenerator([], [], []).generate();
    const alias = await readJSON("search/combined.json", dir);
    assert.deepEqual(alias.data, { countries: [], states: [], cities: [] });
    assert.equal(alias.meta.complete, true);
    assert.deepEqual(alias.meta.counts, {
      countries: { returned: 0, total: 0, complete: true },
      states: { returned: 0, total: 0, complete: true },
      cities: { returned: 0, total: 0, complete: true },
    });
    assert.deepEqual(await readJSON("search/combined-sample.json", dir), alias);
  } finally {
    config.OUTPUT_DIR = savedOutputDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
