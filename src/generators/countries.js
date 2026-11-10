const FileUtils = require("../utils/file-utils");
const DataUtils = require("../utils/data-utils");
const BaseGenerator = require("./base-generator");

class CountriesGenerator extends BaseGenerator {
  constructor(countries) {
    super(countries);
    this.countries = countries;
  }

  async generate() {
    console.log("Generating countries endpoints...");

    // Validate data
    DataUtils.validateData(this.countries, ["id", "name", "iso2", "iso3"]);

    // Generate main countries list
    await this.generateCountriesList();

    // Generate individual country files
    await this.generateIndividualCountries();

    // Generate countries by region
    await this.generateCountriesByRegion();

    // Generate countries by subregion
    await this.generateCountriesBySubregion();

    console.log(`✓ Generated ${this.countries.length} country endpoints`);
  }

  async generateCountriesList() {
    const sortedCountries = DataUtils.sortBy(this.countries, "name");
    const dataWithMeta = DataUtils.addMetadata(sortedCountries, "countries", {
      total_countries: sortedCountries.length,
    });

    await FileUtils.writeJSON("countries.json", dataWithMeta);
  }

  async generateIndividualCountries() {
    console.log(
      `Generating individual country files for ${this.countries.length} countries...`,
    );

    let generatedCount = 0;
    for (const country of this.countries) {
      // Include all fields for individual country view
      const countryData = DataUtils.addMetadata(country, "country", {
        country_id: country.id,
        country_name: country.name,
        has_timezones: country.timezones && country.timezones.length > 0,
        has_translations:
          country.translations && Object.keys(country.translations).length > 0,
      });

      // Only log first 5 as examples
      const shouldLog = generatedCount < 5;
      // Use iso2 as filename (lowercased). Fallback to id when iso2 is missing.
      const safeFileName =
        (country.iso2 &&
          String(country.iso2)
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")) ||
        country.id;
      await FileUtils.writeJSON(`countries/${safeFileName}.json`, countryData, {
        forceLog: shouldLog,
      });
      generatedCount++;
    }

    console.log(`✓ Generated ${generatedCount} individual country files`);
  }

  async generateCountriesByRegion() {
    const countriesByRegion = DataUtils.groupBy(
      this.countries.filter((c) => c.region),
      "region",
    );

    for (const [region, countries] of Object.entries(countriesByRegion)) {
      if (!region || region === "undefined") continue;

      const sortedCountries = DataUtils.sortBy(countries, "name");
      const dataWithMeta = DataUtils.addMetadata(
        sortedCountries,
        "countries_by_region",
        {
          region: region,
          region_id: countries[0].region_id,
          total_countries: sortedCountries.length,
        },
      );

      // Create safe filename from region name
      const safeRegionName = region.toLowerCase().replace(/[^a-z0-9]/g, "-");
      await FileUtils.writeJSON(
        `countries/region/${safeRegionName}.json`,
        dataWithMeta,
      );
    }

    // Generate regions index
    const regionsIndex = Object.keys(countriesByRegion)
      .filter((region) => region && region !== "undefined")
      .map((region) => {
        const countries = countriesByRegion[region];
        return {
          region: region,
          region_id: countries[0].region_id,
          country_count: countries.length,
          endpoint: `countries/region/${region
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")}.json`,
        };
      });

    await FileUtils.writeJSON(
      "countries/regions.json",
      DataUtils.addMetadata(regionsIndex, "regions_index"),
    );
  }

  async generateCountriesBySubregion() {
    const countriesBySubregion = DataUtils.groupBy(
      this.countries.filter((c) => c.subregion),
      "subregion",
    );

    for (const [subregion, countries] of Object.entries(countriesBySubregion)) {
      if (!subregion || subregion === "undefined") continue;

      const sortedCountries = DataUtils.sortBy(countries, "name");
      const dataWithMeta = DataUtils.addMetadata(
        sortedCountries,
        "countries_by_subregion",
        {
          subregion: subregion,
          subregion_id: countries[0].subregion_id,
          region: countries[0].region,
          total_countries: sortedCountries.length,
        },
      );

      const safeSubregionName = subregion
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-");
      await FileUtils.writeJSON(
        `countries/subregion/${safeSubregionName}.json`,
        dataWithMeta,
      );
    }
  }
}

module.exports = CountriesGenerator;
