#!/usr/bin/env node

// Verify the published v2 output without source data or runtime dependencies.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { getRoutes, matchRoute } = require("../src/api-contract");
const validators = require("../src/generated/validators");

const DEFAULT_MAX_MANIFEST_BYTES = 25 * 1024 * 1024;

function verifyOutput(
  outputDir = path.join(process.cwd(), "dist/api/v2"),
  options = {},
) {
  const root = path.resolve(outputDir);
  const maxManifestBytes =
    options.maxManifestBytes === undefined
      ? DEFAULT_MAX_MANIFEST_BYTES
      : options.maxManifestBytes;
  if (!Number.isSafeInteger(maxManifestBytes) || maxManifestBytes < 0) {
    throw new Error("maxManifestBytes must be a non-negative integer");
  }
  const errors = [];
  const files = new Set();
  const jsonFiles = new Set();
  const invalid = new Set();
  const names = new Map();
  const missing = new Set();
  const timestamps = new Set();
  const expectedRoutes = new Set();
  const error = (message) => errors.push(message);
  const object = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const validId = (value) => Number.isSafeInteger(value) && value >= 0;
  const checkCount = (label, actual, expected) => {
    if (!Number.isSafeInteger(actual) || actual !== expected)
      error(`${label}: expected ${expected}, found ${JSON.stringify(actual)}`);
  };

  function safePath(name, context) {
    if (
      typeof name !== "string" ||
      !name ||
      name.includes("\\") ||
      name.includes("\0") ||
      path.posix.isAbsolute(name) ||
      path.win32.isAbsolute(name) ||
      /^[a-z]:/i.test(name) ||
      name.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      error(`${context}: unsafe or invalid path ${JSON.stringify(name)}`);
      return false;
    }
    return true;
  }

  function scan(directory, prefix = "") {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (err) {
      error(`${prefix || root}: cannot read directory: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        error(`${name}: symbolic links are not allowed in API output`);
        continue;
      }
      if (entry.isDirectory()) {
        scan(full, name);
        continue;
      }
      if (!entry.isFile()) continue;
      files.add(name);
      const key = name.normalize("NFC").toLowerCase();
      if (names.has(key) && names.get(key) !== name)
        error(`Filename collision: ${names.get(key)} and ${name}`);
      names.set(key, name);
      if (
        /^countries\/[a-z]{2}\/cities\/\d+\.json$/.test(name) &&
        options.maxSearchShardBytes !== undefined
      ) {
        const bytes = fs.statSync(full).size;
        if (bytes > options.maxSearchShardBytes)
          error(
            `${name}: city page exceeds byte budget (${bytes} > ${options.maxSearchShardBytes} bytes)`,
          );
      }
      if (!name.toLowerCase().endsWith(".json")) continue;
      jsonFiles.add(name);
      try {
        const value = JSON.parse(fs.readFileSync(full, "utf8"));
        const route = matchRoute(name);
        if (route) {
          const validate = validators[route.response];
          if (typeof validate !== "function") {
            error(`${name}: no schema validator for ${route.response}`);
            if (name !== "manifest.json") {
              invalid.add(name);
              continue;
            }
          } else if (!validate(value)) {
            const issue = validate.errors?.[0];
            error(
              `${name}: schema ${issue?.instancePath || "/"} ${issue?.message || "invalid value"}`,
            );
            if (name !== "manifest.json") {
              invalid.add(name);
              continue;
            }
          }
        }
        if (object(value) && "data" in value && "meta" in value) {
          if (!object(value.meta)) error(`${name}: missing metadata`);
          else {
            checkCount(
              `${name} meta.count`,
              value.meta.count,
              Array.isArray(value.data) ? value.data.length : 1,
            );
            if (value.meta.api_version !== "v2")
              error(`${name}: expected api_version v2`);
            if (
              typeof value.meta.generated_at !== "string" ||
              Number.isNaN(Date.parse(value.meta.generated_at))
            )
              error(`${name}: invalid generated_at`);
            else timestamps.add(value.meta.generated_at);
          }
        }
      } catch (err) {
        invalid.add(name);
        error(`${name}: invalid JSON or unreadable file: ${err.message}`);
      }
    }
  }

  function read(name, context = "Required endpoint") {
    if (!safePath(name, context)) return null;
    if (matchRoute(name))
      expectedRoutes.add(name.normalize("NFC").toLowerCase());
    if (!jsonFiles.has(name)) {
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
  function array(name, value) {
    if (value === null) return [];
    if (!Array.isArray(value?.data)) {
      error(`${name}: data must be an array`);
      return [];
    }
    return value.data;
  }
  function idMap(items, label) {
    const result = new Map();
    for (const item of items) {
      if (!object(item) || !validId(item.id))
        error(`${label}: invalid record ID ${JSON.stringify(item?.id)}`);
      else if (result.has(item.id)) error(`${label}: duplicate ID ${item.id}`);
      else result.set(item.id, item);
    }
    return result;
  }
  function compare(expected, actual, label) {
    const absent = [...expected.keys()].filter((id) => !actual.has(id));
    const extra = [...actual.keys()].filter((id) => !expected.has(id));
    if (absent.length || extra.length)
      error(
        `${label}: ID coverage mismatch (${absent.length} missing, ${extra.length} unexpected)`,
      );
    for (const [id, value] of expected) {
      if (actual.has(id) && !isDeepStrictEqual(value, actual.get(id)))
        error(`${label}: record ${id} differs`);
    }
  }
  function addGroup(groups, key, value) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  function groupIndex(filename, field, countField, expected) {
    const index = read(filename);
    const seen = new Set();
    for (const item of array(filename, index)) {
      const key = item?.[field];
      if (typeof key !== "string" || !key || seen.has(key)) {
        error(`${filename}: invalid or duplicate ${field}`);
        continue;
      }
      seen.add(key);
      if (!expected.has(key)) error(`${filename}: unexpected ${field} ${key}`);
      const group = read(item.endpoint, filename);
      const records = array(item.endpoint, group);
      if (group && group.meta?.[field] !== key)
        error(`${item.endpoint}: mismatched ${field}`);
      checkCount(
        `${filename} ${key} ${countField}`,
        item[countField],
        records.length,
      );
      compare(
        idMap(expected.get(key) || [], `${field} ${key}`),
        idMap(records, item.endpoint),
        item.endpoint,
      );
    }
    for (const key of expected.keys())
      if (!seen.has(key)) error(`${filename}: missing ${field} ${key}`);
  }

  scan(root);
  const countryList = array("countries.json", read("countries.json"));
  const countries = idMap(countryList, "countries.json");
  const stateList = array("states/all.json", read("states/all.json"));
  const states = idMap(stateList, "states/all.json");
  const summaries = new Map();
  const byCountry = new Map();
  const stateTypes = new Map();
  const stateTimezones = new Map();
  const countryRegions = new Map();
  const countrySubregions = new Map();
  const cityTimezones = new Map();
  const seenStates = new Map();
  const codes = new Set();

  for (const country of countryList) {
    if (!/^[A-Z]{2}$/.test(country?.iso2 || "") || codes.has(country.iso2)) {
      error(`countries.json: invalid or duplicate ISO2 ${country?.iso2}`);
      continue;
    }
    codes.add(country.iso2);
    const code = country.iso2.toLowerCase();
    const detailName = `countries/${code}.json`;
    const detail = read(detailName);
    if (detail && !isDeepStrictEqual(detail.data, country))
      error(`${detailName}: country differs from list`);
    if (country.region) addGroup(countryRegions, country.region, country);
    if (country.subregion)
      addGroup(countrySubregions, country.subregion, country);
    const stateName = `countries/${code}/states.json`;
    const countryStates = array(stateName, read(stateName));
    for (const state of countryStates) {
      if (!validId(state?.id) || seenStates.has(state.id)) {
        error(`${stateName}: invalid or duplicate state ID ${state?.id}`);
        continue;
      }
      seenStates.set(state.id, state);
      if (
        state.country_id !== country.id ||
        state.country_code !== country.iso2
      )
        error(`${stateName}: state ${state.id} has wrong country`);
      if (
        typeof state.path_key !== "string" ||
        !/^[a-z0-9-]+$/.test(state.path_key)
      ) {
        error(`${stateName}: invalid state path key`);
        continue;
      }
      const base = `countries/${code}/states/${state.path_key}`;
      const stateDetail = read(`${base}.json`);
      if (stateDetail && !isDeepStrictEqual(stateDetail.data, state))
        error(`${base}.json: state differs from list`);
      if (state.type) addGroup(stateTypes, state.type, state);
      if (state.timezone) addGroup(stateTimezones, state.timezone, state);
      const cityName = `${base}/cities.json`;
      for (const city of array(cityName, read(cityName))) {
        if (!validId(city?.id) || summaries.has(city.id)) {
          error(`${cityName}: invalid or duplicate city ID ${city?.id}`);
          continue;
        }
        if (
          city.state_id !== state.id ||
          city.state_code !== state.iso2 ||
          city.state_path_key !== state.path_key ||
          city.country_id !== country.id ||
          city.country_code !== country.iso2
        )
          error(`${cityName}: city ${city.id} has mismatched parent data`);
        const normalized =
          typeof city.name === "string"
            ? city.name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
            : "";
        if (city.name_normalized !== normalized)
          error(`${cityName}: city ${city.id} has invalid normalized name`);
        summaries.set(city.id, city);
        addGroup(byCountry, country.id, city);
        const cityDetailName = `cities/${city.id}.json`;
        const cityDetail = read(cityDetailName);
        if (cityDetail) {
          if (cityDetail.meta?.city_id !== city.id)
            error(`${cityDetailName}: invalid city metadata`);
          for (const [field, value] of Object.entries(city))
            if (!isDeepStrictEqual(cityDetail.data?.[field], value))
              error(`${cityDetailName}: ${field} differs from city list`);
          for (const field of ["latitude", "longitude"])
            if (
              cityDetail.data?.[field] !== null &&
              (typeof cityDetail.data?.[field] !== "number" ||
                !Number.isFinite(cityDetail.data[field]))
            )
              error(`${cityDetailName}: ${field} must be numeric or null`);
          if (cityDetail.data?.timezone)
            addGroup(cityTimezones, cityDetail.data.timezone, city);
        }
      }
    }
  }
  compare(states, seenStates, "Country state lists");
  compare(
    countries,
    idMap(
      array("search/countries.json", read("search/countries.json")),
      "search/countries.json",
    ),
    "Country search",
  );
  compare(
    states,
    idMap(
      array("search/states.json", read("search/states.json")),
      "search/states.json",
    ),
    "State search",
  );

  const globalIndex = read("search/cities/index.json");
  const globalEntries = array("search/cities/index.json", globalIndex);
  const indexedCountries = new Set();
  let indexedTotal = 0;
  for (const entry of globalEntries) {
    const code = entry?.country_code;
    const country = countryList.find((item) => item.iso2 === code);
    if (!country || indexedCountries.has(code)) {
      error(`search/cities/index.json: invalid or duplicate country ${code}`);
      continue;
    }
    indexedCountries.add(code);
    const expectedName = `countries/${code.toLowerCase()}/cities/index.json`;
    if (entry.filename !== expectedName) {
      error(
        `search/cities/index.json: invalid country index path ${entry.filename}`,
      );
      continue;
    }
    const index = read(expectedName);
    const pages = array(expectedName, index);
    const countryCities = idMap(
      byCountry.get(country.id) || [],
      `cities of ${code}`,
    );
    const pageCities = new Map();
    let pageTotal = 0;
    for (const [position, page] of pages.entries()) {
      const expectedPage = `countries/${code.toLowerCase()}/cities/${position + 1}.json`;
      if (page?.filename !== expectedPage) {
        error(`${expectedName}: invalid page path ${page?.filename}`);
        continue;
      }
      const contents = read(expectedPage, expectedName);
      const records = array(expectedPage, contents);
      checkCount(`${expectedPage} page count`, page.count, records.length);
      if (contents && contents.meta?.country_code !== code)
        error(`${expectedPage}: wrong country code`);
      if (index?.meta?.page_size && records.length > index.meta.page_size)
        error(`${expectedPage}: page exceeds page_size`);
      pageTotal += records.length;
      for (const city of records) {
        if (!validId(city?.id) || pageCities.has(city.id))
          error(`${expectedPage}: invalid or duplicate city ID ${city?.id}`);
        else pageCities.set(city.id, city);
      }
    }
    if (
      !Number.isSafeInteger(index?.meta?.page_size) ||
      index.meta.page_size < 1
    )
      error(`${expectedName}: invalid page_size`);
    if (index?.meta?.country_code !== code)
      error(`${expectedName}: wrong country code`);
    checkCount(
      `${expectedName} total_cities`,
      index?.meta?.total_cities,
      pageTotal,
    );
    checkCount(
      `search/cities/index.json ${code} count`,
      entry.count,
      pageTotal,
    );
    compare(countryCities, pageCities, `${expectedName} coverage`);
    indexedTotal += pageTotal;
  }
  for (const country of countryList)
    if (!indexedCountries.has(country.iso2))
      error(`search/cities/index.json: missing country ${country.iso2}`);
  checkCount(
    "search/cities/index.json total_cities",
    globalIndex?.meta?.total_cities,
    indexedTotal,
  );
  checkCount(
    "city index total against state lists",
    indexedTotal,
    summaries.size,
  );
  for (const name of jsonFiles) {
    const match = /^cities\/(\d+)\.json$/.exec(name);
    if (match && !summaries.has(Number(match[1])))
      error(`${name}: city is absent from state lists`);
  }

  groupIndex(
    "countries/regions.json",
    "region",
    "country_count",
    countryRegions,
  );
  for (const [subregion, group] of countrySubregions) {
    const name = `countries/subregion/${subregion.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;
    const content = read(name);
    if (content && content.meta?.subregion !== subregion)
      error(`${name}: mismatched subregion`);
    compare(idMap(group, subregion), idMap(array(name, content), name), name);
  }
  groupIndex("states/types.json", "type", "state_count", stateTypes);
  groupIndex(
    "states/timezones.json",
    "timezone",
    "state_count",
    stateTimezones,
  );
  if (cityTimezones.size || jsonFiles.has("cities/timezones.json"))
    groupIndex(
      "cities/timezones.json",
      "timezone",
      "city_count",
      cityTimezones,
    );
  const info = read("api-info.json");
  const documentation = read("documentation.json");
  if (info && info.api_version !== "v2")
    error("api-info.json: expected api_version v2");
  if (documentation && documentation.version !== "v2")
    error("documentation.json: expected version v2");
  for (const [kind, count] of [
    ["countries", countries.size],
    ["states", states.size],
    ["cities", summaries.size],
  ])
    if (info)
      checkCount(
        `api-info.json statistics.total_${kind}`,
        info.statistics?.[`total_${kind}`],
        count,
      );
  for (const route of getRoutes({ cityTimezones: cityTimezones.size > 0 })) {
    if (info && info.endpoints?.[route.group]?.[route.key] !== route.path)
      error(
        `api-info.json: missing or incorrect ${route.group}.${route.key} route`,
      );
    const documented =
      documentation?.endpoints?.[route.group]?.[`GET /${route.path}`];
    if (documentation && documented?.response_schema !== route.response)
      error(
        `documentation.json: missing or incorrect ${route.group} route ${route.path}`,
      );
  }
  read("build-report.json");

  const manifestSize = (() => {
    try {
      return fs.statSync(path.join(root, "manifest.json")).size;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  })();
  if (manifestSize !== null && manifestSize > maxManifestBytes) {
    error(
      `manifest.json: ${manifestSize} bytes exceeds the ${maxManifestBytes}-byte budget`,
    );
  }

  for (const name of jsonFiles) {
    if (
      matchRoute(name) &&
      !expectedRoutes.has(name.normalize("NFC").toLowerCase()) &&
      name !== "manifest.json"
    )
      error(`${name}: unexpected API route`);
  }

  const manifest = read("manifest.json");
  if (manifest) {
    if (manifest.schema_version !== 1)
      error("manifest.json: unsupported schema_version");
    if (manifest.api_version !== "v2")
      error("manifest.json: expected api_version v2");
    if (!/^sha256:[0-9a-f]{64}$/.test(manifest.dataset_version || ""))
      error("manifest.json: invalid dataset_version");
    if (
      manifest.build_fingerprint !== undefined &&
      !/^sha256:[0-9a-f]{64}$/.test(manifest.build_fingerprint)
    )
      error("manifest.json: invalid build_fingerprint");
    if (
      typeof manifest.generator_version !== "string" ||
      !manifest.generator_version
    )
      error("manifest.json: invalid generator_version");
    if (
      typeof manifest.generated_at !== "string" ||
      Number.isNaN(Date.parse(manifest.generated_at))
    )
      error("manifest.json: invalid generated_at");
    if (
      timestamps.size > 1 ||
      (timestamps.size && !timestamps.has(manifest.generated_at))
    )
      error("manifest.json: inconsistent release timestamps");
    if (manifest.checksum_algorithm !== "sha256")
      error("manifest.json: checksum_algorithm must be sha256");
    for (const [key, total] of [
      ["countries", countries.size],
      ["states", states.size],
      ["cities", summaries.size],
    ])
      checkCount(`manifest.json counts.${key}`, manifest.counts?.[key], total);
    if (!Array.isArray(manifest.files))
      error("manifest.json: files must be an array");
    else {
      checkCount(
        "manifest.json file_count",
        manifest.file_count,
        manifest.files.length + 1,
      );
      checkCount(
        "manifest.json file_count against output",
        manifest.file_count,
        files.size,
      );
      const listed = new Set();
      for (const entry of manifest.files) {
        if (!object(entry) || !safePath(entry.path, "manifest.json")) continue;
        const name = entry.path;
        const key = name.normalize("NFC").toLowerCase();
        if (listed.has(key))
          error(`manifest.json: duplicate file path ${name}`);
        listed.add(key);
        if (key === "manifest.json") {
          error("manifest.json: the manifest must not list itself");
          continue;
        }
        if (!files.has(name)) {
          error(`manifest.json: missing listed file ${name}`);
          continue;
        }
        if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0)
          error(`manifest.json: invalid byte length for ${name}`);
        if (!/^[0-9a-f]{64}$/.test(entry.sha256 || ""))
          error(`manifest.json: invalid sha256 for ${name}`);
        if ("generated" in entry && typeof entry.generated !== "boolean")
          error(`manifest.json: invalid generated marker for ${name}`);
        if (
          entry.generated === false &&
          matchRoute(name.replace(/\.(?:gz|br)$/i, ""))
        )
          error(
            `manifest.json: reserved API route cannot be marked preserved: ${name}`,
          );
        try {
          const contents = fs.readFileSync(path.join(root, ...name.split("/")));
          checkCount(
            `manifest.json ${name} bytes`,
            entry.bytes,
            contents.length,
          );
          if (
            createHash("sha256").update(contents).digest("hex") !== entry.sha256
          )
            error(`manifest.json: ${name} sha256 checksum mismatch`);
        } catch (err) {
          error(`manifest.json: cannot read ${name}: ${err.message}`);
        }
      }
      for (const name of files)
        if (
          name !== "manifest.json" &&
          !listed.has(name.normalize("NFC").toLowerCase())
        )
          error(`manifest.json: unlisted output file ${name}`);
    }
  }
  return { outputDir: root, filesChecked: jsonFiles.size, errors };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let outputDir;
  let maxSearchShardBytes;
  let maxManifestBytes;
  let invalidArgs = false;
  let help = false;
  const readByteLimit = (value) => {
    const number = Number(value);
    return value && Number.isSafeInteger(number) && number >= 0 ? number : null;
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") help = true;
    else if (args[i] === "--max-search-shard-bytes") {
      maxSearchShardBytes = readByteLimit(args[++i]);
      if (maxSearchShardBytes === null) invalidArgs = true;
    } else if (args[i] === "--max-manifest-bytes") {
      maxManifestBytes = readByteLimit(args[++i]);
      if (maxManifestBytes === null) invalidArgs = true;
    } else if (!args[i].startsWith("-") && !outputDir) outputDir = args[i];
    else invalidArgs = true;
  }
  if (help || invalidArgs) {
    (invalidArgs ? console.error : console.log)(
      "Usage: node scripts/verify.js [output-directory] [--max-search-shard-bytes N] [--max-manifest-bytes N]",
    );
    if (invalidArgs) process.exitCode = 2;
  } else {
    const report = verifyOutput(outputDir, {
      maxSearchShardBytes,
      maxManifestBytes,
    });
    if (report.errors.length) {
      console.error(
        `Verification failed: ${report.errors.length} issue(s) in ${report.outputDir}`,
      );
      for (const message of report.errors) console.error(`- ${message}`);
      process.exitCode = 1;
    } else
      console.log(
        `Verified ${report.filesChecked} JSON files in ${report.outputDir}`,
      );
  }
}

module.exports = { verifyOutput };
