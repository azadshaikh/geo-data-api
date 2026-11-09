function countryKey(value) {
  if (typeof value !== "string" || !/^[a-z]{2}$/i.test(value)) {
    throw new TypeError("Country code must be a two-letter ISO2 code");
  }
  return value.toLowerCase();
}

function stateKey(value) {
  if (typeof value !== "string" || !/^[a-z0-9-]+$/i.test(value)) {
    throw new TypeError("State must be a valid state path key");
  }
  return value.toLowerCase();
}

function cityKey(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(
        "City ID must be a non-negative safe integer or decimal string",
      );
    }
    return String(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return value.replace(/^0+(?=\d)/, "");
  }
  throw new TypeError(
    "City ID must be a non-negative safe integer or decimal string",
  );
}

function createGeoClient({ baseUrl, fetch: fetchOption } = {}) {
  const base = new URL(baseUrl);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const fetcher =
    fetchOption ??
    (typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : globalThis.fetch);
  if (typeof fetcher !== "function")
    throw new TypeError("A fetch implementation is required");

  async function get(path, missingIsNull = false) {
    const response = await fetcher(new URL(path, base).href);
    if (missingIsNull && response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `Geo-Data API request failed with HTTP ${response.status}`,
      );
    return (await response.json()).data;
  }

  async function getCities(iso2, state) {
    const country = countryKey(iso2);
    if (state !== undefined) {
      return get(`countries/${country}/states/${stateKey(state)}/cities.json`);
    }

    const index = await get(`countries/${country}/cities/index.json`);
    if (!Array.isArray(index)) throw new TypeError("Invalid city page index");
    const filenamePattern = new RegExp(
      `^countries/${country}/cities/[1-9][0-9]*\\.json$`,
    );
    for (const entry of index) {
      if (
        typeof entry?.filename !== "string" ||
        !filenamePattern.test(entry.filename)
      ) {
        throw new TypeError("Invalid city page filename");
      }
    }
    const pages = await Promise.all(
      index.map(async ({ filename }) => {
        const page = await get(filename);
        if (!Array.isArray(page)) throw new TypeError("Invalid city page");
        return page;
      }),
    );
    return pages.flat();
  }

  return {
    getCountries: () => get("countries.json"),
    async getCountry(iso2) {
      return get(`countries/${countryKey(iso2)}.json`, true);
    },
    async getStates(iso2) {
      return get(`countries/${countryKey(iso2)}/states.json`);
    },
    async getState(iso2, state) {
      return get(
        `countries/${countryKey(iso2)}/states/${stateKey(state)}.json`,
        true,
      );
    },
    getCities,
    async getCity(id) {
      return get(`cities/${cityKey(id)}.json`, true);
    },
    async searchCities(iso2, query, state) {
      if (typeof query !== "string")
        throw new TypeError("Search query must be a string");
      const normalized = query
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
      return (await getCities(iso2, state)).filter((city) =>
        city.name_normalized.includes(normalized),
      );
    },
  };
}

module.exports = { createGeoClient };
