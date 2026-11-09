module.exports = {
  // Input paths - Updated to use db folder
  INPUT_DIR: "./db",
  OUTPUT_DIR: "./dist/api/v1",

  // File settings
  PRETTY_JSON: false, // false: compact, true: pretty, null: choose by threshold
  OPTIMIZE_JSON: false, // Opt in to removing null and empty-string fields
  COORDINATE_PRECISION: 8, // Decimal places for latitude/longitude
  COUNTRY_CITY_SHARD_SIZE: 5000, // Large country lists also get chunks and an index

  // JSON serialization thresholds
  PRETTY_JSON_THRESHOLD: 100, // Used only when PRETTY_JSON is null

  // API version
  API_VERSION: "v1",

  // Timestamp of this repository's checked-in dataset snapshot. Set
  // SOURCE_DATE_EPOCH for a different reproducible release timestamp.
  RELEASE_TIMESTAMP: "2025-09-12T09:30:16.000Z",

  // CDN settings (for reference)
  CDN_BASE_URL: "https://unpkg.com/geo-data-api@latest/dist/api/v1",

  // Suppress detailed per-file logs (pagination and other verbose file writes).
  // When true, FileUtils.writeJSON will skip routine generated file logs unless forceLog is set.
  SUPPRESS_DETAILED_LOGS: true,

  // Updated search fields to include new data
  SEARCH_FIELDS: {
    countries: [
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
    states: [
      "name",
      "name_normalized",
      "iso2",
      "country_name",
      "country_code",
      "type",
      "timezone",
    ],
    cities: [
      "name",
      "name_normalized",
      "state_name",
      "country_name",
      "state_code",
      "country_code",
      "wikiDataId",
    ],
  },

  // Country fields to include in different endpoints
  COUNTRY_FIELDS: {
    list: [
      "id",
      "name",
      "iso2",
      // "iso3",
      // "numeric_code",
      "phonecode",
      // "capital",
      // "currency",
      // "currency_name",
      // "currency_symbol",
      // "region",
      // "subregion",
      // "emoji",
      // "emojiU",
      // "latitude",
      // "longitude",
    ],
    detail: "all", // Include all fields for individual country endpoints
  },

  // State fields configuration
  STATE_FIELDS: {
    list: [
      "id",
      "name",
      // "country_id",
      // "country_code",
      // "country_name",
      "iso2",
      "iso3166_2", // Uncommented to include ISO 3166-2 codes in state lists
      // "type",
      // "latitude",
      // "longitude",
      // "timezone",
    ],
    detail: "all", // Include all fields for individual state endpoints
  },

  // City fields configuration
  CITY_FIELDS: {
    list: [
      "id",
      "name",
      "iso2",
      // "state_id",
      // "state_code",
      // "state_name",
      // "country_id",
      // "country_code",
      // "country_name",
      "latitude",
      "longitude",
      "wikiDataId",
    ],
    detail: "all", // Include all fields for individual city endpoints
  },

  // Generation options for improved performance and configurability
  GENERATION_OPTIONS: {
    // Batch size for processing large datasets
    batchSize: 100,
    // Enable progress logging during generation
    enableProgressLogging: false,
    // Error handling mode: 'strict', 'warn', 'ignore'
    errorHandlingMode: "warn",
    // Memory optimization: clear caches after each generator
    enableMemoryOptimization: true,
    // Validation strictness: 'strict', 'warn', 'skip'
    validationMode: "warn",
  },
};
