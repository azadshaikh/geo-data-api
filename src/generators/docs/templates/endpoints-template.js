const config = require("../../../config");

class EndpointsTemplate {
  constructor(countries, states, cities, dataAnalysis) {
    this.countries = countries;
    this.states = states;
    this.cities = cities;
    this.dataAnalysis = dataAnalysis;
  }

  generate() {
    return `# API Endpoints Reference

## API Information

- \`GET /api-info.json\` - Dataset statistics and endpoint index.
- \`GET /documentation.json\` - Machine-readable endpoint descriptions and examples.

## Countries

### GET /countries.json

Get list of all countries with essential information.

**Response Fields**: ${config.COUNTRY_FIELDS ? (config.COUNTRY_FIELDS.list ? config.COUNTRY_FIELDS.list.join(", ") : "id, name, iso2, iso3, capital, currency, region, subregion") : "id, name, iso2, iso3, capital, currency, region, subregion"}

**Example**: \`${config.CDN_BASE_URL}/countries.json\`

### GET /countries/{iso2}.json

Get detailed information for a specific country by ISO2 code.

**Parameters**:

- \`iso2\`: Lowercase country ISO2 code (for example, \`us\`)

**Response Fields**: All available fields including timezones, translations, and geographic data

**Example**: \`${config.CDN_BASE_URL}/countries/us.json\`

### GET /countries/region/{region}.json

Get countries by region (e.g., Asia, Europe, Africa).

**Parameters**:

- \`region\`: Region name (lowercase, hyphenated)

**Example**: \`${config.CDN_BASE_URL}/countries/region/asia.json\`

**Available Regions**:

${[...new Set(this.countries.map((c) => c.region))]
  .filter(Boolean)
  .map((region) => `- ${region}`)
  .join("\n")}

### GET /countries/subregion/{subregion}.json

Get countries by subregion.

**Parameters**:

- \`subregion\`: Subregion name (lowercase, hyphenated)

---

## States

### GET /states/all.json

Get all states (full list, not paginated in this release).

**Note**: States are provided as a full list (no pagination)

**Example**: \`${config.CDN_BASE_URL}/states/all.json\`

### GET /states/country/{country_iso2}.json

Get states for a specific country with administrative details.

**Parameters**:

- \`country_iso2\`: Lowercase country ISO2 code (for example, \`af\`)

**List fields**: ID, name, ISO2 code, and ISO 3166-2 code. Use the individual state endpoint for additional details.

**Example**: \`${config.CDN_BASE_URL}/states/country/af.json\`

### GET /states/type/{type}.json

Get states by administrative type (province, state, region, etc.).

**Parameters**:

- \`type\`: Administrative type (lowercase, hyphenated)

**Example**: \`${config.CDN_BASE_URL}/states/type/province.json\`

**Available Types**:

${this.dataAnalysis.states.types.map((type) => `- ${type}`).join("\n")}

### GET /states/{iso3166_2}.json

Get detailed information for a specific state by ISO 3166-2 code.

**Parameters**:

- \`iso3166_2\`: State ISO 3166-2 code (format: {country_iso2}-{state_code})

**Response Fields**: All available fields including geographic coordinates and timezone

**Example**: \`${config.CDN_BASE_URL}/states/af-bds.json\` (Badakhshan, Afghanistan)

### GET /states/timezone/{timezone}.json

Get states by timezone.

**Parameters**:

- \`timezone\`: Timezone name with non-alphanumeric characters replaced by hyphens

**Example**: \`${config.CDN_BASE_URL}/states/timezone/Asia-Kabul.json\`

### GET /states/timezones.json

Get index of all state timezones with counts.

**Example**: \`${config.CDN_BASE_URL}/states/timezones.json\`

---

## Cities

### GET /cities/country/{country_iso2}.json

Get cities for a specific country.

**Parameters**:

- \`country_iso2\`: Lowercase country ISO2 code (for example, \`af\`)

**Example**: \`${config.CDN_BASE_URL}/cities/country/af.json\`

### GET /cities/country/{country_iso2}/index.json

For countries exceeding the configured shard size (5,000 cities by default), this index lists numbered chunks and their API-root-relative filenames. The complete country file remains available. Smaller countries do not have a chunk index.

### GET /cities/state/{state_iso3166_2}.json

Get cities for a specific state.

**Parameters**:

- \`state_iso3166_2\`: State ISO 3166-2 code (format: {country_iso2}-{state_code})

**Example**: \`${config.CDN_BASE_URL}/cities/state/af-bds.json\`



### GET /cities/batches.json

Get batch index for efficient individual city lookups.

**Note**: Contains metadata about all city batch files with start/end ID ranges. This is the recommended way to find the correct batch file for any city ID.

**Example**: \`${config.CDN_BASE_URL}/cities/batches.json\`

**Response Structure**:
\`\`\`json
{
  "data": [
    {
      "filename": "cities/batch/batch-57900-58006.json",
      "start_id": 57900,
      "end_id": 58006,
      "count": 100
    },
    {
      "filename": "cities/batch/batch-58007-58116.json",
      "start_id": 58007,
      "end_id": 58116,
      "count": 100
    }
  ],
  "meta": {
    "type": "batch_index",
    "total_batches": 1512,
    "cities_per_batch": 100,
    "total_cities": 151165,
    "usage": "Use start_id/end_id to find which batch contains a specific city ID"
  }
}
\`\`\`

### GET /cities/batch/{filename}

Get a batch of cities for efficient individual city access.

**Parameters**:

- \`filename\`: Batch basename including \`.json\` (e.g., \`batch-57900-58006.json\`)

**Note**: Cities are accessible by ID as object keys in the \`data\` field. The batch index contains the complete path relative to the API base URL; append \`batch.filename\` directly to that base URL.

**Example**: \`${config.CDN_BASE_URL}/cities/batch/batch-57900-58006.json\`

**Response Structure**:
\`\`\`json
{
  "data": {
    "57995": {
      "id": 57995,
      "name": "Bhopal",
      "state_id": 4030,
      "state_name": "Madhya Pradesh",
      "country_id": 101,
      "country_name": "India",
      "latitude": 23.25469,
      "longitude": 77.40289
    }
  },
  "meta": {
    "type": "cities_batch",
    "batch_range": "57900-58006",
    "cities_count": 100,
    "usage": "Access city by ID: data[city_id]"
  }
}
\`\`\`

### GET /cities/timezone/{timezone}.json

Get cities by timezone when the source data contains city timezone values. A build with no city timezones does not produce these files.

Fetch \`cities/timezones.json\` and use each entry's \`endpoint\` value. Some timezone names require disambiguating suffixes to avoid filename collisions. The index and files are omitted when the source has no city timezones. The same rule applies to \`states/timezones.json\` for states.

Individual city detail files are not generated. Use \`cities/batches.json\` and the indicated batch file to look up a city by ID.

---

## Search

### GET /search/countries.json

Searchable countries index for client-side filtering.

**Searchable Fields**: ${config.SEARCH_FIELDS.countries.join(", ")}

**Usage**: Download once and filter client-side using any searchable field

**Example**: \`${config.CDN_BASE_URL}/search/countries.json\`

### GET /search/states.json

Searchable states index for client-side filtering.

**Searchable Fields**: ${config.SEARCH_FIELDS.states.join(", ")}

**Example**: \`${config.CDN_BASE_URL}/search/states.json\`

### GET /search/cities.json

Complete global city search index for client-side filtering. Ordinary builds retain this endpoint; Cloudflare Pages builds omit it to meet the 25 MiB asset limit. For complete global search on Cloudflare, use all country shards listed by \`search/cities/index.json\`.

**Searchable Fields**: ${config.SEARCH_FIELDS.cities.join(", ")}

**Warning**: Large file - prefer a country shard when the country is known.

**Example**: \`${config.CDN_BASE_URL}/search/cities.json\`

### GET /search/cities/index.json

Manifest of available city-search shards. Each entry includes a country code, record count, and \`filename\` relative to the API base URL. \`meta.global_index_available\` indicates whether \`search/cities.json\` is present.

**Example**: \`${config.CDN_BASE_URL}/search/cities/index.json\`

### GET /search/cities/country/{iso2}.json

Searchable city records for one country, with the same fields as the global city index.

**Parameters**: \`iso2\` is the lowercase two-letter country code. Use the manifest to discover available shards; a country without cities has no shard. Records without a usable country code appear in \`unknown.json\` when present.

**Example**: \`${config.CDN_BASE_URL}/search/cities/country/in.json\`

Search records include \`name_normalized\`, produced by lowercasing and removing Unicode combining marks. Normalize the query in the same way; this is diacritic folding rather than full transliteration.

### GET /search/combined-sample.json

Combined search index across all entity types (limited dataset).

**Limitations**: Includes at most the first 1,000 states and 5,000 cities. Use the individual search indexes for complete results.

\`meta.counts\` and \`meta.complete\` describe the returned and total records. \`search/combined.json\` is a compatibility alias for the same sample.

**Example**: \`${config.CDN_BASE_URL}/search/combined-sample.json\`

---

## Rate Limits

- **No rate limits** - API is cached by CDN
- **Recommendation**: Implement client-side caching for better performance

## Error Responses

All endpoints return appropriate HTTP status codes:

- \`200\`: Success
- \`404\`: Resource not found
- \`500\`: Server error (rare for static files)
`;
  }
}

module.exports = EndpointsTemplate;
