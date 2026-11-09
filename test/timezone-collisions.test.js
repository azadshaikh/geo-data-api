const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const config = require("../src/config");
const StatesGenerator = require("../src/generators/states");
const CitiesGenerator = require("../src/generators/cities");
const { normalizeDataset } = require("../src/utils/v2-model");

test("distinct timezones with the same legacy slug retain distinct data and index paths", async (t) => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "geo-timezone-"));
  const previous = config.OUTPUT_DIR;
  config.OUTPUT_DIR = output;
  t.after(async () => {
    config.OUTPUT_DIR = previous;
    await fs.rm(output, { recursive: true, force: true });
  });
  const countries = [{ id: 1, iso2: "EX", iso3: "EXP", name: "Example" }];
  const states = [
    {
      id: 10,
      name: "Minus",
      iso2: "A",
      iso3166_2: "EX-A",
      country_id: 1,
      country_code: "EX",
      country_name: "Example",
      timezone: "Etc/GMT-12",
    },
    {
      id: 11,
      name: "Plus",
      iso2: "B",
      iso3166_2: "EX-B",
      country_id: 1,
      country_code: "EX",
      country_name: "Example",
      timezone: "Etc/GMT+12",
    },
  ];
  const data = normalizeDataset(countries, states, []);
  await new StatesGenerator(data.states, data.countries).generate();
  const index = JSON.parse(
    await fs.readFile(path.join(output, "states/timezones.json"), "utf8"),
  );
  const minus = index.data.find((item) => item.timezone === "Etc/GMT-12");
  const plus = index.data.find((item) => item.timezone === "Etc/GMT+12");
  assert.notEqual(minus.endpoint.toLowerCase(), plus.endpoint.toLowerCase());
  for (const item of [minus, plus]) {
    const data = JSON.parse(
      await fs.readFile(path.join(output, item.endpoint), "utf8"),
    );
    assert.equal(data.meta.timezone, item.timezone);
    assert.equal(data.data.length, 1);
    assert.equal(data.data[0].id, item.timezone === "Etc/GMT-12" ? 10 : 11);
  }
});

test("city timezone indexes distinguish colliding legacy slugs", async (t) => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "geo-city-timezone-"));
  const previous = config.OUTPUT_DIR;
  config.OUTPUT_DIR = output;
  t.after(async () => {
    config.OUTPUT_DIR = previous;
    await fs.rm(output, { recursive: true, force: true });
  });
  const countries = [{ id: 1, iso2: "EX", name: "Example" }];
  const states = [
    {
      id: 2,
      iso2: "A",
      iso3166_2: "EX-A",
      name: "Example State",
      country_id: 1,
    },
  ];
  const cities = [
    {
      id: 10,
      name: "Minus",
      state_id: 2,
      state_name: "Example State",
      country_id: 1,
      country_name: "Example",
      timezone: "Etc/GMT-12",
    },
    {
      id: 11,
      name: "Plus",
      state_id: 2,
      state_name: "Example State",
      country_id: 1,
      country_name: "Example",
      timezone: "Etc/GMT+12",
    },
  ];
  const data = normalizeDataset(countries, states, cities);
  await new CitiesGenerator(
    data.cities,
    data.states,
    data.countries,
  ).generate();
  const index = JSON.parse(
    await fs.readFile(path.join(output, "cities/timezones.json"), "utf8"),
  );
  const [first, second] = index.data;
  assert.notEqual(first.endpoint.toLowerCase(), second.endpoint.toLowerCase());
  for (const item of index.data) {
    const data = JSON.parse(
      await fs.readFile(path.join(output, item.endpoint), "utf8"),
    );
    assert.equal(data.meta.timezone, item.timezone);
    assert.equal(data.data.length, 1);
    assert.equal(data.data[0].id, item.timezone === "Etc/GMT-12" ? 10 : 11);
  }
});
