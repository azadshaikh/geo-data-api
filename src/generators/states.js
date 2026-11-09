const FileUtils = require("../utils/file-utils");
const DataUtils = require("../utils/data-utils");
const config = require("../config");
const BaseGenerator = require("./base-generator");
const { planTimezoneFilenames } = require("../utils/timezone-filenames");

class StatesGenerator extends BaseGenerator {
  constructor(states, countries) {
    super(states);
    this.states = states;
    this.countries = countries;
    this.countriesMap = new Map(countries.map((c) => [c.id, c]));
  }

  async generate() {
    await this.initialize();

    try {
      // Validate data with enhanced error handling
      this.states = this.validateData(
        this.states,
        [
          "id",
          "name",
          "country_id",
          "country_code",
          "country_name",
        ],
        { context: "States validation" }
      );

      // Generate states by country
      await this.generateStatesByCountry();

      // Generate individual state files
      await this.generateIndividualStates();

      // Generate states by type (province, state, region, etc.)
      await this.generateStatesByType();

      // Generate states by timezone
      await this.generateStatesByTimezone();

      // Generate all states list
      await this.generateAllStatesList();

      this.logSuccess(
        `Generated states endpoints for ${this.states.length} states`
      );
    } catch (error) {
      this.logError(`States generation failed: ${error.message}`);
      throw error;
    } finally {
      await this.finalize();
    }
  }

  async generateStatesByCountry() {
    try {
      const statesByCountry = DataUtils.groupBy(this.states, "country_id");

      for (const [countryId, states] of Object.entries(statesByCountry)) {
        try {
          const country = this.countriesMap.get(parseInt(countryId));
          if (!country?.iso2) {
            this.logWarn(`Skipping country ${countryId}: missing iso2 code`);
            continue;
          }

          await this.processCountryStates(country, states);
        } catch (error) {
          this.logError(
            `Error processing country ${countryId}: ${error.message}`
          );
          if (config.GENERATION_OPTIONS.errorHandlingMode === "strict") {
            throw error;
          }
          // Continue with next country
        }
      }
    } catch (error) {
      this.logError(
        `Critical error in generateStatesByCountry: ${error.message}`
      );
      throw error;
    }
  }

  async processCountryStates(country, states) {
    const sortedStates = DataUtils.sortBy(states, "name");

    // Create optimized state data for listing
    const optimizedStates = this.createOptimizedListData(
      sortedStates,
      config.STATE_FIELDS.list
    );

    // Always emit the full states list for the country (no pagination)
    const dataWithMeta = DataUtils.addMetadata(optimizedStates, "states", {
      country_id: parseInt(country.id),
      country_name: country?.name,
      country_iso2: country?.iso2,
      country_iso3: country?.iso3,
      country_code: states[0].country_code,
      total_states: optimizedStates.length,
      types: [...new Set(states.map((s) => s.type))].filter(Boolean),
      timezones: [...new Set(states.map((s) => s.timezone))].filter(Boolean),
    });

    const safeCountryFileName = this.generateSafeFilename(
      country.iso2,
      country.id.toString()
    );
    const success = await this.safeWriteJSON(
      `states/country/${safeCountryFileName}.json`,
      dataWithMeta
    );

    if (success && config.GENERATION_OPTIONS.enableProgressLogging) {
      this.logInfo(
        `Generated states for ${country.name} (${optimizedStates.length} states)`
      );
    }
  }

  async generateIndividualStates() {
    this.logInfo(
      `Generating individual state files for ${this.states.length} states...`
    );

    let generatedCount = 0;

    // Use batch processing for large datasets
    await this.processInBatches(this.states, async (batch) => {
      const results = await Promise.allSettled(
        batch.map((state) => this.generateSingleState(state))
      );

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          generatedCount++;
        }
      });
    });

    this.logSuccess(`Generated ${generatedCount} individual state files`);
  }

  async generateSingleState(state) {
    try {
      const country = this.countriesMap.get(state.country_id);

      // Include all fields for individual state view
      const stateData = DataUtils.addMetadata(state, "state", {
        country_name: country?.name,
        country_iso2: country?.iso2,
        country_iso3: country?.iso3,
        has_coordinates: DataUtils.hasCoordinates(state),
        has_timezone: !!state.timezone,
      });

      const safeFileName = this.generateSafeFilename(
        state.iso3166_2,
        state.id.toString()
      );
      const success = await this.safeWriteJSON(
        `states/${safeFileName}.json`,
        stateData
      );

      return success;
    } catch (error) {
      this.logError(`Failed to generate state ${state.id}: ${error.message}`);
      return false;
    }
  }

  async generateStatesByType() {
    try {
      const statesByType = DataUtils.groupBy(this.states, "type");

      for (const [type, states] of Object.entries(statesByType)) {
        if (!type || type === "undefined" || type === "null") continue;

        try {
          await this.processStatesByType(type, states);
        } catch (error) {
          this.logError(
            `Error processing state type ${type}: ${error.message}`
          );
          if (config.GENERATION_OPTIONS.errorHandlingMode === "strict") {
            throw error;
          }
        }
      }

      // Generate types index
      await this.generateStateTypesIndex(statesByType);
    } catch (error) {
      this.logError(`Critical error in generateStatesByType: ${error.message}`);
      throw error;
    }
  }

  async processStatesByType(type, states) {
    const sortedStates = DataUtils.sortBy(states, "name");

    // Create optimized data for type listing
    const optimizedStates = sortedStates.map((state) => ({
      id: state.id,
      name: state.name,
      country_id: state.country_id,
      country_code: state.country_code,
      country_name: state.country_name,
      iso2: state.iso2,
      latitude: state.latitude,
      longitude: state.longitude,
      timezone: state.timezone,
    }));

    const dataWithMeta = DataUtils.addMetadata(
      optimizedStates,
      "states_by_type",
      {
        type: type,
        total_states: sortedStates.length,
        countries: [...new Set(states.map((s) => s.country_name))].sort(),
        timezones: [...new Set(states.map((s) => s.timezone))]
          .filter(Boolean)
          .sort(),
      }
    );

    const safeTypeName = this.generateSafeFilename(type);
    const success = await this.safeWriteJSON(
      `states/type/${safeTypeName}.json`,
      dataWithMeta
    );

    return success;
  }

  async generateStateTypesIndex(statesByType) {
    try {
      const typesIndex = Object.keys(statesByType)
        .filter((type) => type && type !== "undefined" && type !== "null")
        .map((type) => {
          const states = statesByType[type];
          return {
            type: type,
            state_count: states.length,
            country_count: [...new Set(states.map((s) => s.country_id))].length,
            endpoint: `states/type/${this.generateSafeFilename(type)}.json`,
          };
        })
        .sort((a, b) => b.state_count - a.state_count);

      const dataWithMeta = DataUtils.addMetadata(
        typesIndex,
        "state_types_index"
      );
      await this.safeWriteJSON("states/types.json", dataWithMeta);
    } catch (error) {
      this.logError(`Failed to generate state types index: ${error.message}`);
      throw error;
    }
  }

  async generateStatesByTimezone() {
    try {
      const statesByTimezone = DataUtils.groupBy(
        this.states.filter((s) => s.timezone),
        "timezone"
      );
      const timezones = Object.keys(statesByTimezone).filter(
        (timezone) => timezone && timezone !== "undefined" && timezone !== "null"
      );
      const { filenames, aliases } = planTimezoneFilenames(timezones);

      for (const [timezone, states] of Object.entries(statesByTimezone)) {
        if (!timezone || timezone === "undefined" || timezone === "null")
          continue;

        try {
          await this.processStatesByTimezone(timezone, states, filenames.get(timezone));
        } catch (error) {
          this.logError(
            `Error processing timezone ${timezone}: ${error.message}`
          );
          if (config.GENERATION_OPTIONS.errorHandlingMode === "strict") {
            throw error;
          }
        }
      }

      // An ambiguous old path remains an alias to a deterministic member.
      for (const alias of aliases) {
        await this.processStatesByTimezone(alias.timezone, statesByTimezone[alias.timezone], alias.legacy);
      }

      // Generate timezones index
      await this.generateStateTimezonesIndex(statesByTimezone, filenames);
    } catch (error) {
      this.logError(
        `Critical error in generateStatesByTimezone: ${error.message}`
      );
      throw error;
    }
  }

  async processStatesByTimezone(timezone, states, safeTimezoneName) {
    const sortedStates = DataUtils.sortBy(states, "name");

    const optimizedStates = sortedStates.map((state) => ({
      id: state.id,
      name: state.name,
      country_id: state.country_id,
      country_code: state.country_code,
      country_name: state.country_name,
      type: state.type,
      latitude: state.latitude,
      longitude: state.longitude,
    }));

    const dataWithMeta = DataUtils.addMetadata(
      optimizedStates,
      "states_by_timezone",
      {
        timezone: timezone,
        total_states: sortedStates.length,
        countries: [...new Set(states.map((s) => s.country_name))].sort(),
        types: [...new Set(states.map((s) => s.type))].filter(Boolean).sort(),
      }
    );

    const success = await this.safeWriteJSON(
      `states/timezone/${safeTimezoneName}.json`,
      dataWithMeta
    );

    return success;
  }

  async generateStateTimezonesIndex(statesByTimezone, filenames) {
    try {
      const timezonesIndex = Object.keys(statesByTimezone)
        .filter((tz) => tz && tz !== "undefined" && tz !== "null")
        .map((timezone) => {
          const states = statesByTimezone[timezone];
          return {
            timezone: timezone,
            state_count: states.length,
            country_count: [...new Set(states.map((s) => s.country_id))].length,
            endpoint: `states/timezone/${filenames.get(timezone)}.json`,
          };
        })
        .sort((a, b) => a.timezone.localeCompare(b.timezone));

      const dataWithMeta = DataUtils.addMetadata(
        timezonesIndex,
        "state_timezones_index"
      );
      await this.safeWriteJSON("states/timezones.json", dataWithMeta);
    } catch (error) {
      this.logError(
        `Failed to generate state timezones index: ${error.message}`
      );
      throw error;
    }
  }

  async generateAllStatesList() {
    try {
      // Generate a complete states list (optimized for listing)
      const allStates = this.createOptimizedListData(
        this.states,
        config.STATE_FIELDS.list
      );
      const sortedStates = DataUtils.sortBy(allStates, "name");

      // Always emit the full list of states (no pagination)
      const dataWithMeta = DataUtils.addMetadata(sortedStates, "all_states", {
        total_states: sortedStates.length,
        countries: [...new Set(this.states.map((s) => s.country_name))].length,
        types: [...new Set(this.states.map((s) => s.type))].filter(Boolean),
        timezones: [...new Set(this.states.map((s) => s.timezone))].filter(
          Boolean
        ).length,
      });

      const success = await this.safeWriteJSON("states/all.json", dataWithMeta);
      if (success) {
        this.logSuccess(
          `Generated complete states list with ${sortedStates.length} states`
        );
      }
    } catch (error) {
      this.logError(`Failed to generate all states list: ${error.message}`);
      throw error;
    }
  }
}

module.exports = StatesGenerator;
