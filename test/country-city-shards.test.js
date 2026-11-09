const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const config = require("../src/config");
const CitiesGenerator = require("../src/generators/cities");
const { normalizeDataset } = require("../src/utils/v2-model");

test("country city indexes cover every page, including the final partial page", async (t) => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "geo-country-pages-"));
  const previous = {
    output: config.OUTPUT_DIR,
    size: config.COUNTRY_CITY_SHARD_SIZE,
  };
  config.OUTPUT_DIR = output;
  config.COUNTRY_CITY_SHARD_SIZE = 2;
  t.after(async () => {
    config.OUTPUT_DIR = previous.output;
    config.COUNTRY_CITY_SHARD_SIZE = previous.size;
    await fs.rm(output, { recursive: true, force: true });
  });
  const data = normalizeDataset(
    [
      { id: 1, name: "Example", iso2: "EX" },
      { id: 2, name: "Empty", iso2: "EM" },
    ],
    [{ id: 10, name: "State", iso2: "ST", country_id: 1 }],
    Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `City ${i}`,
      state_id: 10,
      country_id: 1,
    })),
  );
  await new CitiesGenerator(
    data.cities,
    data.states,
    data.countries,
  ).generate();
  const read = async (name) =>
    JSON.parse(await fs.readFile(path.join(output, name), "utf8"));
  const index = await read("countries/ex/cities/index.json");
  assert.equal(index.meta.total_cities, 5);
  assert.equal(index.meta.page_size, 2);
  assert.equal(index.meta.country_code, "EX");
  assert.deepEqual(index.data, [
    { filename: "countries/ex/cities/1.json", count: 2 },
    { filename: "countries/ex/cities/2.json", count: 2 },
    { filename: "countries/ex/cities/3.json", count: 1 },
  ]);
  const pages = await Promise.all(
    index.data.map((entry) => read(entry.filename)),
  );
  assert.deepEqual(
    pages.flatMap((page) => page.data.map((city) => city.id)),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    pages.flatMap((page) => page.data),
    (await read("countries/ex/states/st/cities.json")).data,
  );
  const empty = await read("countries/em/cities/index.json");
  assert.deepEqual(empty.data, []);
  assert.equal(empty.meta.total_cities, 0);
  assert.equal(empty.meta.page_size, 2);
});

test("rejects an invalid country page size before writing pages", async (t) => {
  const output = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-invalid-page-size-"),
  );
  const previous = {
    output: config.OUTPUT_DIR,
    size: config.COUNTRY_CITY_SHARD_SIZE,
  };
  config.OUTPUT_DIR = output;
  t.after(async () => {
    config.OUTPUT_DIR = previous.output;
    config.COUNTRY_CITY_SHARD_SIZE = previous.size;
    await fs.rm(output, { recursive: true, force: true });
  });
  const data = normalizeDataset(
    [{ id: 1, name: "Example", iso2: "EX" }],
    [],
    [],
  );
  for (const size of [0, -1, 1.5]) {
    config.COUNTRY_CITY_SHARD_SIZE = size;
    await assert.rejects(
      new CitiesGenerator(data.cities, data.states, data.countries).generate(),
      /page size.*positive integer/i,
    );
  }
  assert.deepEqual(await fs.readdir(output), []);
});
