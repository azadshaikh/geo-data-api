# Geo-Data API

Generate a static, versioned JSON API for countries, states and cities. The files can be served from a CDN or the included Docker image, with no runtime database. This repository produces the data under `dist/api/v2/` and provides a separate optional fetch client.

## Build and preview

Node.js 22 or newer and npm are required. The checked-in `db/countries.json`, `db/states.json`, and `db/cities.json` provide the source snapshot.

```sh
npm install
npm run build
npm run verify
npm test
npm run serve
```

Open `http://127.0.0.1:3000` for the site, `/demo/demo.html` for the cascading location picker and search playground, and `/docs/index.html` for the API guides. The site also works under a deployment subpath. `npm run build:docs` regenerates the checked-in Markdown documentation; an ordinary build leaves it alone. `npm run clean` removes the generated v2 tree only.

To deploy the data separately, upload the contents of `dist/api/v2/` beneath your host's `api/v2/` path. Configure the host's CORS, caching, and content types for your application. The included website expects the API at the same deployment root. Static hosts must support the large number of city files.

## API paths

Paths are relative to your `api/v2/` base. Use lowercase country codes in paths; ISO codes in JSON are uppercase. Static paths are case-sensitive. State paths use the `path_key` supplied by the selected state record, including `id-{numeric-id}` fallbacks when the source subdivision code is unavailable or unsafe.

| Path | Data |
| --- | --- |
| `countries.json` | All countries. |
| `countries/{iso2}.json` | One country. |
| `countries/{iso2}/states.json` | All states in a country. |
| `countries/{iso2}/states/{state}.json` | One state. |
| `countries/{iso2}/states/{state}/cities.json` | City summaries for one state. |
| `countries/{iso2}/cities/index.json` | Index of city-summary pages for a country. |
| `countries/{iso2}/cities/{page}.json` | Numbered city-summary page, starting at 1. |
| `cities/{id}.json` | Full city record by numeric source ID. |
| `states/all.json` | All states. |
| `search/countries.json`, `search/states.json` | Complete country and state search records. |
| `search/cities/index.json` | Global index of country city-page indexes. |
| `api-info.json`, `documentation.json`, `manifest.json`, `build-report.json` | Discovery, checksums and source validation. |

Region, state-type and timezone groupings remain available where the source data supplies those values. Known country and state collection files exist even when empty; an empty country city index has no page entries. Unknown files return HTTP 404.

Resource and list responses have `{ "data": ..., "meta": ... }` with `type`, `count`, `api_version: "v2"` and `generated_at` metadata; discovery catalogs, the manifest and the build report have their own top-level structures. Country and state lists use the same record shape as details. City lists contain summaries; `cities/{id}.json` adds coordinates, timezone and `wikidata_id`. Coordinates are numeric or `null`, missing scalars are `null`, and city timezones are not inferred from their state. City, state and country IDs identify records within a snapshot and may change when upstream data is updated.

For country search, load the country index and follow every API-relative `filename` in its `data` array. The index metadata reports `total_cities`, `page_size`, and `country_code`; pages contain at most 5,000 records by default. The global city index links to every country index. Filter the summaries in your app: the static server does not perform searches from query strings.

```javascript
const base = new URL("https://your-host.example/api/v2/");
async function read(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()).data;
}

const states = await read("countries/br/states.json");
const state = states.find(item => item.name === "São Paulo");
const cities = state ? await read(`countries/br/states/${state.path_key}/cities.json`) : [];

const index = await read("countries/br/cities/index.json");
const pages = await Promise.all(index.map(page => read(page.filename)));
const query = "Sao Paulo".toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const matches = pages.flat().filter(city => city.name_normalized.includes(query));
console.log(cities, matches);
```

This normalization folds combining marks; it is not full transliteration. Read the [endpoint reference](docs/ENDPOINTS.md) and [data structure](docs/DATA_STRUCTURE.md) for more detail.

## Separate npm packages

- `geo-data-api` is the data and generator package. Its generated v2 files can also be hosted directly.
- `geo-data-api-client` is a small, dependency-free CommonJS fetch client with TypeScript declarations. Its methods return unwrapped data; unknown single resources return `null` on 404, while missing collection files and other HTTP errors reject.

The two packages have separate release lifecycles. The repository changes do **not** publish either package: a maintainer must publish each intended version before it is available through npm or a package CDN. Pin an actual published version when consuming one; inspect the package contents before release with `npm run check:package` and `npm pack --dry-run`.

The data package contains more than 150,000 individual city files, so installing it can take several minutes and use substantial disk space. The client package avoids that installation by fetching the files an application needs from a hosted API.

The data package does not include the original `db/` source snapshot. To use its generator after installation, supply your own directory containing `countries.json`, `states.json`, and `cities.json`:

```sh
npx geo-data-api --input ./my-dataset --output ./generated-api
```

After publishing and installing the client, for example:

```javascript
const { createGeoClient } = require("geo-data-api-client");
async function main() {
  const client = createGeoClient({ baseUrl: "https://your-host.example/api/v2/" });
  const countries = await client.getCountries();
  const states = await client.getStates("BR");
  const cities = states.length ? await client.getCities("BR", states[0].path_key) : [];
  const matches = await client.searchCities("BR", "Sao Paulo");
  const city = await client.getCity(57995); // null when this ID is absent
  console.log(countries, cities, matches, city);
}
main().catch(console.error);
```

The client also exposes `getCountry(iso2)` and `getState(iso2, state)`. Calling `getCities(iso2)` or searching without a state follows every country page.

## Docker and Dokploy

```sh
docker compose -f compose.yaml up --build -d
```

The local `compose.yaml` exposes the service on `127.0.0.1:3000` by default. Set `GEO_DATA_HOST_PORT` to choose a different host port; the container still listens on port **3000**. Stop it with `docker compose -f compose.yaml down`. The image builds the dataset and serves the website and API as a non-root user. Rebuild the image after changing the source data.

For Dokploy, use the [Dokploy Compose file](docker-compose.yml), select the `geo-data-api` service and point its domain at container port **3000**. See the [step-by-step Dokploy deployment guide](docs/DOKPLOY.md) for DNS, HTTPS, updates and troubleshooting.

The included server and deployment headers require revalidation for mutable `/api/v2/` URLs. For immutable CDN caching, use an exact published package version. `npm run build:compress` can generate `.gz` and `.br` JSON siblings; a host must be configured to negotiate those files because the included Node server does not select them automatically.

The optional `npm run deploy:s3` command does not delete remote files. Use a new versioned S3 prefix for each snapshot, or separately reconcile removed files and compressed variants before switching traffic; otherwise older records can remain available.

## Source and reproducible releases

The checked-in source snapshot comes from [dr5hn/countries-states-cities-database](https://github.com/dr5hn/countries-states-cities-database). Review the upstream license, attribution requirements and update notes when replacing the dataset. Updates are deliberate: replace all three source JSON files as a coherent snapshot, select a release timestamp, build, verify, and review the resulting manifest before publishing or deploying.

`meta.generated_at` is the stable dataset release time, not the wall-clock time of each build. The checked-in snapshot defaults to `2025-09-12T09:30:16.000Z`; set `SOURCE_DATE_EPOCH` to a Unix timestamp in seconds when preparing a different release. With the same source, generator, runtime, options and release timestamp, output bytes are reproducible. The manifest records the source hash and release timestamp and checksums the output files; `build-report.json` records source validation. Builds stage and verify the generated output before replacement.

## Project links

- [Documentation](docs/README.md)
- [GitHub repository](https://github.com/azadshaikh/geo-data-api)
- [MIT License](LICENSE)
