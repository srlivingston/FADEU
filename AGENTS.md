# Repository Guidelines

## Project Structure & Module Organization

- `index.html` is the entry point for the ArcGIS JS map experience.
- `app.js` holds the map setup, layer configuration, and filter logic.
- `styles.css` defines the visual system and layout.
- `data/points.geojson` contains map-ready features derived from `Fadeu Full Report.xlsx`.
- Keep raw data files in the root or a `data/` subfolder; keep generated map assets in `data/`.

## Build, Test, and Development Commands

- Run a local web server for the ArcGIS JS app (required for `fetch`):
  - `python -m http.server 8000` — serve the repo, then open `http://localhost:8000`.
  - `npx serve` — alternative static server.
- No build step is required for the current static setup.

## Coding Style & Naming Conventions

- Use 2 spaces for indentation in HTML, CSS, and JavaScript.
- Prefer `camelCase` for JS variables/functions and `kebab-case` for CSS classes.
- Keep filenames lowercase and descriptive (e.g., `points.geojson`, `app.js`).
- If introducing tooling (lint/format), document the commands in this file.

## Testing Guidelines

- No automated tests are configured yet.
- If tests are added, specify the framework, naming pattern (e.g., `*.spec.js`), and how to run them.

## Commit & Pull Request Guidelines

- No commit history is available in this repository, so no message conventions are known.
- Proposed conventions for future work:
  - Commit messages: short, imperative, and scoped (e.g., `Add data ingest script`).
  - Pull requests: include a clear description, link related issues, and attach screenshots or sample outputs when changing data or UI.

## Agent-Specific Notes

- Keep `AGENTS.md` updated as soon as code, tests, or automation tooling are added so contributors have accurate guidance.
