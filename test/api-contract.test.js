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
const APIInfoGenerator = require("../src/generators/docs/api-info-generator");
const APIDocumentationGenerator = require("../src/generators/docs/api-documentation-generator");
const ApiDocumentationTemplate = require("../src/generators/docs/templates/api-documentation-template");
const QuickStartTemplate = require("../src/generators/docs/templates/quick-start-template");
const DataStructureTemplate = require("../src/generators/docs/templates/data-structure-template");

const countries = [
  {
    id: 101,
    name: "India",
    iso2: "IN",
    iso3: "IND",
    native: "भारत",
    capital: "New Delhi",
    currency: "INR",
    currency_name: "Indian rupee",
    region: "Asia",
    subregion: "Southern Asia",
    phonecode: "91",
  },
];
const states = [
  {
    id: 4027,
    name: "Kerala",
    iso2: "KL",
    iso3166_2: "IN-KL",
    country_id: 101,
    country_code: "IN",
    country_name: "India",
    type: "state",
    timezone: "Asia/Kolkata",
    latitude: 0,
    longitude: "76.27110000",
  },
];
const cities = [
  {
    id: 52,
    name: "Adoor",
    state_id: 4027,
    state_code: "KL",
    state_name: "Kerala",
    country_id: 101,
    country_code: "IN",
    country_name: "India",
    latitude: "9.15500000",
    longitude: 0,
    wikiDataId: "Q1234",
    timezone: "Asia/Kolkata",
  },
  {
    id: 99,
    name: "Kochi",
    state_id: 4027,
    state_code: "KL",
    state_name: "Kerala",
    country_id: 101,
    country_code: "IN",
    country_name: "India",
    latitude: "9.93120000",
    longitude: "76.26730000",
    wikiDataId: "Q5678",
    timezone: "Asia/Kolkata",
  },
];

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

test("generates the country, state, and city lookup files used by clients", async () => {
  const countryList = await readJSON("countries.json");
  const stateList = await readJSON("states/country/in.json");
  const cityList = await readJSON("cities/state/in-kl.json");
  assert.equal(countryList.data[0].iso2, "IN");
  assert.equal(stateList.data[0].iso3166_2, "IN-KL");
  assert.deepEqual(
    cityList.data.map((city) => city.name),
    ["Adoor", "Kochi"],
  );
});

test("finds a city using the batch index and its advertised filename", async () => {
  const index = await readJSON("cities/batches.json");
  const batch = index.data.find(
    (item) => item.start_id <= 52 && item.end_id >= 52,
  );
  assert.ok(batch);
  const details = await readJSON(batch.filename);
  assert.equal(details.data[52].name, "Adoor");
  assert.equal(details.data[99].name, "Kochi");
});

test("counts zero-valued coordinates in generated data and statistics", async () => {
  const state = await readJSON("states/in-kl.json");
  const stateCities = await readJSON("cities/state/in-kl.json");
  const countryCities = await readJSON("cities/country/in.json");
  const batchIndex = await readJSON("cities/batches.json");
  const batch = await readJSON(batchIndex.data[0].filename);
  const info = await readJSON("api-info.json");
  const documentation = await readJSON("documentation.json");
  const analysis = new DataAnalyzer(countries, states, cities).analyzeData();
  assert.equal(state.meta.has_coordinates, true);
  assert.equal(stateCities.meta.cities_with_coordinates, 2);
  assert.equal(countryCities.meta.summary.cities_with_coordinates, 2);
  assert.equal(batch.data[52].has_coordinates, true);
  assert.equal(info.statistics.states_with_coordinates, 1);
  assert.equal(info.statistics.cities_with_coordinates, 2);
  assert.match(
    documentation.data_quality.coordinates,
    /100\.0% of states and 100\.0% of cities/,
  );
  assert.equal(analysis.states.with_coordinates, 1);
  assert.equal(analysis.cities.with_coordinates, 2);
});

test("does not count missing coordinate values as present", () => {
  assert.equal(DataUtils.hasCoordinates({ latitude: 0, longitude: 0 }), true);
  assert.equal(
    DataUtils.hasCoordinates({ latitude: null, longitude: 0 }),
    false,
  );
  assert.equal(DataUtils.hasCoordinates({ latitude: "", longitude: 0 }), false);
  assert.equal(DataUtils.hasCoordinates({ latitude: 0 }), false);
});

test("state search contains its advertised country, type, and timezone fields", async () => {
  const result = await readJSON("search/states.json");
  assert.equal(result.data[0].country_code, "IN");
  assert.equal(result.data[0].type, "state");
  assert.equal(result.data[0].timezone, "Asia/Kolkata");
  for (const field of ["country_code", "type", "timezone"]) {
    assert.ok(result.meta.searchable_fields.includes(field));
  }
});

test("city search contains its advertised codes and WikiData field", async () => {
  const result = await readJSON("search/cities.json");
  assert.equal(result.data[0].country_code, "IN");
  assert.equal(result.data[0].state_code, "KL");
  assert.equal(result.data[0].wikiDataId, "Q1234");
  for (const field of ["country_code", "state_code", "wikiDataId"]) {
    assert.ok(result.meta.searchable_fields.includes(field));
  }
});

test("generates city timezone files when timezone data exists", async () => {
  const result = await readJSON("cities/timezone/Asia-Kolkata.json");
  assert.equal(result.data.length, 2);
});

test("does not advertise city timezone endpoints when the source has none", async () => {
  const emptyTimezoneDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-data-no-timezone-"),
  );
  const savedOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = emptyTimezoneDir;
  try {
    const noTimezoneCities = cities.map(({ timezone, ...city }) => city);
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
      await fs.readFile(path.join(emptyTimezoneDir, "api-info.json"), "utf8"),
    );
    assert.equal(info.endpoints.cities.by_timezone, undefined);
    const documentation = JSON.parse(
      await fs.readFile(
        path.join(emptyTimezoneDir, "documentation.json"),
        "utf8",
      ),
    );
    assert.equal(
      documentation.endpoints.cities["GET /cities/timezone/{timezone}.json"],
      undefined,
    );
    await assert.rejects(
      fs.access(path.join(emptyTimezoneDir, "cities", "timezone")),
      { code: "ENOENT" },
    );
  } finally {
    config.OUTPUT_DIR = savedOutputDir;
    await fs.rm(emptyTimezoneDir, { recursive: true, force: true });
  }
});

test("machine-readable endpoint catalogs describe the generated city batch API", async () => {
  const info = await readJSON("api-info.json");
  assert.equal(info.endpoints.cities.batches, "cities/batches.json");
  assert.equal(info.endpoints.cities.batch, "cities/batch/{filename}");
  assert.equal(
    info.endpoints.cities.country_shards_index,
    "cities/country/{country_iso2}/index.json",
  );
  assert.equal(info.endpoints.cities.individual, undefined);
  assert.equal(info.endpoints.cities.major, undefined);
  const documentation = await readJSON("documentation.json");
  assert.ok(documentation.endpoints.cities["GET /cities/batches.json"]);
  const batchRoute = Object.keys(documentation.endpoints.cities).find((route) =>
    route.startsWith("GET /cities/batch/{filename}"),
  );
  assert.ok(batchRoute);
  const index = await readJSON("cities/batches.json");
  const filename = path.posix.basename(index.data[0].filename);
  assert.equal(
    batchRoute.replace("GET /", "").replace("{filename}", filename),
    index.data[0].filename,
  );
  assert.equal(
    documentation.endpoints.cities["GET /cities/{id}.json"],
    undefined,
  );
  assert.ok(documentation.endpoints.countries["GET /countries/{iso2}.json"]);
  assert.ok(
    documentation.endpoints.countries[
      "GET /countries/subregion/{subregion}.json"
    ],
  );
  assert.ok(documentation.endpoints.states["GET /states/{iso3166_2}.json"]);
  assert.ok(documentation.endpoints.states["GET /states/timezones.json"]);
  assert.ok(
    documentation.endpoints.cities["GET /cities/timezone/{timezone}.json"],
  );
});

test("the generated city lookup example follows the batch index filename", async () => {
  const documentation = await readJSON("documentation.json");
  const example =
    documentation.client_examples.javascript.get_single_city_batch_system.split(
      "// Example:",
    )[0];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const getExampleCity = new AsyncFunction(
    "fetch",
    "cityId",
    `${example}\nreturn getCityById(cityId);`,
  );
  const fetchFile = async (url) => {
    assert.ok(url.startsWith(`${config.CDN_BASE_URL}/`));
    const relativePath = url.slice(config.CDN_BASE_URL.length + 1);
    return { json: () => readJSON(relativePath) };
  };
  assert.equal((await getExampleCity(fetchFile, 52)).name, "Adoor");
  await assert.rejects(getExampleCity(fetchFile, 53), /not found/i);
});

test("generated cached lookup examples reject missing IDs inside a batch", async () => {
  const analysis = {
    countries: { regions: 1, subregions: 1 },
    states: { types: ["state"], timezones: 1, with_coordinates: 1 },
    cities: { with_coordinates: 2, with_wikidata: 2, timezones: 1 },
  };
  const templates = [
    new ApiDocumentationTemplate(countries, states, cities, analysis),
    new QuickStartTemplate(),
    new DataStructureTemplate(countries, states, cities, analysis),
  ];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fetchFile = async (url) => {
    assert.ok(url.startsWith(`${config.CDN_BASE_URL}/`));
    return { json: () => readJSON(url.slice(config.CDN_BASE_URL.length + 1)) };
  };
  for (const template of templates) {
    const document = template.generate();
    const start = document.indexOf("class CityAPI {");
    const end = document.indexOf("\n// Usage:", start);
    assert.ok(start >= 0 && end > start);
    const createClient = new AsyncFunction(
      "fetch",
      "baseUrl",
      `${document.slice(start, end)}\nreturn new CityAPI(baseUrl);`,
    );
    const cachedClient = await createClient(fetchFile, config.CDN_BASE_URL);
    assert.equal((await cachedClient.getCity(52)).name, "Adoor");
    await assert.rejects(cachedClient.getCity(53), /not found/i);
    const freshClient = await createClient(fetchFile, config.CDN_BASE_URL);
    await assert.rejects(freshClient.getCity(53), /not found/i);
  }
});

test("the coordinate filtering example keeps zero and excludes empty values", async () => {
  const analysis = {
    countries: { regions: 1, subregions: 1 },
    states: { types: ["state"], timezones: 1, with_coordinates: 1 },
    cities: { with_coordinates: 2, with_wikidata: 2, timezones: 1 },
  };
  const document = new DataStructureTemplate(
    countries,
    states,
    cities,
    analysis,
  ).generate();
  const start = document.indexOf("// Get cities with coordinates");
  const end = document.indexOf("\n```", start);
  assert.ok(start >= 0 && end > start);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const filterCities = new AsyncFunction(
    "fetch",
    `${document.slice(start, end)}\nreturn citiesWithCoords;`,
  );
  const fetchFixture = async () => ({
    json: async () => ({
      data: [
        { id: 1, latitude: 0, longitude: 76 },
        { id: 2, latitude: "", longitude: 76 },
        { id: 3, latitude: null, longitude: 76 },
      ],
    }),
  });
  assert.deepEqual(
    (await filterCities(fetchFixture)).map((city) => city.id),
    [1],
  );
});
