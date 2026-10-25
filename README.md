# Music Performance

A browser-based game where you perform the melody of a backing track on an instrument or
with your voice, and get scored on how closely you match it.

Built to run on Cloudflare Workers with all audio processing kept in the browser.

## Status

**Scaffolding complete.** The stage, navigation and Worker API are in place. Phase 1
(microphone capture, pitch tracking, scoring, curated tracks) is not implemented yet.

Current behaviour:

- Welcome screen with rules.
- Setup screen with player name, instrument selection and a track catalogue served by
  the Worker.
- Game screen with a large start button and 3-2-1 countdown.
- Results screen shell.
- Player name and last instrument/track remembered in `localStorage`.

The catalogue is intentionally empty until licensed tracks are added. In development,
the welcome screen has a **Preview game flow** link so the stage and results screens can
be walked without any audio.

## Stack

Cloudflare Workers + static assets, Vite 8, React 19, TypeScript, Tailwind CSS 4, Hono,
Vitest, Biome.

## Quick start

Requires Node 22 or newer.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite with the Cloudflare plugin, so the real Worker serves `/api/*`
and the SPA assets together. Open the URL printed by Vite (usually
`http://localhost:5173`).

## Scripts

| Command              | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Local development with Worker + SPA                    |
| `npm run build`      | Type-check and build the production bundle             |
| `npm test`           | Run unit tests                                         |
| `npm run lint`       | Biome check (lint + formatting)                        |
| `npm run lint:fix`   | Apply Biome fixes                                      |
| `npm run typecheck`  | Type-check app, Worker and tooling projects            |
| `npm run cf-dry-run` | Build and validate the Worker bundle without deploying |
| `npm run deploy`     | Build and deploy to Cloudflare                         |

## Deploying

The target account is `707690ff96207f8c8eeef44fb9995ac7` (free plan) and is pinned in
`wrangler.jsonc`.

```bash
npx wrangler login
npm run deploy
```

The Worker is named `music-performance` and deploys to
`music-performance.<your-subdomain>.workers.dev`.

## Project layout

```
src/client/    React screens, game UI, browser storage
src/shared/    Domain types and pure music helpers (used by both sides)
src/worker/    Worker entry point (Hono) and track catalogue
public/        Static assets: audio tracks, charts, icons
docs/          Architecture and phase design documents
```

## Documentation

- [Architecture](docs/000.%20ARCHITECTURE.md)
- [Original brief](docs/001.%20PROMPT.md)
- [Track content guide](docs/002.%20TRACK-CONTENT.md)
- [Phase 1 design](docs/003.%20PHASE-1-DESIGN.md)

## Licence

See [LICENSE](LICENSE). Backing tracks will carry their own licence metadata, surfaced in
the game UI and documented per track.
