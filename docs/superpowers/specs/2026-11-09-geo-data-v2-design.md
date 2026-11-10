# Geo-Data API v2 design

## Intent

Replace v1 with a static, versioned v2 API that follows country → state → city navigation, keeps one direct city file per ID, and works on a static CDN and in the Dokploy image. The user does not want v1 generated or included in the v2 package. The existing `geo-data-api` package remains the data/generator package; a separate small `geo-data-api-client` package provides an optional fetch client. Publishing either package is outside this implementation.

## Public routes

All routes below are relative to `api/v2/`; path codes are lowercase, while ISO codes in JSON remain uppercase. A country code is its ISO 3166-1 alpha-2 code. A state path key is its country-local subdivision code lowercased; if unavailable or unsafe, use `id-{numeric-id}`. Unsafe includes Windows device names such as `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, and `LPT1`–`LPT9`; for example, Cornwall uses `id-2312`. Reject path-key collisions before writing.

| Route | Data |
| --- | --- |
| `countries.json` | All country records. |
| `countries/{iso2}.json` | One country record. |
| `countries/{iso2}/states.json` | All states for the country, including `[]` when none exist. |
| `countries/{iso2}/states/{state}.json` | One state. |
| `countries/{iso2}/states/{state}/cities.json` | City summaries for the state, including `[]` when none exist. |
| `countries/{iso2}/cities/index.json` | Index of all city-summary pages for the country; empty countries have an empty index. |
| `countries/{iso2}/cities/{page}.json` | One numbered page of city summaries, starting at 1. |
| `cities/{id}.json` | One full city record, addressed globally by its numeric source ID. |
| `search/countries.json` | Complete country search records. |
| `search/states.json` | Complete state search records. |
| `search/cities/index.json` | Complete country index referencing the country city-page indexes. |
| `api-info.json`, `documentation.json`, `manifest.json`, `build-report.json` | Discovery, contract, checksums, and source-validation report. |

Existing region, state-type, and timezone groupings remain available under v2 where their source data exists. The old city batches, combined sample, and global city search file are not emitted. City search filters prebuilt country/state data in the client; arbitrary query strings are not server-side search. Pages have at most 5,000 records by default; all country indexes have the same shape, including small and empty countries.

The retained cross-cutting paths are `countries/regions.json`, `countries/region/{region}.json`, `countries/subregion/{subregion}.json`, `states/all.json`, `states/types.json`, `states/type/{type}.json`, `states/timezones.json`, `states/timezone/{timezone}.json`, and, when city timezone data exists, `cities/timezones.json` and `cities/timezone/{timezone}.json`. Their index entries must name the actual output filename, including collision-safe timezone suffixes.

## Data contract

Resource and list responses use `{ "data": ..., "meta": ... }`; the discovery catalogs, manifest, and build report keep their own documented top-level structures. Resource metadata has `type`, `count`, `api_version: "v2"`, and the stable dataset release `generated_at` selected by the user. Page indexes additionally expose `total_cities`, `page_size`, and `country_code`; index entries are `{ "filename": "countries/in/cities/1.json", "count": 123 }`, with filenames relative to the API base. The global city index entries are `{ "country_code": "IN", "filename": "countries/in/cities/index.json", "count": 123 }` and cover all countries.

Country and state records retain the useful source fields with snake_case keys and include `name_normalized`. State records expose `path_key` to make fallback paths discoverable. City summaries contain `id`, `name`, `name_normalized`, `state_id`, `state_code`, `state_name`, `state_path_key`, `country_id`, `country_code`, and `country_name`. Derive the city state code, state name and path key from the joined canonical state, and country name/code from the joined country, because source city copies can be stale. Full city records add numeric-or-null `latitude` and `longitude`, nullable `timezone`, and nullable `wikidata_id`. Country and state coordinates are also numeric-or-null in both compact and pretty output. Missing scalar fields use `null`; no city timezone is inferred from a state. Country timezone keys and `emoji_u` use snake_case. Lists and details use the same record shape for countries and states; city lists deliberately use summaries.

All known country and state collection files exist, even when empty. Unknown files produce HTTP 404. Country and state keys are case-sensitive at the static host; clients lowercase input. Source IDs identify records within a dataset snapshot and are not promised to remain unchanged across upstream updates. The manifest records the source hash and stable release timestamp; source attribution and update policy are documented.

## Client and contracts

`geo-data-api-client` is a dependency-free CommonJS package with TypeScript declarations and `createGeoClient({ baseUrl, fetch? })`. It provides `getCountries()`, `getCountry(iso2)`, `getStates(iso2)`, `getState(iso2, state)`, `getCities(iso2, state?)`, `getCity(id)`, and `searchCities(iso2, query, state?)`. Methods return the unwrapped `data`; an unknown single resource returns `null` on HTTP 404, while missing collection files and other HTTP errors reject. Country-only city requests follow the country index and load every page; state requests load one list. Search applies the same lowercase NFD/combining-mark folding as the generator.

JSON Schema is the canonical model contract. Generate OpenAPI, TypeScript declarations, and standalone validators from that source and shared endpoint descriptors, and use the same descriptors for machine-readable discovery. The generator and output verifier enforce those schemas without a runtime npm dependency. Automated tests must validate real compact and pretty outputs, route coverage, empty collections, pagination, filename collisions, city ID detail parity, normalized search, 404s, and client behavior.

The generated root declarations retain `DataProcessor` and its options; the standalone client ships its own generated model declarations. Include schema and route-contract source inputs in the build fingerprint. The page-size setting must be a positive integer because every country has a page index.

## Builds and deployment

Generate only `dist/api/v2`, whitelist only v2 output in the npm package, and avoid deleting a user's existing local v1 files. The local server must not serve a leftover v1 tree, and package/Docker artifacts must not contain it. Preserved user files cannot occupy reserved API routes; reject such conflicts without removing the original files. `npm run clean` targets v2. The Docker image builds and serves the website and v2 data as a non-root user; Compose and Dokploy keep port 3000. The demo, site, generated Markdown, and npm examples use only v2 paths. Preserve reproducible timestamps, full validation, manifest checksums, safe staged publication, and bounded city writes. CI runs the test suite, full build/verifier/package check, client package tests, and Docker smoke test.
