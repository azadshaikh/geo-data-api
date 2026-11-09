import {
  createGeoClient,
  type City,
  type CitySummary,
  type Country,
  type State,
} from "../index";

const client = createGeoClient({
  baseUrl: "https://example.com/api/v2",
  fetch: globalThis.fetch,
});
const countries: Promise<Country[]> = client.getCountries();
const country: Promise<Country | null> = client.getCountry("IN");
const states: Promise<State[]> = client.getStates("IN");
const state: Promise<State | null> = client.getState("IN", "id-2312");
const cities: Promise<CitySummary[]> = client.getCities("IN", "id-2312");
const search: Promise<CitySummary[]> = client.searchCities("IN", "kochi");
const city: Promise<City | null> = client.getCity(1);

void [countries, country, states, state, cities, search, city];

// @ts-expect-error A city ID cannot be an object.
client.getCity({ id: 1 });
// @ts-expect-error Search queries must be strings.
client.searchCities("IN", 42);
