const FileUtils = require("../utils/file-utils");
const DataUtils = require("../utils/data-utils");
const config = require("../config");
const BaseGenerator = require("./base-generator");
const { planTimezoneFilenames } = require("../utils/timezone-filenames");
const { releaseTimestamp } = require("../utils/build-context");

class CitiesGenerator extends BaseGenerator {
  constructor(cities, states, countries) {
    super(cities);
    this.cities = cities;
    this.states = states;
    this.countries = countries;
    this.statesMap = new Map(states.map((s) => [s.id, s]));
    this.countriesMap = new Map(countries.map((c) => [c.id, c]));
  }

  async generate() {
    console.log("Generating cities endpoints...");

    // Validate data
    DataUtils.validateData(this.cities, [
      "id",
      "name",
      "state_id",
      "state_name",
      "country_id",
      "country_name",
    ]);

    // Generate cities by country
    await this.generateCitiesByCountry();

    // Generate cities by state
    await this.generateCitiesByState();

    // Generate cities with WikiData
    await this.generateCitiesWithWikiData();

    // Generate cities by timezone (if available)
    await this.generateCitiesByTimezone();

    // Generate city batches for efficient API access
    await this.generateCityBatches();

    console.log(
      `✓ Generated cities endpoints for ${this.cities.length} cities`
    );
  }

  async generateCitiesByCountry() {
    const citiesByCountry = DataUtils.groupBy(this.cities, "country_id");

    for (const [countryId, cities] of Object.entries(citiesByCountry)) {
      const country = this.countriesMap.get(parseInt(countryId));
      const sortedCities = DataUtils.sortBy(cities, "name");

      // Create optimized city data for listing
      const optimizedCities = sortedCities.map((city) => {
        const cityData = {};

        // Include specified fields for list view
        config.CITY_FIELDS.list.forEach((field) => {
          if (city[field] !== undefined) {
            cityData[field] = city[field];
          }
        });

        return cityData;
      });

      // Emit the full cities list for the country (no pagination)
      const dataWithMeta = DataUtils.addMetadata(optimizedCities, "cities", {
        country_id: parseInt(countryId),
        country_name: country?.name,
        country_iso2: country?.iso2,
        country_code: cities[0].country_code,
        total_cities: optimizedCities.length,
        generated_at: releaseTimestamp(),
        api_version: config.API_VERSION,
        summary: {
          states: [...new Set(cities.map((c) => c.state_name))].length,
          cities_with_wikidata: cities.filter((c) => c.wikiDataId).length,
          cities_with_coordinates: cities.filter(DataUtils.hasCoordinates).length,
        },
      });

      // Use country iso2 as filename (lowercased). Fallback to numeric id when iso2 missing.
      const safeCountryFileName =
        (country &&
          country.iso2 &&
          String(country.iso2)
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")) ||
        countryId;

      await FileUtils.writeJSON(
        `cities/country/${safeCountryFileName}.json`,
        dataWithMeta
      );
      const shardSize = config.COUNTRY_CITY_SHARD_SIZE;
      if (Number.isSafeInteger(shardSize) && shardSize > 0 && optimizedCities.length > shardSize) {
        const chunks = [];
        for (let offset = 0; offset < optimizedCities.length; offset += shardSize) {
          const chunk = optimizedCities.slice(offset, offset + shardSize);
          const filename = `cities/country/${safeCountryFileName}/${chunks.length + 1}.json`;
          await FileUtils.writeJSON(filename, DataUtils.addMetadata(chunk, "cities_country_shard", {
            country_id: parseInt(countryId), country_iso2: country?.iso2,
          }));
          chunks.push({ filename, count: chunk.length });
        }
        await FileUtils.writeJSON(`cities/country/${safeCountryFileName}/index.json`, DataUtils.addMetadata(chunks, "cities_country_shard_index", {
          country_id: parseInt(countryId), country_iso2: country?.iso2,
          city_count: optimizedCities.length, shard_size: shardSize,
        }));
      }
    }
    // Completed cities by country generation (no pagination)
  }

  async generateCitiesByState() {
    const citiesByState = DataUtils.groupBy(this.cities, "state_id");

    for (const [stateId, cities] of Object.entries(citiesByState)) {
      const state = this.statesMap.get(parseInt(stateId));
      const country = this.countriesMap.get(cities[0].country_id);
      const sortedCities = DataUtils.sortBy(cities, "name");

      // Create optimized city data for listing
      const optimizedCities = sortedCities.map((city) => {
        const cityData = {};

        // Include specified fields for list view
        config.CITY_FIELDS.list.forEach((field) => {
          if (city[field] !== undefined) {
            cityData[field] = city[field];
          }
        });

        return cityData;
      });

      // Always emit full city list for the state (no pagination)
      const dataWithMeta = DataUtils.addMetadata(optimizedCities, "cities", {
        state_id: parseInt(stateId),
        state_name: state?.name,
        state_code: cities[0].state_code,
        country_id: cities[0].country_id,
        country_name: cities[0].country_name,
        country_code: cities[0].country_code,
        total_cities: optimizedCities.length,
        cities_with_wikidata: cities.filter((c) => c.wikiDataId).length,
        cities_with_coordinates: cities.filter(DataUtils.hasCoordinates).length,
      });

      // Use state iso3166_2 as filename (lowercased). Fallback to numeric id when iso3166_2 missing.
      const safeStateFileName =
        (state &&
          state.iso3166_2 &&
          String(state.iso3166_2)
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")) ||
        stateId;

      await FileUtils.writeJSON(
        `cities/state/${safeStateFileName}.json`,
        dataWithMeta
      );
    }
  }

  async generateCitiesWithWikiData() {
    // Intentionally skip generating the global WikiData cities file.
    // This prevents creation of the global cities WikiData file as requested.
    console.log("Skipping generation of cities WikiData file");
    return;
  }

  async generateCitiesByTimezone() {
    const citiesWithTimezone = this.cities.filter((city) => city.timezone);

    if (citiesWithTimezone.length > 0) {
      const citiesByTimezone = DataUtils.groupBy(
        citiesWithTimezone,
        "timezone"
      );
      const { filenames, aliases } = planTimezoneFilenames(Object.keys(citiesByTimezone));

      const writeTimezone = async (timezone, cities, safeTimezoneName) => {
        const sortedCities = DataUtils.sortBy(cities, "name");

        const optimizedCities = sortedCities.map((city) => ({
          id: city.id,
          name: city.name,
          state_name: city.state_name,
          country_name: city.country_name,
          latitude: city.latitude,
          longitude: city.longitude,
          wikiDataId: city.wikiDataId,
        }));

        const dataWithMeta = DataUtils.addMetadata(
          optimizedCities,
          "cities_by_timezone",
          {
            timezone: timezone,
            total_cities: sortedCities.length,
            countries: [...new Set(cities.map((c) => c.country_name))].sort(),
            states: [...new Set(cities.map((c) => c.state_name))].length,
          }
        );

        await FileUtils.writeJSON(
          `cities/timezone/${safeTimezoneName}.json`,
          dataWithMeta
        );
      };

      for (const [timezone, cities] of Object.entries(citiesByTimezone)) {
        await writeTimezone(timezone, cities, filenames.get(timezone));
      }
      for (const alias of aliases) {
        await writeTimezone(alias.timezone, citiesByTimezone[alias.timezone], alias.legacy);
      }

      const index = Object.keys(citiesByTimezone).sort().map((timezone) => ({
        timezone,
        city_count: citiesByTimezone[timezone].length,
        endpoint: `cities/timezone/${filenames.get(timezone)}.json`,
      }));
      await FileUtils.writeJSON("cities/timezones.json", DataUtils.addMetadata(index, "city_timezones_index"));
    }
  }

  async generateCityBatches() {
    const CITIES_PER_BATCH = 100;
    const CITY_WRITE_CONCURRENCY = 24;
    const sortedCities = DataUtils.sortBy(this.cities, "id");
    const seenIds = new Set();
    for (const city of sortedCities) {
      if (!Number.isSafeInteger(city.id) || city.id < 0 || seenIds.has(city.id)) {
        throw new Error(`Invalid or duplicate city ID: ${city.id}`);
      }
      seenIds.add(city.id);
    }

    console.log(
      `Generating ${Math.ceil(sortedCities.length / CITIES_PER_BATCH)} city batch files`
    );

    const batches = [];

    for (let i = 0; i < sortedCities.length; i += CITIES_PER_BATCH) {
      const batch = sortedCities.slice(i, i + CITIES_PER_BATCH);
      const startId = batch[0].id;
      const endId = batch[batch.length - 1].id;

      // Create lookup object for this batch
      const cityLookup = {};
      batch.forEach((city) => {
        const state = this.statesMap.get(city.state_id);
        const country = this.countriesMap.get(city.country_id);

        // Include all city data with enhanced fields
        cityLookup[city.id] = {
          ...city,
          state_name: state?.name || city.state_name,
          state_type: state?.type,
          country_name: country?.name || city.country_name,
          country_iso2: country?.iso2,
          country_iso3: country?.iso3,
          has_coordinates: DataUtils.hasCoordinates(city),
          has_wikidata: !!city.wikiDataId,
          has_timezone: !!city.timezone,
        };
      });

      // Keep individual details identical to the records in their batch while
      // bounding concurrent writes. Wait for every write before propagating an
      // error so the staged output can be cleaned up safely.
      for (let offset = 0; offset < batch.length; offset += CITY_WRITE_CONCURRENCY) {
        const group = batch.slice(offset, offset + CITY_WRITE_CONCURRENCY);
        const results = await Promise.allSettled(group.map((city) =>
          FileUtils.writeJSON(
            `cities/${city.id}.json`,
            DataUtils.addMetadata(cityLookup[city.id], "city", { city_id: city.id }),
          ),
        ));
        const failed = results.find((result) => result.status === "rejected");
        if (failed) throw failed.reason;
      }

      const filename = `batch-${startId}-${endId}.json`;
      const filePath = `cities/batch/${filename}`;

      await FileUtils.writeJSON(filePath, {
        data: cityLookup,
        meta: {
          type: "cities_batch",
          batch_range: `${startId}-${endId}`,
          cities_count: batch.length,
          usage: "Access city by ID: data[city_id]",
          api_version: config.API_VERSION,
          generated_at: releaseTimestamp(),
        },
      });

      batches.push({
        filename: filePath,
        start_id: startId,
        end_id: endId,
        count: batch.length,
      });
    }

    // Create batch lookup index
    await FileUtils.writeJSON("cities/batches.json", {
      data: batches,
      meta: {
        type: "batch_index",
        total_batches: batches.length,
        cities_per_batch: CITIES_PER_BATCH,
        total_cities: sortedCities.length,
        usage:
          "Use start_id/end_id to find which batch contains a specific city ID",
        api_version: config.API_VERSION,
        generated_at: releaseTimestamp(),
      },
    });

    console.log(`✓ Generated ${batches.length} city batch files and index`);
  }
}

module.exports = CitiesGenerator;
