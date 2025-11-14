# Repository Guidelines

## Project Structure & Module Organization
Core TypeScript realtime server lives in `src/`, with `server.ts` orchestrating Twilio + WebSocket flows, `sessionManager.ts` handling duplex streams, and domain helpers (aiConfig, dataStorage, aiProviders, callContext). Compiled assets land in `dist/` (never edit manually). Browser admin pages (`adminPanel.html`, `recordingsTemplate.html`) also live in `src/` and are copied post-build. `recordings/` persists WAV call captures and should stay git-ignored. `console_admin_app/` contains a Flutter console app; treat it as an independent module with its own `pubspec.yaml` and `test/`. Shared operational docs live at repo root (`GOOGLE_DRIVE_SETUP.md`, `.env.example`).

## Build, Test, and Development Commands
`npm install` (root) installs the Node/TypeScript server dependencies. `npm run dev` starts a watched server via `ts-node` + nodemon; point ngrok at port 8082 during manual testing (`ngrok http 8082`). `npm run build` transpiles via `tsc` and copies static HTML/TwiML into `dist/`. `npm run start` runs the compiled server from `dist/server.js` and is what Procfile/Heroku uses. `npm run test-models` first builds, then executes `test-model-system.js` to sanity-check model definitions exported by `dist/modelConfig`.

## Coding Style & Naming Conventions
TypeScript is the source of truth (strict mode per `tsconfig.json`); keep files under `src/` and mirror build-time paths. Use 2-space indentation, double quotes, and `async/await` over raw promises. Functions, variables, and files follow `camelCase` (`sessionManager.ts`), types/interfaces use `PascalCase` (`AIProviderConfig`), and enums/constants are UPPER_SNAKE. Co-locate helper modules when cohesion is tight, otherwise prefer dedicated files such as `callContext.ts`. Run `npx tsc --noEmit` before pushing if you touched types.

## Testing Guidelines
`test-model-system.js` is the current reference test; extend it or add adjacent scripts in the repo root when validating configuration logic. Name new tests `*.spec.ts` or `*.test.ts` and point them at compiled outputs or ts-node runners. Minimum expectation is to cover new providers, menu logic, or storage layers with happy-path + failure-path assertions. If you add automated tests, wire them into `npm test` so CI can fail fast; preserve the "build then run" pattern to keep `dist/` in sync.

## Commit & Pull Request Guidelines
The repo snapshot excludes `.git`, so adopt Conventional Commits for clarity (`feat(session): add Google Drive export`). Keep messages imperative and mention related ticket IDs. Pull requests must describe the scenario, highlight env/config changes (`.env`, `GOOGLE_DRIVE_*`), and document how you validated Twilio calls (console logs, ngrok traces, or audio samples). Add screenshots for UI or admin console tweaks, and link customer issues or incident threads when relevant.

## Security & Configuration Tips
Never commit `.env` or raw recordings; use `.env.example` and scrub WAV files before sharing. Rotate `TWILIO_AUTH_TOKEN`, `OPENAI_API_KEY`, and Google service credentials regularly, and confirm `PUBLIC_URL` references the active ngrok tunnel before deploying. When working on Google Drive exports, revisit `GOOGLE_DRIVE_SETUP.md` and keep downloaded credentials in your OS keychain, not the repo.
