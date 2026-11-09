const FileUtils = require("../utils/file-utils");
const DataUtils = require("../utils/data-utils");
const config = require("../config");
const BaseGenerator = require("./base-generator");

// Diacritic folding is not full transliteration: letters such as Ł remain.
function normalizeName(name) {
  return typeof name === "string"
    ? name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
    : "";
}

const nameNormalization =
  "name_normalized uses lowercase Unicode NFD and removes combining marks (diacritic folding, not full transliteration)";

class SearchGenerator extends BaseGenerator {
  constructor(
    countries,
    states,
    cities,
    { includeGlobalCityIndex = true } = {},
  ) {
    super(countries);
    this.countries = countries;
    this.states = states;
    this.cities = cities;
    this.includeGlobalCityIndex = includeGlobalCityIndex;
  }

  async generate() {
    console.log("Generating search endpoints...");

    await this.generateCountriesSearch();
    await this.generateStatesSearch();
    const shardCount = await this.generateCitiesSearch();
    await this.generateCombinedSearch();

    console.log("✓ Generated search endpoints");
    return {
      filesGenerated: 5 + shardCount + Number(this.includeGlobalCityIndex),
    };
  }

  async generateCountriesSearch() {
    const searchData = this.countries.map((country) => ({
      id: country.id,
      name: country.name,
      name_normalized: normalizeName(country.name),
      iso2: country.iso2,
      iso3: country.iso3,
      native: country.native,
      capital: country.capital,
      currency: country.currency,
      currency_name: country.currency_name,
      region: country.region,
      subregion: country.subregion,
      emoji: country.emoji,
      // Add searchable translations
      translations: country.translations
        ? Object.values(country.translations)
        : [],
    }));

    const dataWithMeta = DataUtils.addMetadata(searchData, "countries_search", {
      searchable_fields: config.SEARCH_FIELDS.countries,
      name_normalization: nameNormalization,
      usage: "Filter client-side using any of the searchable fields",
      total_countries: searchData.length,
    });

    await FileUtils.writeJSON("search/countries.json", dataWithMeta);
  }

  async generateStatesSearch() {
    const searchData = this.states.map((state) => ({
      id: state.id,
      name: state.name,
      name_normalized: normalizeName(state.name),
      iso2: state.iso2 || null,
      country_id: state.country_id,
      country_name: state.country_name,
      country_iso2: state.country_iso2,
      country_code: state.country_code,
      type: state.type,
      timezone: state.timezone,
    }));

    const dataWithMeta = DataUtils.addMetadata(searchData, "states_search", {
      searchable_fields: config.SEARCH_FIELDS.states,
      name_normalization: nameNormalization,
      usage: "Filter client-side using name, iso2, or country_name fields",
      total_states: searchData.length,
    });

    await FileUtils.writeJSON("search/states.json", dataWithMeta);
  }

  async generateCitiesSearch() {
    // Create a lightweight search index for cities
    const searchData = this.cities.map((city) => ({
      id: city.id,
      name: city.name,
      name_normalized: normalizeName(city.name),
      state_id: city.state_id,
      state_name: city.state_name,
      state_code: city.state_code,
      country_id: city.country_id,
      country_name: city.country_name,
      country_code: city.country_code,
      wikiDataId: city.wikiDataId,
    }));

    const dataWithMeta = DataUtils.addMetadata(searchData, "cities_search", {
      searchable_fields: config.SEARCH_FIELDS.cities,
      name_normalization: nameNormalization,
      usage:
        "Filter client-side using name, state_name, or country_name fields",
      note: "Large global index - use a country shard when the country is known",
      total_cities: searchData.length,
    });

    if (this.includeGlobalCityIndex) {
      await FileUtils.writeJSON("search/cities.json", dataWithMeta);
    }
    return this.generateCitySearchShards(searchData);
  }

  async generateCitySearchShards(searchData) {
    const countriesById = new Map(
      this.countries.map((country) => [String(country.id), country]),
    );
    const groups = new Map();
    const normalizeCode = (value) => {
      if (typeof value !== "string") return null;
      const code = value.trim();
      return /^[a-z]{2}$/i.test(code) ? code.toUpperCase() : null;
    };

    for (const city of searchData) {
      const country = countriesById.get(String(city.country_id));
      const code =
        normalizeCode(country?.iso2) || normalizeCode(city.country_code);
      const key = code || "unknown";
      if (!groups.has(key)) {
        groups.set(key, {
          country_code: code,
          country_name: code
            ? country?.name || city.country_name || null
            : null,
          cities: [],
        });
      }
      groups.get(key).cities.push(city);
    }

    const shards = [...groups.values()].sort((a, b) => {
      if (!a.country_code) return 1;
      if (!b.country_code) return -1;
      return a.country_code.localeCompare(b.country_code);
    });
    const index = [];

    for (const shard of shards) {
      const filename = `search/cities/country/${shard.country_code?.toLowerCase() || "unknown"}.json`;
      await FileUtils.writeJSON(
        filename,
        DataUtils.addMetadata(shard.cities, "cities_search_by_country", {
          country_code: shard.country_code,
          country_name: shard.country_name,
          searchable_fields: config.SEARCH_FIELDS.cities,
          name_normalization: nameNormalization,
          total_cities: shard.cities.length,
        }),
      );
      index.push({
        country_code: shard.country_code,
        country_name: shard.country_name,
        count: shard.cities.length,
        filename,
      });
    }

    await FileUtils.writeJSON(
      "search/cities/index.json",
      DataUtils.addMetadata(index, "city_search_shard_index", {
        total_cities: searchData.length,
        searchable_fields: config.SEARCH_FIELDS.cities,
        name_normalization: nameNormalization,
        global_index_available: this.includeGlobalCityIndex,
        usage: this.includeGlobalCityIndex
          ? "Fetch a country shard by its filename; use search/cities.json for the full global index"
          : "Fetch country shards by their filenames; together they contain the complete global index",
      }),
    );
    return index.length;
  }

  async generateCombinedSearch() {
    // Create a combined lightweight search index
    const combinedData = {
      countries: this.countries.map((c) => ({
        type: "country",
        id: c.id,
        name: c.name,
        name_normalized: normalizeName(c.name),
        iso2: c.iso2,
        emoji: c.emoji,
      })),
      states: this.states.slice(0, 1000).map((s) => ({
        // Limit states for performance
        type: "state",
        id: s.id,
        name: s.name,
        name_normalized: normalizeName(s.name),
        country_name: s.country_name,
      })),
      cities: this.cities.slice(0, 5000).map((c) => ({
        // Limit cities for performance
        type: "city",
        id: c.id,
        name: c.name,
        name_normalized: normalizeName(c.name),
        state_name: c.state_name,
        country_name: c.country_name,
      })),
    };

    const counts = {};
    for (const [key, records] of Object.entries(combinedData)) {
      const total = this[key].length;
      counts[key] = {
        returned: records.length,
        total,
        complete: records.length === total,
      };
    }

    const dataWithMeta = DataUtils.addMetadata(
      combinedData,
      "combined_search",
      {
        usage: "Quick search across all entity types",
        name_normalization: nameNormalization,
        complete: Object.values(counts).every((count) => count.complete),
        counts,
        limitations: {
          states: "Limited to first 1000 states",
          cities: "Limited to first 5000 cities",
        },
        note: "For complete search, use individual search endpoints",
      },
    );

    await FileUtils.writeJSON("search/combined-sample.json", dataWithMeta);
    await FileUtils.writeJSON("search/combined.json", dataWithMeta);
  }
}

module.exports = SearchGenerator;
