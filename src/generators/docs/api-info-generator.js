const FileUtils = require("../../utils/file-utils");
const config = require("../../config");
const DataUtils = require("../../utils/data-utils");
const { releaseTimestamp } = require("../../utils/build-context");
const { getRoutes } = require("../../api-contract");

class APIInfoGenerator {
  constructor(countries, states, cities, dataAnalysis) {
    this.countries = countries;
    this.states = states;
    this.cities = cities;
    this.dataAnalysis = dataAnalysis;
  }

  async generate() {
    const endpoints = {};
    for (const route of getRoutes({
      cityTimezones: this.cities.some((city) => city.timezone),
    })) {
      (endpoints[route.group] ||= {})[route.key] = route.path;
    }
    const apiInfo = {
      api_version: config.API_VERSION,
      generated_at: releaseTimestamp(),
      base_url: config.CDN_BASE_URL,
      statistics: {
        total_countries: this.countries.length,
        total_states: this.states.length,
        total_cities: this.cities.length,
        regions: new Set(
          this.countries.map((country) => country.region).filter(Boolean),
        ).size,
        subregions: new Set(
          this.countries.map((country) => country.subregion).filter(Boolean),
        ).size,
        state_types: [
          ...new Set(this.states.map((state) => state.type).filter(Boolean)),
        ],
        cities_with_wikidata: this.cities.filter(
          (city) => city.wikidata_id || city.wikiDataId,
        ).length,
        states_with_coordinates: this.states.filter(DataUtils.hasCoordinates)
          .length,
        cities_with_coordinates: this.cities.filter(DataUtils.hasCoordinates)
          .length,
      },
      data_analysis: this.dataAnalysis || {},
      endpoints,
      usage_examples: {
        "Get all countries": `${config.CDN_BASE_URL}/countries.json`,
        "Get a country": `${config.CDN_BASE_URL}/countries/in.json`,
        "Get states in a country": `${config.CDN_BASE_URL}/countries/in/states.json`,
        "Get cities in a state": `${config.CDN_BASE_URL}/countries/in/states/mp/cities.json`,
        "Get a country city-page index": `${config.CDN_BASE_URL}/countries/in/cities/index.json`,
        "Get a city by ID": `${config.CDN_BASE_URL}/cities/57995.json`,
      },
      notes: {
        search:
          "Filter country and state records client-side; for cities, follow a country page index and filter its summaries.",
        pagination:
          "Every country has a city-page index, including countries with no cities. Index filenames are relative to the API base.",
        paths:
          "Country and state path keys are lowercase. Use the state record's path_key for navigation.",
        timezones:
          "Timezone information is available only when supplied by the source. Timezone indexes name the actual generated endpoints.",
        timestamps:
          "generated_at is the stable dataset release timestamp, configurable using SOURCE_DATE_EPOCH.",
      },
    };
    await FileUtils.writeJSON("api-info.json", apiInfo);
  }
}

module.exports = APIInfoGenerator;
