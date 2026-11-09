# Geo-Data API client

A dependency-free CommonJS client for a static Geo-Data API v2 deployment. It uses the standard Fetch API and includes TypeScript declarations.

Install from this checkout with `npm install ./packages/client`, or install the `geo-data-api-client` package when it is published.

```js
const { createGeoClient } = require("geo-data-api-client");

const geo = createGeoClient({ baseUrl: "https://example.com/api/v2/" });

async function example() {
  const countries = await geo.getCountries();
  const india = await geo.getCountry("IN");
  const states = await geo.getStates("IN");

  // Use the published path key, which may differ from the subdivision code.
  const state = states[0];
  const stateDetails = await geo.getState("IN", state.path_key);
  const stateCities = await geo.getCities("IN", state.path_key);
  const matches = await geo.searchCities("IN", "kochi", state.path_key);
  const city = matches[0] ? await geo.getCity(matches[0].id) : null;

  return { countries, india, stateDetails, stateCities, matches, city };
}
```

`baseUrl` points to the v2 directory and can have or omit the trailing slash. Provide a Fetch API-compatible implementation as `fetch` if the runtime does not provide `globalThis.fetch`:

```js
const geo = createGeoClient({ baseUrl: "https://example.com/api/v2", fetch: myFetch });
```

Each method returns the response's `data` field. `getCountry`, `getState`, and `getCity` return `null` for a 404; missing collections, other HTTP errors, network errors, and invalid JSON reject. Country and state keys are lowercased for the static paths. City IDs are snapshot-specific non-negative integers or decimal strings; IDs are not guaranteed to stay the same across dataset updates.

`getCities(iso2)` follows the country index and fetches all its pages; for a state use `getCities(iso2, statePathKey)`. Both return city summaries, and `getCity(id)` returns the full detail. `searchCities(iso2, query, statePathKey?)` loads the relevant summaries and matches their normalized names locally. It lowercases, applies Unicode NFD, and removes combining marks; this folds accents but does not transliterate letters such as `ł`. An empty query matches every summary in the selected collection.
