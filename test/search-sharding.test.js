const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const config = require("../src/config");
const SearchGenerator = require("../src/generators/search");
const CitiesGenerator = require("../src/generators/cities");
const { normalizeDataset } = require("../src/utils/v2-model");
const APIInfoGenerator = require("../src/generators/docs/api-info-generator");
const APIDocumentationGenerator = require("../src/generators/docs/api-documentation-generator");
const QuickStartTemplate = require("../src/generators/docs/templates/quick-start-template");

const data = normalizeDataset(
  [
    { id: 1, iso2: "br", name: "Brazil" },
    { id: 2, iso2: "US", name: "United States" },
    { id: 3, iso2: "EM", name: "Empty" },
  ],
  [
    { id: 10, name: "São Paulo", iso2: "SP", country_id: 1 },
    { id: 11, name: "New York", iso2: "NY", country_id: 2 },
  ],
  [
    {
      id: 1,
      name: "São Paulo",
      state_id: 10,
      country_id: 1,
      country_code: "WRONG",
    },
    { id: 2, name: "Campinas", state_id: 10, country_id: 1 },
    { id: 3, name: "Santos", state_id: 10, country_id: 1 },
    { id: 4, name: "New York", state_id: 11, country_id: 2, wikiDataId: "Q60" },
  ],
);
let outputDir;
let previous;

async function readJSON(file) {
  return JSON.parse(await fs.readFile(path.join(outputDir, file), "utf8"));
}

before(async () => {
  outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "geo-data-pages-"));
  previous = {
    output: config.OUTPUT_DIR,
    size: config.COUNTRY_CITY_SHARD_SIZE,
  };
  config.OUTPUT_DIR = outputDir;
  config.COUNTRY_CITY_SHARD_SIZE = 2;
  await new CitiesGenerator(
    data.cities,
    data.states,
    data.countries,
  ).generate();
  await new SearchGenerator(
    data.countries,
    data.states,
    data.cities,
  ).generate();
  await new APIInfoGenerator(
    data.countries,
    data.states,
    data.cities,
    {},
  ).generate();
  await new APIDocumentationGenerator(
    data.countries,
    data.states,
    data.cities,
    {},
  ).generate();
});

after(async () => {
  config.OUTPUT_DIR = previous.output;
  config.COUNTRY_CITY_SHARD_SIZE = previous.size;
  if (outputDir) await fs.rm(outputDir, { recursive: true, force: true });
});

test("global city catalog points to every country's complete page index", async () => {
  const catalog = await readJSON("search/cities/index.json");
  assert.equal(catalog.meta.total_cities, 4);
  assert.deepEqual(catalog.data, [
    {
      country_code: "BR",
      filename: "countries/br/cities/index.json",
      count: 3,
    },
    {
      country_code: "EM",
      filename: "countries/em/cities/index.json",
      count: 0,
    },
    {
      country_code: "US",
      filename: "countries/us/cities/index.json",
      count: 1,
    },
  ]);
  const allIds = [];
  for (const country of catalog.data) {
    const index = await readJSON(country.filename);
    assert.equal(index.meta.country_code, country.country_code);
    assert.equal(index.meta.total_cities, country.count);
    const pages = await Promise.all(
      index.data.map((entry) => readJSON(entry.filename)),
    );
    for (const [position, page] of pages.entries())
      assert.equal(page.data.length, index.data[position].count);
    allIds.push(...pages.flatMap((page) => page.data.map((city) => city.id)));
  }
  assert.deepEqual(
    allIds.sort((a, b) => a - b),
    [1, 2, 3, 4],
  );
  assert.equal(new Set(allIds).size, 4);
  const brazil = (await readJSON("countries/br/states/sp/cities.json")).data;
  assert.equal(brazil.find((city) => city.id === 1).country_code, "BR");
  assert.equal((await readJSON("cities/4.json")).data.wikidata_id, "Q60");
});

test("discovery catalogs advertise v2 country pages and direct city URLs", async () => {
  const info = await readJSON("api-info.json");
  const documentation = await readJSON("documentation.json");
  assert.equal(info.endpoints.search.cities, "search/cities/index.json");
  assert.equal(
    info.endpoints.cities.country_pages_index,
    "countries/{iso2}/cities/index.json",
  );
  assert.ok(documentation.endpoints.search["GET /search/cities/index.json"]);
  assert.ok(
    documentation.endpoints.cities["GET /countries/{iso2}/cities/{page}.json"],
  );
});

test("the quick-start search example loads every page and folds the query", async () => {
  const document = new QuickStartTemplate().generate();
  const start = document.indexOf(
    'const index = await read("countries/br/cities/index.json");',
  );
  const end = document.indexOf("console.log(matches);", start);
  assert.ok(start >= 0 && end > start);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction(
    "read",
    `${document.slice(start, end)}\nreturn matches;`,
  );
  const requests = [];
  const result = await run(async (name) => {
    requests.push(name);
    return (await readJSON(name)).data;
  });
  assert.deepEqual(
    result.map((city) => city.id),
    [1],
  );
  assert.deepEqual(requests, [
    "countries/br/cities/index.json",
    "countries/br/cities/1.json",
    "countries/br/cities/2.json",
  ]);
});

test("invalid country codes and orphaned city records cannot form unsafe paths", () => {
  assert.throws(
    () => normalizeDataset([{ id: 1, iso2: "../", name: "Invalid" }], [], []),
    /invalid country iso2/i,
  );
  assert.throws(
    () =>
      normalizeDataset(
        [{ id: 1, iso2: "BR", name: "Brazil" }],
        [],
        [{ id: 9, state_id: 999, country_id: 1 }],
      ),
    /missing parents/i,
  );
});
