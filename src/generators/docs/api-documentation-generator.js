const FileUtils = require("../../utils/file-utils");
const config = require("../../config");
const DataUtils = require("../../utils/data-utils");
const { releaseTimestamp } = require("../../utils/build-context");
const { getRoutes, parameters } = require("../../api-contract");

class APIDocumentationGenerator {
  constructor(countries, states, cities, dataAnalysis) {
    this.countries = countries;
    this.states = states;
    this.cities = cities;
    this.dataAnalysis = dataAnalysis;
  }

  async generate() {
    const percentage = (count, total) =>
      `${(total ? (count / total) * 100 : 0).toFixed(1)}%`;
    const documentation = {
      title: "Geo-Data API Documentation",
      version: config.API_VERSION,
      generated_at: releaseTimestamp(),
      base_url: config.CDN_BASE_URL,
      overview: {
        description:
          "Static JSON API for navigating countries, states, and cities.",
        features: [
          `${this.countries.length} countries`,
          `${this.states.length} states, provinces, and regions`,
          `${this.cities.length} cities`,
          "Country city pages and direct city details",
          "Normalized names for client-side search",
          "Regional, administrative-type, and available timezone groupings",
        ],
      },
      authentication: {
        type: "None",
        description: "This public static API requires no authentication.",
      },
      rate_limits: {
        description: "Rate limits depend on the hosting provider.",
        recommendation: "Cache responses according to the host's headers.",
      },
      data_quality: {
        coordinates: `${percentage(this.states.filter(DataUtils.hasCoordinates).length, this.states.length)} of states and ${percentage(this.cities.filter(DataUtils.hasCoordinates).length, this.cities.length)} of cities have coordinates`,
        wikidata: `${percentage(this.cities.filter((city) => city.wikidata_id || city.wikiDataId).length, this.cities.length)} of cities have Wikidata references`,
        timezones: `${new Set(this.states.map((state) => state.timezone).filter(Boolean)).size} unique state timezones available`,
      },
      endpoints: this._generateEndpointsDocumentation(),
      response_format: this._generateResponseFormatDocumentation(),
      client_examples: this._generateClientExamples(),
      best_practices: {
        caching:
          "Cache static files according to the hosting provider's response headers.",
        paths:
          "Lowercase country and state path keys and use the state record's path_key.",
        search:
          "Filter prebuilt records client-side using name_normalized; no server-side query API is provided.",
        pagination:
          "Fetch a country city-page index and follow every filename relative to the API base.",
        identifiers:
          "Source IDs identify records in this dataset snapshot and may change in upstream updates.",
      },
    };
    await FileUtils.writeJSON("documentation.json", documentation);
  }

  _generateEndpointsDocumentation() {
    const endpoints = {};
    for (const route of getRoutes({
      cityTimezones: this.cities.some((city) => city.timezone),
    })) {
      const names = [...route.path.matchAll(/\{([^}]+)\}/g)].map(
        (match) => match[1],
      );
      const item = {
        description: route.description || route.summary,
        response_schema: route.response,
        example: `${config.CDN_BASE_URL}/${route.example}`,
        ...(names.length
          ? {
              parameters: Object.fromEntries(
                names.map((name) => [name, parameters[name].description]),
              ),
            }
          : {}),
      };
      (endpoints[route.group] ||= {})[`GET /${route.path}`] = item;
    }
    return endpoints;
  }

  _generateResponseFormatDocumentation() {
    return {
      structure: {
        data: "Requested object or array of records",
        meta: {
          type: "Resource type",
          count: "Number of records",
          generated_at: "Stable dataset release timestamp",
          api_version: "v2",
        },
      },
      exceptions:
        "api-info.json, documentation.json, manifest.json, and build-report.json have their own top-level structures.",
      example: {
        data: [
          {
            id: 57995,
            name: "Bhopal",
            name_normalized: "bhopal",
            state_id: 4039,
            state_code: "MP",
            state_name: "Madhya Pradesh",
            state_path_key: "mp",
            country_id: 101,
            country_code: "IN",
            country_name: "India",
          },
        ],
        meta: {
          type: "cities",
          count: 1,
          generated_at: releaseTimestamp(),
          api_version: "v2",
        },
      },
    };
  }

  _generateClientExamples() {
    return {
      javascript: {
        basic_fetch: `const response = await fetch('${config.CDN_BASE_URL}/countries.json');\nif (!response.ok) throw new Error('Countries request failed: ' + response.status);\nconst countries = (await response.json()).data;`,
        get_states_by_country: `const response = await fetch('${config.CDN_BASE_URL}/countries/in/states.json');\nif (!response.ok) throw new Error('States request failed: ' + response.status);\nconst states = (await response.json()).data;`,
        get_single_city: `async function getCityById(cityId) {\n  if (!Number.isSafeInteger(cityId) || cityId < 0) throw new Error('Invalid city ID');\n  const response = await fetch(\`${config.CDN_BASE_URL}/cities/\${cityId}.json\`);\n  if (response.status === 404) return null;\n  if (!response.ok) throw new Error('City request failed: ' + response.status);\n  return (await response.json()).data;\n}\n\n// Example: getCityById(57995);`,
        search_example: `const response = await fetch('${config.CDN_BASE_URL}/countries/in/states/mp/cities.json');\nif (!response.ok) throw new Error('Cities request failed: ' + response.status);\nconst cities = (await response.json()).data;\nconst query = 'bhopal'.toLowerCase().normalize('NFD').replace(/\\p{M}/gu, '');\nconst matches = cities.filter(city => city.name_normalized.includes(query));`,
      },
    };
  }
}

module.exports = APIDocumentationGenerator;
