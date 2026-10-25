# Music Performance

A browser-based game where you perform the melody of a backing track on an instrument or
with your voice, and get scored on how closely you match it.

Built to run on Cloudflare Workers with all audio processing kept in the browser.

## Status

**Phase 1 is playable, with a local practice mode and PWA shell.** Players can configure a
performance, complete a 3-2-1 countdown, follow a live pitch lane, receive a score, review a
phrase breakdown, retry, practise with a metronome, and keep local history. Everything stays
in the browser.

Implemented:

- Welcome, rules, setup, game, results, history and privacy/settings screens.
- Microphone or Web MIDI keyboard input.
- Four tracks: Twinkle (easy, with lyrics), Greensleeves and Ode to Joy (medium), Bach
  Minuet (hard).
- Pre-rendered backing keys at -2, 0 and +2 semitones, with automatic octave fitting and
  vocal octave equivalence.
- MPM pitch detection (`pitchy`), RMS/level articulation, time-weighted coverage, pitch,
  timing and coverage scoring.
- Live pitch lane, score, current streak, pause/forfeit dialog, count-in click and
  reduced-motion presentation.
- Practice mode with looping, guide-only playback, metronome and 50/75/100% speeds.
- Results with note and phrase breakdowns, clean personal bests, share and retry.
- Local history, privacy data controls, volume and timing-offset settings, local diagnostics.
- PWA manifest, offline app shell/catalogue/played audio, security headers.
- Developer-quality tests: unit, content, Worker/API, IndexedDB, Playwright E2E and axe.

## Tracks

| Track                         | Difficulty | Length | Licence                     |
| ----------------------------- | ---------- | ------ | --------------------------- |
| Twinkle, Twinkle, Little Star | Easy       | 0:29   | PD melody / CC0 arrangement |
| Greensleeves                  | Medium     | 0:39   | Public domain               |
| Ode to Joy                    | Medium     | 0:38   | Public domain               |
| Minuet in G Major             | Hard       | 0:41   | Public domain               |

The dedicated melody track is muted in the backing; harmony can still contain the same pitch
classes as the melody. Each track also ships a melody-only guide stem. Use wired headphones
to stop the backing leaking into the microphone; Bluetooth adds latency. **Echo cancellation**
is on by default for speaker use and can be turned off on the ready screen or in
**Privacy & sound**.

## Stack

Cloudflare Workers + static assets, Vite 8, React 19, TypeScript, Tailwind CSS 4, Hono,
`pitchy`, Vitest, Playwright, axe, Biome.

## Quick start

Requires Node 22 or newer.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite with the Cloudflare plugin, so the real Worker serves `/api/*` and
the SPA assets together. Open the URL printed by Vite (usually
`http://localhost:5173`). Use Chrome, Safari or Firefox on localhost/HTTPS; microphone access
is blocked on insecure origins.

## Scripts

| Command                    | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `npm run dev`              | Local development with Worker + SPA                        |
| `npm run build`            | Validate content, type-check and build                     |
| `npm test`                 | Unit, Worker and IndexedDB tests                           |
| `npm run test:coverage`    | Unit tests plus enforced coverage thresholds               |
| `npm run test:e2e`         | Playwright browser smoke/accessibility tests               |
| `npm run test:e2e:pwa`     | Production preview and offline service-worker test         |
| `npm run lint`             | Biome check (lint + formatting)                            |
| `npm run lint:fix`         | Apply Biome fixes                                          |
| `npm run typecheck`        | Type-check app, Worker, scripts and tooling                |
| `npm run content:setup`    | Download and verify the MIT FluidR3Mono soundfont          |
| `npm run content:build`    | Re-render key variants/charts and regenerate the catalogue |
| `npm run content:validate` | Validate lock hashes, charts, variants and catalogue       |
| `npm run content`          | Build then validate content                                |
| `npm run cf-dry-run`       | Build and validate the Worker bundle without deploying     |
| `npm run deploy`           | Build and deploy to Cloudflare                             |

Playwright uses system Chrome locally and bundled Chromium in CI; the dev server starts via
the Playwright `webServer` config if it is not already running. Real-device, real-microphone
and screen-reader checks are listed in `docs/004. MANUAL-TESTING.md`.

## Content pipeline

Source note data lives in `content/tracks/`; rendered MP3s, key variants and charts live in
`public/`. Normal builds use the committed assets. To regenerate them you need `fluidsynth`,
`ffmpeg` and the MIT-labelled FluidR3Mono soundfont (upstream licensing caveat noted in
`content/SOUNDFONT-LICENSE.md`; legal review pending).

```bash
npm run content:setup
npm run content:build
npm run content:validate
```

The pipeline renders melody-muted backing stems, optional guide stems, pre-rendered ±2-key
variants and charts derived from audited melody MIDI. `content/content.lock.json` pins
source, voice, MIDI, chart and every audio variant hash; `npm run content:validate`
regenerates charts and catalogue entries and deep-compares them. Track provenance is in each
`content/tracks/<id>/LICENSE.md`. Soundfont notices are served at
`/THIRD_PARTY_NOTICES.txt` and reproduced in `content/SOUNDFONT-LICENSE.md`.

## Privacy and data

- Audio is processed in the browser and is never uploaded.
- The player name, last setup and audio/timing preferences are in `localStorage`.
- Results and clean personal bests are in IndexedDB (latest 100).
- Session diagnostics are in `sessionStorage` for the current tab only.
- **Privacy & data** in the footer shows what is stored and clears all local player data.
- There is no client analytics or remote error reporting. Cloudflare Worker
  observability may log API request metadata (paths/timing); no audio or player data is sent.
  Security headers include a CSP, Permissions-Policy, Referrer-Policy and a strict frame
  policy.

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
content/       Source MIDI/voices, licences, soundfont instructions and content lock
scripts/       Content build, validation and soundfont setup scripts
e2e/           Playwright smoke and axe accessibility tests
src/client/    React screens, audio/MIDI engine, pitch detection and browser storage
src/shared/    Domain types, scoring, range fitting and music helpers
src/worker/    Worker entry point (Hono) and generated track catalogue
public/        Static assets: audio, charts, notices, PWA icons and service worker
docs/          Architecture, content guide and phase design documents
```

## Testing

- `npm test` covers music maths, scoring/articulation, range fitting, chart regeneration,
  content licences, MIDI/microphone sources, loader behaviour, result selection and the
  Hono API, including an IndexedDB integration test.
- `npm run test:e2e` covers welcome/setup, microphone and MIDI starts, pause/forfeit,
  privacy/clear-data, practice mode, pre-rendered keys, mobile landscape and axe audits.
- Browser testing currently uses Chromium/Chrome. Safari, Firefox, iOS and Android need a
  real-device pass before release; automated axe checks pass but a manual screen-reader pass
  is still needed.

## Known limitations

- Scoring is monophonic; play or sing the melody one note at a time.
- Note names and instrument ranges are concert pitch. Guitar sounds an octave below written
  notation; guitarists reading written music should transpose by an octave.
- Backing timbres are per-track (piano, music box, harpsichord) rather than fully
  instrument-specific arrangements.
- Input latency is approximated from the analysis window and browser-reported track latency,
  with a manual timing offset; a measured calibration flow is still a follow-up.
- A backing track will bleed into speakers and can inflate the score.
- Results are local to this browser only; there are no accounts or remote leaderboards.
- Slow practice uses browser pitch-preserving playback; there is no phrase-range editor yet.
- Phase 2 uploads and instrument separation are not implemented.

## Documentation

- [Project guide](PROJECT.md)
- [Architecture](docs/000.%20ARCHITECTURE.md)
- [Original brief](docs/001.%20PROMPT.md)
- [Track content guide](docs/002.%20TRACK-CONTENT.md)
- [Phase 1 design](docs/003.%20PHASE-1-DESIGN.md)
- [Manual test checklist](docs/004.%20MANUAL-TESTING.md)

## Licence

See [LICENSE](LICENSE). Backing tracks and arrangements carry their own licence metadata,
surfaced in the game UI and documented per track. The rendered stems use the MIT-labelled
FluidR3Mono soundfont; upstream notes licensing may change, so legal review is pending. The
full notices are in
[`public/THIRD_PARTY_NOTICES.txt`](public/THIRD_PARTY_NOTICES.txt).
