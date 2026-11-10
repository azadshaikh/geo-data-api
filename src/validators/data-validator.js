class DataValidator {
  constructor(countries, states, cities) {
    this.datasets = { countries, states, cities };
  }

  validateDataStructure() {
    const { states, cities } = this.datasets;
    const report = { counts: {}, issues: [] };
    const issues = new Map();
    const recordIssue = (code, message) => {
      if (!issues.has(code)) issues.set(code, { code, count: 0, samples: [] });
      const issue = issues.get(code);
      issue.count++;
      if (issue.samples.length < 3) issue.samples.push(message);
    };
    const required = {
      countries: ["id", "name", "iso2", "iso3"],
      states: ["id", "name", "country_id", "country_code", "country_name"],
      cities: [
        "id",
        "name",
        "state_id",
        "state_name",
        "country_id",
        "country_name",
      ],
    };
    const ids = {};
    for (const [kind, records] of Object.entries(this.datasets)) {
      if (!Array.isArray(records)) throw new Error(`${kind} must be an array`);
      report.counts[kind] = records.length;
      ids[kind] = new Map();
      const codes = { iso2: new Set(), iso3: new Set() };
      records.forEach((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) {
          recordIssue(`${kind}.record`, `${kind}[${index}] must be an object`);
          return;
        }
        for (const field of required[kind]) {
          const value = record[field];
          if (field === "id" || field.endsWith("_id")) {
            if (!Number.isSafeInteger(value) || value < 0)
              recordIssue(
                `${kind}.${field}`,
                `${kind}[${index}].${field} must be a non-negative integer`,
              );
          } else if (typeof value !== "string" || !value.trim()) {
            recordIssue(
              `${kind}.${field}`,
              `${kind}[${index}].${field} must be a non-empty string`,
            );
          }
        }
        if (ids[kind].has(record.id))
          recordIssue(
            `${kind}.duplicate_id`,
            `duplicate ${kind} id ${record.id}`,
          );
        else ids[kind].set(record.id, record);
        if (kind === "countries") {
          for (const field of ["iso2", "iso3"]) {
            if (typeof record[field] !== "string") continue;
            const code = record[field].toUpperCase();
            if (codes[field].has(code))
              recordIssue(
                `countries.duplicate_${field}`,
                `duplicate countries ${field} ${record[field]}`,
              );
            else codes[field].add(code);
          }
        }
      });
    }
    for (const state of states.filter(
      (item) => item && typeof item === "object",
    )) {
      if (!ids.countries.has(state.country_id))
        recordIssue(
          "states.orphan_country",
          `state ${state.id} references missing country_id ${state.country_id}`,
        );
    }
    for (const city of cities.filter(
      (item) => item && typeof item === "object",
    )) {
      if (!ids.countries.has(city.country_id))
        recordIssue(
          "cities.orphan_country",
          `city ${city.id} references missing country_id ${city.country_id}`,
        );
      const state = ids.states.get(city.state_id);
      if (!state)
        recordIssue(
          "cities.orphan_state",
          `city ${city.id} references missing state_id ${city.state_id}`,
        );
      else if (state.country_id !== city.country_id)
        recordIssue(
          "cities.country_mismatch",
          `city ${city.id} and state ${state.id} reference different countries`,
        );
    }
    report.issues = [...issues.values()];
    if (report.issues.length) {
      const error = new Error(
        `Source validation failed: ${report.issues.map((issue) => `${issue.count} ${issue.samples[0]}`).join("; ")}`,
      );
      error.report = report;
      throw error;
    }
    return report;
  }
}

module.exports = DataValidator;
