#!/usr/bin/env node

// Verify the published output itself, without requiring source data or npm
// dependencies. Paths in indexes are API-root-relative, never filesystem URLs.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");

const REQUIRED_FILES = [
  "countries.json",
  "countries/regions.json",
  "states/all.json",
  "states/types.json",
  "states/timezones.json",
  "cities/batches.json",
  "search/countries.json",
  "search/states.json",
  "search/cities.json",
  "search/cities/index.json",
  "search/combined-sample.json",
  "search/combined.json",
  "api-info.json",
  "documentation.json",
];

const INFO_ENDPOINTS = {
  countries: {
    list: "countries.json",
    individual: "countries/{iso2}.json",
    by_region: "countries/region/{region-name}.json",
    by_subregion: "countries/subregion/{subregion-name}.json",
    regions_index: "countries/regions.json",
  },
  states: {
    all: "states/all.json",
    individual: "states/{iso3166_2}.json",
    by_country: "states/country/{country_iso2}.json",
    by_type: "states/type/{type-name}.json",
    by_timezone: "states/timezone/{timezone-name}.json",
    types_index: "states/types.json",
    timezones_index: "states/timezones.json",
  },
  cities: {
    by_country: "cities/country/{country_iso2}.json",
    by_state: "cities/state/{state_iso3166_2}.json",
    batches: "cities/batches.json",
    batch: "cities/batch/{filename}",
  },
  search: {
    countries: "search/countries.json",
    states: "search/states.json",
    cities: "search/cities.json",
    city_shards_index: "search/cities/index.json",
    cities_by_country: "search/cities/country/{iso2}.json",
    combined_sample: "search/combined-sample.json",
    combined: "search/combined.json",
  },
};

const DOCUMENTATION_ENDPOINTS = {
  countries: [
    "GET /countries.json",
    "GET /countries/{iso2}.json",
    "GET /countries/region/{region}.json",
    "GET /countries/subregion/{subregion}.json",
    "GET /countries/regions.json",
  ],
  states: [
    "GET /states/all.json",
    "GET /states/{iso3166_2}.json",
    "GET /states/country/{country_iso2}.json",
    "GET /states/type/{type}.json",
    "GET /states/timezone/{timezone}.json",
    "GET /states/types.json",
    "GET /states/timezones.json",
  ],
  cities: [
    "GET /cities/country/{country_iso2}.json",
    "GET /cities/state/{state_iso3166_2}.json",
    "GET /cities/batches.json",
    "GET /cities/batch/{filename}",
  ],
  search: [
    "GET /search/countries.json",
    "GET /search/states.json",
    "GET /search/cities.json",
    "GET /search/cities/index.json",
    "GET /search/cities/country/{iso2}.json",
    "GET /search/combined-sample.json",
    "GET /search/combined.json",
  ],
};

function verifyOutput(
  outputDir = path.join(process.cwd(), "dist/api/v1"),
  options = {},
) {
  const root = path.resolve(outputDir);
  const errors = [];
  const files = new Set();
  const allFiles = new Set();
  const invalid = new Set();
  const missing = new Set();
  const physicalNames = new Map();
  const identities = new Map();
  let filesChecked = 0;

  const error = (message) => errors.push(message);
  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const validId = (id) => Number.isSafeInteger(id) && id >= 0;
  const checkCount = (label, actual, expected) => {
    if (!Number.isSafeInteger(actual) || actual !== expected) {
      error(`${label}: expected ${expected}, found ${JSON.stringify(actual)}`);
    }
  };

  function inspectArrayCounts(name, data) {
    if (!Array.isArray(data?.data)) return;
    if (!isObject(data.meta)) {
      error(`${name}: missing metadata for array data`);
      return;
    }
    if (name !== "cities/batches.json" || "count" in data.meta)
      checkCount(`${name} meta.count`, data.meta.count, data.data.length);
    if (name !== "search/cities/index.json" && name !== "cities/batches.json") {
      for (const key of ["total_countries", "total_states", "total_cities"]) {
        if (key in data.meta)
          checkCount(`${name} meta.${key}`, data.meta[key], data.data.length);
      }
    }
  }

  function scan(dir, prefix = "") {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      error(`${prefix || root}: cannot read directory: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        error(`${name}: symbolic links are not allowed in API output`);
      } else if (entry.isDirectory()) {
        scan(full, name);
      } else if (entry.isFile()) {
        allFiles.add(name);
        if (
          /^search\/cities\/country\/[^/]+\.json$/.test(name) &&
          options.maxSearchShardBytes !== undefined
        ) {
          const bytes = fs.statSync(full).size;
          if (bytes > options.maxSearchShardBytes)
            error(
              `${name}: search shard exceeds byte budget (${bytes} > ${options.maxSearchShardBytes} bytes)`,
            );
        }
        const lower = name.toLowerCase();
        if (physicalNames.has(lower) && physicalNames.get(lower) !== name) {
          error(
            `Filename collision: ${physicalNames.get(lower)} and ${name} differ only by case`,
          );
        }
        physicalNames.set(lower, name);
        if (!name.toLowerCase().endsWith(".json")) continue;
        files.add(name);
        filesChecked++;
        try {
          inspectArrayCounts(name, JSON.parse(fs.readFileSync(full, "utf8")));
        } catch (err) {
          invalid.add(name);
          error(`${name}: invalid JSON or unreadable file: ${err.message}`);
        }
      }
    }
  }

  function safePath(name, context) {
    if (
      typeof name !== "string" ||
      !name ||
      name.includes("\\") ||
      name.includes("\0") ||
      path.posix.isAbsolute(name) ||
      path.win32.isAbsolute(name) ||
      /^[a-z]:/i.test(name) ||
      name
        .split("/")
        .some((part) => part === ".." || part === "." || part === "")
    ) {
      error(`${context}: unsafe or invalid path ${JSON.stringify(name)}`);
      return false;
    }
    return true;
  }

  function read(name, context = "Required endpoint") {
    if (!safePath(name, context)) return null;
    if (!files.has(name)) {
      if (!missing.has(name)) error(`${context}: missing ${name}`);
      missing.add(name);
      return null;
    }
    if (invalid.has(name)) return null;
    try {
      return JSON.parse(
        fs.readFileSync(path.join(root, ...name.split("/")), "utf8"),
      );
    } catch (err) {
      error(`${name}: cannot read JSON: ${err.message}`);
      return null;
    }
  }

  function array(name, object) {
    if (object === null) return [];
    if (!Array.isArray(object?.data)) {
      error(`${name}: data must be an array`);
      return [];
    }
    return object.data;
  }

  function register(name, identity, context) {
    if (!safePath(name, context)) return;
    const key = name.toLowerCase();
    const previous = identities.get(key);
    if (previous && previous.identity !== identity) {
      error(
        `Filename collision: ${previous.identity} and ${identity} both reference ${name}`,
      );
    } else if (!previous) {
      identities.set(key, { identity });
    }
  }

  function idMap(items, label) {
    const map = new Map();
    for (const item of items) {
      if (!isObject(item) || !validId(item.id)) {
        error(`${label}: invalid record ID ${JSON.stringify(item?.id)}`);
      } else if (map.has(item.id)) {
        error(`${label}: duplicate ID ${item.id}`);
      } else {
        map.set(item.id, item);
      }
    }
    return map;
  }

  function compareIds(expected, actual, label) {
    const absent = [...expected.keys()].filter((id) => !actual.has(id));
    const extra = [...actual.keys()].filter((id) => !expected.has(id));
    if (absent.length || extra.length) {
      error(
        `${label} ID coverage mismatch: ${absent.length} missing (${absent.slice(0, 5).join(", ")}), ${extra.length} unexpected (${extra.slice(0, 5).join(", ")})`,
      );
    }
  }

  function indexReferences(name, field, countField, metaField, expectedGroups) {
    const index = read(name);
    const seen = new Set();
    for (const entry of array(name, index)) {
      if (!isObject(entry) || typeof entry[field] !== "string") {
        error(`${name}: invalid ${field} entry`);
        continue;
      }
      if (seen.has(entry[field]))
        error(`${name}: duplicate ${field} ${entry[field]}`);
      seen.add(entry[field]);
      const identity = `${field} ${entry[field]}`;
      register(entry.endpoint, identity, name);
      const target = read(entry.endpoint, `${name} ${identity}`);
      if (!target) continue;
      if (target.meta?.[metaField] !== entry[field]) {
        error(
          `${entry.endpoint}: meta.${metaField} is ${JSON.stringify(target.meta?.[metaField])}, expected ${JSON.stringify(entry[field])} from ${name}`,
        );
      }
      if (Array.isArray(target.data)) {
        checkCount(
          `${name} ${entry[field]} ${countField}`,
          entry[countField],
          target.data.length,
        );
        if (expectedGroups) {
          if (!expectedGroups.has(entry[field]))
            error(`${name}: unexpected ${identity}`);
          compareIds(
            idMap(
              expectedGroups.get(entry[field]) || [],
              `${identity} detail data`,
            ),
            idMap(target.data, entry.endpoint),
            entry.endpoint,
          );
        }
      } else error(`${entry.endpoint}: data must be an array`);
    }
    if (expectedGroups) {
      for (const key of expectedGroups.keys()) {
        if (!seen.has(key)) error(`${name}: missing ${field} ${key}`);
      }
    }
  }

  function groupedAdd(groups, key, item) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  function safeCountryName(country, fallback) {
    return (
      (country?.iso2 &&
        String(country.iso2)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")) ||
      String(fallback)
    );
  }
  function safeStateName(state, fallback) {
    return (
      (state?.iso3166_2 &&
        String(state.iso3166_2)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")) ||
      String(fallback)
    );
  }
  function safeDetailName(name, fallback) {
    return typeof name === "string" && name
      ? name
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      : String(fallback);
  }

  try {
    if (
      !fs.lstatSync(root).isDirectory() ||
      fs.lstatSync(root).isSymbolicLink()
    ) {
      error(`${root}: output root must be a real directory`);
      return { outputDir: root, filesChecked, errors };
    }
  } catch (err) {
    error(`${root}: cannot access output root: ${err.message}`);
    return { outputDir: root, filesChecked, errors };
  }
  scan(root);
  for (const name of REQUIRED_FILES) read(name);

  const info = read("api-info.json");
  const documentation = read("documentation.json");
  for (const [group, endpoints] of Object.entries(INFO_ENDPOINTS)) {
    for (const [key, value] of Object.entries(endpoints)) {
      if (info?.endpoints?.[group]?.[key] !== value)
        error(`api-info.json endpoints.${group}.${key}: expected ${value}`);
    }
  }
  for (const [group, endpoints] of Object.entries(DOCUMENTATION_ENDPOINTS)) {
    for (const endpoint of endpoints) {
      if (!Object.hasOwn(documentation?.endpoints?.[group] || {}, endpoint))
        error(`documentation.json: missing ${endpoint}`);
    }
  }

  const countryList = read("countries.json");
  const stateList = read("states/all.json");
  const globalCities = read("search/cities.json");
  const countries = idMap(
    array("countries.json", countryList),
    "countries.json",
  );
  const states = idMap(array("states/all.json", stateList), "states/all.json");
  const citySearch = idMap(
    array("search/cities.json", globalCities),
    "search/cities.json",
  );
  checkCount(
    "api-info.json statistics.total_countries",
    info?.statistics?.total_countries,
    countries.size,
  );
  checkCount(
    "api-info.json statistics.total_states",
    info?.statistics?.total_states,
    states.size,
  );
  checkCount(
    "api-info.json statistics.total_cities",
    info?.statistics?.total_cities,
    citySearch.size,
  );
  for (const [name, expected] of [
    ["search/countries.json", countries],
    ["search/states.json", states],
  ]) {
    compareIds(expected, idMap(array(name, read(name)), name), name);
  }
  const combined = read("search/combined.json");
  const combinedSample = read("search/combined-sample.json");
  if (
    combined &&
    combinedSample &&
    !isDeepStrictEqual(combined, combinedSample)
  ) {
    error(
      "search/combined.json: compatibility alias differs from search/combined-sample.json",
    );
  }
  if (combinedSample) {
    let complete = true;
    for (const [kind, expected] of [
      ["countries", countries],
      ["states", states],
      ["cities", citySearch],
    ]) {
      const rows = combinedSample.data?.[kind];
      if (!Array.isArray(rows)) {
        error(`search/combined-sample.json: data.${kind} must be an array`);
        complete = false;
        continue;
      }
      const sample = idMap(rows, `search/combined-sample.json ${kind}`);
      const unexpected = [...sample.keys()].filter((id) => !expected.has(id));
      if (unexpected.length)
        error(
          `search/combined-sample.json ${kind}: unexpected IDs ${unexpected.slice(0, 5).join(", ")}`,
        );
      const counts = combinedSample.meta?.counts?.[kind];
      checkCount(
        `search/combined-sample.json ${kind} returned count`,
        counts?.returned,
        rows.length,
      );
      checkCount(
        `search/combined-sample.json ${kind} total count`,
        counts?.total,
        expected.size,
      );
      const kindComplete = rows.length === expected.size;
      if (counts?.complete !== kindComplete)
        error(`search/combined-sample.json ${kind}: incorrect complete flag`);
      complete = complete && kindComplete;
    }
    if (combinedSample.meta?.complete !== complete)
      error("search/combined-sample.json: incorrect overall complete flag");
  }

  const countryRegions = new Map();
  const countrySubregions = new Map();
  for (const country of countries.values()) {
    const name = `countries/${safeCountryName(country, country.id)}.json`;
    register(name, `country ${country.id}`, "countries.json");
    const detail = read(name, `Country ${country.id}`);
    if (detail && detail.data?.id !== country.id)
      error(`${name}: country ID does not match ${country.id}`);
    for (const [field, groups] of [
      ["region", countryRegions],
      ["subregion", countrySubregions],
    ]) {
      const value = detail?.data?.[field];
      if (!value || value === "undefined") continue;
      if (typeof value !== "string")
        error(`${name}: invalid ${field} ${JSON.stringify(value)}`);
      else groupedAdd(groups, value, country);
    }
  }
  for (const [kind, groups] of [
    ["region", countryRegions],
    ["subregion", countrySubregions],
  ]) {
    for (const [value, entries] of groups) {
      const name = `countries/${kind}/${value.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;
      register(name, `${kind} ${value}`, "Country detail data");
      const group = read(name, `${kind} ${value}`);
      if (!group) continue;
      if (group.meta?.[kind] !== value)
        error(`${name}: meta.${kind} does not match ${value}`);
      compareIds(
        idMap(entries, `${kind} ${value} countries`),
        idMap(array(name, group), name),
        name,
      );
    }
  }
  const statesByCountry = new Map();
  const stateTypes = new Map();
  const stateTimezones = new Map();
  for (const state of states.values()) {
    const name = `states/${safeDetailName(state.iso3166_2, state.id)}.json`;
    register(name, `state ${state.id}`, "states/all.json");
    const detail = read(name, `State ${state.id}`);
    if (detail && detail.data?.id !== state.id)
      error(`${name}: state ID does not match ${state.id}`);
    if (validId(detail?.data?.country_id))
      groupedAdd(statesByCountry, detail.data.country_id, state);
    for (const [field, groups] of [
      ["type", stateTypes],
      ["timezone", stateTimezones],
    ]) {
      const value = detail?.data?.[field];
      if (!value || value === "undefined" || value === "null") continue;
      if (typeof value !== "string")
        error(`${name}: invalid ${field} ${JSON.stringify(value)}`);
      else groupedAdd(groups, value, state);
    }
  }
  for (const [countryId, entries] of statesByCountry) {
    const country = countries.get(countryId);
    if (!country?.iso2) continue; // The generator omits this index without an ISO code.
    const name = `states/country/${safeDetailName(country.iso2, country.id)}.json`;
    register(name, `states of country ${countryId}`, "states/all.json");
    const group = read(name, `States of country ${countryId}`);
    if (group)
      compareIds(
        idMap(entries, `states for ${countryId}`),
        idMap(array(name, group), name),
        name,
      );
  }
  indexReferences(
    "countries/regions.json",
    "region",
    "country_count",
    "region",
    countryRegions,
  );
  indexReferences(
    "states/types.json",
    "type",
    "state_count",
    "type",
    stateTypes,
  );
  indexReferences(
    "states/timezones.json",
    "timezone",
    "state_count",
    "timezone",
    stateTimezones,
  );

  const batchIndex = read("cities/batches.json");
  const batchEntries = array("cities/batches.json", batchIndex);
  checkCount(
    "cities/batches.json meta.total_batches",
    batchIndex?.meta?.total_batches,
    batchEntries.length,
  );
  const batchCities = new Map();
  const citiesByCountry = new Map();
  const citiesByState = new Map();
  const citiesByTimezone = new Map();
  const ranges = [];
  let indexedCityCount = 0;
  for (const entry of batchEntries) {
    if (
      !isObject(entry) ||
      !validId(entry.start_id) ||
      !validId(entry.end_id) ||
      entry.start_id > entry.end_id ||
      !Number.isSafeInteger(entry.count) ||
      entry.count < 0
    ) {
      error("cities/batches.json: invalid batch range or count");
      continue;
    }
    indexedCityCount += entry.count;
    ranges.push(entry);
    register(
      entry.filename,
      `batch ${entry.start_id}-${entry.end_id}`,
      "cities/batches.json",
    );
    const batch = read(entry.filename, "cities/batches.json");
    if (!batch) continue;
    if (!isObject(batch.data)) {
      error(`${entry.filename}: batch data must be an ID-keyed object`);
      continue;
    }
    const rows = Object.entries(batch.data);
    checkCount(`${entry.filename} batch count`, entry.count, rows.length);
    checkCount(
      `${entry.filename} meta.cities_count`,
      batch.meta?.cities_count,
      rows.length,
    );
    if (batch.meta?.batch_range !== `${entry.start_id}-${entry.end_id}`)
      error(`${entry.filename}: batch range metadata mismatch`);
    let min = Infinity;
    let max = -Infinity;
    for (const [key, city] of rows) {
      if (
        !isObject(city) ||
        !validId(city.id) ||
        String(city.id) !== key ||
        city.id < entry.start_id ||
        city.id > entry.end_id
      ) {
        error(`${entry.filename}: invalid batch city ID or key ${key}`);
        continue;
      }
      min = Math.min(min, city.id);
      max = Math.max(max, city.id);
      if (batchCities.has(city.id))
        error(`${entry.filename}: duplicate batch city ID ${city.id}`);
      else batchCities.set(city.id, city);
      if (validId(city.country_id))
        groupedAdd(citiesByCountry, city.country_id, city);
      if (validId(city.state_id))
        groupedAdd(citiesByState, city.state_id, city);
      if (city.timezone) groupedAdd(citiesByTimezone, city.timezone, city);
    }
    if (min !== entry.start_id || max !== entry.end_id)
      error(
        `${entry.filename}: batch ID bounds do not match index range ${entry.start_id}-${entry.end_id}`,
      );
  }
  ranges.sort((a, b) => a.start_id - b.start_id || a.end_id - b.end_id);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start_id <= ranges[i - 1].end_id)
      error(
        `cities/batches.json: overlapping batch ranges ${ranges[i - 1].start_id}-${ranges[i - 1].end_id} and ${ranges[i].start_id}-${ranges[i].end_id}`,
      );
  }
  checkCount(
    "cities/batches.json meta.total_cities",
    batchIndex?.meta?.total_cities,
    indexedCityCount,
  );
  checkCount(
    "cities/batches.json batch city sum",
    indexedCityCount,
    batchCities.size,
  );
  compareIds(
    citySearch,
    batchCities,
    "City batch coverage against search/cities.json",
  );

  function checkCityGroups(groups, kind) {
    for (const [id, entries] of groups) {
      const file =
        kind === "country"
          ? safeCountryName(countries.get(id), id)
          : safeStateName(states.get(id), id);
      const name = `cities/${kind}/${file}.json`;
      register(name, `cities of ${kind} ${id}`, "City batch data");
      const group = read(name, `Cities of ${kind} ${id}`);
      if (!group) continue;
      if (group.meta?.[`${kind}_id`] !== id)
        error(`${name}: meta.${kind}_id does not match ${id}`);
      compareIds(
        idMap(entries, `${kind} ${id} batch cities`),
        idMap(array(name, group), name),
        name,
      );
      const indexName = `cities/country/${file}/index.json`;
      if (kind === "country" && files.has(indexName)) {
        const index = read(indexName, `Country shard index ${id}`);
        const indexed = [];
        const seenPaths = new Set();
        for (const [position, shard] of array(indexName, index).entries()) {
          const expected = `cities/country/${file}/${position + 1}.json`;
          if (
            !isObject(shard) ||
            shard.filename !== expected ||
            seenPaths.has(shard.filename)
          ) {
            error(`${indexName}: invalid country shard filename`);
            continue;
          }
          seenPaths.add(shard.filename);
          const content = read(shard.filename, indexName);
          const rows = array(shard.filename, content);
          checkCount(
            `${shard.filename} country shard count`,
            shard.count,
            rows.length,
          );
          if (content?.meta?.country_id !== id)
            error(`${shard.filename}: wrong country shard country_id`);
          indexed.push(...rows);
        }
        checkCount(
          `${indexName} country shard city_count`,
          index?.meta?.city_count,
          indexed.length,
        );
        if (!isDeepStrictEqual(indexed, group.data))
          error(
            `${indexName}: country shard contents do not match the complete country list`,
          );
      }
    }
  }
  checkCityGroups(citiesByCountry, "country");
  checkCityGroups(citiesByState, "state");
  if (citiesByTimezone.size || files.has("cities/timezones.json")) {
    const timezoneIndex = read("cities/timezones.json");
    const seenTimezones = new Set();
    for (const entry of array("cities/timezones.json", timezoneIndex)) {
      if (
        !isObject(entry) ||
        typeof entry.timezone !== "string" ||
        !entry.timezone
      ) {
        error("cities/timezones.json: invalid timezone entry");
        continue;
      }
      const timezone = entry.timezone;
      if (seenTimezones.has(timezone))
        error(`cities/timezones.json: duplicate timezone ${timezone}`);
      seenTimezones.add(timezone);
      register(
        entry.endpoint,
        `city timezone ${timezone}`,
        "cities/timezones.json",
      );
      const group = read(entry.endpoint, `City timezone ${timezone}`);
      if (!group) continue;
      if (group.meta?.timezone !== timezone)
        error(
          `${entry.endpoint}: meta.timezone ${JSON.stringify(group.meta?.timezone)} does not match ${timezone}`,
        );
      const rows = array(entry.endpoint, group);
      checkCount(
        `cities/timezones.json ${timezone} city_count`,
        entry.city_count,
        rows.length,
      );
      compareIds(
        idMap(
          citiesByTimezone.get(timezone) || [],
          `city timezone ${timezone}`,
        ),
        idMap(rows, entry.endpoint),
        entry.endpoint,
      );
    }
    for (const timezone of citiesByTimezone.keys()) {
      if (!seenTimezones.has(timezone))
        error(`cities/timezones.json: missing timezone ${timezone}`);
    }
  }

  const shardIndex = read("search/cities/index.json");
  const shardEntries = array("search/cities/index.json", shardIndex);
  const shardCities = new Map();
  const shardCodes = new Set();
  let shardCount = 0;
  for (const entry of shardEntries) {
    if (
      !isObject(entry) ||
      !(entry.country_code === null || /^[A-Z]{2}$/.test(entry.country_code)) ||
      !Number.isSafeInteger(entry.count) ||
      entry.count < 0
    ) {
      error("search/cities/index.json: invalid shard country code or count");
      continue;
    }
    if (shardCodes.has(entry.country_code))
      error(
        `search/cities/index.json: duplicate shard country code ${entry.country_code}`,
      );
    shardCodes.add(entry.country_code);
    shardCount += entry.count;
    register(
      entry.filename,
      `search shard ${entry.country_code}`,
      "search/cities/index.json",
    );
    const shard = read(entry.filename, "search/cities/index.json");
    if (!shard) continue;
    if (shard.meta?.country_code !== entry.country_code)
      error(`${entry.filename}: shard country_code metadata mismatch`);
    const rows = array(entry.filename, shard);
    checkCount(`${entry.filename} shard count`, entry.count, rows.length);
    for (const city of rows) {
      if (!isObject(city) || !validId(city.id)) {
        error(`${entry.filename}: invalid shard city ID`);
        continue;
      }
      if (shardCities.has(city.id))
        error(`${entry.filename}: duplicate shard city ID ${city.id}`);
      else shardCities.set(city.id, city);
      if (!citySearch.has(city.id))
        error(
          `${entry.filename}: shard city ID ${city.id} is absent from global search`,
        );
      else if (!isDeepStrictEqual(city, citySearch.get(city.id)))
        error(
          `${entry.filename}: shard city ID ${city.id} differs from global search`,
        );
      const normalize = (code) =>
        typeof code === "string" && /^[a-z]{2}$/i.test(code.trim())
          ? code.trim().toUpperCase()
          : null;
      const expectedCode =
        normalize(countries.get(city.country_id)?.iso2) ||
        normalize(city.country_code);
      if (entry.country_code !== expectedCode)
        error(
          `${entry.filename}: shard city ID ${city.id} belongs to ${expectedCode}, not ${entry.country_code}`,
        );
    }
  }
  checkCount(
    "search/cities/index.json meta.total_cities",
    shardIndex?.meta?.total_cities,
    shardCount,
  );
  checkCount(
    "search/cities/index.json shard city sum",
    shardCount,
    shardCities.size,
  );
  compareIds(citySearch, shardCities, "Search shard coverage");

  if (files.has("manifest.json") && !invalid.has("manifest.json")) {
    const manifest = read("manifest.json");
    if (manifest?.schema_version !== 1)
      error("manifest.json: unsupported schema_version");
    if (manifest?.api_version !== "v1")
      error("manifest.json: expected api_version v1");
    if (!/^sha256:[0-9a-f]{64}$/.test(manifest?.dataset_version || ""))
      error("manifest.json: invalid dataset_version");
    if (
      manifest?.build_fingerprint !== undefined &&
      !/^sha256:[0-9a-f]{64}$/.test(manifest.build_fingerprint)
    )
      error("manifest.json: invalid build_fingerprint");
    if (
      typeof manifest?.generator_version !== "string" ||
      !manifest.generator_version
    )
      error("manifest.json: invalid generator_version");
    if (
      typeof manifest?.generated_at !== "string" ||
      Number.isNaN(Date.parse(manifest.generated_at))
    )
      error("manifest.json: invalid generated_at timestamp");
    if (manifest?.checksum_algorithm !== "sha256")
      error("manifest.json: checksum_algorithm must be sha256");
    for (const [key, total] of [
      ["countries", countries.size],
      ["states", states.size],
      ["cities", citySearch.size],
    ]) {
      checkCount(`manifest.json counts.${key}`, manifest?.counts?.[key], total);
    }
    if (!Array.isArray(manifest?.files)) {
      error("manifest.json: files must be an array");
    } else {
      checkCount(
        "manifest.json file_count",
        manifest.file_count,
        manifest.files.length + 1,
      );
      checkCount(
        "manifest.json file_count against output",
        manifest.file_count,
        allFiles.size,
      );
      const listed = new Set();
      for (const entry of manifest.files) {
        if (!isObject(entry) || !safePath(entry.path, "manifest.json"))
          continue;
        const name = entry.path;
        const key = name.toLowerCase();
        if (listed.has(key))
          error(`manifest.json: duplicate file path ${name}`);
        listed.add(key);
        if (key === "manifest.json") {
          error("manifest.json: the manifest must not list itself");
          continue;
        }
        if (!allFiles.has(name)) {
          error(`manifest.json: missing listed file ${name}`);
          continue;
        }
        if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0)
          error(`manifest.json: invalid byte length for ${name}`);
        if (
          typeof entry.sha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(entry.sha256)
        )
          error(`manifest.json: invalid sha256 for ${name}`);
        if ("generated" in entry && typeof entry.generated !== "boolean")
          error(`manifest.json: invalid generated marker for ${name}`);
        try {
          const contents = fs.readFileSync(path.join(root, ...name.split("/")));
          checkCount(
            `manifest.json ${name} bytes`,
            entry.bytes,
            contents.length,
          );
          const digest = createHash("sha256").update(contents).digest("hex");
          if (digest !== entry.sha256)
            error(`manifest.json: ${name} sha256 checksum mismatch`);
        } catch (err) {
          error(`manifest.json: cannot read ${name}: ${err.message}`);
        }
      }
      for (const name of allFiles) {
        if (name !== "manifest.json" && !listed.has(name.toLowerCase()))
          error(`manifest.json: unlisted output file ${name}`);
      }
    }
  }

  return { outputDir: root, filesChecked, errors };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let outputDir;
  let maxSearchShardBytes;
  let invalidArgs = false;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") help = true;
    else if (args[i] === "--max-search-shard-bytes") {
      const value = args[++i];
      maxSearchShardBytes = Number(value);
      if (
        !value ||
        !Number.isSafeInteger(maxSearchShardBytes) ||
        maxSearchShardBytes < 0
      )
        invalidArgs = true;
    } else if (!args[i].startsWith("-") && !outputDir) outputDir = args[i];
    else invalidArgs = true;
  }
  if (help || invalidArgs) {
    (invalidArgs ? console.error : console.log)(
      "Usage: node scripts/verify.js [output-directory] [--max-search-shard-bytes N]",
    );
    if (invalidArgs) process.exitCode = 2;
  } else {
    const report = verifyOutput(outputDir, { maxSearchShardBytes });
    if (report.errors.length) {
      console.error(
        `Verification failed: ${report.errors.length} issue(s) in ${report.outputDir}`,
      );
      for (const message of report.errors) console.error(`- ${message}`);
      process.exitCode = 1;
    } else {
      console.log(
        `Verified ${report.filesChecked} JSON files in ${report.outputDir}`,
      );
    }
  }
}

module.exports = { verifyOutput };
