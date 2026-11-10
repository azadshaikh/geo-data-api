const FileUtils = require("../utils/file-utils");
const DataUtils = require("../utils/data-utils");
const config = require("../config");

/**
 * Base generator class with common functionality for all data generators
 * Provides error handling, logging, streaming, and shared utilities
 */
class BaseGenerator {
  constructor(data, cache) {
    this.data = data;
    this.cache = cache;
    this.errors = [];
    this.warnings = [];
    this.stats = {
      startTime: null,
      endTime: null,
      filesGenerated: 0,
      recordsProcessed: 0,
    };
  }

  /**
   * Initialize generation process
   */
  async initialize() {
    this.stats.startTime = Date.now();
    this.errors = [];
    this.warnings = [];

    if (config.GENERATION_OPTIONS.enableProgressLogging) {
      console.log(`🚀 Starting ${this.constructor.name} generation...`);
    }
  }

  /**
   * Finalize generation process
   */
  async finalize() {
    this.stats.endTime = Date.now();
    const duration = this.stats.endTime - this.stats.startTime;

    if (config.GENERATION_OPTIONS.enableProgressLogging) {
      console.log(`✅ ${this.constructor.name} completed in ${duration}ms`);
      console.log(`   📊 Files generated: ${this.stats.filesGenerated}`);
      console.log(`   📈 Records processed: ${this.stats.recordsProcessed}`);
    }

    if (this.errors.length > 0) {
      console.warn(
        `⚠️  ${this.errors.length} errors occurred during generation`,
      );
      if (config.GENERATION_OPTIONS.errorHandlingMode === "strict") {
        throw new Error(`Generation failed with ${this.errors.length} errors`);
      }
    }

    if (this.warnings.length > 0) {
      console.warn(`⚠️  ${this.warnings.length} warnings generated`);
    }

    // Memory optimization
    if (config.GENERATION_OPTIONS.enableMemoryOptimization) {
      this.cleanup();
    }
  }

  /**
   * Safe file writing with error handling
   */
  async safeWriteJSON(filePath, data, options = {}) {
    try {
      await FileUtils.writeJSON(filePath, data, options);
      this.stats.filesGenerated++;
      return true;
    } catch (error) {
      const errorInfo = {
        filePath,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      this.errors.push(errorInfo);

      this.logError(`Failed to write ${filePath}: ${error.message}`);

      if (config.GENERATION_OPTIONS.errorHandlingMode === "strict") {
        throw error;
      }

      return false;
    }
  }

  /**
   * Process data in batches for large datasets
   */
  async processInBatches(
    items,
    processFn,
    batchSize = config.GENERATION_OPTIONS.batchSize,
  ) {
    const results = [];
    const totalBatches = Math.ceil(items.length / batchSize);

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize) + 1;

      if (config.GENERATION_OPTIONS.enableProgressLogging && totalBatches > 1) {
        this.logProgress(batchIndex, totalBatches, "Processing batch");
      }

      try {
        const batchResults = await processFn(batch);
        if (batchResults && Array.isArray(batchResults)) {
          results.push(...batchResults);
        }
        this.stats.recordsProcessed += batch.length;

        // Allow event loop to process other operations
        await new Promise((resolve) => setImmediate(resolve));
      } catch (error) {
        this.logError(`Batch processing failed: ${error.message}`);
        if (config.GENERATION_OPTIONS.errorHandlingMode === "strict") {
          throw error;
        }
      }
    }

    return results;
  }

  /**
   * Enhanced data validation with recovery options
   */
  validateData(data, requiredFields, context = "") {
    if (!Array.isArray(data)) {
      const error = `${context}: Data must be an array`;
      this.logError(error);
      throw new Error(error);
    }

    const invalidRecords = [];
    const validRecords = [];

    data.forEach((item, index) => {
      const missingFields = requiredFields.filter(
        (field) =>
          item[field] === undefined ||
          item[field] === null ||
          item[field] === "",
      );

      if (missingFields.length > 0) {
        invalidRecords.push({
          index,
          id: item.id,
          missingFields,
          record: item,
        });
      } else {
        validRecords.push(item);
      }
    });

    if (invalidRecords.length > 0) {
      const warning = `${context}: Found ${invalidRecords.length} invalid records with missing fields`;
      this.warnings.push({
        message: warning,
        invalidRecords: invalidRecords.length,
        timestamp: new Date().toISOString(),
      });

      this.logWarn(warning);

      if (config.GENERATION_OPTIONS.validationMode === "strict") {
        throw new Error(
          `${warning}. Use validationMode: 'warn' to continue with valid records only.`,
        );
      }

      // Log first few invalid records for debugging
      invalidRecords.slice(0, 3).forEach((record) => {
        this.logWarn(
          `Invalid record ${record.id}: missing ${record.missingFields.join(", ")}`,
        );
      });
    }

    return validRecords;
  }

  /**
   * Create optimized data for listing views
   */
  createOptimizedListData(items, fields) {
    return items.map((item) => {
      const optimized = {};
      fields.forEach((field) => {
        if (item[field] !== undefined) {
          optimized[field] = item[field];
        }
      });
      return optimized;
    });
  }

  /**
   * Generate safe filename from potentially unsafe strings
   */
  generateSafeFilename(name, fallback = "unknown") {
    if (!name || typeof name !== "string") {
      return fallback;
    }

    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /**
   * Logging utilities
   */
  logInfo(message, data = {}) {
    if (config.GENERATION_OPTIONS.enableProgressLogging) {
      console.log(`ℹ️ ${message}`, Object.keys(data).length ? data : "");
    }
  }

  logSuccess(message, data = {}) {
    console.log(`✅ ${message}`, Object.keys(data).length ? data : "");
  }

  logWarn(message, data = {}) {
    console.warn(`⚠️ ${message}`, Object.keys(data).length ? data : "");
  }

  logError(message, data = {}) {
    console.error(`❌ ${message}`, Object.keys(data).length ? data : "");
  }

  logProgress(current, total, operation) {
    if (config.GENERATION_OPTIONS.enableProgressLogging) {
      const percentage = Math.round((current / total) * 100);
      console.log(`${operation}: ${current}/${total} (${percentage}%)`);
    }
  }

  /**
   * Cleanup method to free memory
   */
  cleanup() {
    this.data = null;
    if (this.cache && typeof this.cache.cleanup === "function") {
      this.cache.cleanup();
    }
  }

  /**
   * Get generation statistics
   */
  getStats() {
    return {
      ...this.stats,
      duration: this.stats.endTime
        ? this.stats.endTime - this.stats.startTime
        : 0,
      errors: this.errors.length,
      warnings: this.warnings.length,
      cacheStats: this.cache ? this.cache.getStats() : null,
    };
  }
}

module.exports = BaseGenerator;
