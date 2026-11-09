# Geo-Data API Documentation

## Overview

This is a comprehensive static JSON API providing detailed information about countries, states, and cities worldwide. The API is designed to be fast, reliable, and easy to integrate into any application.

### Statistics

- **250** countries with detailed information
- **5099** states/provinces/regions with administrative details
- **151165** cities with geographic coordinates
- **6** regions and **22** subregions
- **150853** cities with WikiData references
- **5099** states with coordinates (**100.0%**)
- **151165** cities with coordinates (**100.0%**)

## Features

- 🌍 **Comprehensive Coverage**: Complete data for all countries, states, and major cities
- 📍 **Geographic Data**: Latitude/longitude coordinates for precise location mapping
- 🕒 **Timezone Support**: State and city timezone information where provided by the source data
- 🏛️ **Administrative Details**: State types (province, state, region, etc.)
- 🔗 **WikiData Integration**: Enhanced city information with Wikipedia references
- 💰 **Currency Information**: Detailed currency data with symbols
- 🗣️ **Multi-language**: Country names in native languages
- 🚀 **CDN Ready**: Optimized for global content delivery networks
- 📱 **No Authentication**: Public API with no keys required
- ⚡ **Batch API**: Efficient city lookup with 100 cities per batch file
- 🔍 **Smart Indexing**: Batch index for quick city ID resolution
- 🗂️ **Country Search Shards**: Load city search data for one country at a time

## Base URL

```text
https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1
```

## API Discovery

- `/api-info.json` contains dataset statistics and an endpoint index.
- `/documentation.json` contains machine-readable endpoint descriptions and client examples.

## Data Quality

- **100.0%** of states have geographic coordinates
- **100.0%** of cities have geographic coordinates
- **99.8%** of cities have WikiData references
- **352** unique state timezones available

## Quick Examples

### Get All Countries

```javascript
const response = await fetch('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/countries.json');
const data = await response.json();
console.log(data.data); // Array of countries
```

### Get States for a Country

```javascript
// Get states for Afghanistan (country_id: 1)
const response = await fetch('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/states/country/af.json');
const data = await response.json();
console.log(data.data); // Array of states
```

### Get Cities for a State

```javascript
// Get cities for Badakhshan (state_id: 3901, iso3166_2: AF-BDS)
const response = await fetch('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/state/af-bds.json');
const data = await response.json();
console.log(data.data); // Array of cities
```

### Get City by ID (Batch API)

```javascript
// Get a specific city by ID using batch API
async function getCity(cityId) {
  // First, get the batch index to find the correct batch file
  const indexResponse = await fetch('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/batches.json');
  const batchIndex = await indexResponse.json();

  // Find which batch contains the city
  const batch = batchIndex.data.find(b => cityId >= b.start_id && cityId <= b.end_id);

  if (!batch) {
    throw new Error(`City with ID ${cityId} not found`);
  }

  // Fetch the specific batch file
  const batchResponse = await fetch(`https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/${batch.filename}`);
  const batchData = await batchResponse.json();

  // Return the city data
  if (!batchData.data[cityId]) throw new Error('City not found: ' + cityId);
  return batchData.data[cityId];
}

// Usage: Get city with ID 57995 (Bhopal)
const bhopal = await getCity(57995);
console.log(bhopal.name); // "Bhopal"
console.log(bhopal.latitude, bhopal.longitude);
```

### Search Cities in One Country

```javascript
const response = await fetch('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/cities/country/in.json');
if (!response.ok) throw new Error(`Search shard request failed: ${response.status}`);
const { data } = await response.json();
const query = 'kochi'.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const matches = data.filter(city => city.name_normalized.includes(query));
```

Discover country shards via `/search/cities/index.json`. Each shard covers one country. Ordinary builds include the complete `/search/cities.json` index; Cloudflare Pages builds omit that file to meet the 25 MiB asset limit. The shards together still cover the complete dataset, and `meta.global_index_available` indicates whether the full file is present.

Search normalization removes combining marks after Unicode NFD lowercasing; it is not full transliteration. `/search/combined-sample.json` (also available as `/search/combined.json`) contains at most 1,000 states and 5,000 cities; its metadata exposes the counts and completeness.

## Response Format

Most entity endpoints return JSON with this structure:

```json
{
  "data": [], // Array or Object containing the requested data
  "meta": {
    "type": "countries", // Type of data
    "count": 195, // Number of items (for arrays)
    "generated_at": "2024-01-01T00:00:00.000Z",
    "api_version": "v1"
  }
}
```

## Best Practices

1. **Caching**: Implement client-side caching as data doesn't change frequently
2. **Search**: Use a country city-search shard when the country is known; use the full city index for global searches
3. **Coordinates**: Check for latitude/longitude availability before using location features
4. **WikiData**: Use WikiData IDs to fetch additional information from Wikipedia/Wikidata APIs
5. **Batch API**: Use city batch files for efficient individual city lookups instead of downloading all cities
6. **Batch Caching**: Cache batch files on client-side as each contains 100 cities

## Batch API Usage

The batch API provides efficient access to individual cities by organizing them into files of approximately 100 cities each. The batch system uses an index to ensure reliable access:

### Recommended Method: Using Batch Index

```javascript
async function getCity(cityId) {
  // Step 1: Load the batch index
  const indexResponse = await fetch('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/batches.json');
  const batchIndex = await indexResponse.json();

  // Step 2: Find which batch contains the city
  const batch = batchIndex.data.find(b => cityId >= b.start_id && cityId <= b.end_id);

  if (!batch) {
    throw new Error(`City with ID ${cityId} not found`);
  }

  // Step 3: Fetch the specific batch file
  const batchResponse = await fetch(`https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/${batch.filename}`);
  const batchData = await batchResponse.json();

  // Step 4: Extract the city data
  if (!batchData.data[cityId]) throw new Error('City not found: ' + cityId);
  return batchData.data[cityId];
}

// Usage examples
const bhopal = await getCity(57995); // Bhopal, India
const tokyo = await getCity(64500);  // Tokyo, Japan
const london = await getCity(50388); // London, UK
```

### Advanced: Batch API with Caching

```javascript
class CityAPI {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.batchIndex = null;
    this.batchCache = new Map();
  }

  async loadBatchIndex() {
    if (!this.batchIndex) {
      const response = await fetch(`${this.baseUrl}/cities/batches.json`);
      const data = await response.json();
      this.batchIndex = data.data;
    }
    return this.batchIndex;
  }

  async getCity(cityId) {
    await this.loadBatchIndex();

    const batch = this.batchIndex.find(b =>
      cityId >= b.start_id && cityId <= b.end_id
    );

    if (!batch) {
      throw new Error(`City ID ${cityId} not found`);
    }

    // Check cache first
    if (this.batchCache.has(batch.filename)) {
      const cachedBatch = this.batchCache.get(batch.filename);
      if (!cachedBatch[cityId]) throw new Error('City not found: ' + cityId);
      return cachedBatch[cityId];
    }

    // Fetch and cache the batch
    const response = await fetch(`${this.baseUrl}/${batch.filename}`);
    const batchData = await response.json();

    this.batchCache.set(batch.filename, batchData.data);
    if (!batchData.data[cityId]) throw new Error('City not found: ' + cityId);
    return batchData.data[cityId];
  }

  async getCities(cityIds) {
    const results = {};
    const batchGroups = {};

    // Group city IDs by batch
    for (const cityId of cityIds) {
      await this.loadBatchIndex();
      const batch = this.batchIndex.find(b =>
        cityId >= b.start_id && cityId <= b.end_id
      );

      if (batch) {
        if (!batchGroups[batch.filename]) {
          batchGroups[batch.filename] = [];
        }
        batchGroups[batch.filename].push(cityId);
      }
    }

    // Fetch each batch once and extract needed cities
    for (const [filename, ids] of Object.entries(batchGroups)) {
      if (!this.batchCache.has(filename)) {
        const response = await fetch(`${this.baseUrl}/${filename}`);
        const batchData = await response.json();
        this.batchCache.set(filename, batchData.data);
      }

      const batchData = this.batchCache.get(filename);
      ids.forEach(id => {
        results[id] = batchData[id];
      });
    }

    return results;
  }
}

// Usage:
const cityAPI = new CityAPI('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1');

// Get single city
const bhopal = await cityAPI.getCity(57995);
console.log(bhopal.name); // "Bhopal"

// Get multiple cities efficiently
const cities = await cityAPI.getCities([57995, 64500, 50388]);
console.log(cities[57995].name, cities[64500].name);
```

### Batch API Endpoints

- `/cities/batches.json` - Index of all batch files with ID ranges
- `/cities/batch/batch-{start}-{end}.json` - Batch files containing 100 cities each

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/azadshaikh/geo-data-api).

## License

This project is open source and available under the [MIT License](../LICENSE).
