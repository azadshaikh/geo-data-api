const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const validators = require("../generated/validators");

function validateRecord(type, value) {
  const validate = validators[type];
  if (!validate(value)) {
    const issue = validate.errors?.[0];
    throw new Error(
      `${type} ${value.id}: ${issue?.instancePath || "/"} ${issue?.message || "invalid value"}`,
    );
  }
  return value;
}

function normalizeName(value) {
  return typeof value === "string"
    ? value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
    : "";
}

function nullable(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function coordinate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid coordinate: ${label}`);
  return number;
}

function statePathKey(state) {
  const code =
    typeof state.iso2 === "string" ? state.iso2.trim().toLowerCase() : "";
  return code && /^[a-z0-9-]+$/.test(code) && !WINDOWS_DEVICE_NAME.test(code)
    ? code
    : `id-${state.id}`;
}

function countryRecord(country) {
  const iso2 = String(country.iso2 || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso2))
    throw new Error(`Invalid country ISO2: ${country.iso2}`);
  return {
    id: country.id,
    name: country.name,
    name_normalized: normalizeName(country.name),
    iso2,
    iso3: nullable(
      typeof country.iso3 === "string"
        ? country.iso3.toUpperCase()
        : country.iso3,
    ),
    numeric_code: nullable(country.numeric_code),
    phonecode: nullable(country.phonecode),
    capital: nullable(country.capital),
    currency: nullable(country.currency),
    currency_name: nullable(country.currency_name),
    currency_symbol: nullable(country.currency_symbol),
    tld: nullable(country.tld),
    native: nullable(country.native),
    region: nullable(country.region),
    region_id: nullable(country.region_id),
    subregion: nullable(country.subregion),
    subregion_id: nullable(country.subregion_id),
    nationality: nullable(country.nationality),
    timezones: Array.isArray(country.timezones)
      ? country.timezones.map((tz) => ({
          zone_name: nullable(tz.zone_name ?? tz.zoneName),
          gmt_offset: nullable(tz.gmt_offset ?? tz.gmtOffset),
          gmt_offset_name: nullable(tz.gmt_offset_name ?? tz.gmtOffsetName),
          abbreviation: nullable(tz.abbreviation),
          tz_name: nullable(tz.tz_name ?? tz.tzName),
        }))
      : [],
    translations:
      country.translations &&
      typeof country.translations === "object" &&
      !Array.isArray(country.translations)
        ? country.translations
        : {},
    latitude: coordinate(country.latitude, `country ${country.id} latitude`),
    longitude: coordinate(country.longitude, `country ${country.id} longitude`),
    emoji: nullable(country.emoji),
    emoji_u: nullable(country.emoji_u ?? country.emojiU),
  };
}

function stateRecord(state, country) {
  if (!country) throw new Error(`State ${state.id} has no country`);
  return {
    id: state.id,
    name: state.name,
    name_normalized: normalizeName(state.name),
    country_id: country.id,
    country_code: country.iso2,
    country_name: country.name,
    iso2: nullable(
      typeof state.iso2 === "string" ? state.iso2.toUpperCase() : state.iso2,
    ),
    iso3166_2: nullable(
      typeof state.iso3166_2 === "string"
        ? state.iso3166_2.toUpperCase()
        : state.iso3166_2,
    ),
    path_key: statePathKey(state),
    fips_code: nullable(state.fips_code),
    type: nullable(state.type),
    level: nullable(state.level),
    parent_id: nullable(state.parent_id),
    latitude: coordinate(state.latitude, `state ${state.id} latitude`),
    longitude: coordinate(state.longitude, `state ${state.id} longitude`),
    timezone: nullable(state.timezone),
  };
}

function cityRecord(city, state, country) {
  if (!state || !country)
    throw new Error(`City ${city.id} has missing parents`);
  return {
    id: city.id,
    name: city.name,
    name_normalized: normalizeName(city.name),
    state_id: state.id,
    state_code: state.iso2,
    state_name: state.name,
    state_path_key: state.path_key,
    country_id: country.id,
    country_code: country.iso2,
    country_name: country.name,
    latitude: coordinate(city.latitude, `city ${city.id} latitude`),
    longitude: coordinate(city.longitude, `city ${city.id} longitude`),
    timezone: nullable(city.timezone),
    wikidata_id: nullable(city.wikidata_id ?? city.wikiDataId),
  };
}

function citySummary(city) {
  const {
    id,
    name,
    name_normalized,
    state_id,
    state_code,
    state_name,
    state_path_key,
    country_id,
    country_code,
    country_name,
  } = city;
  return {
    id,
    name,
    name_normalized,
    state_id,
    state_code,
    state_name,
    state_path_key,
    country_id,
    country_code,
    country_name,
  };
}

function normalizeDataset(countries, states, cities) {
  const normalizedCountries = countries.map((country) =>
    validateRecord("Country", countryRecord(country)),
  );
  const countriesById = new Map(
    normalizedCountries.map((country) => [country.id, country]),
  );
  const normalizedStates = states.map((state) =>
    validateRecord(
      "State",
      stateRecord(state, countriesById.get(state.country_id)),
    ),
  );
  const paths = new Map();
  for (const state of normalizedStates) {
    const key = `${state.country_code.toLowerCase()}/${state.path_key}`;
    if (paths.has(key))
      throw new Error(
        `State path collision: ${key} (${paths.get(key)} and ${state.id})`,
      );
    paths.set(key, state.id);
  }
  const statesById = new Map(
    normalizedStates.map((state) => [state.id, state]),
  );
  const normalizedCities = cities.map((city) =>
    validateRecord(
      "City",
      cityRecord(
        city,
        statesById.get(city.state_id),
        countriesById.get(city.country_id),
      ),
    ),
  );
  return {
    countries: normalizedCountries,
    states: normalizedStates,
    cities: normalizedCities,
  };
}

module.exports = {
  normalizeName,
  statePathKey,
  countryRecord,
  stateRecord,
  cityRecord,
  citySummary,
  normalizeDataset,
};
