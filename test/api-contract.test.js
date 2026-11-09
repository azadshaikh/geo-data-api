const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const config = require("../src/config");
const CountriesGenerator = require("../src/generators/countries");
const StatesGenerator = require("../src/generators/states");
const CitiesGenerator = require("../src/generators/cities");
const SearchGenerator = require("../src/generators/search");
const DataAnalyzer = require("../src/analyzers/data-analyzer");
const DataUtils = require("../src/utils/data-utils");
const { normalizeDataset } = require("../src/utils/v2-model");
const APIInfoGenerator = require("../src/generators/docs/api-info-generator");
const APIDocumentationGenerator = require("../src/generators/docs/api-documentation-generator");

const sourceCountries = [
  {
    id: 101,
    name: "India",
    iso2: "IN",
    iso3: "IND",
    region: "Asia",
    subregion: "Southern Asia",
  },
  { id: 102, name: "Emptyland", iso2: "EM", iso3: "EMP" },
];
const sourceStates = [
  {
    id: 4027,
    name: "Kerala",
    iso2: "KL",
    iso3166_2: "IN-KL",
    country_id: 101,
    type: "state",
    timezone: "Asia/Kolkata",
    latitude: 0,
    longitude: "76.27110000",
  },
  { id: 4028, name: "Delhi", iso2: "DL", country_id: 101 },
];
const sourceCities = [
  {
    id: 52,
    name: "Adoor",
    state_id: 4027,
    state_code: "OLD",
    state_name: "Old state",
    country_id: 101,
    country_code: "ZZ",
    country_name: "Old country",
    latitude: "9.15500000",
    longitude: 0,
    wikiDataId: "Q1234",
    timezone: "Asia/Kolkata",
  },
  {
    id: 99,
    name: "Kochi",
    state_id: 4027,
    country_id: 101,
    latitude: "9.93120000",
    longitude: "76.26730000",
    wikiDataId: "Q5678",
    timezone: "Asia/Kolkata",
  },
];
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
  outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "geo-data-contract-"));
  previousOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = outputDir;
  await new CountriesGenerator(countries).generate();
  await new StatesGenerator(states, countries).generate();
  await new CitiesGenerator(cities, states, countries).generate();
  await new SearchGenerator(countries, states, cities).generate();
  await new APIInfoGenerator(countries, states, cities, {}).generate();
  await new APIDocumentationGenerator(countries, states, cities, {}).generate();
});

after(async () => {
  config.OUTPUT_DIR = previousOutputDir;
  if (outputDir) await fs.rm(outputDir, { recursive: true, force: true });
});

test("country and state lists have the same records as their detail files", async () => {
  const country = (await readJSON("countries.json")).data.find(
    (item) => item.iso2 === "IN",
  );
  const state = (await readJSON("countries/in/states.json")).data.find(
    (item) => item.path_key === "kl",
  );
  assert.deepEqual((await readJSON("countries/in.json")).data, country);
  assert.deepEqual((await readJSON("countries/in/states/kl.json")).data, state);
  assert.equal(state.iso3166_2, "IN-KL");
  assert.equal(state.latitude, 0);
  assert.deepEqual((await readJSON("countries/em/states.json")).data, []);
  assert.deepEqual(
    (await readJSON("countries/in/states/dl/cities.json")).data,
    [],
  );
  assert.deepEqual((await readJSON("countries/em/cities/index.json")).data, []);
});

test("country pages contain all canonical city summaries and direct details", async () => {
  const index = await readJSON("countries/in/cities/index.json");
  assert.equal(index.meta.country_code, "IN");
  assert.equal(index.meta.total_cities, 2);
  const pages = await Promise.all(
    index.data.map((entry) => readJSON(entry.filename)),
  );
  const summaries = pages.flatMap((page) => page.data);
  const stateCities = (await readJSON("countries/in/states/kl/cities.json"))
    .data;
  assert.deepEqual(summaries, stateCities);
  assert.deepEqual(
    summaries.map((city) => city.name),
    ["Adoor", "Kochi"],
  );
  assert.equal(summaries[0].state_code, "KL");
  assert.equal(summaries[0].state_name, "Kerala");
  assert.equal(summaries[0].state_path_key, "kl");
  assert.equal(summaries[0].country_code, "IN");
  assert.equal(summaries[0].country_name, "India");
  for (const summary of summaries) {
    const detail = await readJSON(`cities/${summary.id}.json`);
    for (const [key, value] of Object.entries(summary))
      assert.deepEqual(detail.data[key], value);
    assert.equal(detail.meta.type, "city");
    assert.equal(detail.meta.city_id, summary.id);
    assert.equal(detail.meta.api_version, "v2");
  }
  const detail = (await readJSON("cities/52.json")).data;
  assert.equal(detail.latitude, 9.155);
  assert.equal(detail.longitude, 0);
  assert.equal(detail.wikidata_id, "Q1234");
  assert.equal(detail.timezone, "Asia/Kolkata");
  assert.equal(Object.hasOwn(summaries[0], "wikidata_id"), false);
  await assert.rejects(readJSON("cities/53.json"), { code: "ENOENT" });
});

test("rejects invalid and duplicate city IDs before generating city files", async () => {
  for (const records of [
    [{ ...cities[0], id: "../escape" }],
    [cities[0], { ...cities[0] }],
  ]) {
    await assert.rejects(
      new CitiesGenerator(records, states, countries).generate(),
      /invalid or duplicate city ID/i,
    );
  }
});

test("counts zero-valued coordinates in details and generated statistics", async () => {
  const state = await readJSON("countries/in/states/kl.json");
  const info = await readJSON("api-info.json");
  const documentation = await readJSON("documentation.json");
  const analysis = new DataAnalyzer(
    sourceCountries,
    sourceStates,
    sourceCities,
  ).analyzeData();
  assert.equal(state.meta.has_coordinates, true);
  assert.equal(info.statistics.states_with_coordinates, 1);
  assert.equal(info.statistics.cities_with_coordinates, 2);
  assert.match(
    documentation.data_quality.coordinates,
    /50\.0% of states and 100\.0% of cities/,
  );
  assert.equal(analysis.states.with_coordinates, 1);
  assert.equal(analysis.cities.with_coordinates, 2);
  assert.equal(DataUtils.hasCoordinates({ latitude: 0, longitude: 0 }), true);
  for (const value of [null, "", undefined])
    assert.equal(
      DataUtils.hasCoordinates({ latitude: value, longitude: 0 }),
      false,
    );
});

test("country and state search expose their complete normalized records", async () => {
  const countrySearch = await readJSON("search/countries.json");
  const stateSearch = await readJSON("search/states.json");
  assert.deepEqual(countrySearch.data, countries);
  assert.deepEqual(stateSearch.data, states);
  assert.equal(stateSearch.data[0].country_code, "IN");
  assert.equal(stateSearch.data[0].type, "state");
  assert.equal(stateSearch.data[0].timezone, "Asia/Kolkata");
  for (const field of ["name_normalized", "country_code", "type", "timezone"])
    assert.ok(stateSearch.meta.searchable_fields.includes(field));
});

test("generates and advertises city timezone files only when timezone data exists", async () => {
  const index = await readJSON("cities/timezones.json");
  const item = index.data.find((entry) => entry.timezone === "Asia/Kolkata");
  assert.equal(item.city_count, 2);
  assert.equal((await readJSON(item.endpoint)).data.length, 2);
  assert.equal(
    (await readJSON("api-info.json")).endpoints.cities.by_timezone,
    "cities/timezone/{timezone}.json",
  );

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "geo-data-no-timezone-"));
  const savedOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = dir;
  try {
    const noTimezoneCities = cities.map((city) => ({
      ...city,
      timezone: null,
    }));
    await new CitiesGenerator(noTimezoneCities, states, countries).generate();
    await new APIInfoGenerator(
      countries,
      states,
      noTimezoneCities,
      {},
    ).generate();
    await new APIDocumentationGenerator(
      countries,
      states,
      noTimezoneCities,
      {},
    ).generate();
    const info = JSON.parse(
      await fs.readFile(path.join(dir, "api-info.json"), "utf8"),
    );
    const documentation = JSON.parse(
      await fs.readFile(path.join(dir, "documentation.json"), "utf8"),
    );
    assert.equal(info.endpoints.cities.by_timezone, undefined);
    assert.equal(
      documentation.endpoints.cities["GET /cities/timezone/{timezone}.json"],
      undefined,
    );
    await assert.rejects(fs.access(path.join(dir, "cities/timezones.json")), {
      code: "ENOENT",
    });
  } finally {
    config.OUTPUT_DIR = savedOutputDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("machine-readable catalogs describe navigable v2 city routes", async () => {
  const info = await readJSON("api-info.json");
  const documentation = await readJSON("documentation.json");
  assert.equal(
    info.endpoints.cities.country_pages_index,
    "countries/{iso2}/cities/index.json",
  );
  assert.equal(
    info.endpoints.cities.country_page,
    "countries/{iso2}/cities/{page}.json",
  );
  assert.equal(info.endpoints.cities.individual, "cities/{id}.json");
  assert.equal(info.endpoints.search.cities, "search/cities/index.json");
  for (const [group, route] of [
    ["countries", "GET /countries/{iso2}.json"],
    ["countries", "GET /countries/subregion/{subregion}.json"],
    ["states", "GET /countries/{iso2}/states/{state}.json"],
    ["states", "GET /states/timezones.json"],
    ["cities", "GET /countries/{iso2}/cities/index.json"],
    ["cities", "GET /countries/{iso2}/cities/{page}.json"],
    ["cities", "GET /cities/{id}.json"],
    ["cities", "GET /cities/timezone/{timezone}.json"],
  ])
    assert.ok(documentation.endpoints[group][route], route);
});

test("the documented direct city example uses one file and handles 404", async () => {
  const example = (
    await readJSON("documentation.json")
  ).client_examples.javascript.get_single_city.split("// Example:")[0];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction(
    "fetch",
    "cityId",
    `${example}\nreturn getCityById(cityId);`,
  );
  const requests = [];
  const fetchFile = async (url) => {
    requests.push(url);
    if (url.endsWith("/cities/53.json")) return { ok: false, status: 404 };
    return {
      ok: true,
      status: 200,
      json: () => readJSON(url.slice(config.CDN_BASE_URL.length + 1)),
    };
  };
  assert.equal((await run(fetchFile, 52)).name, "Adoor");
  assert.equal(await run(fetchFile, 53), null);
  assert.deepEqual(requests, [
    `${config.CDN_BASE_URL}/cities/52.json`,
    `${config.CDN_BASE_URL}/cities/53.json`,
  ]);
  await assert.rejects(run(fetchFile, "../secret"), /invalid city id/i);
});
