/** Coordinates are numbers in compact output when parseable and source strings in pretty output. */
export type Coordinate = number | string | null;

export interface CountryTimezone {
  zoneName?: string;
  gmtOffset?: number;
  gmtOffsetName?: string;
  abbreviation?: string;
  tzName?: string;
}

export interface CountryListItem {
  id: number;
  name: string;
  iso2?: string | null;
  phonecode?: string | null;
}

export interface Country extends CountryListItem {
  iso3?: string | null;
  numeric_code?: string | null;
  capital?: string | null;
  currency?: string | null;
  currency_name?: string | null;
  currency_symbol?: string | null;
  tld?: string | null;
  native?: string | null;
  region?: string | null;
  region_id?: number | null;
  subregion?: string | null;
  subregion_id?: number | null;
  nationality?: string | null;
  timezones?: CountryTimezone[] | null;
  translations?: Record<string, string | null> | null;
  latitude?: Coordinate;
  longitude?: Coordinate;
  emoji?: string | null;
  emojiU?: string | null;
}

export interface CountryGroupItem {
  id: number;
  name: string;
  iso2?: string | null;
  iso3?: string | null;
  capital?: string | null;
  currency?: string | null;
  currency_symbol?: string | null;
  region?: string | null;
  subregion?: string | null;
  emoji?: string | null;
  emojiU?: string | null;
}

export interface RegionIndexItem {
  region: string;
  region_id?: number | null;
  country_count: number;
  /** Path relative to the API base URL. */
  endpoint: string;
}

export interface StateListItem {
  id: number;
  name: string;
  iso2?: string | null;
  iso3166_2?: string | null;
}

export interface State extends StateListItem {
  country_id?: number | null;
  country_code?: string | null;
  country_name?: string | null;
  fips_code?: string | null;
  type?: string | null;
  level?: string | number | null;
  parent_id?: string | number | null;
  latitude?: Coordinate;
  longitude?: Coordinate;
  timezone?: string | null;
}

export interface StateGroupItem {
  id: number;
  name: string;
  country_id?: number | null;
  country_code?: string | null;
  country_name?: string | null;
  iso2?: string | null;
  type?: string | null;
  latitude?: Coordinate;
  longitude?: Coordinate;
  timezone?: string | null;
}

export interface StateTypeIndexItem {
  type: string;
  state_count: number;
  country_count: number;
  endpoint: string;
}

export interface StateTimezoneIndexItem {
  timezone: string;
  state_count: number;
  country_count: number;
  /** Use this relative path: collisions may require a suffix. */
  endpoint: string;
}

export interface CityListItem {
  id: number;
  name: string;
  iso2?: string | null;
  latitude?: Coordinate;
  longitude?: Coordinate;
  wikiDataId?: string | null;
}

/** City details; fields not supplied by the source can be omitted or null. */
export interface City extends CityListItem {
  state_id?: number | null;
  state_code?: string | null;
  state_name?: string | null;
  state_type?: string | null;
  country_id?: number | null;
  country_code?: string | null;
  country_name?: string | null;
  country_iso2?: string | null;
  country_iso3?: string | null;
  timezone?: string | null;
  has_coordinates?: boolean;
  has_wikidata?: boolean;
  has_timezone?: boolean;
}

export interface CityBatchItem extends City {
  has_coordinates: boolean;
  has_wikidata: boolean;
  has_timezone: boolean;
}

export interface CityTimezoneItem extends CityListItem {
  state_name?: string | null;
  country_name?: string | null;
}

export interface CityTimezoneIndexItem {
  timezone: string;
  city_count: number;
  /** Use this relative path: collisions may require a suffix. */
  endpoint: string;
}

export interface CountryCityShardIndexItem {
  /** Path relative to the API base URL. */
  filename: string;
  count: number;
}

/** The search fold is lowercase Unicode NFD with combining marks removed. */
export interface SearchCountry {
  id: number;
  name: string;
  name_normalized: string;
  iso2?: string | null;
  iso3?: string | null;
  native?: string | null;
  capital?: string | null;
  currency?: string | null;
  currency_name?: string | null;
  region?: string | null;
  subregion?: string | null;
  emoji?: string | null;
  translations: Array<string | null>;
}

export interface SearchState {
  id: number;
  name: string;
  name_normalized: string;
  iso2: string | null;
  country_id?: number | null;
  country_name?: string | null;
  country_iso2?: string | null;
  country_code?: string | null;
  type?: string | null;
  timezone?: string | null;
}

export interface SearchCity {
  id: number;
  name: string;
  name_normalized: string;
  state_id?: number | null;
  state_name?: string | null;
  state_code?: string | null;
  country_id?: number | null;
  country_name?: string | null;
  country_code?: string | null;
  wikiDataId?: string | null;
}

export interface CitySearchShardIndexItem {
  country_code: string | null;
  country_name: string | null;
  count: number;
  /** Path relative to the API base URL. */
  filename: string;
}

export interface CombinedCountry {
  type: "country";
  id: number;
  name: string;
  name_normalized: string;
  iso2?: string | null;
  emoji?: string | null;
}

export interface CombinedState {
  type: "state";
  id: number;
  name: string;
  name_normalized: string;
  country_name?: string | null;
}

export interface CombinedCity {
  type: "city";
  id: number;
  name: string;
  name_normalized: string;
  state_name?: string | null;
  country_name?: string | null;
}

export interface SearchCount {
  returned: number;
  total: number;
  complete: boolean;
}

export interface CombinedData {
  countries: CombinedCountry[];
  states: CombinedState[];
  cities: CombinedCity[];
}

export interface BatchIndexItem {
  /** Path relative to the API base URL, including cities/batch/. */
  filename: string;
  start_id: number;
  end_id: number;
  count: number;
}

export interface ResponseMeta {
  type: string;
  count: number;
  generated_at: string;
  api_version: string;
  [key: string]: unknown;
}

export interface SearchMeta extends ResponseMeta {
  searchable_fields: string[];
  name_normalization: string;
}

export interface CitySearchShardMeta extends SearchMeta {
  country_code: string | null;
  country_name: string | null;
  total_cities: number;
}

export interface CombinedMeta extends ResponseMeta {
  name_normalization: string;
  complete: boolean;
  counts: { countries: SearchCount; states: SearchCount; cities: SearchCount };
}

export interface CityBatchMeta {
  type: "cities_batch";
  batch_range: string;
  cities_count: number;
  usage: string;
  api_version: string;
  generated_at: string;
}

export interface CityBatchIndexMeta {
  type: "batch_index";
  total_batches: number;
  cities_per_batch: number;
  total_cities: number;
  usage: string;
  api_version: string;
  generated_at: string;
}

export interface DataResponse<T, M = ResponseMeta> {
  data: T;
  meta: M;
}

export type CountryListResponse = DataResponse<CountryListItem[]>;
export type CountryResponse = DataResponse<Country>;
export type CountryGroupResponse = DataResponse<CountryGroupItem[]>;
export type RegionIndexResponse = DataResponse<RegionIndexItem[]>;
export type StateListResponse = DataResponse<StateListItem[]>;
export type StateResponse = DataResponse<State>;
export type StateGroupResponse = DataResponse<StateGroupItem[]>;
export type StateTypeIndexResponse = DataResponse<StateTypeIndexItem[]>;
export type StateTimezoneIndexResponse = DataResponse<StateTimezoneIndexItem[]>;
export type CityListResponse = DataResponse<CityListItem[]>;
export type CountryCityShardIndexResponse = DataResponse<
  CountryCityShardIndexItem[],
  ResponseMeta & {
    country_id: number;
    country_iso2?: string;
    city_count: number;
    shard_size: number;
  }
>;
export type CityTimezoneResponse = DataResponse<CityTimezoneItem[]>;
export type CityTimezoneIndexResponse = DataResponse<CityTimezoneIndexItem[]>;
export type CountrySearchResponse = DataResponse<SearchCountry[], SearchMeta>;
export type StateSearchResponse = DataResponse<SearchState[], SearchMeta>;
export type CitySearchResponse = DataResponse<SearchCity[], SearchMeta>;
export type CitySearchShardResponse = DataResponse<
  SearchCity[],
  CitySearchShardMeta
>;
export type CitySearchShardIndexResponse = DataResponse<
  CitySearchShardIndexItem[],
  SearchMeta
>;
export type CombinedSearchResponse = DataResponse<CombinedData, CombinedMeta>;
export type CityBatchIndexResponse = DataResponse<
  BatchIndexItem[],
  CityBatchIndexMeta
>;
/** A batch range can contain gaps, so a lookup by ID can be undefined. */
export type CityBatchResponse = DataResponse<
  Partial<Record<string, CityBatchItem>>,
  CityBatchMeta
>;

export interface ManifestFile {
  /** Path relative to the API root; may name a compressed sidecar. */
  path: string;
  bytes: number;
  sha256: string;
  /** True when the builder owns this output; false for a preserved extra file. */
  generated: boolean;
}

export interface Manifest {
  schema_version: 1;
  api_version: string;
  dataset_version: string;
  /** Optional on older builds; identifies generator inputs for incremental builds. */
  build_fingerprint?: string;
  generator_version: string;
  generated_at: string;
  counts: { countries: number; states: number; cities: number };
  /** Includes the manifest, although files excludes it. */
  file_count: number;
  checksum_algorithm: "sha256";
  files: ManifestFile[];
}

/** Programmatic builds share generator configuration; run builds sequentially. */
export interface ProcessorOptions {
  inputDir?: string;
  outputDir?: string;
  pretty?: boolean;
  compress?: boolean;
  compressionThreshold?: number;
  countryShardSize?: number;
}

export class DataProcessor {
  constructor(options?: ProcessorOptions);
  run(): Promise<unknown>;
}
