# API Endpoints Reference

All paths are relative to your `api/v2/` base. Path codes are lowercase; ISO codes in records are uppercase. Static-host paths are case-sensitive.

| Path | Response data |
| --- | --- |
| `countries.json` | All countries. |
| `countries/{iso2}.json` | One country. |
| `countries/{iso2}/states.json` | All states in a country, including an empty array. |
| `countries/{iso2}/states/{state}.json` | One state, addressed by its `path_key`. |
| `countries/{iso2}/states/{state}/cities.json` | City summaries in a state, including an empty array. |
| `countries/{iso2}/cities/index.json` | A country city-page index, including an empty index. |
| `countries/{iso2}/cities/{page}.json` | A numbered city-summary page, starting at 1. |
| `cities/{id}.json` | Full details for one numeric city ID. |
| `states/all.json` | All states. |
| `search/countries.json` | Complete country search records. |
| `search/states.json` | Complete state search records. |
| `search/cities/index.json` | Index of every country city-page index. |
| `api-info.json`, `documentation.json` | Dataset and endpoint discovery. |
| `manifest.json`, `build-report.json` | Source and output checksums, build and validation information. |

Region and subregion groupings under `countries/`, state type and timezone groupings under `states/`, and city timezone groupings under `cities/` are available where the source provides those values. Use grouping indexes to discover filenames.

A country index entry looks like `{ "filename": "countries/in/cities/1.json", "count": 123 }`; its metadata includes `country_code`, `total_cities`, and `page_size`. The global index has entries like `{ "country_code": "IN", "filename": "countries/in/cities/index.json", "count": 123 }`. Fetch every listed page for complete country results. The default maximum is 5,000 records per page.

Country and state collection files exist even when empty. Unknown resources return HTTP 404. Search is performed by your application over downloaded records, not by the static server.
