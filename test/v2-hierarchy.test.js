const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { DataProcessor } = require("../src/data-processor");
const config = require("../src/config");
const { createGeoClient } = require("../packages/client");

const countries = [
  {
    id: 101,
    name: "India",
    iso2: "IN",
    iso3: "IND",
    latitude: "20.0",
    longitude: "77.0",
  },
  {
    id: 233,
    name: "United States",
    iso2: "US",
    iso3: "USA",
    latitude: "38.0",
    longitude: "-97.0",
  },
];
const states = [
  {
    id: 4039,
    name: "Madhya Pradesh",
    iso2: "MP",
    iso3166_2: "IN-MP",
    country_id: 101,
    country_code: "IN",
    country_name: "India",
    latitude: "23.5",
    longitude: "77.0",
  },
  {
    id: 4021,
    name: "Delhi",
    iso2: "DL",
    iso3166_2: "IN-DL",
    country_id: 101,
    country_code: "IN",
    country_name: "India",
    latitude: "28.7",
    longitude: "77.1",
  },
];
const cities = [
  {
    id: 57995,
    name: "Bhopal",
    state_id: 4039,
    state_code: "OLD",
    state_name: "Madhya Pradesh",
    country_id: 101,
    country_code: "IN",
    country_name: "India",
    latitude: "23.25469000",
    longitude: "77.40289000",
    timezone: null,
    wikiDataId: "Q80989",
  },
  {
    id: 57996,
    name: "São Example",
    state_id: 4039,
    state_code: "MP",
    state_name: "Madhya Pradesh",
    country_id: 101,
    country_code: "IN",
    country_name: "India",
    latitude: "0",
    longitude: "0",
    timezone: null,
    wikiDataId: null,
  },
  {
    id: 57997,
    name: "Zed",
    state_id: 4039,
    state_code: "MP",
    state_name: "Madhya Pradesh",
    country_id: 101,
    country_code: "IN",
    country_name: "India",
    latitude: "22",
    longitude: "78",
    timezone: null,
    wikiDataId: null,
  },
];

async function fixture(t, input = { countries, states, cities }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "geo-v2-hierarchy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const inputDir = path.join(root, "db");
  const outputDir = path.join(root, "api");
  await fs.mkdir(inputDir);
  for (const [name, records] of Object.entries(input))
    await fs.writeFile(
      path.join(inputDir, `${name}.json`),
      JSON.stringify(records),
    );
  return {
    inputDir,
    outputDir,
    read: async (name) =>
      JSON.parse(await fs.readFile(path.join(outputDir, name), "utf8")),
  };
}

test("builds hierarchical v2 files, complete country pages, and empty lists", async (t) => {
  const f = await fixture(t);
  await new DataProcessor({
    inputDir: f.inputDir,
    outputDir: f.outputDir,
    countryShardSize: 2,
    pretty: true,
  }).run();

  const indiaStates = await f.read("countries/in/states.json");
  assert.deepEqual(
    indiaStates.data.map((s) => s.path_key),
    ["dl", "mp"],
  );
  assert.equal(indiaStates.meta.api_version, "v2");
  assert.deepEqual((await f.read("countries/us/states.json")).data, []);
  assert.deepEqual(
    (await f.read("countries/in/states/dl/cities.json")).data,
    [],
  );
  const state = await f.read("countries/in/states/mp.json");
  assert.equal(state.data.iso3166_2, "IN-MP");
  assert.equal(state.data.latitude, 23.5);

  const list = await f.read("countries/in/states/mp/cities.json");
  assert.deepEqual(
    list.data.map((city) => city.id),
    [57995, 57996, 57997],
  );
  assert.equal(list.data[1].name_normalized, "sao example");
  assert.equal(list.data[0].state_path_key, "mp");
  assert.equal(list.data[0].state_code, "MP");
  const city = await f.read("cities/57995.json");
  assert.equal(city.data.latitude, 23.25469);
  assert.equal(city.data.wikidata_id, "Q80989");
  assert.equal(city.data.timezone, null);
  assert.equal(city.meta.api_version, "v2");
  assert.equal(city.meta.generated_at, config.RELEASE_TIMESTAMP);

  const index = await f.read("countries/in/cities/index.json");
  assert.deepEqual(
    index.data.map((page) => page.count),
    [2, 1],
  );
  const pages = await Promise.all(
    index.data.map((page) => f.read(page.filename)),
  );
  assert.deepEqual(
    pages.flatMap((page) => page.data.map((city) => city.id)),
    [57995, 57996, 57997],
  );
  assert.deepEqual((await f.read("countries/us/cities/index.json")).data, []);
  const search = await f.read("search/cities/index.json");
  assert.deepEqual(
    search.data.map((item) => item.filename),
    ["countries/in/cities/index.json", "countries/us/cities/index.json"],
  );
  await assert.rejects(
    fs.access(path.join(f.outputDir, "cities/batches.json")),
    { code: "ENOENT" },
  );
  await assert.rejects(
    fs.access(path.join(f.outputDir, "search/cities.json")),
    { code: "ENOENT" },
  );

  const client = createGeoClient({
    baseUrl: "https://example.test/subpath/api/v2/",
    fetch: async (url) => {
      const prefix = "/subpath/api/v2/";
      const pathname = new URL(url).pathname;
      assert.ok(pathname.startsWith(prefix));
      try {
        return new Response(
          await fs.readFile(
            path.join(f.outputDir, pathname.slice(prefix.length)),
          ),
          { status: 200 },
        );
      } catch (error) {
        if (error.code === "ENOENT") return new Response(null, { status: 404 });
        throw error;
      }
    },
  });
  assert.equal((await client.getStates("IN"))[1].path_key, "mp");
  assert.equal((await client.getCities("IN")).length, 3);
  assert.deepEqual(
    (await client.searchCities("IN", "Sao")).map((item) => item.id),
    [57996],
  );
  assert.equal((await client.getCity(57995)).wikidata_id, "Q80989");
  assert.equal(await client.getCity(123456), null);
});

test("rejects ambiguous state path keys instead of overwriting a state", async (t) => {
  const f = await fixture(t, {
    countries,
    states: [states[0], { ...states[1], iso2: "mp" }],
    cities,
  });
  await assert.rejects(
    new DataProcessor({ inputDir: f.inputDir, outputDir: f.outputDir }).run(),
    /state.*(?:collision|duplicate)|(?:collision|duplicate).*state/i,
  );
});

test("uses a safe fallback for Windows-reserved subdivision codes", async (t) => {
  const f = await fixture(t, {
    countries,
    states: [{ ...states[0], iso2: "CON", iso3166_2: "IN-CON" }],
    cities,
  });
  await new DataProcessor({
    inputDir: f.inputDir,
    outputDir: f.outputDir,
  }).run();
  const list = await f.read("countries/in/states.json");
  assert.equal(list.data[0].path_key, "id-4039");
  assert.equal(
    (await f.read("countries/in/states/id-4039.json")).data.id,
    4039,
  );
  assert.equal(
    (await f.read("countries/in/states/id-4039/cities.json")).data.length,
    3,
  );
  assert.equal((await f.read("cities/57995.json")).data.state_code, "CON");
});

test("rejects source values that would violate the published model schema", async (t) => {
  const f = await fixture(t, {
    countries: [{ ...countries[0], phonecode: 123 }, countries[1]],
    states,
    cities,
  });
  await assert.rejects(
    new DataProcessor({ inputDir: f.inputDir, outputDir: f.outputDir }).run(),
    /country.*phonecode/i,
  );
});

test("normalizes lowercase country ISO codes before publishing", async (t) => {
  const f = await fixture(t, {
    countries: [{ ...countries[0], iso2: "in", iso3: "ind" }, countries[1]],
    states,
    cities,
  });
  await new DataProcessor({
    inputDir: f.inputDir,
    outputDir: f.outputDir,
  }).run();
  const country = (await f.read("countries/in.json")).data;
  assert.equal(country.iso2, "IN");
  assert.equal(country.iso3, "IND");
});
