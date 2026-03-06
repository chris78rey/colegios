# Repository Guidelines

## Project Structure & Module Organization
- `services/api/`: Node.js HTTP API service (ESM). Entry point: `services/api/src/index.js`. Prisma schema lives in `services/api/prisma/schema.prisma`.
- `services/worker/`: Background worker service (ESM). Entry point: `services/worker/src/index.js`.
- `docs/`: Architecture and domain notes (see `docs/architecture.md`).
- `scripts/`: Utility scripts (e.g., `scripts/healthcheck.sh`).
- `docker-compose.yml`: Local orchestration for `api`, `worker`, `postgres`, `redis`.

## Build, Test, and Development Commands
- `docker compose up -d postgres redis`: Start databases for local development.
- `docker compose up --build`: Build and run all services locally.
- `npm install`: Install dependencies (run inside `services/api` or `services/worker`).
- `npm run dev`: Start a service in watch mode (run from each service folder).
- `npm run start`: Start a service without watch mode.
- `npm run prisma:generate`: Generate Prisma client (API only).
- `npm run prisma:migrate`: Run local Prisma migrations (API only).
- `scripts/healthcheck.sh`: Quick service health check.

## Coding Style & Naming Conventions
- Use ESM modules, double quotes, semicolons, and 2-space indentation (match `services/*/src/index.js`).
- Keep modules small; prefer explicit function names over anonymous callbacks for complex logic.
- HTTP routes should be versioned under `/v1/...`.

## Testing Guidelines
- No automated test framework is configured yet. If you add one, document it here and add a `npm run test` script.
- Name tests by feature area (e.g., `requests.test.js`) and keep them close to the service they cover.

## Commit & Pull Request Guidelines
- Git history is empty, so no established commit message convention yet. Use short, imperative summaries (e.g., "Add request queue handler").
- PRs should include a clear description of the change and why it is needed, steps to verify (commands and expected results), and screenshots or sample payloads for API/UX changes when relevant.

## Security & Configuration Tips
- Secrets should not be hard-coded. Use environment variables and `.env` files locally (do not commit secrets).
- Common variables are defined in `docker-compose.yml` (e.g., `DATABASE_URL`, `REDIS_URL`, `STORAGE_PATH`).
- Local files are stored under `data/` (mounted in containers). Avoid committing generated data.
