const FileUtils = require("../../utils/file-utils");
const TimestampUtils = require("./utils/timestamp-utils");
const ApiDocumentationTemplate = require("./templates/api-documentation-template");
const QuickStartTemplate = require("./templates/quick-start-template");
const EndpointsTemplate = require("./templates/endpoints-template");
const DataStructureTemplate = require("./templates/data-structure-template");

class MarkdownGenerator {
  constructor(countries, states, cities, dataAnalysis) {
    this.countries = countries;
    this.states = states;
    this.cities = cities;
    this.dataAnalysis = dataAnalysis;

    // Initialize templates
    this.apiDocTemplate = new ApiDocumentationTemplate(
      countries,
      states,
      cities,
      dataAnalysis,
    );
    this.quickStartTemplate = new QuickStartTemplate();
    this.endpointsTemplate = new EndpointsTemplate(
      countries,
      states,
      cities,
      dataAnalysis,
    );
    this.dataStructureTemplate = new DataStructureTemplate(
      countries,
      states,
      cities,
      dataAnalysis,
    );
  }

  async generateAll() {
    console.log("Generating markdown documentation files...");
    // Main API Documentation (no timestamp)
    const mainDocumentation = this.apiDocTemplate.generate();
    await FileUtils.writeFile("docs/API_DOCUMENTATION.md", mainDocumentation);

    // Quick Start Guide (no timestamp)
    const quickStartGuide = this.quickStartTemplate.generate();
    await FileUtils.writeFile("docs/QUICK_START.md", quickStartGuide);

    // Endpoints Reference (no timestamp)
    const endpointsReference = this.endpointsTemplate.generate();
    await FileUtils.writeFile("docs/ENDPOINTS.md", endpointsReference);

    // Data Structure Reference (no timestamp)
    const dataStructure = this.dataStructureTemplate.generate();
    await FileUtils.writeFile("docs/DATA_STRUCTURE.md", dataStructure);

    console.log("✓ Generated markdown documentation files in project root");
  }

  async generateAPI() {
    console.log("Generating API documentation...");

    // Generate using markdown templates
    await this.generateAll();

    console.log("✓ Generated all documentation files");
  }

  // Legacy methods for backward compatibility
  generateMainAPIDocumentationMD() {
    // Return documentation without timestamp
    return this.apiDocTemplate.generate();
  }

  generateQuickStartGuideMD() {
    // Return quick start without timestamp
    return this.quickStartTemplate.generate();
  }

  generateEndpointsReferenceMD() {
    // Return endpoints reference without timestamp
    return this.endpointsTemplate.generate();
  }

  generateDataStructureMD() {
    // Return data structure without timestamp
    return this.dataStructureTemplate.generate();
  }

  /**
   * Generate a formatted timestamp for documentation
   * @returns {string} Formatted timestamp
   * @deprecated Use TimestampUtils.generateTimestamp() instead
   */
  generateTimestamp() {
    return TimestampUtils.generateTimestamp();
  }

  /**
   * Generate a human-readable timestamp for documentation
   * @returns {string} Human-readable timestamp
   * @deprecated Use TimestampUtils.generateHumanTimestamp() instead
   */
  generateHumanTimestamp() {
    return TimestampUtils.generateHumanTimestamp();
  }
}

module.exports = MarkdownGenerator;
