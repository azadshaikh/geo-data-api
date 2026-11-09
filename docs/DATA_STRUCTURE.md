# Data Structure Reference

## Countries

### Sample Country Object

```json
{
  "id": 82,
  "name": "Germany",
  "iso3": "DEU",
  "iso2": "DE",
  "numeric_code": "276",
  "phonecode": "49",
  "capital": "Berlin",
  "currency": "EUR",
  "currency_name": "Euro",
  "currency_symbol": "€",
  "tld": ".de",
  "native": "Deutschland",
  "region": "Europe",
  "region_id": 4,
  "subregion": "Western Europe",
  "subregion_id": 17,
  "nationality": "German",
  "timezones": [
    {
      "zoneName": "Europe/Berlin",
      "gmtOffset": 3600,
      "gmtOffsetName": "UTC+01:00",
      "abbreviation": "CET",
      "tzName": "Central European Time"
    },
    {
      "zoneName": "Europe/Busingen",
      "gmtOffset": 3600,
      "gmtOffsetName": "UTC+01:00",
      "abbreviation": "CET",
      "tzName": "Central European Time"
    }
  ],
  "translations": {
    "br": "Alamagn",
    "ko": "독일",
    "pt-BR": "Alemanha",
    "pt": "Alemanha",
    "nl": "Duitsland",
    "hr": "Njemačka",
    "fa": "آلمان",
    "de": "Deutschland",
    "es": "Alemania",
    "fr": "Allemagne",
    "ja": "ドイツ",
    "it": "Germania",
    "zh-CN": "德国",
    "tr": "Almanya",
    "ru": "Германия",
    "uk": "Німеччина",
    "pl": "Niemcy"
  },
  "latitude": "51.00000000",
  "longitude": "9.00000000",
  "emoji": "🇩🇪",
  "emojiU": "U+1F1E9 U+1F1EA"
}
```

### Country Fields

| Field | Type | Description | Always Present |
|-------|------|-------------|----------------|
| `id` | integer | Unique country identifier | ✅ |
| `name` | string | Country name in English | ✅ |
| `iso2` | string | ISO 3166-1 alpha-2 code | ✅ |
| `iso3` | string | ISO 3166-1 alpha-3 code | ✅ |
| `native` | string | Native country name | ❌ |
| `capital` | string | Capital city name | ❌ |
| `currency` | string | Primary currency code | ❌ |
| `currency_name` | string | Currency full name | ❌ |
| `currency_symbol` | string | Currency symbol | ❌ |
| `region` | string | Continental region | ❌ |
| `subregion` | string | Geographic subregion | ❌ |
| `phonecode` | string | International dialing code | ❌ |
| `latitude` | number or string | Geographic latitude | ❌ |
| `longitude` | number or string | Geographic longitude | ❌ |
| `emoji` | string | Unicode flag emoji | ❌ |
| `tld` | string | Top-level domain | ❌ |
| `timezones` | array | List of timezone objects | ❌ |
| `translations` | object | Country name translations | ❌ |

---

## States

### Sample State Object

```json
{
  "id": 3009,
  "name": "Bavaria",
  "country_id": 82,
  "country_code": "DE",
  "country_name": "Germany",
  "iso2": "BY",
  "iso3166_2": "DE-BY",
  "fips_code": "02",
  "type": "land",
  "level": null,
  "parent_id": null,
  "latitude": "48.94675620",
  "longitude": "11.40387170",
  "timezone": "Europe/Berlin"
}
```

### State Fields

| Field | Type | Description | Always Present |
|-------|------|-------------|----------------|
| `id` | integer | Unique state identifier | ✅ |
| `name` | string | State/province name | ✅ |
| `country_id` | integer | Parent country ID | ✅ |
| `country_code` | string | Country ISO2 code | ✅ |
| `country_name` | string | Country name | ✅ |
| `iso2` | string | State ISO code | ❌ |
| `iso3166_2` | string | ISO 3166-2 subdivision code | ❌ |
| `type` | string | Administrative type (province, state, etc.) | ❌ |
| `fips_code` | string | FIPS code | ❌ |
| `latitude` | number or string | Geographic latitude | ❌ |
| `longitude` | number or string | Geographic longitude | ❌ |
| `timezone` | string | Primary timezone | ❌ |

### State Types

The following administrative types are available:

- `province`
- `municipality`
- `district`
- `county`
- `atoll`
- `parish`
- `dependency`
- `city`
- `region`
- `capital city`
- `territory`
- `state`
- `autonomous republic`
- `governorate`
- `division`
- `oblast`
- `department`
- `special municipality`
- `canton`
- `entity`
- `federal district`
- `autonomous municipality`
- `geographical region`
- `prefecture`
- `commune`
- `economic prefecture`
- `autonomous region`
- `special administrative region`
- `capital district`
- `island`
- `autonomous district`
- `administration`
- `metropolitan department`
- `European collectivity`
- `metropolitan region`
- `metropolitan collectivity with special status`
- `overseas region`
- `overseas collectivity`
- `overseas territory`
- `land`
- `regional unit`
- `administrative region`
- `village`
- `city with county rights`
- `union territory`
- `Special region`
- `free municipal consortium`
- `decentralized regional entity`
- `metropolitan city`
- `state city`
- `popularate`
- `district municipality`
- `federal territory`
- `administrative atoll`
- `local council`
- `sheadings`
- `chain`
- `autonomous territorial unit`
- `territorial unit`
- `quarter`
- `special island authority`
- `capital territory`
- `special city`
- `arctic region`
- `administered area`
- `federal capital territory`
- `indigenous region`
- `capital`
- `voivodship`
- `republic`
- `administrative territory`
- `autonomous city`
- `area`
- `urban municipality`
- `special self-governing province`
- `special self-governing city`
- `autonomous community`
- `districts under republic administration`
- `metropolitan administration`
- `borough`
- `town council`
- `island council`
- `emirate`
- `council area`
- `unitary authority`
- `district council`
- `borough council`
- `london borough`
- `metropolitan district`
- `two-tier county`
- `country`
- `outlying area`
- `federal dependency`

---

## Cities

### Sample City Object

```json
{
  "id": 24053,
  "name": "Berlin",
  "state_id": 3010,
  "state_code": "BE",
  "state_name": "Berlin",
  "country_id": 82,
  "country_code": "DE",
  "country_name": "Germany",
  "latitude": "52.52437000",
  "longitude": "13.41053000",
  "timezone": null,
  "wikiDataId": "Q64"
}
```

### City Fields

| Field | Type | Description | Always Present |
|-------|------|-------------|----------------|
| `id` | integer | Unique city identifier | ✅ |
| `name` | string | City name | ✅ |
| `state_id` | integer | Parent state ID | ✅ |
| `state_name` | string | State/province name | ✅ |
| `country_id` | integer | Parent country ID | ✅ |
| `country_name` | string | Country name | ✅ |
| `state_code` | string | State ISO code | ❌ |
| `country_code` | string | Country ISO2 code | ❌ |
| `latitude` | number or string | Geographic latitude | ❌ |
| `longitude` | number or string | Geographic longitude | ❌ |
| `wikiDataId` | string | WikiData identifier | ❌ |
| `timezone` | string | Primary timezone | ❌ |

---

## Response Wrapper

Most entity responses are wrapped in this structure:

### Standard Response

```json
{
  "data": [], // Array or Object containing the requested data
  "meta": {
    "type": "countries", // Type of data returned
    "count": 195, // Number of items in data array
    "generated_at": "2024-01-01T00:00:00.000Z", // Stable release timestamp
    "api_version": "v1" // API version
  }
}
```

### Individual Resource Response

```json
{
  "data": {}, // Single object for individual resources
  "meta": {
    "type": "country",
    "id": 1,
    "generated_at": "2024-01-01T00:00:00.000Z",
    "api_version": "v1"
  }
}
```

---

## Data Quality Notes

### Geographic Coordinates

- **100.0%** of states have latitude/longitude coordinates
- **100.0%** of cities have latitude/longitude coordinates
- Compact JSON converts coordinates to numbers; pretty JSON preserves the source values, which may be strings.

### WikiData Integration

- **99.8%** of cities have WikiData references
- WikiData IDs can be used to fetch additional information from Wikipedia/Wikidata APIs
- Format: `Q{number}` (e.g., "Q1492")

### Timezone Information

- **352** unique timezones available for states
- Format follows IANA timezone database (e.g., "Asia/Kabul", "America/New_York")
- City timezone fields and timezone endpoint files are present only when supplied by the source dataset.

### Administrative Types

States are classified by administrative type:

- **province**: 1159 items
- **municipality**: 525 items
- **district**: 748 items
- **county**: 214 items
- **atoll**: 2 items
- **parish**: 101 items
- **dependency**: 8 items
- **city**: 31 items
- **region**: 514 items
- **capital city**: 6 items
- **territory**: 5 items
- **state**: 279 items
- **autonomous republic**: 3 items
- **governorate**: 150 items
- **division**: 27 items
- **oblast**: 6 items
- **department**: 221 items
- **special municipality**: 10 items
- **canton**: 48 items
- **entity**: 2 items
- **federal district**: 2 items
- **autonomous municipality**: 1 items
- **geographical region**: 2 items
- **prefecture**: 120 items
- **commune**: 29 items
- **economic prefecture**: 1 items
- **autonomous region**: 17 items
- **special administrative region**: 2 items
- **capital district**: 3 items
- **island**: 16 items
- **autonomous district**: 5 items
- **administration**: 2 items
- **metropolitan department**: 95 items
- **European collectivity**: 1 items
- **metropolitan region**: 12 items
- **metropolitan collectivity with special status**: 3 items
- **overseas region**: 5 items
- **overseas collectivity**: 5 items
- **overseas territory**: 1 items
- **land**: 16 items
- **regional unit**: 15 items
- **administrative region**: 65 items
- **village**: 33 items
- **city with county rights**: 22 items
- **union territory**: 9 items
- **Special region**: 1 items
- **free municipal consortium**: 6 items
- **decentralized regional entity**: 4 items
- **metropolitan city**: 7 items
- **state city**: 7 items
- **popularate**: 21 items
- **district municipality**: 45 items
- **federal territory**: 3 items
- **administrative atoll**: 19 items
- **local council**: 67 items
- **sheadings**: 6 items
- **chain**: 2 items
- **autonomous territorial unit**: 1 items
- **territorial unit**: 1 items
- **quarter**: 3 items
- **special island authority**: 1 items
- **capital territory**: 2 items
- **special city**: 2 items
- **arctic region**: 2 items
- **administered area**: 3 items
- **federal capital territory**: 1 items
- **indigenous region**: 3 items
- **capital**: 1 items
- **voivodship**: 16 items
- **republic**: 23 items
- **administrative territory**: 9 items
- **autonomous city**: 5 items
- **area**: 1 items
- **urban municipality**: 11 items
- **special self-governing province**: 2 items
- **special self-governing city**: 1 items
- **autonomous community**: 17 items
- **districts under republic administration**: 1 items
- **metropolitan administration**: 2 items
- **borough**: 3 items
- **town council**: 1 items
- **island council**: 7 items
- **emirate**: 7 items
- **council area**: 32 items
- **unitary authority**: 89 items
- **district council**: 8 items
- **borough council**: 11 items
- **london borough**: 32 items
- **metropolitan district**: 35 items
- **two-tier county**: 25 items
- **country**: 2 items
- **outlying area**: 6 items
- **federal dependency**: 1 items

---

## Usage Examples

### Filtering by Coordinates

```javascript
// Get cities with coordinates
const cities = await fetch('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/country/us.json');
const citiesData = await cities.json();

const citiesWithCoords = citiesData.data.filter(city =>
  city.latitude != null && city.latitude !== '' && city.longitude != null && city.longitude !== ''
);
```

### Accessing Individual Cities (Batch API)

```javascript
// Method 1: Direct batch index lookup (recommended)
const batchIndex = await fetch('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/cities/batches.json');
const batches = await batchIndex.json();

const batch = batches.data.find(b => cityId >= b.start_id && cityId <= b.end_id);
if (batch) {
  const response = await fetch(`https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1/${batch.filename}`);
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
      const response = await fetch(`${this.baseUrl}/cities/batches.json`);
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
      throw new Error(`City ID ${cityId} not found`);
    }

    if (this.batchCache.has(batch.filename)) {
      const cachedBatch = this.batchCache.get(batch.filename);
      if (!cachedBatch[cityId]) throw new Error('City not found: ' + cityId);
      return cachedBatch[cityId];
    }

    const response = await fetch(`${this.baseUrl}/${batch.filename}`);
    const batchData = await response.json();

    this.batchCache.set(batch.filename, batchData.data);
    if (!batchData.data[cityId]) throw new Error('City not found: ' + cityId);
    return batchData.data[cityId];
  }
}

// Usage:
const cityAPI = new CityAPI('https://cdn.jsdelivr.net/npm/geo-data-api@latest/dist/api/v1');
const bhopal = await cityAPI.getCity(57995);
console.log(bhopal.name); // "Bhopal"
```

### Distance Calculations

```javascript
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
```
