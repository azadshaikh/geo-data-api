module.exports = {
  // Input paths - Updated to use db folder
  INPUT_DIR: "./db",
  OUTPUT_DIR: "./dist/api/v2",

  // File settings
  PRETTY_JSON: false, // false: compact, true: pretty, null: choose by threshold
  OPTIMIZE_JSON: false, // Opt in to removing null and empty-string fields
  COORDINATE_PRECISION: 8, // Decimal places for latitude/longitude
  COUNTRY_CITY_SHARD_SIZE: 5000, // Maximum city summaries per country page

  // JSON serialization thresholds
  PRETTY_JSON_THRESHOLD: 100, // Used only when PRETTY_JSON is null

  // API version
  API_VERSION: "v2",

  // Timestamp of this repository's checked-in dataset snapshot. Set
  // SOURCE_DATE_EPOCH for a different reproducible release timestamp.
  RELEASE_TIMESTAMP: "2026-11-03T08:18:19.000Z",

  // CDN settings (for reference)
  CDN_BASE_URL: "https://unpkg.com/geo-data-api@2.0.0/dist/api/v2",

  // Suppress detailed per-file logs (pagination and other verbose file writes).
  // When true, FileUtils.writeJSON will skip routine generated file logs unless forceLog is set.
  SUPPRESS_DETAILED_LOGS: true,

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
