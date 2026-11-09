class QuickStartTemplate {
  generate() {
    return `# Quick Start Guide

Replace the example base with your own published static API. No authentication is needed for publicly hosted files.

\`\`\`javascript
const base = new URL("https://cdn.example.com/api/v2/");

async function read(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(\`Request failed: \${response.status}\`);
  return (await response.json()).data;
}

const countries = await read("countries.json");
const states = await read("countries/us/states.json");
// Pick a state in your UI and use its path_key, not a guessed ISO code.
const state = states.find(item => item.path_key === "ca");
const cities = state ? await read(\`countries/us/states/\${state.path_key}/cities.json\`) : [];
console.log(countries, states, cities);
\`\`\`

To search all city summaries in a country, follow all page filenames in its index:

\`\`\`javascript
const index = await read("countries/br/cities/index.json");
const pages = await Promise.all(index.map(page => read(page.filename)));
const query = "Sao Paulo".toLowerCase().normalize("NFD").replace(/\\p{M}/gu, "");
const matches = pages.flat().filter(city => city.name_normalized.includes(query));
console.log(matches);
\`\`\`

An empty country index yields no requests for pages and no matches. For a single city's full data, fetch \`cities/{id}.json\`; a missing ID returns HTTP 404. See the [endpoint reference](ENDPOINTS.md) and [data structure](DATA_STRUCTURE.md).
`;
  }
}

module.exports = QuickStartTemplate;
