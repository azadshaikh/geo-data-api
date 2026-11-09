import type { City, CitySummary, Country, State } from "./models";

export type { City, CitySummary, Country, State } from "./models";

/** The subset of a Fetch API response used by this client. */
export interface GeoFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): PromiseLike<unknown>;
}

/** Compatible with the standard Fetch API and injectable fetch implementations. */
export type GeoFetch = (url: string) => PromiseLike<GeoFetchResponse>;

export interface GeoClientOptions {
  /** Absolute URL of the API v2 directory, with or without a trailing slash. */
  baseUrl: string;
  /** Defaults to globalThis.fetch. */
  fetch?: GeoFetch;
}

export interface GeoClient {
  getCountries(): Promise<Country[]>;
  getCountry(iso2: string): Promise<Country | null>;
  getStates(iso2: string): Promise<State[]>;
  /** Pass the path_key from a State record. */
  getState(iso2: string, state: string): Promise<State | null>;
  /** Country-wide requests load all pages; state requests load a single list. */
  getCities(iso2: string, state?: string): Promise<CitySummary[]>;
  getCity(id: number | string): Promise<City | null>;
  searchCities(
    iso2: string,
    query: string,
    state?: string,
  ): Promise<CitySummary[]>;
}

export function createGeoClient(options: GeoClientOptions): GeoClient;
