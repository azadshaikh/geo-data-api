#!/usr/bin/env node
// Rebuild db/ from a Countries States Cities Database release.
//
// The upstream cities export is only published as a release asset and is
// several times larger than the fields this API consumes, so this script
// downloads it, keeps the fields used by the v2 model, and writes a coherent
// snapshot that can be committed to Git.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

const DataValidator = require("../src/validators/data-validator");
const { normalizeDataset } = require("../src/utils/v2-model");

const REPO = "dr5hn/countries-states-cities-database";
const CITY_ASSET = "json-cities.json.gz";

// Field lists mirror the reads in src/utils/v2-model.js. Keeping the source
// snapshot to these fields avoids a 193 MB cities.json in the repository.
const COUNTRY_FIELDS = [
  "id",
  "name",
  "iso3",
  "iso2",
  "numeric_code",
  "phonecode",
  "capital",
  "currency",
  "currency_name",
  "currency_symbol",
  "tld",
  "native",
  "region",
  "region_id",
  "subregion",
  "subregion_id",
  "nationality",
  "timezones",
  "translations",
  "latitude",
  "longitude",
  "emoji",
  "emojiU",
];
const STATE_FIELDS = [
  "id",
  "name",
  "country_id",
  "country_code",
  "country_name",
  "iso2",
  "iso3166_2",
  "fips_code",
  "type",
  "level",
  "parent_id",
  "latitude",
  "longitude",
  "timezone",
];
const CITY_FIELDS = [
  "id",
  "name",
  "state_id",
  "state_code",
  "state_name",
  "country_id",
  "country_code",
  "country_name",
  "latitude",
  "longitude",
  "timezone",
  "wikiDataId",
];

function parseArgs(argv) {
  const options = { tag: null, source: null, output: "./db" };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--tag", "--source", "--output"].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function usage() {
  console.log(`
Usage: node scripts/import-upstream.js [options]

Options:
  --tag <tag>        Upstream release tag (default: latest release)
  --source <dir>     Read countries.json, states.json and cities.json[.gz]
                     from a directory instead of downloading
  --output <dir>     Directory for the derived snapshot (default: ./db)
  --help, -h         Show this help message

The script keeps only the fields consumed by the v2 model. Cities whose
state is missing upstream are skipped because v2 requires a parent state.
`);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`${url} responded with ${response.status}`);
  return response.json();
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded with ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function releaseMetadata(tag) {
  return fetchJson(
    tag
      ? `https://api.github.com/repos/${REPO}/releases/tags/${tag}`
      : `https://api.github.com/repos/${REPO}/releases/latest`,
  );
}

async function loadSource(source) {
  const read = async (name) => {
    for (const candidate of [`${name}.json`, `${name}.json.gz`]) {
      const file = path.join(source, candidate);
      try {
        const bytes = await fs.readFile(file);
        const text = candidate.endsWith(".gz")
          ? gunzipSync(bytes).toString("utf8")
          : bytes.toString("utf8");
        return JSON.parse(text);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    throw new Error(`${source} is missing ${name}.json or ${name}.json.gz`);
  };
  return {
    countries: await read("countries"),
    states: await read("states"),
    cities: await read("cities"),
  };
}

function project(records, fields, kind) {
  if (!Array.isArray(records))
    throw new Error(`Upstream ${kind} data is not an array`);
  return records.map((record) =>
    Object.fromEntries(fields.map((field) => [field, record[field]])),
  );
}

function compact(records) {
  return `${JSON.stringify(records)}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  // A local source can be processed offline; only ask GitHub for release
  // metadata when downloading or when a tag was supplied explicitly.
  const release =
    options.source && !options.tag ? null : await releaseMetadata(options.tag);
  const tag = options.tag || release?.tag_name || "local source";
  const publishedAt = release
    ? new Date(release.published_at).toISOString()
    : null;
  console.log(
    `Upstream release: ${tag}${publishedAt ? ` (${publishedAt})` : ""}`,
  );

  let source = options.source && path.resolve(options.source);
  let tempDir;
  if (!source) {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "geo-upstream-"));
    source = tempDir;
    console.log(`Downloading ${tag} into ${tempDir}...`);
    const raw = `https://raw.githubusercontent.com/${REPO}/${tag}/json`;
    for (const name of ["countries", "states"]) {
      const bytes = await download(`${raw}/${name}.json`);
      await fs.writeFile(path.join(source, `${name}.json`), bytes);
    }
    const asset = release.assets.find((item) => item.name === CITY_ASSET);
    if (!asset)
      throw new Error(`${tag} does not publish the ${CITY_ASSET} asset`);
    const bytes = await download(asset.browser_download_url);
    await fs.writeFile(path.join(source, CITY_ASSET), bytes);
  }

  try {
    const upstream = await loadSource(source);
    const countries = project(upstream.countries, COUNTRY_FIELDS, "countries");
    const states = project(upstream.states, STATE_FIELDS, "states");
    const stateIds = new Set(states.map((state) => state.id));
    const skipped = upstream.cities.filter(
      (city) => !stateIds.has(city.state_id),
    );
    const cities = project(
      upstream.cities.filter((city) => stateIds.has(city.state_id)),
      CITY_FIELDS,
      "cities",
    );

    // Fail before writing when the derived snapshot is not coherent.
    const normalized = normalizeDataset(countries, states, cities);
    new DataValidator(countries, states, cities).validateDataStructure();

    const output = path.resolve(options.output);
    await fs.mkdir(output, { recursive: true });
    for (const [name, records] of Object.entries({ countries, states, cities }))
      await fs.writeFile(path.join(output, `${name}.json`), compact(records));

    console.log(`Wrote ${output}`);
    console.log(
      `  countries: ${normalized.countries.length}, states: ${normalized.states.length}, cities: ${normalized.cities.length}`,
    );
    if (skipped.length) {
      console.log(
        `  skipped ${skipped.length} cities without a parent state: ${skipped
          .map((city) => city.name)
          .join(", ")}`,
      );
    }
    if (publishedAt) {
      console.log(
        `Next: set RELEASE_TIMESTAMP in src/config.js to ${publishedAt}, update the snapshot in src/attribution.js and ATTRIBUTION.md, then run npm run build.`,
      );
    } else {
      console.log(
        "Next: set RELEASE_TIMESTAMP and update the snapshot in src/attribution.js and ATTRIBUTION.md, then run npm run build.",
      );
    }
    console.log(`Source credit: Data by Countries States Cities Database`);
    console.log(`https://github.com/${REPO} | ODbL v1.0`);
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
});
