const assert = require("node:assert/strict");
const { test } = require("node:test");
const DataValidator = require("../src/validators/data-validator");

const fixture = () => ({
  countries: [{ id: 1, name: "Example", iso2: "EX", iso3: "EXP" }],
  states: [
    {
      id: 2,
      name: "State",
      country_id: 1,
      country_code: "EX",
      country_name: "Example",
    },
  ],
  cities: [
    {
      id: 3,
      name: "City",
      state_id: 2,
      state_name: "State",
      country_id: 1,
      country_name: "Example",
    },
  ],
});

test("source validation reports counts for all records and relationships", () => {
  const data = fixture();
  const report = new DataValidator(
    data.countries,
    data.states,
    data.cities,
  ).validateDataStructure();
  assert.deepEqual(report.counts, { countries: 1, states: 1, cities: 1 });
  assert.equal(report.issues.length, 0);
});

test("source validation detects invalid later records, duplicate codes, and orphans", () => {
  const data = fixture();
  data.countries.push({ id: 4, name: "Other", iso2: "ex", iso3: "OTH" });
  data.cities.push({
    id: 5,
    state_id: 99,
    state_name: "Missing",
    country_id: 1,
    country_name: "Example",
  });
  const validator = new DataValidator(data.countries, data.states, data.cities);
  assert.throws(
    () => validator.validateDataStructure(),
    (error) => {
      assert.match(error.message, /duplicate.*iso2/i);
      assert.match(error.message, /name/i);
      assert.match(error.message, /state_id/i);
      assert.equal(error.report.counts.cities, 2);
      return true;
    },
  );
});
