const fs = require("node:fs/promises");
const path = require("path");
const { createHash, randomBytes } = require("node:crypto");
const config = require("../config");

class FileUtils {
  static beginOutputTracking() {
    this.outputTracking = { paths: new Map(), files: new Map(), errors: [] };
  }

  static endOutputTracking() {
    this.outputTracking = null;
  }

  static assertNoOutputCollisions() {
    if (this.outputTracking?.errors.length) throw this.outputTracking.errors[0];
  }

  static getTrackedFiles() {
    return this.outputTracking ? [...this.outputTracking.files.values()] : [];
  }

  static resolveOutputPath(filePath) {
    const root = path.resolve(config.OUTPUT_DIR);
    const target = path.resolve(root, filePath);
    const relative = path.relative(root, target);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      const error = new Error(`Output path is outside the API directory: ${filePath}`);
      error.code = "OUTPUT_PATH_OUTSIDE_ROOT";
      throw error;
    }
    return { target, relative: relative.split(path.sep).join("/") };
  }

  static async writeIfChanged(fullPath, content) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    try {
      if ((await fs.readFile(fullPath)).equals(bytes)) return false;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await this.ensureDir(path.dirname(fullPath));
    const temporary = `${fullPath}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
    try {
      await fs.writeFile(temporary, bytes, { flag: "wx" });
      await fs.rename(temporary, fullPath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return true;
  }

  static async ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  static async writeOutput(filePath, content) {
    const { target: fullPath, relative } = this.resolveOutputPath(filePath);
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const tracking = this.outputTracking;
    const key = relative.normalize("NFC").toLowerCase();
    if (tracking) {
      if (tracking.paths.has(key)) {
        const error = new Error(`Output filename collision: ${tracking.paths.get(key)} and ${relative}`);
        error.code = "OUTPUT_PATH_COLLISION";
        tracking.errors.push(error);
        throw error;
      }
      tracking.paths.set(key, relative);
    }
    try {
      const changed = await this.writeIfChanged(fullPath, bytes);
      if (tracking) {
        tracking.files.set(key, {
          path: relative,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          changed,
        });
      }
    } catch (error) {
      if (tracking) tracking.errors.push(error);
      throw error;
    }
  }

  static async writeBinary(filePath, data) {
    await this.writeOutput(filePath, data);
  }

  static async writeJSON(filePath, data, options = {}) {
    const shouldPrettyPrint = this.shouldPrettyPrint(data, options);
    const jsonData = shouldPrettyPrint
      ? JSON.stringify(data, null, 2)
      : this.minifyJSON(data, options);
    await this.writeOutput(filePath, jsonData);

    // Only log important files or if explicitly requested.
    const suppressionEnabled = !!config.SUPPRESS_DETAILED_LOGS;
    const isImportant = this.isImportantFile(filePath);

    if (suppressionEnabled) {
      // When suppression is enabled, only log files considered important by patterns.
      if (isImportant) {
        console.log(
          `✓ Generated: ${filePath}${shouldPrettyPrint ? "" : " (minified)"}`
        );
      }
    } else {
      // When suppression is disabled, log important files or explicit forceLog.
      if (options.forceLog || isImportant) {
        console.log(
          `✓ Generated: ${filePath}${shouldPrettyPrint ? "" : " (minified)"}`
        );
      }
    }
  }

  static shouldPrettyPrint(data, options = {}) {
    // If explicitly requested to pretty print
    if (options.pretty === true) return true;
    if (options.pretty === false) return false;

    // Use global config if available
    if (config.PRETTY_JSON === true) return true;
    if (config.PRETTY_JSON === false) {
      // Only pretty print if explicitly enabled - ignore threshold for minification
      return false;
    }

    // Default fallback - use threshold only when PRETTY_JSON is undefined
    const dataSize = Array.isArray(data?.data)
      ? data.data.length
      : Array.isArray(data)
        ? data.length
        : 1;

    return dataSize <= config.PRETTY_JSON_THRESHOLD;
  }

  static minifyJSON(data, options = {}) {
    // Custom JSON stringifier with optimizations
    const shouldOptimize = options.optimize ?? config.OPTIMIZE_JSON;
    const optimizedData = shouldOptimize
      ? this.optimizeDataForMinification(data, options)
      : data;

    // Use minimal spacing
    let jsonString = JSON.stringify(optimizedData, (key, value) => {
      // Round coordinates to configured decimal places to reduce precision
      if (
        (key === "latitude" || key === "longitude") &&
        typeof value === "string"
      ) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          const precision = config.COORDINATE_PRECISION || 8;
          const multiplier = Math.pow(10, precision);
          return Math.round(num * multiplier) / multiplier;
        }
      }
      return value;
    });

    return jsonString;
  }

  static optimizeDataForMinification(data, options = {}) {
    // Deep clone to avoid modifying original data
    const cloned = JSON.parse(JSON.stringify(data));

    // Recursively optimize the data structure
    return this.optimizeObject(cloned);
  }

  static optimizeObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.optimizeObject(item));
    } else if (obj && typeof obj === "object") {
      const optimized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Remove null values and empty strings to save space
        if (value !== null && value !== "") {
          optimized[key] = this.optimizeObject(value);
        }
      }
      return optimized;
    }
    return obj;
  }

  static isImportantFile(filePath) {
    // Avoid logging each city search shard.
    const suppressPatterns = [
      /^search\/cities\/country\/.*\.json$/, // City search shards
    ];

    // If it matches a suppress pattern, don't log it
    if (suppressPatterns.some((pattern) => pattern.test(filePath))) {
      return false;
    }

    // Define patterns for important files that should always be logged
    const importantPatterns = [
      /^countries\.json$/,
      /^countries\/regions\.json$/,
      /^states\/all\.json$/,
      /^states\/types\.json$/,
      /^states\/timezones\.json$/,
      /^cities\/major\.json$/,
      /^cities\/wikidata\.json$/,
      /^search\//,
      /^api-info\.json$/,
      /^documentation\.json$/,
      // Individual files are not logged by default when suppression is enabled
    ];

    return importantPatterns.some((pattern) => pattern.test(filePath));
  }

  static async writeFile(filePath, content) {
    // For markdown files, we want to write to project root
    // Get the project root by going up from the current file location
    const projectRoot = path.resolve(__dirname, "../../");
    const fullPath = path.join(projectRoot, filePath);
    await this.ensureDir(path.dirname(fullPath));

    await this.writeIfChanged(fullPath, content);
    console.log(`✓ Generated: ${path.basename(filePath)}`);
  }

  static async readJSON(filePath) {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  }

  static async pathExists(filePath) {
    try { await fs.access(filePath); return true; }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  }

  static async copyFile(sourcePath, destPath) {
    // Ensure the source file exists
    if (!(await this.pathExists(sourcePath))) {
      console.warn(`⚠ Source file not found: ${sourcePath}`);
      return;
    }

    await this.writeIfChanged(destPath, await fs.readFile(sourcePath));
    console.log(`✓ Copied: ${path.basename(sourcePath)} -> ${destPath}`);
  }

  static async copyDir(sourceDir, destDir) {
    // Ensure the source directory exists
    if (!(await this.pathExists(sourceDir))) {
      console.warn(`⚠ Source directory not found: ${sourceDir}`);
      return;
    }

    // Create destination directory if it doesn't exist
    await this.ensureDir(destDir);

    // Get all files and directories in source
    const items = await fs.readdir(sourceDir);

    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const destPath = path.join(destDir, item);

      const stats = await fs.stat(sourcePath);

      if (stats.isDirectory()) {
        // Recursively copy directory
        await this.copyDir(sourcePath, destPath);
      } else {
        await this.writeIfChanged(destPath, await fs.readFile(sourcePath));
      }
    }

    console.log(`✓ Copied directory: ${sourceDir} -> ${destDir}`);
  }
}

module.exports = FileUtils;
