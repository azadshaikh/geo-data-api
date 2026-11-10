const FileUtils = require("../utils/file-utils");
const DataUtils = require("../utils/data-utils");

class SearchGenerator {
  constructor(countries, states, cities) {
    this.countries = countries;
    this.states = states;
    this.cities = cities;
  }

  async generate() {
    const normalization = "lowercase Unicode NFD with combining marks removed";
    await FileUtils.writeJSON(
      "search/countries.json",
      DataUtils.addMetadata(this.countries, "countries_search", {
        searchable_fields: [
          "name",
          "name_normalized",
          "iso2",
          "iso3",
          "native",
          "capital",
          "currency",
          "region",
          "subregion",
        ],
        name_normalization: normalization,
      }),
    );
    await FileUtils.writeJSON(
      "search/states.json",
      DataUtils.addMetadata(this.states, "states_search", {
        searchable_fields: [
          "name",
          "name_normalized",
          "iso2",
          "country_code",
          "country_name",
          "type",
          "timezone",
        ],
        name_normalization: normalization,
      }),
    );
    const groups = DataUtils.groupBy(this.cities, "country_id");
    const countries = [...this.countries].sort((a, b) =>
      a.iso2.localeCompare(b.iso2),
    );
    const index = countries.map((country) => ({
      country_code: country.iso2,
      filename: `countries/${country.iso2.toLowerCase()}/cities/index.json`,
      count: (groups[String(country.id)] || []).length,
    }));
    await FileUtils.writeJSON(
      "search/cities/index.json",
      DataUtils.addMetadata(index, "city_search_index", {
        total_cities: this.cities.length,
        name_normalization: normalization,
      }),
    );
    console.log("✓ Generated search indexes");
    return { filesGenerated: 3 };
  }
}

module.exports = SearchGenerator;
