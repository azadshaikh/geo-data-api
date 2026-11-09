# Project Documentation

This folder contains the project's Markdown documentation. Use this page to quickly navigate to the main documentation files.

## Contents

- [API Documentation](API_DOCUMENTATION.md) — Full API reference and examples.
- [Quick Start Guide](QUICK_START.md) — Minimal setup and examples to get started.
- [Endpoints Reference](ENDPOINTS.md) — List of available endpoints and parameters.
- [Data Structure](DATA_STRUCTURE.md) — Description of the JSON data layout used by the project.
- [Deploy with Dokploy](DOKPLOY.md) — Host the website, playground and API using Docker Compose.

## Regenerating the docs

The API reference guides are generated from templates in `src/generators/docs/` (see `markdown-generator.js`). To update those guides, run the project's documentation generator using Node.js. The Dokploy guide is maintained directly in this folder.

## Contributing

If you find errors or want to improve the docs, edit the appropriate Markdown file in this folder or update the templates under `src/generators/docs/templates/` and regenerate.

---

Last updated: see repository commit history.
