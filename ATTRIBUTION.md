# Attribution and licenses

This repository contains software and a derived geographic database with
separate licenses.

## Software

Copyright (c) 2025 asterodigital. The source code is licensed under the MIT
License; see [LICENSE](LICENSE).

## Data

The checked-in snapshot in `db/` and the generated JSON API in
`dist/api/v2/` are derived from the
[Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database)
(CSC) and are made available under the
[Open Database License (ODbL) v1.0](LICENSE-DATA).

Required credit:

```text
Data by Countries States Cities Database
https://github.com/dr5hn/countries-states-cities-database | ODbL v1.0
```

Keep this credit and the ODbL notice with the database, any derivative
database, and any public use of either. If you redistribute the generated API
or a modified snapshot, share the resulting database under the ODbL as well.

### Snapshot

- Release: `v5.2.0-export.1`
- Published: `2026-11-03T08:18:19Z`
- Upstream commit: `9b255c45fc53e02a8dff547d88558d4fe91784d5`
- Countries: 250 · States: 5,327 · Cities: 156,166

### Changes made for this project

`scripts/import-upstream.js` reproduces these changes:

- Keeps only the source fields that the v2 model exposes. The upstream cities
  export includes additional fields such as `native`, `translations`, and
  population data; those fields are not part of this API.
- Excludes three city records from Western Sahara (Gueltat Zemmour, Imlili and
  Smara) because the upstream snapshot has no state for `EH` and this API
  requires every city to belong to a state.
- The generator adds `name_normalized`, `state_path_key`, and
  `name_normalized` fields, converts `wikiDataId` to `wikidata_id`, and
  serializes country and state records in snake_case. Names, coordinates,
  codes, and identifiers are otherwise unchanged.

No other changes are made to the upstream records.

### Additional source credits

Some records also carry names or points copied from open sources that ask for
credit: [GeoNames](https://www.geonames.org/) (CC BY 4.0),
[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
(ODbL 1.0), and [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing)
(CC0). Country names in some languages follow
[Unicode CLDR](https://cldr.unicode.org/) 48.2: Copyright © 2015–2024 Unicode,
Inc., under the [Unicode License v3](NOTICE-Unicode-3.0.txt), whose notice must
travel with copies.

Source credits and notices for the upstream sources are in
[NOTICE-SOURCES.txt](NOTICE-SOURCES.txt). Keep the applicable credits and
notices when redistributing the data.
