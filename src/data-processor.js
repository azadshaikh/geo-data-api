#!/usr/bin/env node
const FileUtils = require("./utils/file-utils");
const CountriesGenerator = require("./generators/countries");
const StatesGenerator = require("./generators/states");
const CitiesGenerator = require("./generators/cities");
const SearchGenerator = require("./generators/search");
const APIInfoGenerator = require("./generators/docs/api-info-generator");
const APIDocumentationGenerator = require("./generators/docs/api-documentation-generator");
const DataValidator = require("./validators/data-validator");
const DataAnalyzer = require("./analyzers/data-analyzer");
const PerformanceMonitor = require("./utils/performance-monitor");
const config = require("./config");
const path = require("path");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const { releaseTimestamp } = require("./utils/build-context");
const { preserveExtras, describeFiles, publishStage } = require("./utils/build-output");
const { verifyOutput } = require("../scripts/verify");
const { compressJsonFiles } = require("./utils/compression");
const { assertSafeLocations } = require("./utils/path-safety");
const { buildFingerprint } = require("./utils/build-fingerprint");

class DataProcessor {
  constructor(options = {}) {
    this.options = {
      ...options,
      omitGlobalCityIndex:
        options.omitGlobalCityIndex ?? (process.env.CF_PAGES === "1"),
    };
    this.countries = [];
    this.states = [];
    this.cities = [];
    this.dataAnalysis = null;
    this.performanceMonitor = new PerformanceMonitor();
  }

  async loadData() {
    console.log("Loading source data from db folder...");

    try {
      const datasetHash = createHash("sha256");
      for (const kind of ["countries", "states", "cities"]) {
        const name = `${kind}.json`;
        const bytes = await fs.readFile(path.join(config.INPUT_DIR, name));
        datasetHash.update(`${name}\0${bytes.length}\0`).update(bytes);
        this[kind] = JSON.parse(bytes.toString("utf8"));
      }
      this.datasetVersion = `sha256:${datasetHash.digest("hex")}`;

      console.log(`✓ Loaded ${this.countries.length} countries`);
      console.log(`✓ Loaded ${this.states.length} states`);
      console.log(`✓ Loaded ${this.cities.length} cities`);

      // Validate data structure
      this.validateDataStructure();

      // Perform data analysis
      this.analyzeData();
    } catch (error) {
      console.error("Error loading data:", error.message);
      console.error(
        "Make sure countries.json, states.json, and cities.json exist in the db/ folder",
      );
      throw error;
    }
  }

  validateDataStructure() {
    this.validationReport = new DataValidator(this.countries, this.states, this.cities).validateDataStructure();
    console.log("✓ Validated all source records and relationships");
  }

  analyzeData() {
    const analyzer = new DataAnalyzer(this.countries, this.states, this.cities);
    this.dataAnalysis = analyzer.analyzeData();
  }

  async generateAPI() {
    console.log("Starting API generation...");
    await assertSafeLocations(config.INPUT_DIR, config.OUTPUT_DIR);
    const originalOutput = config.OUTPUT_DIR;
    const output = path.resolve(originalOutput);
    let generatorVersion = "unknown";
    try {
      generatorVersion = JSON.parse(await fs.readFile(path.join(__dirname, "../package.json"), "utf8")).version;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const fingerprint = await buildFingerprint({ datasetVersion: this.datasetVersion, config, options: this.options, timestamp: releaseTimestamp(), generatorVersion });
    let previousManifest;
    try { previousManifest = JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    if (previousManifest?.build_fingerprint === fingerprint && verifyOutput(output).errors.length === 0) {
      console.log("✅ API output is unchanged; verified existing files without regenerating them.");
      return { manifest: previousManifest, changed: false };
    }
    const parent = path.dirname(output);
    const base = path.basename(output);
    await fs.mkdir(parent, { recursive: true });
    const stage = await fs.mkdtemp(path.join(parent, `.${base}-stage-`));
    config.OUTPUT_DIR = stage;
    FileUtils.beginOutputTracking();
    try {
      await this.performanceMonitor.measure("countries_generation", async () => {
        await new CountriesGenerator(this.countries).generate();
        FileUtils.assertNoOutputCollisions();
      });
      await this.performanceMonitor.measure("states_generation", async () => {
        await new StatesGenerator(this.states, this.countries).generate();
        FileUtils.assertNoOutputCollisions();
      });
      await this.performanceMonitor.measure("cities_generation", async () => {
        await new CitiesGenerator(this.cities, this.states, this.countries).generate();
        FileUtils.assertNoOutputCollisions();
      });
      await this.performanceMonitor.measure("search_generation", async () => {
        await new SearchGenerator(this.countries, this.states, this.cities, {
          includeGlobalCityIndex: !this.options.omitGlobalCityIndex,
        }).generate();
        FileUtils.assertNoOutputCollisions();
      });
      await this.performanceMonitor.measure("api_documentation_generation", async () => {
        const searchOptions = {
          includeGlobalCityIndex: !this.options.omitGlobalCityIndex,
        };
        await new APIInfoGenerator(
          this.countries, this.states, this.cities, this.dataAnalysis, searchOptions,
        ).generate();
        await new APIDocumentationGenerator(
          this.countries, this.states, this.cities, this.dataAnalysis, searchOptions,
        ).generate();
        FileUtils.assertNoOutputCollisions();
      });

      await FileUtils.writeJSON("build-report.json", this.validationReport);

      if (this.options.compress) {
        const count = await compressJsonFiles(stage, {
          thresholdBytes: this.options.compressionThreshold ?? 1024,
        });
        console.log(`✓ Generated ${count} compressed files`);
      }

      const generatedPaths = FileUtils.getTrackedFiles().map((file) => file.path);
      const preserved = await preserveExtras(output, stage, generatedPaths);
      const files = await describeFiles(stage, preserved);
      const manifest = {
        schema_version: 1,
        api_version: config.API_VERSION,
        dataset_version: this.datasetVersion,
        build_fingerprint: fingerprint,
        generator_version: generatorVersion,
        generated_at: releaseTimestamp(),
        counts: { countries: this.countries.length, states: this.states.length, cities: this.cities.length },
        file_count: files.length + 1,
        checksum_algorithm: "sha256",
        files,
      };
      await FileUtils.writeJSON("manifest.json", manifest);
      FileUtils.assertNoOutputCollisions();
      const verification = verifyOutput(stage);
      if (verification.errors.length) throw new Error(`Generated output failed verification:\n${verification.errors.join("\n")}`);
      const changed = await publishStage(stage, output, { retainBackup: !previousManifest });
      this.performanceMonitor.increment("files_generated", files.filter((file) => file.generated).length + 1);
      console.log(changed ? "✅ API generation completed successfully!" : "✅ API output is unchanged.");
      console.log(`📁 Generated files are in: ${originalOutput}`);
      console.log(`🌐 Upload ${originalOutput} to your CDN`);
      this.performanceMonitor.printReport();
      return { manifest, changed };
    } finally {
      config.OUTPUT_DIR = originalOutput;
      FileUtils.endOutputTracking();
      if (path.dirname(stage) === parent && path.basename(stage).startsWith(`.${base}-stage-`)) {
        await fs.rm(stage, { recursive: true, force: true });
      }
    }
  }

  async run() {
    const previous = { input: config.INPUT_DIR, output: config.OUTPUT_DIR, pretty: config.PRETTY_JSON, countryShardSize: config.COUNTRY_CITY_SHARD_SIZE };
    try {
      if (this.options.inputDir) config.INPUT_DIR = this.options.inputDir;
      if (this.options.outputDir) config.OUTPUT_DIR = this.options.outputDir;
      if (this.options.pretty) config.PRETTY_JSON = true;
      if (this.options.countryShardSize !== undefined) {
        if (!Number.isSafeInteger(this.options.countryShardSize) || this.options.countryShardSize < 0) throw new Error("Country shard size must be a non-negative integer");
        config.COUNTRY_CITY_SHARD_SIZE = this.options.countryShardSize;
      }
      await assertSafeLocations(config.INPUT_DIR, config.OUTPUT_DIR);
      console.log("🚀 Geo-Data API Generator");
      console.log("⚡ Sequential processing enabled");
      console.log(
        `📄 JSON formatting: ${config.PRETTY_JSON ? "Pretty (readable)" : "Compact (optimized)"}`,
      );
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Load and process data
      await this.performanceMonitor.measure("data_loading", () =>
        this.loadData(),
      );

      // Generate API files
      await this.generateAPI();

      console.log("================================================");
      console.log("✅ Generation completed successfully!");
      console.log("");
      console.log("Next steps:");
      console.log(`1. Upload ${config.OUTPUT_DIR} to your CDN`);
      console.log("2. Update CDN_BASE_URL in src/config.js");
      console.log("3. Test your endpoints");
      console.log("");
      console.log(`📊 Generated API contains:`);
      console.log(`   • ${this.countries.length} countries`);
      console.log(
        `   • ${this.states.length} states (${this.dataAnalysis.states.types.length} types)`,
      );
      console.log(
        `   • ${this.cities.length} cities across ${this.dataAnalysis.cities.countries} countries`,
      );
      console.log("🎉 Generation completed! Your API is ready to be deployed.");

      return this.dataAnalysis;
    } catch (error) {
      console.error("❌ Fatal error:", error.message);
      console.error(error.stack);
      throw error;
    } finally {
      config.INPUT_DIR = previous.input;
      config.OUTPUT_DIR = previous.output;
      config.PRETTY_JSON = previous.pretty;
      config.COUNTRY_CITY_SHARD_SIZE = previous.countryShardSize;
    }
  }
}

// Run the processor with command line argument processing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--pretty") options.pretty = true;
    else if (arg === "--compress") options.compress = true;
    else if (["--input", "--output", "--compression-threshold", "--country-shard-size"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--input") options.inputDir = value;
      else if (arg === "--output") options.outputDir = value;
      else {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${arg} requires a non-negative integer`);
        if (arg === "--country-shard-size") options.countryShardSize = number;
        else options.compressionThreshold = number;
      }
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.help) {
    console.log(`
Usage: geo-data-api [options]

Options:
  --input <directory>   Source data directory (default: ./db)
  --output <directory>  API output directory (default: ./dist/api/v1)
  --pretty          Enable pretty JSON formatting for all files
  --compress        Create gzip and Brotli siblings for JSON files
  --compression-threshold <bytes>  Minimum JSON size to compress (default: 1024)
  --country-shard-size <count>     Cities per country shard (default: 5000; 0 disables)
  --help, -h        Show this help message

Performance Notes:
  - Compact JSON (default) is faster and produces smaller files
  - Sequential processing is used for all file generation
  - Use --pretty for development/debugging, compact for production
`);
  }
  return options;
}

module.exports = { DataProcessor };

if (require.main === module) {
  Promise.resolve().then(() => {
    const options = parseArgs();
    return options.help ? undefined : new DataProcessor(options).run();
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
