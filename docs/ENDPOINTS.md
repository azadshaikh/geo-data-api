# API Endpoints Reference

## API Information

- `GET /api-info.json` - Dataset statistics and endpoint index.
- `GET /documentation.json` - Machine-readable endpoint descriptions and examples.

## Countries

### GET /countries.json

Get list of all countries with essential information.

**Response Fields**: id, name, iso2, phonecode

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/countries.json`

### GET /countries/{iso2}.json

Get detailed information for a specific country by ISO2 code.

**Parameters**:

- `iso2`: Lowercase country ISO2 code (for example, `us`)

**Response Fields**: All available fields including timezones, translations, and geographic data

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/countries/us.json`

### GET /countries/region/{region}.json

Get countries by region (e.g., Asia, Europe, Africa).

**Parameters**:

- `region`: Region name (lowercase, hyphenated)

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/countries/region/asia.json`

**Available Regions**:

- Asia
- Europe
- Africa
- Oceania
- Americas
- Polar

### GET /countries/subregion/{subregion}.json

Get countries by subregion.

**Parameters**:

- `subregion`: Subregion name (lowercase, hyphenated)

---

## States

### GET /states/all.json

Get all states (full list, not paginated in this release).

**Note**: States are provided as a full list (no pagination)

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/states/all.json`

### GET /states/country/{country_iso2}.json

Get states for a specific country with administrative details.

**Parameters**:

- `country_iso2`: Lowercase country ISO2 code (for example, `af`)

**List fields**: ID, name, ISO2 code, and ISO 3166-2 code. Use the individual state endpoint for additional details.

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/states/country/af.json`

### GET /states/type/{type}.json

Get states by administrative type (province, state, region, etc.).

**Parameters**:

- `type`: Administrative type (lowercase, hyphenated)

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/states/type/province.json`

**Available Types**:

- province
- municipality
- district
- county
- atoll
- parish
- dependency
- city
- region
- capital city
- territory
- state
- autonomous republic
- governorate
- division
- oblast
- department
- special municipality
- canton
- entity
- federal district
- autonomous municipality
- geographical region
- prefecture
- commune
- economic prefecture
- autonomous region
- special administrative region
- capital district
- island
- autonomous district
- administration
- metropolitan department
- European collectivity
- metropolitan region
- metropolitan collectivity with special status
- overseas region
- overseas collectivity
- overseas territory
- land
- regional unit
- administrative region
- village
- city with county rights
- union territory
- Special region
- free municipal consortium
- decentralized regional entity
- metropolitan city
- state city
- popularate
- district municipality
- federal territory
- administrative atoll
- local council
- sheadings
- chain
- autonomous territorial unit
- territorial unit
- quarter
- special island authority
- capital territory
- special city
- arctic region
- administered area
- federal capital territory
- indigenous region
- capital
- voivodship
- republic
- administrative territory
- autonomous city
- area
- urban municipality
- special self-governing province
- special self-governing city
- autonomous community
- districts under republic administration
- metropolitan administration
- borough
- town council
- island council
- emirate
- council area
- unitary authority
- district council
- borough council
- london borough
- metropolitan district
- two-tier county
- country
- outlying area
- federal dependency

### GET /states/{iso3166_2}.json

Get detailed information for a specific state by ISO 3166-2 code.

**Parameters**:

- `iso3166_2`: State ISO 3166-2 code (format: {country_iso2}-{state_code})

**Response Fields**: All available fields including geographic coordinates and timezone

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/states/af-bds.json` (Badakhshan, Afghanistan)

### GET /states/timezone/{timezone}.json

Get states by timezone.

**Parameters**:

- `timezone`: Timezone name with non-alphanumeric characters replaced by hyphens

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/states/timezone/Asia-Kabul.json`

### GET /states/timezones.json

Get index of all state timezones with counts.

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/states/timezones.json`

---

## Cities

### GET /cities/country/{country_iso2}.json

Get cities for a specific country.

**Parameters**:

- `country_iso2`: Lowercase country ISO2 code (for example, `af`)

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/country/af.json`

### GET /cities/country/{country_iso2}/index.json

For countries exceeding the configured shard size (5,000 cities by default), this index lists numbered chunks and their API-root-relative filenames. The complete country file remains available. Smaller countries do not have a chunk index.

### GET /cities/state/{state_iso3166_2}.json

Get cities for a specific state.

**Parameters**:

- `state_iso3166_2`: State ISO 3166-2 code (format: {country_iso2}-{state_code})

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/state/af-bds.json`



### GET /cities/batches.json

Get batch index for efficient individual city lookups.

**Note**: Contains metadata about all city batch files with start/end ID ranges. This is the recommended way to find the correct batch file for any city ID.

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/batches.json`

**Response Structure**:
```json
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
```

### GET /cities/batch/{filename}

Get a batch of cities for efficient individual city access.

**Parameters**:

- `filename`: Batch basename including `.json` (e.g., `batch-57900-58006.json`)

**Note**: Cities are accessible by ID as object keys in the `data` field. The batch index contains the complete path relative to the API base URL; append `batch.filename` directly to that base URL.

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/batch/batch-57900-58006.json`

**Response Structure**:
```json
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
```

### GET /cities/timezone/{timezone}.json

Get cities by timezone when the source data contains city timezone values. A build with no city timezones does not produce these files.

Fetch `cities/timezones.json` and use each entry's `endpoint` value. Some timezone names require disambiguating suffixes to avoid filename collisions. The index and files are omitted when the source has no city timezones. The same rule applies to `states/timezones.json` for states.

Individual city detail files are not generated. Use `cities/batches.json` and the indicated batch file to look up a city by ID.

---

## Search

### GET /search/countries.json

Searchable countries index for client-side filtering.

**Searchable Fields**: name, name_normalized, iso2, iso3, native, capital, currency, region, subregion

**Usage**: Download once and filter client-side using any searchable field

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/countries.json`

### GET /search/states.json

Searchable states index for client-side filtering.

**Searchable Fields**: name, name_normalized, iso2, country_name, country_code, type, timezone

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/states.json`

### GET /search/cities.json

Complete global city search index for client-side filtering. This endpoint remains available for existing clients.

**Searchable Fields**: name, name_normalized, state_name, country_name, state_code, country_code, wikiDataId

**Warning**: Large file - prefer a country shard when the country is known.

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/cities.json`

### GET /search/cities/index.json

Manifest of available city-search shards. Each entry includes a country code, record count, and `filename` relative to the API base URL.

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/cities/index.json`

### GET /search/cities/country/{iso2}.json

Searchable city records for one country, with the same fields as the global city index.

**Parameters**: `iso2` is the lowercase two-letter country code. Use the manifest to discover available shards; a country without cities has no shard. Records without a usable country code appear in `unknown.json` when present.

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/cities/country/in.json`

Search records include `name_normalized`, produced by lowercasing and removing Unicode combining marks. Normalize the query in the same way; this is diacritic folding rather than full transliteration.

### GET /search/combined-sample.json

Combined search index across all entity types (limited dataset).

**Limitations**: Includes at most the first 1,000 states and 5,000 cities. Use the individual search indexes for complete results.

`meta.counts` and `meta.complete` describe the returned and total records. `search/combined.json` is a compatibility alias for the same sample.

**Example**: `https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/combined-sample.json`

---

## Rate Limits

- **No rate limits** - API is cached by CDN
- **Recommendation**: Implement client-side caching for better performance

## Error Responses

All endpoints return appropriate HTTP status codes:

- `200`: Success
- `404`: Resource not found
- `500`: Server error (rare for static files)
