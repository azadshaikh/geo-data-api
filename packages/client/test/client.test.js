const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createGeoClient } = require("../index.js");

const baseUrl = "https://example.test/api/v2";

function fixtureFetch(routes) {
  return async (url) => {
    if (!Object.hasOwn(routes, url)) return new Response(null, { status: 404 });
    const data = routes[url];
    return new Response(
      JSON.stringify({
        data,
        meta: {
          type: "fixture",
          count: Array.isArray(data) ? data.length : 1,
          api_version: "v2",
          generated_at: "2026-11-09T00:00:00Z",
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  };
}

test("loads unwrapped countries when the API base has no trailing slash", async () => {
  assert.equal(typeof createGeoClient, "function");
  const client = createGeoClient({
    baseUrl,
    fetch: fixtureFetch({
      "https://example.test/api/v2/countries.json": [
        { id: 101, name: "India", name_normalized: "india", iso2: "IN" },
      ],
    }),
  });
  assert.deepEqual(await client.getCountries(), [
    { id: 101, name: "India", name_normalized: "india", iso2: "IN" },
  ]);
});

test("navigates country and state routes using lowercase keys and the published state path key", async () => {
  const country = {
    id: 232,
    name: "United Kingdom",
    name_normalized: "united kingdom",
    iso2: "GB",
  };
  const state = {
    id: 2312,
    name: "Cornwall",
    name_normalized: "cornwall",
    iso2: "CON",
    path_key: "id-2312",
  };
  const city = {
    id: 1,
    name: "Truro",
    name_normalized: "truro",
    state_id: 2312,
    state_code: "CON",
    state_name: "Cornwall",
    state_path_key: "id-2312",
    country_id: 232,
    country_code: "GB",
    country_name: "United Kingdom",
  };
  const fullCity = {
    ...city,
    latitude: 50.265,
    longitude: -5.052,
    timezone: null,
    wikidata_id: null,
  };
  const client = createGeoClient({
    baseUrl: `${baseUrl}/`,
    fetch: fixtureFetch({
      "https://example.test/api/v2/countries/gb.json": country,
      "https://example.test/api/v2/countries/gb/states.json": [state],
      "https://example.test/api/v2/countries/gb/states/id-2312.json": state,
      "https://example.test/api/v2/countries/gb/states/id-2312/cities.json": [
        city,
      ],
      "https://example.test/api/v2/cities/1.json": fullCity,
    }),
  });

  assert.deepEqual(await client.getCountry("Gb"), country);
  assert.deepEqual(await client.getStates("GB"), [state]);
  assert.deepEqual(await client.getState("gB", "ID-2312"), state);
  assert.deepEqual(await client.getCities("GB", state.path_key), [city]);
  assert.deepEqual(await client.getCity(1), fullCity);
  assert.deepEqual(await client.getCity("1"), fullCity);
  assert.deepEqual(await client.getCity("0001"), fullCity);
});

test("returns null only for missing single-resource details", async () => {
  const client = createGeoClient({ baseUrl, fetch: fixtureFetch({}) });
  assert.equal(await client.getCountry("ZZ"), null);
  assert.equal(await client.getState("ZZ", "NONE"), null);
  assert.equal(await client.getCity(999), null);
  await assert.rejects(client.getCountries(), /404/);
  await assert.rejects(client.getStates("ZZ"), /404/);
  await assert.rejects(client.getCities("ZZ", "NONE"), /404/);
});

test("rejects other HTTP errors and propagates network and JSON failures", async () => {
  const unavailable = createGeoClient({
    baseUrl,
    fetch: async () => new Response(null, { status: 503 }),
  });
  await assert.rejects(unavailable.getCountry("IN"), /503/);
  await assert.rejects(unavailable.getCities("IN", "KA"), /503/);

  const offline = new Error("network disconnected");
  const disconnected = createGeoClient({
    baseUrl,
    fetch: async () => {
      throw offline;
    },
  });
  await assert.rejects(disconnected.getCity(5), (error) => error === offline);

  const invalidJson = createGeoClient({
    baseUrl,
    fetch: async () => new Response("bad JSON"),
  });
  await assert.rejects(invalidJson.getCountries(), SyntaxError);
});

test("loads every country city page in index order and handles empty country indexes", async () => {
  const first = {
    id: 1,
    name: "São Paulo",
    name_normalized: "sao paulo",
    state_id: 1,
    state_code: "SP",
    state_name: "São Paulo",
    state_path_key: "sp",
    country_id: 1,
    country_code: "BR",
    country_name: "Brazil",
  };
  const second = {
    id: 2,
    name: "Rio",
    name_normalized: "rio",
    state_id: 2,
    state_code: "RJ",
    state_name: "Rio de Janeiro",
    state_path_key: "rj",
    country_id: 1,
    country_code: "BR",
    country_name: "Brazil",
  };
  const client = createGeoClient({
    baseUrl,
    fetch: fixtureFetch({
      "https://example.test/api/v2/countries/br/cities/index.json": [
        { filename: "countries/br/cities/1.json", count: 1 },
        { filename: "countries/br/cities/2.json", count: 1 },
      ],
      "https://example.test/api/v2/countries/br/cities/1.json": [first],
      "https://example.test/api/v2/countries/br/cities/2.json": [second],
      "https://example.test/api/v2/countries/aq/cities/index.json": [],
      "https://example.test/api/v2/countries/aq/states.json": [],
    }),
  });
  assert.deepEqual(await client.getCities("Br"), [first, second]);
  assert.deepEqual(await client.getCities("AQ"), []);
  assert.deepEqual(await client.getStates("AQ"), []);
});

test("rejects missing country city indexes and missing index pages", async () => {
  const client = createGeoClient({
    baseUrl,
    fetch: fixtureFetch({
      "https://example.test/api/v2/countries/br/cities/index.json": [
        { filename: "countries/br/cities/1.json", count: 1 },
      ],
    }),
  });
  await assert.rejects(client.getCities("ZZ"), /404/);
  await assert.rejects(client.getCities("BR"), /404/);
});

test("rejects unsafe page filenames without requesting them", async () => {
  const invalidNames = [
    "../secrets.json",
    "/countries/br/cities/1.json",
    "https://attacker.test/a.json",
    "countries/br/cities/../../secrets.json",
    "countries/br/cities/%2e%2e/1.json",
    "countries/us/cities/1.json",
    "countries/br/cities/1.json?token=x",
    "countries/br/cities/0.json",
    "countries/br/cities/1.json#part",
    "countries/br/cities/1.json\n",
  ];
  for (const filename of invalidNames) {
    const requested = [];
    const client = createGeoClient({
      baseUrl,
      fetch: async (url) => {
        requested.push(url);
        if (
          url === "https://example.test/api/v2/countries/br/cities/index.json"
        ) {
          return new Response(
            JSON.stringify({ data: [{ filename, count: 1 }], meta: {} }),
            { headers: { "content-type": "application/json" } },
          );
        }
        throw new Error("unsafe request escaped the index");
      },
    });
    await assert.rejects(client.getCities("BR"));
    assert.deepEqual(requested, [
      "https://example.test/api/v2/countries/br/cities/index.json",
    ]);
  }
});

test("searches all pages with the generator's Unicode folding and honors a state path key", async () => {
  const sao = { id: 1, name: "São Paulo", name_normalized: "sao paulo" };
  const izmir = { id: 2, name: "İzmir", name_normalized: "izmir" };
  const lodz = { id: 3, name: "Łódź", name_normalized: "łodz" };
  const tokyo = { id: 4, name: "東京", name_normalized: "東京" };
  const client = createGeoClient({
    baseUrl,
    fetch: fixtureFetch({
      "https://example.test/api/v2/countries/br/cities/index.json": [
        { filename: "countries/br/cities/1.json", count: 2 },
        { filename: "countries/br/cities/2.json", count: 2 },
      ],
      "https://example.test/api/v2/countries/br/cities/1.json": [sao, izmir],
      "https://example.test/api/v2/countries/br/cities/2.json": [lodz, tokyo],
      "https://example.test/api/v2/countries/br/states/id-12/cities.json": [
        sao,
      ],
    }),
  });
  const { searchCities } = client;
  assert.deepEqual(await searchCities("BR", "SA\u0303O"), [sao]);
  assert.deepEqual(await searchCities("BR", "  Sao  "), [sao]);
  assert.deepEqual(await searchCities("BR", "İZMİR"), [izmir]);
  assert.deepEqual(await searchCities("BR", "ŁÓDŹ"), [lodz]);
  assert.deepEqual(await searchCities("BR", "LODZ"), []);
  assert.deepEqual(await searchCities("BR", "東京"), [tokyo]);
  assert.deepEqual(await searchCities("BR", "S\u1AB0AO", "ID-12"), [sao]);
  assert.deepEqual(await searchCities("BR", "", "id-12"), [sao]);
});

test("rejects unsafe route keys and malformed IDs before making a request", async () => {
  const requests = [];
  const client = createGeoClient({
    baseUrl,
    fetch: async (url) => {
      requests.push(url);
      return new Response(null, { status: 404 });
    },
  });

  for (const value of [
    "",
    "IN/..",
    "../",
    "i%6e",
    "İN",
    "U S",
    "IN\n",
    123,
    null,
  ]) {
    await assert.rejects(client.getCountry(value), TypeError);
  }
  for (const value of [
    "",
    ".",
    "..",
    "../cities",
    "%2e%2e",
    "A/B",
    "A\\B",
    "A?B",
    "A#B",
    "A\n",
    null,
  ]) {
    await assert.rejects(client.getState("IN", value), TypeError);
    await assert.rejects(client.getCities("IN", value), TypeError);
  }
  for (const value of [
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "",
    "-1",
    "1.0",
    "1e3",
    "../1",
    "1/2",
    "1?x",
    "1\n",
    null,
    false,
    {},
  ]) {
    await assert.rejects(client.getCity(value), TypeError);
  }
  await assert.rejects(client.searchCities("IN", null), TypeError);
  assert.deepEqual(requests, []);
});

test("uses the global fetch when no override is provided", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const fetchFixture = fixtureFetch({
      "https://example.test/api/v2/countries.json": [],
    });
    globalThis.fetch = function (url) {
      "use strict";
      assert.equal(this, globalThis);
      return fetchFixture(url);
    };
    assert.deepEqual(await createGeoClient({ baseUrl }).getCountries(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("search rejects if a country or state collection is missing", async () => {
  const client = createGeoClient({ baseUrl, fetch: fixtureFetch({}) });
  await assert.rejects(client.searchCities("ZZ", "a"), /404/);
  await assert.rejects(client.searchCities("ZZ", "a", "none"), /404/);
});
