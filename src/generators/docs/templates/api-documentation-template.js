class ApiDocumentationTemplate {
  generate() {
    return `# Geo-Data API v2

Geo-Data API is a static collection of JSON files for countries, states and cities. A deployment serves files under an API base such as \`https://cdn.example.com/api/v2/\`. Substitute your own deployment URL in the examples.

## Start here

1. Read \`countries.json\`, then \`countries/{iso2}/states.json\`.
2. Use the selected state's \`path_key\` in \`countries/{iso2}/states/{state}/cities.json\`.
3. Fetch a full city record from \`cities/{id}.json\`, or follow every filename in \`countries/{iso2}/cities/index.json\` to search a country's city summaries.

ISO2 codes in JSON are uppercase; URL codes are lowercase. A state key is country-local, may be an \`id-{id}\` fallback, and must be taken from the state record. Known countries and states have collection files even when empty; unknown resources return HTTP 404.

Resource and list responses use \`{ "data": ..., "meta": ... }\`. Discovery catalogs, the manifest and build report have their own top-level structures. The resource metadata includes \`type\`, \`count\`, \`api_version\`, and a stable dataset-release \`generated_at\`. Country and state lists have the same record shape as details; city lists are summaries and city detail files add coordinates, timezone, and \`wikidata_id\`.

Country page indexes contain API-relative page filenames and counts. The global \`search/cities/index.json\` lists every country index. Normalize a query using lowercase Unicode NFD and remove combining marks before matching \`name_normalized\`. Search is client-side; the static server does not process query parameters.

See the [quick start](QUICK_START.md), [endpoint reference](ENDPOINTS.md), and [data structure](DATA_STRUCTURE.md). Inspect \`api-info.json\`, \`documentation.json\`, \`manifest.json\`, and \`build-report.json\` for discovery and provenance. IDs identify records within a source snapshot and may change in a future dataset.
`;
  }
}

module.exports = ApiDocumentationTemplate;
