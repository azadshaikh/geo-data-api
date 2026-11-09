const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const openapiFile = path.join(root, "openapi.json");
const schemaFile = path.join(root, "schemas", "geo-data.schema.json");
const declarationsFile = path.join(root, "types", "index.d.ts");

function readJSON(file) {
  assert.ok(fs.existsSync(file), `Missing contract file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveRef(fromFile, reference) {
  const target = new URL(reference, pathToFileURL(fromFile));
  assert.equal(
    target.protocol,
    "file:",
    `Only local references are supported: ${reference}`,
  );
  const pointer = decodeURIComponent(target.hash.slice(1));
  target.hash = "";
  const targetFile = fileURLToPath(target);
  let value = readJSON(targetFile);
  if (pointer) {
    assert.ok(pointer.startsWith("/"), `Not a JSON pointer: ${reference}`);
    for (const raw of pointer.slice(1).split("/")) {
      const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
      assert.ok(
        value && Object.hasOwn(value, key),
        `Unresolved reference: ${reference}`,
      );
      value = value[key];
    }
  }
  return { file: targetFile, value };
}

// Exercise the schema keywords used by these contracts without a runtime dependency.
// This is deliberately not a replacement for a complete JSON Schema validator.
function conforms(schema, data, file = schemaFile) {
  if (schema.$ref) {
    const target = resolveRef(file, schema.$ref);
    if (!conforms(target.value, data, target.file)) return false;
  }
  if (schema.allOf && !schema.allOf.every((part) => conforms(part, data, file)))
    return false;
  if (schema.anyOf && !schema.anyOf.some((part) => conforms(part, data, file)))
    return false;
  if (Object.hasOwn(schema, "const") && data !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(data)) return false;
  if (schema.type) {
    const candidates = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = (type) => {
      if (type === "null") return data === null;
      if (type === "array") return Array.isArray(data);
      if (type === "object")
        return (
          data !== null && typeof data === "object" && !Array.isArray(data)
        );
      if (type === "integer") return Number.isInteger(data);
      return typeof data === type;
    };
    if (!candidates.some(matches)) return false;
  }
  if (
    typeof data === "string" &&
    schema.pattern &&
    !new RegExp(schema.pattern).test(data)
  )
    return false;
  if (
    typeof data === "number" &&
    schema.minimum !== undefined &&
    data < schema.minimum
  )
    return false;
  if (
    Array.isArray(data) &&
    schema.items &&
    !data.every((item) => conforms(schema.items, item, file))
  )
    return false;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    if (
      schema.required &&
      !schema.required.every((key) => Object.hasOwn(data, key))
    )
      return false;
    for (const [key, value] of Object.entries(data)) {
      if (schema.properties && Object.hasOwn(schema.properties, key)) {
        if (!conforms(schema.properties[key], value, file)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        if (!conforms(schema.additionalProperties, value, file)) return false;
      }
    }
  }
  return true;
}

test("OpenAPI and every reusable schema reference resolve locally", () => {
  const doc = readJSON(openapiFile);
  const schema = readJSON(schemaFile);
  assert.match(doc.openapi, /^3\.1\./);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  const checked = new Set();
  function visit(node, file) {
    if (!node || typeof node !== "object") return;
    if (node.$ref) {
      const target = resolveRef(file, node.$ref);
      const key = `${target.file}:${node.$ref}`;
      if (!checked.has(key)) {
        checked.add(key);
        visit(target.value, target.file);
      }
    }
    for (const child of Object.values(node)) visit(child, file);
  }
  visit(doc, openapiFile);
  visit(schema, schemaFile);
  assert.ok(
    checked.size >= 10,
    "Endpoints should reference reusable contracts",
  );
  for (const [route, item] of Object.entries(doc.paths)) {
    assert.ok(item.get?.responses?.["200"], `${route} lacks a 200 response`);
    const parameters = item.get.parameters || [];
    for (const [, name] of route.matchAll(/\{([^}]+)\}/g)) {
      assert.ok(
        parameters.some(
          (p) => p.name === name && p.in === "path" && p.required === true,
        ),
        `${route}: missing path parameter ${name}`,
      );
    }
  }
});

test("contracts accept actual compact and pretty generator outputs", async (t) => {
  const config = require("../src/config");
  const CountriesGenerator = require("../src/generators/countries");
  const StatesGenerator = require("../src/generators/states");
  const CitiesGenerator = require("../src/generators/cities");
  const SearchGenerator = require("../src/generators/search");
  const doc = readJSON(openapiFile);
  const output = await fsp.mkdtemp(
    path.join(os.tmpdir(), "geo-contract-schema-"),
  );
  const previousOutput = config.OUTPUT_DIR;
  const previousPretty = config.PRETTY_JSON;
  const previousShardSize = config.COUNTRY_CITY_SHARD_SIZE;
  config.COUNTRY_CITY_SHARD_SIZE = 1;
  t.after(async () => {
    config.OUTPUT_DIR = previousOutput;
    config.PRETTY_JSON = previousPretty;
    config.COUNTRY_CITY_SHARD_SIZE = previousShardSize;
    await fsp.rm(output, { recursive: true, force: true });
  });
  const countries = [
    {
      id: 1,
      name: "Côte",
      iso2: "EX",
      iso3: "EXP",
      native: null,
      region: "Asia",
      region_id: null,
      subregion: "Southern Asia",
      latitude: "0.00000000",
      longitude: "76.25000000",
      translations: { en: "Example" },
    },
  ];
  const states = [
    {
      id: 11,
      name: "Région",
      iso2: "A",
      iso3166_2: "EX-A",
      country_id: 1,
      country_code: "EX",
      country_name: "Côte",
      type: "state",
      timezone: "Etc/GMT+12",
      level: null,
      parent_id: "99",
      latitude: "0.00000000",
      longitude: "76.25000000",
    },
    {
      id: 12,
      name: "Second",
      iso2: "B",
      iso3166_2: "EX-B",
      country_id: 1,
      country_code: "EX",
      country_name: "Côte",
      type: "state",
      timezone: "Etc/GMT-12",
    },
  ];
  const cities = [
    {
      id: 21,
      name: "Málaga",
      state_id: 11,
      state_code: "A",
      state_name: "Région",
      country_id: 1,
      country_code: "EX",
      country_name: "Côte",
      latitude: "0.00000000",
      longitude: "76.25000000",
      timezone: "Etc/GMT+12",
      wikiDataId: null,
    },
    {
      id: 22,
      name: "Other",
      state_id: 12,
      state_code: "B",
      state_name: "Second",
      country_id: 1,
      country_code: "EX",
      country_name: "Côte",
      latitude: "",
      longitude: null,
      timezone: "Etc/GMT-12",
    },
    {
      id: 23,
      name: "Unknown",
      state_id: 12,
      state_name: "Second",
      country_id: 999,
      country_name: "Unknown",
      country_code: "",
      timezone: null,
    },
  ];
  const examples = [
    ["/countries.json", "countries.json"],
    ["/countries/{iso2}.json", "countries/ex.json"],
    ["/countries/regions.json", "countries/regions.json"],
    ["/countries/region/{region}.json", "countries/region/asia.json"],
    [
      "/countries/subregion/{subregion}.json",
      "countries/subregion/southern-asia.json",
    ],
    ["/states/all.json", "states/all.json"],
    ["/states/{iso3166_2}.json", "states/ex-a.json"],
    ["/states/country/{country_iso2}.json", "states/country/ex.json"],
    ["/states/types.json", "states/types.json"],
    ["/states/type/{type}.json", "states/type/state.json"],
    ["/states/timezones.json", "states/timezones.json"],
    ["/cities/{id}.json", "cities/21.json"],
    ["/cities/country/{country_iso2}.json", "cities/country/ex.json"],
    [
      "/cities/country/{country_iso2}/index.json",
      "cities/country/ex/index.json",
    ],
    ["/cities/country/{country_iso2}/{shard}.json", "cities/country/ex/1.json"],
    ["/cities/state/{state_iso3166_2}.json", "cities/state/ex-a.json"],
    ["/cities/batches.json", "cities/batches.json"],
    ["/search/countries.json", "search/countries.json"],
    ["/search/states.json", "search/states.json"],
    ["/search/cities.json", "search/cities.json"],
    ["/search/cities/index.json", "search/cities/index.json"],
    ["/search/cities/country/{iso2}.json", "search/cities/country/ex.json"],
    [
      "/search/cities/country/{iso2}.json",
      "search/cities/country/unknown.json",
    ],
    ["/search/combined-sample.json", "search/combined-sample.json"],
    ["/search/combined.json", "search/combined.json"],
  ];
  for (const pretty of [false, true]) {
    config.OUTPUT_DIR = path.join(output, pretty ? "pretty" : "compact");
    config.PRETTY_JSON = pretty;
    await new CountriesGenerator(countries).generate();
    await new StatesGenerator(states, countries).generate();
    await new CitiesGenerator(cities, states, countries).generate();
    await new SearchGenerator(countries, states, cities).generate();
    const readOutput = (file) => readJSON(path.join(config.OUTPUT_DIR, file));
    const batchPath = readOutput("cities/batches.json").data[0].filename;
    const stateTimezone = readOutput("states/timezones.json").data[0].endpoint;
    const cityTimezone = readOutput("cities/timezones.json").data[0].endpoint;
    for (const [route, file] of [
      ...examples,
      ["/cities/batch/{filename}", batchPath],
      ["/states/timezone/{timezone}.json", stateTimezone],
      ["/cities/timezones.json", "cities/timezones.json"],
      ["/cities/timezone/{timezone}.json", cityTimezone],
    ]) {
      const operation = doc.paths[route]?.get;
      assert.ok(operation, `OpenAPI is missing ${route}`);
      const contract =
        operation.responses["200"].content["application/json"].schema;
      assert.ok(
        conforms(contract, readOutput(file), openapiFile),
        `${file} does not match ${route} in ${pretty ? "pretty" : "compact"} mode`,
      );
    }
    const city = readOutput("cities/state/ex-a.json").data[0];
    assert.equal(typeof city.latitude, pretty ? "string" : "number");
    assert.equal(city.wikiDataId, null);
    assert.equal(
      readOutput("search/cities.json").data[0].name_normalized,
      "malaga",
    );
  }
});

test("schemas reject malformed search shards, batch wrappers, and coordinates", () => {
  const defs = readJSON(schemaFile).$defs;
  assert.ok(conforms(defs.Coordinate, 0));
  assert.ok(conforms(defs.Coordinate, "0.00000000"));
  assert.ok(conforms(defs.Coordinate, null));
  assert.equal(conforms(defs.Coordinate, {}), false);
  const shardIndex = {
    data: [
      {
        country_code: "EX",
        country_name: "Example",
        count: 3,
        filename: "search/cities/country/ex.json",
      },
    ],
    meta: {
      type: "city_search_shard_index",
      count: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      api_version: "v1",
      searchable_fields: ["name"],
      name_normalization: "lowercase and fold diacritics",
    },
  };
  assert.ok(conforms(defs.CitySearchShardIndexResponse, shardIndex));
  shardIndex.data[0].count = "3";
  assert.equal(conforms(defs.CitySearchShardIndexResponse, shardIndex), false);
  const batch = {
    data: {
      1: {
        id: 1,
        name: "City",
        has_coordinates: true,
        has_wikidata: false,
        has_timezone: false,
      },
    },
    meta: {
      type: "cities_batch",
      batch_range: "1-2",
      cities_count: 1,
      usage: "x",
      api_version: "v1",
      generated_at: "2026-01-01T00:00:00.000Z",
    },
  };
  assert.ok(conforms(defs.CityBatchResponse, batch));
  batch.data = [];
  assert.equal(conforms(defs.CityBatchResponse, batch), false);
});

test("manifest contract matches a built dataset with a preserved file", async (t) => {
  const config = require("../src/config");
  const { DataProcessor } = require("../src/data-processor");
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), "geo-manifest-schema-"),
  );
  const savedInput = config.INPUT_DIR;
  const savedOutput = config.OUTPUT_DIR;
  t.after(async () => {
    config.INPUT_DIR = savedInput;
    config.OUTPUT_DIR = savedOutput;
    await fsp.rm(directory, { recursive: true, force: true });
  });
  config.INPUT_DIR = path.join(directory, "db");
  config.OUTPUT_DIR = path.join(directory, "api");
  await fsp.mkdir(config.INPUT_DIR);
  await fsp.mkdir(config.OUTPUT_DIR);
  const fixtures = {
    countries: [{ id: 1, name: "Example", iso2: "EX", iso3: "EXP" }],
    states: [
      {
        id: 2,
        name: "State",
        iso2: "A",
        iso3166_2: "EX-A",
        country_id: 1,
        country_code: "EX",
        country_name: "Example",
      },
    ],
    cities: [
      {
        id: 3,
        name: "City",
        state_id: 2,
        state_name: "State",
        country_id: 1,
        country_name: "Example",
      },
    ],
  };
  for (const [kind, data] of Object.entries(fixtures)) {
    await fsp.writeFile(
      path.join(config.INPUT_DIR, `${kind}.json`),
      JSON.stringify(data),
    );
  }
  await fsp.writeFile(path.join(config.OUTPUT_DIR, "extra.txt"), "preserved");
  const processor = new DataProcessor();
  await processor.loadData();
  await processor.generateAPI();
  const manifest = readJSON(path.join(config.OUTPUT_DIR, "manifest.json"));
  const contract =
    readJSON(openapiFile).paths["/manifest.json"].get.responses["200"].content[
      "application/json"
    ].schema;
  assert.ok(conforms(contract, manifest, openapiFile));
  assert.equal(manifest.file_count, manifest.files.length + 1);
  assert.equal(
    manifest.files.find((file) => file.path === "extra.txt").generated,
    false,
  );
  assert.equal(
    manifest.files.find((file) => file.path === "countries.json").generated,
    true,
  );
});

test("TypeScript declarations have valid syntax", (t) => {
  assert.ok(fs.existsSync(declarationsFile), "Missing TypeScript declarations");
  if (typeof require("node:module").stripTypeScriptTypes !== "function")
    return t.skip("Node cannot parse TypeScript syntax on this version");
  const script =
    'require("node:module").stripTypeScriptTypes(require("node:fs").readFileSync(process.argv[1], "utf8"))';
  const result = spawnSync(
    process.execPath,
    ["--no-warnings", "-e", script, declarationsFile],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("TypeScript declarations admit real nullable payloads and reject invalid data", async (t) => {
  assert.ok(fs.existsSync(declarationsFile), "Missing TypeScript declarations");
  let compiler = process.env.GEO_DATA_TYPESCRIPT_COMPILER;
  if (!compiler) {
    try {
      compiler = require.resolve("typescript/lib/tsc.js", { paths: [root] });
    } catch {
      return t.skip("TypeScript compiler is not installed");
    }
  }
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "geo-contract-types-"));
  t.after(() => fsp.rm(temp, { recursive: true, force: true }));
  const source = `import type { City, CityBatchResponse, CitySearchShardIndexResponse, Coordinate } from ${JSON.stringify(declarationsFile.replace(/\\/g, "/"))};\nconst coordinate: Coordinate = null;\nconst city: City = { id: 1, name: "A", latitude: "0", longitude: 0, wikiDataId: null };\ndeclare const batch: CityBatchResponse;\ndeclare const shards: CitySearchShardIndexResponse;\nconst item = batch.data["1"];\nif (item) { const key: number = item.id; }\nconst filename: string = shards.data[0].filename;\n// @ts-expect-error coordinate objects are invalid\nconst bad: Coordinate = {};\n// @ts-expect-error names must be strings\nconst invalid: City = { id: 1, name: 3 };\n`;
  const file = path.join(temp, "check.ts");
  await fsp.writeFile(file, source);
  const result = spawnSync(
    process.execPath,
    [compiler, "--noEmit", "--strict", "--skipLibCheck", file],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
