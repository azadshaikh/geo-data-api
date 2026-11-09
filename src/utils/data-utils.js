const { releaseTimestamp } = require("./build-context");

class DataUtils {
  static hasCoordinates(record) {
    const present = (value) => value === 0 || Boolean(value);
    return present(record.latitude) && present(record.longitude);
  }

  static createSearchIndex(data, searchFields) {
    return data.map((item) => {
      const searchData = {};
      searchFields.forEach((field) => {
        if (item[field]) {
          searchData[field] = item[field];
        }
      });
      return {
        id: item.id,
        ...searchData,
      };
    });
  }

  static groupBy(data, key) {
    const result = {};
    for (const item of data) {
      const group = String(item?.[key]);
      if (!Object.hasOwn(result, group)) Object.defineProperty(result, group, { value: [], enumerable: true });
      result[group].push(item);
    }
    return result;
  }

  static sortBy(data, key) {
    const rank = (value) => Number.isNaN(value) ? 3 : value === undefined ? 2 : value === null ? 1 : 0;
    return [...data].sort((a, b) => {
      const left = a?.[key];
      const right = b?.[key];
      const difference = rank(left) - rank(right);
      if (difference) return difference;
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });
  }

  static addMetadata(data, type, additionalMeta = {}) {
    return {
      data,
      meta: {
        type,
        count: Array.isArray(data) ? data.length : 1,
        generated_at: releaseTimestamp(),
        api_version: require("../config").API_VERSION,
        ...additionalMeta,
      },
    };
  }

  static validateData(data, requiredFields, options = {}) {
    const {
      context = "",
      strict = false,
      returnInvalidRecords = false,
      maxErrorLogs = 5,
    } = options;

    if (!Array.isArray(data)) {
      const error = `${context}: Data must be an array, received ${typeof data}`;
      throw new Error(error);
    }

    if (data.length === 0) {
      console.warn(`${context}: Empty data array provided`);
      return returnInvalidRecords ? { valid: [], invalid: [] } : [];
    }

    const invalidRecords = [];
    const validRecords = [];
    let errorCount = 0;

    data.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        const error = `${context}: Item at index ${index} is not a valid object`;
        if (strict) throw new Error(error);
        if (errorCount < maxErrorLogs) {
          console.warn(error);
          errorCount++;
        }
        invalidRecords.push({ index, reason: "invalid_object", item });
        return;
      }

      const missingFields = requiredFields.filter((field) => {
        const value = item[field];
        return (
          value === undefined ||
          value === null ||
          (typeof value === "string" && value.trim() === "")
        );
      });

      if (missingFields.length > 0) {
        const error = `${context}: Item ${item.id || index} missing required fields: ${missingFields.join(", ")}`;
        if (strict) throw new Error(error);
        if (errorCount < maxErrorLogs) {
          console.warn(error);
          errorCount++;
        }
        invalidRecords.push({
          index,
          id: item.id,
          missingFields,
          item,
        });
      } else {
        validRecords.push(item);
      }
    });

    if (invalidRecords.length > 0) {
      const summary = `${context}: Found ${invalidRecords.length} invalid records out of ${data.length} total`;
      console.warn(summary);

      if (strict) {
        throw new Error(`${summary}. Strict validation enabled - aborting.`);
      }

      if (invalidRecords.length === data.length) {
        throw new Error(`${context}: All records are invalid - cannot proceed`);
      }
    }

    if (returnInvalidRecords) {
      return { valid: validRecords, invalid: invalidRecords };
    }

    return validRecords.length > 0 ? validRecords : data; // Fallback to original if no valid records
  }

  /**
   * Validate data types for specific fields
   */
  static validateFieldTypes(data, fieldTypes, options = {}) {
    const { context = "", strict = false } = options;
    const errors = [];

    data.forEach((item, index) => {
      Object.entries(fieldTypes).forEach(([field, expectedType]) => {
        const value = item[field];
        if (value !== undefined && value !== null) {
          const actualType = Array.isArray(value) ? "array" : typeof value;

          if (expectedType === "number" && actualType === "string") {
            // Try to convert string numbers
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              item[field] = numValue;
              return;
            }
          }

          if (actualType !== expectedType) {
            const error = `${context}: Field '${field}' in item ${item.id || index} should be ${expectedType}, got ${actualType}`;
            errors.push(error);
            if (strict) throw new Error(error);
          }
        }
      });
    });

    if (errors.length > 0 && !strict) {
      console.warn(`${context}: ${errors.length} type validation warnings`);
      errors.slice(0, 3).forEach((error) => console.warn(error));
    }

    return errors.length === 0;
  }

  /**
   * Sanitize and normalize data
   */
  static sanitizeData(data, sanitizationRules = {}) {
    return data.map((item) => {
      const sanitized = { ...item };

      Object.entries(sanitizationRules).forEach(([field, rule]) => {
        if (Object.hasOwn(sanitized, field)) {
          switch (rule) {
            case "trim":
              if (typeof sanitized[field] === "string") {
                sanitized[field] = sanitized[field].trim();
              }
              break;
            case "lowercase":
              if (typeof sanitized[field] === "string") {
                sanitized[field] = sanitized[field].toLowerCase();
              }
              break;
            case "uppercase":
              if (typeof sanitized[field] === "string") {
                sanitized[field] = sanitized[field].toUpperCase();
              }
              break;
            case "remove_null":
              if (sanitized[field] === null || sanitized[field] === "") {
                delete sanitized[field];
              }
              break;
          }
        }
      });

      return sanitized;
    });
  }
}

module.exports = DataUtils;
