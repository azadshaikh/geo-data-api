// This is the single route inventory used by OpenAPI and the discovery files.
// Paths and examples are relative to the API base URL.
const routes = [
  {
    group: "countries",
    key: "list",
    operationId: "getCountries",
    path: "countries.json",
    response: "CountryListResponse",
    summary: "List countries",
    example: "countries.json",
  },
  {
    group: "countries",
    key: "individual",
    operationId: "getCountry",
    path: "countries/{iso2}.json",
    response: "CountryResponse",
    summary: "Get a country",
    example: "countries/in.json",
  },
  {
    group: "countries",
    key: "regions_index",
    operationId: "getRegions",
    path: "countries/regions.json",
    response: "RegionIndexResponse",
    summary: "List available regions",
    example: "countries/regions.json",
  },
  {
    group: "countries",
    key: "by_region",
    operationId: "getCountriesByRegion",
    path: "countries/region/{region}.json",
    response: "CountryListResponse",
    summary: "List countries in a region",
    example: "countries/region/asia.json",
  },
  {
    group: "countries",
    key: "by_subregion",
    operationId: "getCountriesBySubregion",
    path: "countries/subregion/{subregion}.json",
    response: "CountryListResponse",
    summary: "List countries in a subregion",
    example: "countries/subregion/southern-asia.json",
  },
  {
    group: "states",
    key: "by_country",
    operationId: "getStates",
    path: "countries/{iso2}/states.json",
    response: "StateListResponse",
    summary: "List states in a country",
    example: "countries/in/states.json",
  },
  {
    group: "states",
    key: "individual",
    operationId: "getState",
    path: "countries/{iso2}/states/{state}.json",
    response: "StateResponse",
    summary: "Get a state",
    example: "countries/in/states/mp.json",
  },
  {
    group: "states",
    key: "all",
    operationId: "getAllStates",
    path: "states/all.json",
    response: "StateListResponse",
    summary: "List all states",
    example: "states/all.json",
  },
  {
    group: "states",
    key: "types_index",
    operationId: "getStateTypes",
    path: "states/types.json",
    response: "StateTypeIndexResponse",
    summary: "List available state types",
    example: "states/types.json",
  },
  {
    group: "states",
    key: "by_type",
    operationId: "getStatesByType",
    path: "states/type/{type}.json",
    response: "StateListResponse",
    summary: "List states by type",
    example: "states/type/province.json",
  },
  {
    group: "states",
    key: "timezones_index",
    operationId: "getStateTimezones",
    path: "states/timezones.json",
    response: "StateTimezoneIndexResponse",
    summary: "List available state timezones",
    description:
      "Follow each index entry's endpoint: filename collisions can require a suffix.",
    example: "states/timezones.json",
  },
  {
    group: "states",
    key: "by_timezone",
    operationId: "getStatesByTimezone",
    path: "states/timezone/{timezone}.json",
    response: "StateListResponse",
    summary: "List states by timezone",
    description: "Use the endpoint from the state timezone index.",
    example: "states/timezone/Asia-Kolkata.json",
  },
  {
    group: "cities",
    key: "by_state",
    operationId: "getCitiesByState",
    path: "countries/{iso2}/states/{state}/cities.json",
    response: "CitySummaryListResponse",
    summary: "List city summaries in a state",
    example: "countries/in/states/mp/cities.json",
  },
  {
    group: "cities",
    key: "country_pages_index",
    operationId: "getCountryCityPageIndex",
    path: "countries/{iso2}/cities/index.json",
    response: "CountryCityPageIndexResponse",
    summary: "List country city pages",
    description:
      "Every country has an index, including empty countries. Follow the filenames relative to the API base.",
    example: "countries/in/cities/index.json",
  },
  {
    group: "cities",
    key: "country_page",
    operationId: "getCountryCityPage",
    path: "countries/{iso2}/cities/{page}.json",
    response: "CitySummaryListResponse",
    summary: "Get a country city page",
    description: "Pages start at 1 and contain city summaries.",
    example: "countries/in/cities/1.json",
  },
  {
    group: "cities",
    key: "individual",
    operationId: "getCity",
    path: "cities/{id}.json",
    response: "CityResponse",
    summary: "Get a city by numeric ID",
    example: "cities/57995.json",
  },
  {
    group: "cities",
    key: "timezones_index",
    operationId: "getCityTimezones",
    path: "cities/timezones.json",
    response: "CityTimezoneIndexResponse",
    summary: "List available city timezones",
    description:
      "Generated only when cities have source timezone data. Follow index endpoints to account for filename collisions.",
    example: "cities/timezones.json",
    condition: "cityTimezones",
  },
  {
    group: "cities",
    key: "by_timezone",
    operationId: "getCitiesByTimezone",
    path: "cities/timezone/{timezone}.json",
    response: "CitySummaryListResponse",
    summary: "List cities by timezone",
    description:
      "Generated only when cities have source timezone data. Use the endpoint from the city timezone index.",
    example: "cities/timezone/Asia-Kolkata.json",
    condition: "cityTimezones",
  },
  {
    group: "search",
    key: "countries",
    operationId: "getCountrySearch",
    path: "search/countries.json",
    response: "CountryListResponse",
    summary: "Get country search records",
    example: "search/countries.json",
  },
  {
    group: "search",
    key: "states",
    operationId: "getStateSearch",
    path: "search/states.json",
    response: "StateListResponse",
    summary: "Get state search records",
    example: "search/states.json",
  },
  {
    group: "search",
    key: "cities",
    operationId: "getGlobalCityIndex",
    path: "search/cities/index.json",
    response: "GlobalCityIndexResponse",
    summary: "Get the global country city-index catalog",
    description:
      "The index covers every country; fetch a country's page index and pages to search its city summaries.",
    example: "search/cities/index.json",
  },
  {
    group: "discovery",
    key: "api_info",
    operationId: "getApiInfo",
    path: "api-info.json",
    response: "ApiInfo",
    summary: "Get API discovery information",
    example: "api-info.json",
  },
  {
    group: "discovery",
    key: "documentation",
    operationId: "getDocumentation",
    path: "documentation.json",
    response: "Documentation",
    summary: "Get machine-readable documentation",
    example: "documentation.json",
  },
  {
    group: "discovery",
    key: "manifest",
    operationId: "getManifest",
    path: "manifest.json",
    response: "Manifest",
    summary: "Get the build manifest",
    example: "manifest.json",
  },
  {
    group: "discovery",
    key: "build_report",
    operationId: "getBuildReport",
    path: "build-report.json",
    response: "BuildReport",
    summary: "Get the source validation report",
    example: "build-report.json",
  },
];

const parameters = {
  iso2: {
    description: "Lowercase two-letter country ISO 3166-1 alpha-2 code.",
    schema: { type: "string", pattern: "^[a-z]{2}$" },
  },
  state: {
    description:
      "Country-local lowercase state path_key from the state record; unavailable or unsafe codes use id-{numeric-id}.",
    schema: { type: "string", pattern: "^[a-z0-9-]+$" },
  },
  page: {
    description: "Country city page number, starting at 1.",
    schema: { type: "integer", minimum: 1 },
  },
  id: {
    description: "Non-negative numeric city source ID.",
    schema: { type: "integer", minimum: 0 },
  },
  region: { description: "Region filename key.", schema: { type: "string" } },
  subregion: {
    description: "Subregion filename key.",
    schema: { type: "string" },
  },
  type: { description: "State type filename key.", schema: { type: "string" } },
  timezone: {
    description:
      "Filename key from the relevant timezone index; collisions can require a suffix.",
    schema: { type: "string" },
  },
};

function getRoutes({ cityTimezones = true } = {}) {
  return routes.filter(
    (route) => route.condition !== "cityTimezones" || cityTimezones,
  );
}

const pathPatterns = {
  iso2: "[a-z]{2}",
  state: "[a-z0-9-]+",
  page: "[0-9]+",
  id: "[0-9]+",
};
const routeMatchers = routes.map((route) => {
  const pattern = route.path
    .split(/(\{[^{}]+\})/g)
    .map((part) => {
      if (part.startsWith("{") && part.endsWith("}"))
        return pathPatterns[part.slice(1, -1)] || "[^/]+";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return { route, matcher: new RegExp(`^${pattern}$`, "i") };
});

function matchRoute(filename) {
  if (typeof filename !== "string") return null;
  return (
    routeMatchers.find(({ matcher }) => matcher.test(filename))?.route || null
  );
}

module.exports = { routes, parameters, getRoutes, matchRoute };
