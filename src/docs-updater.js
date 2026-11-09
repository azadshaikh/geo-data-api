const FileUtils = require("./utils/file-utils");
const MarkdownGenerator = require("./generators/docs/markdown-generator");
const DataValidator = require("./validators/data-validator");
const DataAnalyzer = require("./analyzers/data-analyzer");
const config = require("./config");

class DocsUpdater {
  constructor() {
    this.countries = [];
    this.states = [];
    this.cities = [];
    this.dataAnalysis = null;
  }

  async loadData() {
    console.log("Loading source data from db folder...");

    try {
      this.countries = await FileUtils.readJSON(
        `${config.INPUT_DIR}/countries.json`
      );
      this.states = await FileUtils.readJSON(`${config.INPUT_DIR}/states.json`);
      this.cities = await FileUtils.readJSON(`${config.INPUT_DIR}/cities.json`);

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
        "Make sure countries.json, states.json, and cities.json exist in the db/ folder"
      );
      throw error;
    }
  }

  validateDataStructure() {
    new DataValidator(this.countries, this.states, this.cities).validateDataStructure();
  }

  analyzeData() {
    const analyzer = new DataAnalyzer(this.countries, this.states, this.cities);
    this.dataAnalysis = analyzer.analyzeData();
  }

  async updateDocs() {
    console.log("Starting docs update...");

    // Generate API documentation and info
    await this.generateAPIDocumentationFiles();

    console.log("✅ Docs update completed successfully!");
  }

  async generateAPIDocumentationFiles() {
    const docGenerator = new MarkdownGenerator(
      this.countries,
      this.states,
      this.cities,
      this.dataAnalysis
    );

    // Generate all documentation using markdown generator
    await docGenerator.generateAPI();
  }

  async run() {
    try {
      console.log("🚀 Geo-Data API - Docs Updater");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Load and process data
      await this.loadData();

      // Update docs
      await this.updateDocs();

      console.log("================================================");
      console.log("✅ Update completed successfully!");
      console.log("");
      console.log("Updated files:");
      console.log("• API documentation (docs/*.md)");

      // Force exit the process cleanly
      return this.dataAnalysis;
    } catch (error) {
      console.error("❌ Fatal error:", error.message);
      console.error(error.stack);
      throw error;
    }
  }
}

module.exports = { DocsUpdater };
if (require.main === module) {
  new DocsUpdater().run().catch(() => { process.exitCode = 1; });
}
