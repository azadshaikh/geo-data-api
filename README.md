# Geo-Data API Static Generator

[![npm version](https://badge.fury.io/js/geo-data-api.svg)](https://www.npmjs.com/package/geo-data-api)
[![jsDelivr hits (npm)](https://img.shields.io/jsdelivr/npm/hm/geo-data-api)](https://www.jsdelivr.com/package/npm/geo-data-api)
[![Demo](https://img.shields.io/badge/demo-interactive-blue)](https://geo-data-api.asterodigital.com/demo/demo.html)

Generate a static JSON API for geographic data including countries, states and cities that can be hosted on any CDN.

This repository transforms the upstream dataset (countries, states, cities) into a small, cacheable, CDN-ready API under `dist/api/v1/`.

## Quick start

Prerequisites: Node.js 22 or newer and npm. The checked-in `db/` already contains a dataset; replace it when building another release.

1. Place source JSON files in the `db/` directory:
   - `countries.json`
   - `states.json`
   - `cities.json`

You can download the dataset from the GitHub project: [dr5hn/countries-states-cities-database](https://github.com/dr5hn/countries-states-cities-database)

1. Install dependencies and build the API:

```powershell
npm install
npm run build
npm run verify
```

1. Upload the contents of `dist/api/v1/` to your CDN.

1. Update `src/config.js` (for example, `CDN_BASE_URL`) if you need client-side configuration.

## Testing and local preview

Run `npm test` with Node.js 22 or later to check the generator and development server.

`npm run lint` checks JavaScript syntax, and `npm run format:check` checks formatting of the website, tests, and contract files. CI also applies a 5 MB limit to each city search shard. Run `npm run build:docs` explicitly when you want to regenerate the tracked Markdown documentation; an ordinary build leaves those documents alone. `npm run clean` removes `dist/api/v1` only.

Run `npm run serve` to preview an existing build at `http://127.0.0.1:3000`. The server binds to localhost by default; set `HOST` and `PORT` only if a different address is required.

Open `http://127.0.0.1:3000/demo/demo.html` to try the interactive playground: a cascading address form, country-scoped city search, and city lookup by ID. Visit `http://127.0.0.1:3000/docs/index.html` for the website documentation. Both use the Tailwind CSS v3 CDN and work under a deployment subpath.

## What this generates

The generator creates a small static API tree (example):

```text
dist/api/v1/
├── api-info.json                 # dataset statistics and endpoint index
├── documentation.json            # machine-readable API documentation
├── manifest.json                 # dataset version, counts, file checksums
├── build-report.json             # complete source validation summary
├── countries.json                # list all countries
├── countries/{iso2}.json         # country details (ISO2 code)
├── states/country/{iso2}.json    # states by country (ISO2 code)
├── states/{iso3166_2}.json       # state details (ISO 3166-2 code)
├── cities/country/{iso2}.json    # cities by country (ISO2 code)
├── cities/country/{iso2}/        # indexed chunks for large country lists
├── cities/state/{iso3166_2}.json # cities by state (ISO 3166-2 code)
├── cities/batches.json           # index of city batches by ID range
├── cities/batch/{filename}       # city details keyed by ID
└── search/
    ├── countries.json            # searchable country index
    ├── states.json               # searchable state index
    ├── cities.json               # complete global city index (except on Cloudflare Pages)
    └── cities/
        ├── index.json            # country shard manifest
        └── country/{iso2}.json   # searchable cities in one country
```

## API endpoints (static files)

- GET /api-info.json — dataset statistics and endpoint index
- GET /documentation.json — machine-readable endpoint descriptions and examples

### Countries

- GET /countries.json
- GET /countries/{iso2}.json
- GET /countries/region/{region}.json
- GET /countries/subregion/{subregion}.json

### States

- GET /states/country/{iso2}.json
- GET /states/{iso3166_2}.json
- GET /states/type/{type}.json
- GET /states/timezone/{timezone}.json
- GET /states/types.json
- GET /states/timezones.json
- GET /states/all.json

### Cities

- GET /cities/country/{iso2}.json
- GET /cities/country/{iso2}/index.json and its numbered chunks (only for large countries)
- GET /cities/state/{iso3166_2}.json
- GET /cities/timezones.json and its referenced timezone files (only when source cities include timezones)
- GET /cities/batch/{filename} (the filename supplied by the batch index)
- GET /cities/batches.json

City details are retrieved through `cities/batches.json` and its referenced batch files; individual `cities/{id}.json` files are not generated.

### Search

- GET /search/countries.json
- GET /search/states.json
- GET /search/cities.json (complete global index; omitted from Cloudflare Pages builds)
- GET /search/cities/index.json (country shard manifest)
- GET /search/cities/country/{iso2}.json (lowercase country code)
- GET /search/combined-sample.json (at most the first 1,000 states and 5,000 cities)
- GET /search/combined.json (compatibility alias for the same sample)

Search responses include `name_normalized`: lowercase Unicode NFD text with combining marks removed. Normalize the query in the same way for searches such as `Sao Paulo` matching `São Paulo`. This folds diacritics but does not transliterate every letter. The combined sample's `meta.counts` and `meta.complete` report what it contains; use the complete entity indexes or country shards when all results are required.

Cloudflare Pages builds omit the large `search/cities.json` file to meet the 25 MiB per-file limit. All cities remain available through the country shards listed in `search/cities/index.json`; its `meta.global_index_available` field reports whether the full file is present. Ordinary builds continue to include the full index.

## Configuration

Edit `src/config.js` to customize:

- Output formatting (pretty vs compact)
- Search fields included in index files
- `CDN_BASE_URL` used by examples
- Country city chunk size (`COUNTRY_CITY_SHARD_SIZE`, default 5,000; set to 0 to disable)

The CLI accepts `--input`, `--output`, `--pretty`, `--compress`, `--compression-threshold`, and `--country-shard-size`. For example:

```sh
npx geo-data-api --input ./db --output ./dist/api/v1 --compress
```

Programmatic builds are also available. Run builds sequentially because generator configuration is shared within a Node process:

```js
const { DataProcessor } = require("geo-data-api");
await new DataProcessor({ inputDir: "./db", outputDir: "./generated-api" }).run();
```

## Documentation

📚 **Complete API Documentation**

- **[Website documentation](https://geo-data-api.asterodigital.com/docs/index.html)** — getting started, endpoint reference, and integration guides (available after deploying this version)
- **[API Documentation](docs/API_DOCUMENTATION.md)** - Comprehensive overview with examples and best practices
- **[Quick Start Guide](docs/QUICK_START.md)** - Get up and running quickly with code examples
- **[Endpoints Reference](docs/ENDPOINTS.md)** - Detailed reference for all available API endpoints
- **[Data Structure Reference](docs/DATA_STRUCTURE.md)** - Complete field definitions and sample objects
- **[OpenAPI 3.1](openapi.json)**, **[JSON Schema](schemas/geo-data.schema.json)**, and **[TypeScript types](types/index.d.ts)**
- **[GitHub repository](https://github.com/azadshaikh/geo-data-api)** — source code, issues, and contributions
- **[Published package on jsDelivr](https://www.jsdelivr.com/package/npm/geo-data-api)** — published versions may differ from this checkout

## Advanced Features

### Performance Optimizations

- **Sequential Processing**: Optimized for large datasets with controlled memory usage
- **Batch Processing**: Cities are split into manageable batches for efficient API access
- **Compact JSON**: Production-optimized minified output (use `--pretty` for development)
- **Memory Management**: Automatic cache clearing and memory optimization during generation

### Smart Search & Filtering

- **Multi-entity Search**: Explicitly limited combined sample across countries, states, and cities
- **Advanced Filtering**: Use files grouped by region, subregion, administrative type, and available timezones
- **Client-side Search**: Country city-search shards reduce downloads when the country is known
- **Batch City Access**: Efficient city lookup with 100 cities per batch file

### Geographic Intelligence

- **Coordinate Coverage**: Latitude and longitude are included where available in the source data
- **Timezone Support**: State and city timezones are available where included in the source data
- **Administrative Types**: State and province types are available when present in the source data
- **WikiData Integration**: City WikiData identifiers are included when available

## Roadmap

### 🚀 Phase 1: Enhanced User Experience

- [ ] **Astro-powered Landing Page**: Replace current HTML with Astro for better performance and maintainability
- [ ] **Interactive Demo Redesign**: Rebuild demo pages using Astro with improved UX and modern design
- [ ] **Single City Endpoints**: Add option to generate individual city API endpoints for better granularity

### 🔧 Phase 2: Developer Experience

- [x] **OpenAPI Specification**: Describe the static API and response schemas
- [ ] **SDK Generation**: Create SDKs for JavaScript, Python, and PHP
- [x] **TypeScript Support**: Provide response types and a typed processor entry point
- [x] **CLI Tool Enhancement**: Configure input, output, formatting, compression, and sharding

### 📊 Phase 3: Advanced Features

- [ ] **GraphQL API**: Add GraphQL support alongside REST API for flexible querying
- [ ] **Real-time Updates**: Implement webhook system for data updates and notifications
- [ ] **Advanced Search**: Add fuzzy search, autocomplete, and advanced filtering capabilities
- [ ] **Data Export**: Support for CSV, XML, and other data formats

## Deployment

1. Run the build (see Quick start).
1. Upload `dist/api/v1/` to your CDN or static host.
1. Configure CORS on the CDN to allow public reads. Example headers:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Performance tips:

- Enable gzip/Brotli compression on your CDN. Alternatively, `npm run build:compress` writes deterministic `.gz` and `.br` siblings for JSON files at least 1 KiB; `--compression-threshold` changes that threshold. These siblings do not provide content negotiation by themselves: configure the host to select them using `Accept-Encoding` and return the matching `Content-Encoding` and `Vary` headers.
- `_headers` (copied to `dist/`) provides CORS and conservative cache settings for Netlify/Cloudflare Pages; `vercel.json` provides equivalent settings for Vercel. Use immutable caching only with versioned URLs.
- For S3, `npm run deploy:s3 -- s3://BUCKET/api/v1` syncs JSON and optional encoded siblings with content metadata and no `--delete`. Configure bucket CORS and CDN content negotiation separately. S3 sync does not update metadata on unchanged objects automatically.
- Use `/search/cities/country/{iso2}.json` for country-specific searches. Use the shard index to discover available files; fetch all shards for worldwide searches, or use `/search/cities.json` when the host provides it.
- Cloudflare Pages automatically sets `CF_PAGES=1`, so its existing `npm run build` command produces the shard-only variant and checks every deployed asset against the 25 MiB limit. To check another output directory, run `node scripts/check-cloudflare-assets.js path/to/dist`.
- The site build includes a top-level `404.html` so Cloudflare Pages returns a not-found status for missing API files instead of falling back to the homepage.

## Usage examples

Fetch all countries:

```javascript
const resp = await fetch(
  "https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/countries.json"
);
const data = await resp.json();
console.log(data);
```

Get states for a country (example: Afghanistan):

```javascript
const resp = await fetch(
  "https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/states/country/af.json"
);
const states = await resp.json();
```

Get cities for a state (example: Badakhshan province):

```javascript
const resp = await fetch(
  "https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/state/af-bds.json"
);
const cities = await resp.json();
```

Search client-side (example):

```javascript
const resp = await fetch(
  "https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/countries.json"
);
const index = await resp.json();
const matches = index.data.filter((c) => c.name.toLowerCase().includes("ind"));
```

Search cities in one country:

```javascript
const response = await fetch(
  "https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/search/cities/country/in.json"
);
if (!response.ok) throw new Error(`Search shard request failed: ${response.status}`);
const { data } = await response.json();
const query = "Kochi".toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const matches = data.filter((city) => city.name_normalized.includes(query));
```

The shard manifest (`/search/cities/index.json`) lists available countries and relative filenames. A country without cities has no shard; records with no usable country code appear in `unknown.json` when present. The complete global index remains available in ordinary builds; Cloudflare Pages builds use shards only.

## Reproducible builds

`meta.generated_at` remains part of API responses and uses a stable release timestamp. The default is the checked-in dataset snapshot time (`2025-09-12T09:30:16.000Z`); set `SOURCE_DATE_EPOCH` to a Unix timestamp in seconds for another release. Record a new timestamp when updating the source data. With the same source files, generator code, runtime, options, and timestamp, output bytes are reproducible. A build stages and verifies its output before replacement and preserves untracked extra files. If those inputs are unchanged, the builder verifies the existing output and skips regeneration altogether.

When replacing an older output that has no manifest, the first build retains the original directory as a sibling `.v1-backup-*` folder so any ambiguous pre-existing files remain recoverable. Review and remove that backup when it is no longer needed; it is excluded from the npm package.

`manifest.json` identifies the source dataset using SHA-256, records a fingerprint of build inputs, the timestamp and counts, and lists each other output file's byte length and SHA-256 checksum. It excludes itself from its checksum list. `build-report.json` summarizes validation; invalid records, duplicate IDs or ISO codes, and orphan relationships fail the build. `npm run verify` checks generated JSON, endpoint coverage, batch and shard coverage, filename collisions, and manifest checksums. Pass an output directory or `--max-search-shard-bytes N` to customize verification.

React hook example (tiny helper):

```javascript
import { useState, useEffect } from "react";

const API_BASE_URL =
  "https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1";

export function useCountriesAPI() {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(false);

  async function getCountries() {
    setLoading(true);
    const r = await fetch(`${API_BASE_URL}/countries.json`);
    const j = await r.json();
    setCountries(j.data || []);
    setLoading(false);
  }

  useEffect(() => {
    getCountries();
  }, []);

  async function getStates(countryId) {
    // Use a lowercase ISO2 code (e.g., 'af' for Afghanistan)
    const r = await fetch(`${API_BASE_URL}/states/country/${countryId}.json`);
    return r.json();
  }

  async function getCities(stateId) {
    // Use a lowercase ISO 3166-2 code (e.g., 'af-bds' for Badakhshan)
    const r = await fetch(`${API_BASE_URL}/cities/state/${stateId}.json`);
    return r.json();
  }

  return { countries, loading, getStates, getCities };
}
```

## File structure (project)

- `src/` - generator source code
  - `config.js` - configuration and field mappings
  - `data-processor.js` - main processing logic and orchestration
  - `server.js` - development server for testing
  - `generators/` - per-entity generators
    - `countries.js` - country endpoint generation
    - `states.js` - state endpoint generation
    - `cities.js` - city endpoint generation
    - `search.js` - search index generation
    - `base-generator.js` - shared generator utilities
  - `analyzers/` - data analysis and validation
  - `validators/` - data structure validation
  - `utils/` - utility helpers and performance monitoring
  - `docs/` - documentation generation templates
- `db/` - source JSON data files tracked in this repository
  - `countries.json` - country data
  - `states.json` - state/province data
  - `cities.json` - city data
- `dist/` - generated API tree (gitignored)
  - `api/v1/` - static JSON API files
  - `demo/` - interactive demo files
- `docs/` - generated documentation
- `demo/` - demo HTML files

## Notes

- The repository is intended to produce a fully static API; no runtime server is required.
- The checked-in `db/*.json` files are the source dataset used by the build.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
