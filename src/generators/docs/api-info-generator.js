const FileUtils = require("../../utils/file-utils");
const config = require("../../config");
const DataUtils = require("../../utils/data-utils");
const { releaseTimestamp } = require("../../utils/build-context");

class APIInfoGenerator {
  constructor(
    countries,
    states,
    cities,
    dataAnalysis,
    { includeGlobalCityIndex = true } = {},
  ) {
    this.countries = countries;
    this.states = states;
    this.cities = cities;
    this.dataAnalysis = dataAnalysis;
    this.includeGlobalCityIndex = includeGlobalCityIndex;
  }

  async generate() {
    const apiInfo = {
      api_version: config.API_VERSION,
      generated_at: releaseTimestamp(),
      base_url: config.CDN_BASE_URL,
      statistics: {
        total_countries: this.countries.length,
        total_states: this.states.length,
        total_cities: this.cities.length,
        regions: [...new Set(this.countries.map((c) => c.region))].filter(
          Boolean,
        ).length,
        subregions: [...new Set(this.countries.map((c) => c.subregion))].filter(
          Boolean,
        ).length,
        state_types: [...new Set(this.states.map((s) => s.type))].filter(
          Boolean,
        ),
        cities_with_wikidata: this.cities.filter((c) => c.wikiDataId).length,
        states_with_coordinates: this.states.filter(DataUtils.hasCoordinates)
          .length,
        cities_with_coordinates: this.cities.filter(DataUtils.hasCoordinates)
          .length,
      },
      data_analysis: this.dataAnalysis,
      endpoints: {
        countries: {
          list: "countries.json",
          individual: "countries/{iso2}.json",
          by_region: "countries/region/{region-name}.json",
          by_subregion: "countries/subregion/{subregion-name}.json",
          regions_index: "countries/regions.json",
        },
        states: {
          all: "states/all.json",
          by_country: "states/country/{country_iso2}.json",
          by_type: "states/type/{type-name}.json",
          by_timezone: "states/timezone/{timezone-name}.json",
          individual: "states/{iso3166_2}.json",
          types_index: "states/types.json",
          timezones_index: "states/timezones.json",
        },
        cities: {
          individual: "cities/{id}.json",
          by_country: "cities/country/{country_iso2}.json",
          country_shards_index: "cities/country/{country_iso2}/index.json",
          by_state: "cities/state/{state_iso3166_2}.json",
          ...(this.cities.some((city) => city.timezone)
            ? { by_timezone: "cities/timezone/{timezone-name}.json", timezones_index: "cities/timezones.json" }
            : {}),
          batches: "cities/batches.json",
          batch: "cities/batch/{filename}",
        },
        search: {
          countries: "search/countries.json",
          states: "search/states.json",
          ...(this.includeGlobalCityIndex ? { cities: "search/cities.json" } : {}),
          city_shards_index: "search/cities/index.json",
          cities_by_country: "search/cities/country/{iso2}.json",
          combined_sample: "search/combined-sample.json",
          combined: "search/combined.json",
        },
      },
      usage_examples: {
        "Get all countries": `${config.CDN_BASE_URL}/countries.json`,
        "Get Afghanistan details": `${config.CDN_BASE_URL}/countries/af.json`,
        "Get Asian countries": `${config.CDN_BASE_URL}/countries/region/asia.json`,
        "Get states by country": `${config.CDN_BASE_URL}/states/country/us.json`,
        "Get provinces only": `${config.CDN_BASE_URL}/states/type/province.json`,
        "Get cities by state": `${config.CDN_BASE_URL}/cities/state/us-ca.json`,
        "Get city batch index": `${config.CDN_BASE_URL}/cities/batches.json`,
        // Note: a dedicated cities WikiData endpoint/file is no longer generated.
        "Search countries": `${config.CDN_BASE_URL}/search/countries.json`,
      },
      notes: {
        city_search: this.includeGlobalCityIndex
          ? "The full city search index and country shards are available"
          : "The global city search file is omitted; country shards together cover all cities",
        pagination:
          "Complete country and state lists are available; large country city lists also have optional indexed chunks",
        coordinates: "Geographic coordinates available for most locations",
        wikidata: "WikiData IDs available for enhanced city information",
        timezones:
          "Timezone information is available where supplied by the source dataset",
        city_batches:
          "Batch index filenames are complete paths relative to the API base URL",
        types:
          "States include type information (province, state, region, etc.)",
      },
    };

    await FileUtils.writeJSON("api-info.json", apiInfo);
  }
}

module.exports = APIInfoGenerator;
