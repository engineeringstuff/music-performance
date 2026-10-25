# Music Performance

A browser-based game where you perform the melody of a backing track on an instrument or
with your voice, and get scored on how closely you match it.

Built to run on Cloudflare Workers with all audio processing kept in the browser.

## Status

**Phase 1 is playable.** A player can configure a performance, complete a 3-2-1
countdown, follow a live pitch lane, receive a score, and retry. Everything stays in the
browser.

Implemented:

- Welcome and rules screen.
- Setup with player name, instrument, track and an optional guide-melody toggle.
- Track catalogue served by the Worker.
- Microphone capture and MPM pitch detection (`pitchy`).
- Pitch, timing and coverage scoring with octave range fitting and vocal octave
  equivalence.
- Live pitch lane, score, streak and progress.
- Results with a note-by-note breakdown; results saved to IndexedDB.
- Forfeit confirmation and browser-leave warning.
- Local preferences in `localStorage`.
- Developer-only pitch lab at `/` → **Pitch lab**.

## Tracks

| Track                         | Difficulty | Length | Licence                     |
| ----------------------------- | ---------- | ------ | --------------------------- |
| Twinkle, Twinkle, Little Star | Easy       | 0:30   | PD melody / CC0 arrangement |
| Greensleeves                  | Medium     | 0:40   | Public domain               |
| Ode to Joy                    | Medium     | 0:39   | Public domain               |

Backing tracks are rendered without the melody; each track also ships an optional
melody-only guide stem. Headphones are recommended to stop the backing leaking into the
microphone.

## Stack

Cloudflare Workers + static assets, Vite 8, React 19, TypeScript, Tailwind CSS 4, Hono,
`pitchy`, Vitest, Biome.

## Quick start

Requires Node 22 or newer.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite with the Cloudflare plugin, so the real Worker serves `/api/*`
and the SPA assets together. Open the URL printed by Vite (usually
`http://localhost:5173`). Use Chrome, Safari or Firefox on localhost/HTTPS; microphone
access is blocked on insecure origins.

## Scripts

| Command                    | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `npm run dev`              | Local development with Worker + SPA                    |
| `npm run build`            | Validate content, type-check and build                 |
| `npm test`                 | Run unit tests                                         |
| `npm run lint`             | Biome check (lint + formatting)                        |
| `npm run lint:fix`         | Apply Biome fixes                                      |
| `npm run typecheck`        | Type-check app, Worker, scripts and tooling            |
| `npm run content:build`    | Re-render stems/charts and regenerate the catalogue    |
| `npm run content:validate` | Validate manifests, hashes, charts and catalogue       |
| `npm run content`          | Build then validate content                            |
| `npm run cf-dry-run`       | Build and validate the Worker bundle without deploying |
| `npm run deploy`           | Build and deploy to Cloudflare                         |

## Content pipeline

Source note data lives in `content/tracks/`; rendered MP3s and charts live in `public/`.
Normal builds use the committed assets. To regenerate them you need `fluidsynth`,
`ffmpeg` and the MIT-licensed FluidR3Mono soundfont — see
[`content/SOUNDFONT-LICENSE.md`](content/SOUNDFONT-LICENSE.md).

```bash
npm run content:build
npm run content:validate
```

The pipeline renders melody-free backing stems, optional guide stems, and charts derived
from audited melody MIDI. Track provenance and licences are in each
`content/tracks/<id>/LICENSE.md`.

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
content/       Source MIDI/voice data, licences and soundfont instructions
scripts/       Content build and validation scripts
src/client/    React screens, audio engine, pitch detection and browser storage
src/shared/    Domain types, scoring, range fitting and music helpers
src/worker/    Worker entry point (Hono) and generated track catalogue
public/        Static assets: audio stems, charts, icons
docs/          Architecture, content guide and phase design documents
```

## Known limitations

- Scoring is monophonic; play or sing the melody one note at a time.
- Input latency is not calibrated per device; wired headphones are recommended.
- A backing track will bleed into speakers and can inflate the score.
- Results are local to this browser only; there are no accounts or leaderboards.
- Phase 2 uploads and instrument separation are not implemented.

## Documentation

- [Architecture](docs/000.%20ARCHITECTURE.md)
- [Original brief](docs/001.%20PROMPT.md)
- [Track content guide](docs/002.%20TRACK-CONTENT.md)
- [Phase 1 design](docs/003.%20PHASE-1-DESIGN.md)

## Licence

See [LICENSE](LICENSE). Backing tracks and arrangements carry their own licence metadata,
surfaced in the game UI and documented per track.
