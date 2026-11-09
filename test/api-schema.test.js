const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const Ajv2020 = require("ajv/dist/2020");
const schema = require("../schemas/geo-data.schema.json");
const openapi = require("../openapi.json");
const config = require("../src/config");
const { getRoutes } = require("../src/api-contract");
const APIInfoGenerator = require("../src/generators/docs/api-info-generator");
const APIDocumentationGenerator = require("../src/generators/docs/api-documentation-generator");
const { DataProcessor } = require("../src/data-processor");

test("the canonical schema describes the v2 normalized city and country fields", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(schema.$defs.CitySummary.properties.state_path_key);
  assert.ok(schema.$defs.City.properties.wikidata_id);
  assert.ok(schema.$defs.CountryTimezone.properties.zone_name);
  assert.deepEqual(schema.$defs.Coordinate.type, ["number", "null"]);
});

test("OpenAPI exposes the hierarchical v2 endpoints", () => {
  assert.equal(openapi.info.version, "v2");
  for (const path of [
    "/countries.json",
    "/countries/{iso2}.json",
    "/countries/{iso2}/states.json",
    "/countries/{iso2}/states/{state}.json",
    "/countries/{iso2}/states/{state}/cities.json",
    "/countries/{iso2}/cities/index.json",
    "/countries/{iso2}/cities/{page}.json",
    "/cities/{id}.json",
    "/search/cities/index.json",
  ])
    assert.ok(openapi.paths[path], path);
  assert.equal(openapi.paths["/cities/batches.json"], undefined);
});

test("discovery catalogs use the shared routes and advertise city timezones only when generated", async (t) => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "geo-contract-discovery-"),
  );
  const previous = {
    output: config.OUTPUT_DIR,
    version: config.API_VERSION,
    base: config.CDN_BASE_URL,
  };
  t.after(async () => {
    Object.assign(config, {
      OUTPUT_DIR: previous.output,
      API_VERSION: previous.version,
      CDN_BASE_URL: previous.base,
    });
    await fs.rm(dir, { recursive: true, force: true });
  });
  Object.assign(config, {
    OUTPUT_DIR: dir,
    API_VERSION: "v2",
    CDN_BASE_URL: "https://example.test/api/v2",
  });
  const countries = [{ id: 1, name: "India", iso2: "IN" }];
  const states = [
    { id: 2, name: "Example", country_id: 1, country_code: "IN" },
  ];

  for (const timezone of [null, "Asia/Kolkata"]) {
    const cities = [{ id: 3, name: "Example", timezone, wikidata_id: null }];
    await new APIInfoGenerator(countries, states, cities, {}).generate();
    await new APIDocumentationGenerator(
      countries,
      states,
      cities,
      {},
    ).generate();
    const info = JSON.parse(await fs.readFile(path.join(dir, "api-info.json")));
    const docs = JSON.parse(
      await fs.readFile(path.join(dir, "documentation.json")),
    );
    const expected = getRoutes({ cityTimezones: !!timezone });
    const infoRoutes = Object.values(info.endpoints)
      .flatMap(Object.values)
      .sort();
    const docsRoutes = Object.values(docs.endpoints)
      .flatMap(Object.keys)
      .sort();
    assert.deepEqual(infoRoutes, expected.map((route) => route.path).sort());
    assert.deepEqual(
      docsRoutes,
      expected.map((route) => `GET /${route.path}`).sort(),
    );
    const text = JSON.stringify({ info, docs });
    assert.doesNotMatch(
      text,
      /\/v1\b|cities\/batches|combined-sample|states\/country/,
    );
    assert.match(text, /countries\/\{iso2\}\/states/);
  }
});

test("generated declarations and OpenAPI are current and share all route descriptors", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/generate-contracts.js", "--check"],
    { cwd: path.join(__dirname, ".."), encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(
    Object.keys(openapi.paths).sort(),
    getRoutes()
      .map((route) => `/${route.path}`)
      .sort(),
  );
  for (const route of getRoutes()) {
    const operation = openapi.paths[`/${route.path}`].get;
    assert.equal(
      operation.responses["200"].content["application/json"].schema.$ref,
      `./schemas/geo-data.schema.json#/$defs/${route.response}`,
    );
    const expectedParameters = [...route.path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      (operation.parameters || []).map((parameter) => parameter.name),
      expectedParameters,
    );
    for (const parameter of operation.parameters || [])
      assert.equal(parameter.required, true);
  }
});

test("generated types express required v2 model fields and numeric coordinates", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "geo-v2-types-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const rootTypes = path
    .join(__dirname, "../types/index.d.ts")
    .replace(/\\/g, "/");
  const clientTypes = path
    .join(__dirname, "../packages/client/models.d.ts")
    .replace(/\\/g, "/");
  const source = `import type { Country, CountryCityPageIndexResponse, ProcessorOptions, DataProcessor } from ${JSON.stringify(rootTypes)};\nimport type { City, CitySummary, State } from ${JSON.stringify(clientTypes)};\ndeclare const country: Country;\ndeclare const state: State;\ndeclare const city: City;\ndeclare const summary: CitySummary;\ndeclare const index: CountryCityPageIndexResponse;\ndeclare const processor: DataProcessor;\nconst options: ProcessorOptions = { countryShardSize: 2 };\nconst coordinate: number | null = city.latitude;\nconst key: string = state.path_key;\nconst code: string | null = summary.state_code;\nconst timezone: string | null = country.timezones[0].zone_name;\nconst filename: string = index.data[0].filename;\nprocessor.run();\n// @ts-expect-error v2 coordinates cannot be strings\nconst wrongCoordinate: City['latitude'] = '0';\n// @ts-expect-error summary records do not contain details\nsummary.wikidata_id;\n// @ts-expect-error v2 requires a state path key\nconst incomplete: CitySummary = { id: 1, name: 'A' };\n`;
  const file = path.join(temp, "check.ts");
  await fs.writeFile(file, source);
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--lib",
      "ES2022,DOM",
      file,
      path.join(__dirname, "../packages/client/typecheck/consumer.ts"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("Draft 2020-12 schema validates every compact and pretty fixture output", async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "geo-v2-schema-"));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const inputDir = path.join(fixture, "db");
  await fs.mkdir(inputDir);
  const countries = [
    {
      id: 1,
      name: "India",
      iso2: "IN",
      iso3: "IND",
      region: "Asia",
      region_id: 3,
      subregion: "Southern Asia",
      subregion_id: 14,
      latitude: "0",
      longitude: "77.25",
      timezones: [
        {
          zoneName: "Asia/Kolkata",
          gmtOffset: 19800,
          gmtOffsetName: "UTC+05:30",
          abbreviation: "IST",
          tzName: "India Standard Time",
        },
      ],
      translations: { fr: "Inde" },
    },
    { id: 2, name: "United States", iso2: "US", iso3: "USA" },
  ];
  const states = [
    {
      id: 3,
      name: "Example",
      iso2: "CON",
      iso3166_2: "IN-CON",
      country_id: 1,
      country_code: "IN",
      country_name: "India",
      type: "state",
      timezone: "Asia/A",
      latitude: "0",
      longitude: "0",
    },
    {
      id: 4,
      name: "Empty",
      iso2: "EM",
      iso3166_2: "IN-EM",
      country_id: 1,
      country_code: "IN",
      country_name: "India",
      type: "state",
      timezone: "Asia-A",
    },
  ];
  const cities = [
    {
      id: 5,
      name: "São",
      state_id: 3,
      state_name: "Old name",
      state_code: "OLD",
      country_id: 1,
      country_code: "IN",
      country_name: "Old country",
      latitude: "0",
      longitude: "12.5",
      timezone: "Asia/A",
      wikiDataId: "Q5",
    },
    {
      id: 6,
      name: "Zed",
      state_id: 3,
      state_name: "Example",
      state_code: "CON",
      country_id: 1,
      country_code: "IN",
      country_name: "India",
      latitude: null,
      longitude: null,
      timezone: "Asia-A",
    },
  ];
  for (const [name, data] of Object.entries({ countries, states, cities })) {
    await fs.writeFile(
      path.join(inputDir, `${name}.json`),
      JSON.stringify(data),
    );
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(schema);
  const validators = new Map(
    getRoutes().map((route) => [
      route.response,
      ajv.compile({ $ref: `${schema.$id}#/$defs/${route.response}` }),
    ]),
  );
  const routes = [...getRoutes()].sort((a, b) => {
    const count = (route) => [...route.path.matchAll(/\{/g)].length;
    return count(a) - count(b) || b.path.length - a.path.length;
  });
  const matchRoute = (name) =>
    routes.find((route) => {
      const pattern = route.path
        .split(/(\{[^}]+\})/)
        .map((part) =>
          part.startsWith("{")
            ? "[^/]+"
            : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join("");
      return new RegExp(`^${pattern}$`).test(name);
    });
  async function walk(dir, prefix = "") {
    const result = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory())
        result.push(...(await walk(path.join(dir, entry.name), name)));
      else if (name.endsWith(".json")) result.push(name);
    }
    return result;
  }
  const snapshots = [];
  for (const pretty of [false, true]) {
    const outputDir = path.join(fixture, pretty ? "pretty" : "compact");
    await new DataProcessor({
      inputDir,
      outputDir,
      pretty,
      countryShardSize: 1,
    }).run();
    const output = new Map();
    for (const name of await walk(outputDir)) {
      const route = matchRoute(name);
      assert.ok(route, `No contract route for ${name}`);
      const data = JSON.parse(
        await fs.readFile(path.join(outputDir, name), "utf8"),
      );
      const validate = validators.get(route.response);
      assert.ok(
        validate(data),
        `${name} (${route.response}): ${ajv.errorsText(validate.errors)}`,
      );
      output.set(name, data);
    }
    assert.deepEqual(output.get("countries/us/states.json").data, []);
    assert.deepEqual(output.get("countries/us/cities/index.json").data, []);
    assert.deepEqual(output.get("countries/in/states/em/cities.json").data, []);
    const index = output.get("countries/in/cities/index.json");
    assert.equal(index.meta.page_size, 1);
    assert.equal(index.meta.total_cities, 2);
    assert.deepEqual(
      index.data.map((page) => output.get(page.filename).data[0].id),
      [5, 6],
    );
    assert.equal(output.get("cities/5.json").data.state_path_key, "id-3");
    assert.equal(output.get("cities/5.json").data.country_name, "India");
    for (const kind of ["states", "cities"]) {
      const timezoneIndex = output.get(`${kind}/timezones.json`).data;
      assert.equal(timezoneIndex.length, 2);
      assert.notEqual(timezoneIndex[0].endpoint, timezoneIndex[1].endpoint);
      for (const entry of timezoneIndex)
        assert.equal(output.get(entry.endpoint).meta.timezone, entry.timezone);
    }
    snapshots.push(output);
  }
  for (const name of [
    "countries.json",
    "countries/in/states.json",
    "cities/5.json",
    "countries/in/cities/index.json",
  ]) {
    assert.deepEqual(snapshots[0].get(name), snapshots[1].get(name));
  }
});

test("schema rejects legacy fields and malformed v2 records", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(schema);
  const validate = ajv.compile({ $ref: `${schema.$id}#/$defs/City` });
  const city = {
    id: 1,
    name: "A",
    name_normalized: "a",
    state_id: 2,
    state_code: "AA",
    state_name: "A",
    state_path_key: "aa",
    country_id: 3,
    country_code: "AA",
    country_name: "A",
    latitude: 0,
    longitude: null,
    timezone: null,
    wikidata_id: null,
  };
  assert.equal(validate(city), true);
  assert.equal(validate({ ...city, latitude: "0" }), false);
  assert.equal(validate({ ...city, wikiDataId: "Q1" }), false);
  const { state_path_key, ...withoutPath } = city;
  assert.equal(validate(withoutPath), false);
});
