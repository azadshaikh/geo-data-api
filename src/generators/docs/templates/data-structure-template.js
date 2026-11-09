const config = require("../../../config");

class DataStructureTemplate {
  constructor(countries, states, cities, dataAnalysis) {
    this.countries = countries;
    this.states = states;
    this.cities = cities;
    this.dataAnalysis = dataAnalysis;
  }

  generate() {
    // Prefer specific sample records when available (Germany, Bavaria, Berlin)
    const sampleCountry =
      this.countries.find((c) => c && (c.id === 82 || c.country_id === 82)) ||
      this.countries[0] ||
      {};

    const sampleState =
      this.states.find((s) => s && (s.id === 3009 || s.state_id === 3009)) ||
      this.states[0] ||
      {};

    const sampleCity =
      this.cities.find((x) => x && (x.id === 24053 || x.city_id === 24053)) ||
      this.cities[0] ||
      {};

    return `# Data Structure Reference

## Countries

### Sample Country Object

\`\`\`json
${JSON.stringify(sampleCountry, null, 2)}
\`\`\`

### Country Fields

| Field | Type | Description | Always Present |
|-------|------|-------------|----------------|
| \`id\` | integer | Unique country identifier | ✅ |
| \`name\` | string | Country name in English | ✅ |
| \`iso2\` | string | ISO 3166-1 alpha-2 code | ✅ |
| \`iso3\` | string | ISO 3166-1 alpha-3 code | ✅ |
| \`native\` | string | Native country name | ❌ |
| \`capital\` | string | Capital city name | ❌ |
| \`currency\` | string | Primary currency code | ❌ |
| \`currency_name\` | string | Currency full name | ❌ |
| \`currency_symbol\` | string | Currency symbol | ❌ |
| \`region\` | string | Continental region | ❌ |
| \`subregion\` | string | Geographic subregion | ❌ |
| \`phonecode\` | string | International dialing code | ❌ |
| \`latitude\` | number or string | Geographic latitude | ❌ |
| \`longitude\` | number or string | Geographic longitude | ❌ |
| \`emoji\` | string | Unicode flag emoji | ❌ |
| \`tld\` | string | Top-level domain | ❌ |
| \`timezones\` | array | List of timezone objects | ❌ |
| \`translations\` | object | Country name translations | ❌ |

---

## States

### Sample State Object

\`\`\`json
${JSON.stringify(sampleState, null, 2)}
\`\`\`

### State Fields

| Field | Type | Description | Always Present |
|-------|------|-------------|----------------|
| \`id\` | integer | Unique state identifier | ✅ |
| \`name\` | string | State/province name | ✅ |
| \`country_id\` | integer | Parent country ID | ✅ |
| \`country_code\` | string | Country ISO2 code | ✅ |
| \`country_name\` | string | Country name | ✅ |
| \`iso2\` | string | State ISO code | ❌ |
| \`iso3166_2\` | string | ISO 3166-2 subdivision code | ❌ |
| \`type\` | string | Administrative type (province, state, etc.) | ❌ |
| \`fips_code\` | string | FIPS code | ❌ |
| \`latitude\` | number or string | Geographic latitude | ❌ |
| \`longitude\` | number or string | Geographic longitude | ❌ |
| \`timezone\` | string | Primary timezone | ❌ |

### State Types

The following administrative types are available:

${this.dataAnalysis.states.types.map((type) => `- \`${type}\``).join("\n")}

---

## Cities

### Sample City Object

\`\`\`json
${JSON.stringify(sampleCity, null, 2)}
\`\`\`

### City Fields

| Field | Type | Description | Always Present |
|-------|------|-------------|----------------|
| \`id\` | integer | Unique city identifier | ✅ |
| \`name\` | string | City name | ✅ |
| \`state_id\` | integer | Parent state ID | ✅ |
| \`state_name\` | string | State/province name | ✅ |
| \`country_id\` | integer | Parent country ID | ✅ |
| \`country_name\` | string | Country name | ✅ |
| \`state_code\` | string | State ISO code | ❌ |
| \`country_code\` | string | Country ISO2 code | ❌ |
| \`latitude\` | number or string | Geographic latitude | ❌ |
| \`longitude\` | number or string | Geographic longitude | ❌ |
| \`wikiDataId\` | string | WikiData identifier | ❌ |
| \`timezone\` | string | Primary timezone | ❌ |

---

## Response Wrapper

Most entity responses are wrapped in this structure:

### Standard Response

\`\`\`json
{
  "data": [], // Array or Object containing the requested data
  "meta": {
    "type": "countries", // Type of data returned
    "count": 195, // Number of items in data array
    "generated_at": "2024-01-01T00:00:00.000Z", // Stable release timestamp
    "api_version": "v1" // API version
  }
}
\`\`\`

### Individual Resource Response

\`\`\`json
{
  "data": {}, // Single object for individual resources
  "meta": {
    "type": "country",
    "id": 1,
    "generated_at": "2024-01-01T00:00:00.000Z",
    "api_version": "v1"
  }
}
\`\`\`

---

## Data Quality Notes

### Geographic Coordinates

- **${((this.dataAnalysis.states.with_coordinates / this.states.length) * 100).toFixed(1)}%** of states have latitude/longitude coordinates
- **${((this.dataAnalysis.cities.with_coordinates / this.cities.length) * 100).toFixed(1)}%** of cities have latitude/longitude coordinates
- Compact JSON converts coordinates to numbers; pretty JSON preserves the source values, which may be strings.

### WikiData Integration

- **${((this.dataAnalysis.cities.with_wikidata / this.cities.length) * 100).toFixed(1)}%** of cities have WikiData references
- WikiData IDs can be used to fetch additional information from Wikipedia/Wikidata APIs
- Format: \`Q{number}\` (e.g., "Q1492")

### Timezone Information

- **${this.dataAnalysis.states.timezones}** unique timezones available for states
- Format follows IANA timezone database (e.g., "Asia/Kabul", "America/New_York")
- City timezone fields and timezone endpoint files are present only when supplied by the source dataset.

### Administrative Types

States are classified by administrative type:

${this.dataAnalysis.states.types.map((type) => `- **${type}**: ${this.states.filter((s) => s.type === type).length} items`).join("\n")}

---

## Usage Examples

### Filtering by Coordinates

\`\`\`javascript
// Get cities with coordinates
const cities = await fetch('${config.CDN_BASE_URL}/cities/country/us.json');
const citiesData = await cities.json();

const citiesWithCoords = citiesData.data.filter(city =>
  city.latitude != null && city.latitude !== '' && city.longitude != null && city.longitude !== ''
);
\`\`\`

### Accessing Individual Cities

\`\`\`javascript
const response = await fetch('${config.CDN_BASE_URL}/cities/57995.json');
if (!response.ok) throw new Error(\`City request failed: \${response.status}\`);
const { data: city } = await response.json();
console.log(city.name);
\`\`\`

### Accessing City Batches

\`\`\`javascript
// Method 1: Batch index lookup
const batchIndex = await fetch('${config.CDN_BASE_URL}/cities/batches.json');
const batches = await batchIndex.json();

const batch = batches.data.find(b => cityId >= b.start_id && cityId <= b.end_id);
if (batch) {
  const response = await fetch(\`${config.CDN_BASE_URL}/\${batch.filename}\`);
  const batchData = await response.json();
  const city = batchData.data[cityId];
}

// Method 2: Using a helper class
class CityAPI {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.batchIndex = null;
    this.batchCache = new Map();
  }

  async loadBatchIndex() {
    if (!this.batchIndex) {
      const response = await fetch(\`\${this.baseUrl}/cities/batches.json\`);
      const data = await response.json();
      this.batchIndex = data.data;
    }
    return this.batchIndex;
  }

  async getCity(cityId) {
    await this.loadBatchIndex();

    const batch = this.batchIndex.find(b =>
      cityId >= b.start_id && cityId <= b.end_id
    );

    if (!batch) {
      throw new Error(\`City ID \${cityId} not found\`);
    }

    if (this.batchCache.has(batch.filename)) {
      const cachedBatch = this.batchCache.get(batch.filename);
      if (!cachedBatch[cityId]) throw new Error('City not found: ' + cityId);
      return cachedBatch[cityId];
    }

    const response = await fetch(\`\${this.baseUrl}/\${batch.filename}\`);
    const batchData = await response.json();

    this.batchCache.set(batch.filename, batchData.data);
    if (!batchData.data[cityId]) throw new Error('City not found: ' + cityId);
    return batchData.data[cityId];
  }
}

// Usage:
const cityAPI = new CityAPI('${config.CDN_BASE_URL}');
const bhopal = await cityAPI.getCity(57995);
console.log(bhopal.name); // "Bhopal"
\`\`\`

### Distance Calculations

\`\`\`javascript
// Calculate distance between two cities with coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}
\`\`\`
`;
  }
}

module.exports = DataStructureTemplate;
