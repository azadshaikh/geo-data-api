const FileUtils = require("../utils/file-utils");
const DataUtils = require("../utils/data-utils");
const config = require("../config");
const { citySummary } = require("../utils/v2-model");
const { planTimezoneFilenames } = require("../utils/timezone-filenames");

class CitiesGenerator {
  constructor(cities, states, countries) {
    this.cities = cities;
    this.states = states;
    this.countries = countries;
    this.countriesById = new Map(countries.map((country) => [country.id, country]));
  }

  async generate() {
    const ids = new Set();
    for (const city of this.cities) {
      if (!Number.isSafeInteger(city.id) || city.id < 0 || ids.has(city.id))
        throw new Error(`Invalid or duplicate city ID: ${city.id}`);
      ids.add(city.id);
    }
    await this.generateCountries();
    await this.generateStates();
    await this.generateDetails();
    await this.generateTimezones();
    console.log(`✓ Generated cities endpoints for ${this.cities.length} cities`);
  }

  async generateCountries() {
    const groups = DataUtils.groupBy(this.cities, "country_id");
    const pageSize = config.COUNTRY_CITY_SHARD_SIZE;
    if (!Number.isSafeInteger(pageSize) || pageSize < 1)
      throw new Error("Country page size must be a positive integer");
    for (const country of this.countries) {
      const code = country.iso2.toLowerCase();
      const records = DataUtils.sortBy(groups[String(country.id)] || [], "name").map(citySummary);
      const pages = [];
      for (let offset = 0; offset < records.length; offset += pageSize) {
        const data = records.slice(offset, offset + pageSize);
        const filename = `countries/${code}/cities/${pages.length + 1}.json`;
        await FileUtils.writeJSON(filename, DataUtils.addMetadata(data, "country_cities_page", {
          country_code: country.iso2,
        }));
        pages.push({ filename, count: data.length });
      }
      await FileUtils.writeJSON(`countries/${code}/cities/index.json`, DataUtils.addMetadata(pages, "country_cities_index", {
        country_code: country.iso2,
        total_cities: records.length,
        page_size: pageSize,
      }));
    }
  }

  async generateStates() {
    const groups = DataUtils.groupBy(this.cities, "state_id");
    for (const state of this.states) {
      const country = this.countriesById.get(state.country_id);
      const records = DataUtils.sortBy(groups[String(state.id)] || [], "name").map(citySummary);
      await FileUtils.writeJSON(
        `countries/${country.iso2.toLowerCase()}/states/${state.path_key}/cities.json`,
        DataUtils.addMetadata(records, "state_cities", {
          country_code: country.iso2,
          state_id: state.id,
          state_path_key: state.path_key,
        }),
      );
    }
  }

  async generateDetails() {
    const concurrency = 24;
    for (let offset = 0; offset < this.cities.length; offset += concurrency) {
      const group = this.cities.slice(offset, offset + concurrency);
      const results = await Promise.allSettled(group.map((city) => FileUtils.writeJSON(
        `cities/${city.id}.json`,
        DataUtils.addMetadata(city, "city", { city_id: city.id }),
      )));
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
    }
  }

  async generateTimezones() {
    const groups = DataUtils.groupBy(this.cities.filter((city) => city.timezone), "timezone");
    const timezones = Object.keys(groups).sort();
    if (!timezones.length) return;
    const { filenames } = planTimezoneFilenames(timezones);
    const index = [];
    for (const timezone of timezones) {
      const data = DataUtils.sortBy(groups[timezone], "name").map(citySummary);
      const endpoint = `cities/timezone/${filenames.get(timezone)}.json`;
      await FileUtils.writeJSON(endpoint, DataUtils.addMetadata(data, "cities_by_timezone", { timezone }));
      index.push({ timezone, city_count: data.length, endpoint });
    }
    await FileUtils.writeJSON("cities/timezones.json", DataUtils.addMetadata(index, "city_timezones_index"));
  }
}

module.exports = CitiesGenerator;
