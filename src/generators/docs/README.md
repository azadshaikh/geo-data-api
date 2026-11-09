# Geo-Data API Documentation

A comprehensive static JSON API providing detailed geographic data for countries, states/provinces, and cities worldwide. This documentation covers all available endpoints, data structures, and usage examples.

## 🌍 API Overview

**Base URL:** `https://cdn.example.com/api/v1/`

### Key Features

- **250+ countries** with detailed information including translations, timezones, and currencies
- **5000+ states/provinces** with administrative details and geographic coordinates
- **150,000+ cities** with precise location data and WikiData integration
- **Multi-language support** for country names
- **No authentication required** - public API
- **CDN-cached responses** for optimal performance
- **Geographic coordinates** for precise mapping
- **Timezone information** when supplied by the source dataset

## 🚀 Quick Start

### Get All Countries

```javascript
const response = await fetch("https://cdn.example.com/api/v1/countries.json");
const data = await response.json();
console.log(data.data); // Array of countries
```

### Get States for a Country

```javascript
// Get all states for Afghanistan (ISO2: AF)
const response = await fetch(
  "https://cdn.example.com/api/v1/states/country/af.json"
);
const { data, meta } = await response.json();
console.log(`Found ${meta.count} states in ${meta.country_name}`);
```

### Get Cities in a State

```javascript
// Get cities in Badakhshan province (ISO 3166-2: AF-BDS)
const response = await fetch(
  "https://cdn.example.com/api/v1/cities/state/af-bds.json"
);
const { data } = await response.json();
console.log(data); // Array of cities
```

## 📋 Available Endpoints

### Countries

- `GET /countries.json` - All countries list
- `GET /countries/{iso2}.json` - Specific country details
- `GET /countries/region/{region}.json` - Countries by region
- `GET /countries/regions.json` - Available regions index

### States/Provinces

- `GET /states/all.json` - All states/provinces
- `GET /states/country/{country_iso2}.json` - States by country
- `GET /states/type/{type}.json` - States by administrative type
- `GET /states/timezone/{timezone}.json` - States by timezone
- `GET /states/{iso3166_2}.json` - Specific state details
- `GET /states/types.json` - Available state types index

### Cities

- `GET /cities/country/{country_iso2}.json` - Cities by country
- `GET /cities/country/{country_iso2}/index.json` - Numbered chunks for large country lists
- `GET /cities/state/{state_iso3166_2}.json` - Cities by state
- `GET /cities/{id}.json` - Individual city details
- `GET /cities/batches.json` - City batch index
- `GET /cities/batch/{filename}` - City details keyed by ID

### Search

- `GET /search/countries.json` - Searchable countries index
- `GET /search/states.json` - Searchable states index
- `GET /search/cities.json` - Complete global city-search index (omitted on Cloudflare Pages)
- `GET /search/cities/index.json` - Country shard manifest
- `GET /search/cities/country/{iso2}.json` - City-search data for one country
- `GET /search/combined-sample.json` - Sample limited to the first 1,000 states and 5,000 cities; `/search/combined.json` is an identical compatibility alias

Search records expose `name_normalized` for lowercase, diacritic-folded matching. Inspect the sample's `meta.counts` and `meta.complete` before relying on its coverage.

## 📊 Response Format

Most entity responses follow this structure:

```javascript
{
  "data": [...], // Array or Object containing the requested data
  "meta": {
    "type": "countries", // Type of data
    "count": 250, // Number of items (for arrays)
    "generated_at": "2025-09-12T09:30:16.000Z",
    "api_version": "v1"
  }
}
```

## 🔍 Search and Filter Examples

### Client-side Search

```javascript
// Download search index and filter client-side
const response = await fetch(
  "https://cdn.example.com/api/v1/search/states.json"
);
const searchData = await response.json();

// Filter provinces containing "badakh"
const provinces = searchData.data.filter(
  (state) =>
    state.type === "province" && state.name.toLowerCase().includes("badakh")
);
```

### Filter by Region

```javascript
// Get all Asian countries
const response = await fetch(
  "https://cdn.example.com/api/v1/countries/region/asia.json"
);
const asianCountries = await response.json();
```

### Filter by Administrative Type

```javascript
// Get all provinces worldwide
const response = await fetch(
  "https://cdn.example.com/api/v1/states/type/province.json"
);
const provinces = await response.json();
```

## 🌐 Geographic Data

### Working with Coordinates

```javascript
// Get cities with coordinates for mapping
const response = await fetch(
  "https://cdn.example.com/api/v1/cities/country/af.json"
);
const { data } = await response.json();

const citiesWithCoords = data.filter((city) => city.latitude != null && city.latitude !== '' && city.longitude != null && city.longitude !== '');

// Use with mapping libraries
citiesWithCoords.forEach((city) => {
  addMarkerToMap(city.latitude, city.longitude, city.name);
});
```

### Timezone Information

```javascript
// Get states by timezone
const response = await fetch(
  "https://cdn.example.com/api/v1/states/timezone/Asia-Kabul.json"
);
const { data, meta } = await response.json();

// Calculate local time
data.forEach((state) => {
  const localTime = new Date().toLocaleString("en-US", {
    timeZone: meta.timezone,
  });
  console.log(`${state.name}: ${localTime}`);
});
```

## 💾 Data Quality

- Coverage depends on the source dataset. See the generated API documentation for current coordinate, WikiData, and timezone statistics.

## ⚡ Performance Tips

1. **Implement Caching**: Data doesn't change frequently, cache responses client-side
2. **Use Search Shards**: Download a country city-search shard when the country is known
3. **Check Coordinates**: Verify latitude/longitude existence before using location features
4. **Leverage CDN**: Responses are cached globally for fast access

## 🏗️ Project Structure

```text
geo-data-api/
├── db/                           # Source data files
│   ├── countries.json
│   ├── states.json
│   └── cities.json
├── src/                          # Source code
│   ├── config.js                 # Configuration settings
│   ├── data-processor.js         # Main data processing
│   ├── analyzers/               # Data analysis tools
│   │   └── data-analyzer.js
│   ├── generators/              # API file generators
│   │   ├── countries.js
│   │   ├── states.js
│   │   ├── cities.js
│   │   ├── search.js
│   │   └── docs/               # Documentation generators
│   │       ├── api-documentation-generator.js
│   │       ├── api-info-generator.js
│   │       ├── markdown-generator.js
│   │       ├── templates/
│   │       │   ├── api-documentation-template.js
│   │       │   ├── quick-start-template.js
│   │       │   ├── endpoints-template.js
│   │       │   └── data-structure-template.js
│   │       └── utils/
│   │           └── timestamp-utils.js
│   ├── utils/                   # Utility functions
│   │   ├── data-utils.js
│   │   ├── file-utils.js
│   │   └── performance-monitor.js
│   └── validators/              # Data validation
│       └── data-validator.js
├── docs/                        # Generated documentation
│   ├── API_DOCUMENTATION.md
│   ├── QUICK_START.md
│   ├── ENDPOINTS.md
│   ├── DATA_STRUCTURE.md
│   └── README.md
├── dist/                        # Generated API files
│   └── api/                     # Static JSON API files
└── package.json                 # Project configuration
```

## 🔧 Documentation Generators

This directory contains modular documentation generators that create comprehensive API documentation:

### Templates

- **ApiDocumentationTemplate**: Generates main API documentation with overview and statistics
- **QuickStartTemplate**: Creates quick start guide with basic usage examples
- **EndpointsTemplate**: Produces detailed API endpoints reference
- **DataStructureTemplate**: Documents data structure with sample objects

### Utilities

- **TimestampUtils**: Provides various timestamp formats for documentation

### Usage

```javascript
const MarkdownGenerator = require("./markdown-generator");

const generator = new MarkdownGenerator(
  countries,
  states,
  cities,
  dataAnalysis
);
await generator.generateAll();
```

The documentation system is designed to be modular, maintainable, and easily extensible for new documentation types.

## 📖 Additional Resources

- **API Documentation**: `/docs/API_DOCUMENTATION.md` - Complete API reference
- **Quick Start Guide**: `/docs/QUICK_START.md` - Get started quickly
- **Endpoints Reference**: `/docs/ENDPOINTS.md` - Detailed endpoint documentation
- **Data Structure**: `/docs/DATA_STRUCTURE.md` - Data format specifications

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
