class DataStructureTemplate {
  generate() {
    return `# Data Structure Reference

Resource and list responses wrap their value in \`data\` and metadata in \`meta\`. Discovery catalogs, the manifest, and the build report have their own top-level structures. The resource metadata includes \`type\`, \`count\`, \`api_version: "v2"\`, and the stable release timestamp \`generated_at\`. Collection data is an array; detail data is an object. City indexes also report \`country_code\`, \`total_cities\`, and \`page_size\`.

## Countries and states

Country and state lists and detail files use the same respective record shapes. Their useful source fields use snake_case and include \`name_normalized\`. Country and state coordinates are numbers or \`null\`. Country timezone keys and \`emoji_u\` use snake_case.

States include \`path_key\`: use it as the \`{state}\` segment with the lowercase country ISO2. It is the country-local subdivision code when safe and available, or an \`id-{numeric-id}\` fallback. Do not infer it from \`iso3166_2\`.

## Cities

City summary lists contain \`id\`, \`name\`, \`name_normalized\`, \`state_id\`, \`state_code\`, \`state_name\`, \`state_path_key\`, \`country_id\`, \`country_code\`, and \`country_name\`. Full city detail adds numeric-or-null \`latitude\` and \`longitude\`, nullable \`timezone\`, and nullable \`wikidata_id\`. City timezones are not inferred from states. Missing scalar fields use \`null\`.

## Indexes and search

Country index entries contain \`filename\` and \`count\`; global city-index entries add \`country_code\`. Filenames are relative to the API base. Normalize names and queries by lowercasing, applying Unicode NFD, and removing combining marks; this folds diacritics, not every writing system. Follow every page for complete country coverage.

The \`manifest.json\` records the source hash and stable release timestamp. Source IDs identify records within a snapshot and are not guaranteed to persist across upstream updates. The data is derived from the [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database) and licensed under the [ODbL 1.0](../LICENSE-DATA); see [ATTRIBUTION.md](../ATTRIBUTION.md) for the required credit and the changes made for this API.
`;
  }
}

module.exports = DataStructureTemplate;
