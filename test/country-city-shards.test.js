const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const config = require("../src/config");
const CitiesGenerator = require("../src/generators/cities");

test("large country city lists provide discoverable, complete chunks", async (t) => {
  const output = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-country-shards-"),
  );
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
  const country = { id: 1, name: "Example", iso2: "EX" };
  const state = { id: 2, name: "State", country_id: 1, iso3166_2: "EX-ST" };
  const cities = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    name: `City ${i}`,
    state_id: 2,
    state_name: "State",
    country_id: 1,
    country_name: "Example",
  }));
  await new CitiesGenerator(
    cities,
    [state],
    [country],
  ).generateCitiesByCountry();
  const read = async (name) =>
    JSON.parse(await fs.readFile(path.join(output, name), "utf8"));
  const full = await read("cities/country/ex.json");
  const index = await read("cities/country/ex/index.json");
  assert.equal(index.meta.city_count, 5);
  assert.deepEqual(
    index.data.map((entry) => entry.count),
    [2, 2, 1],
  );
  const chunks = await Promise.all(
    index.data.map((entry) => read(entry.filename)),
  );
  assert.deepEqual(
    chunks.flatMap((chunk) => chunk.data),
    full.data,
  );
});
