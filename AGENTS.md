# Agent guide

## Project

Music Performance is a browser game built as a Cloudflare Worker with static assets.
Players perform a backing track on an instrument or with their voice and are scored on
pitch and timing. Audio processing stays in the browser.

Read `PROJECT.md` for project orientation and the decision log, `docs/000. ARCHITECTURE.md`
before making structural changes, and the relevant phase design document before implementing
a feature.

## Commands

Run these from the repository root:

```bash
npm run dev        # Vite + real Worker via @cloudflare/vite-plugin
npm run build      # type-check + production build
npm run typecheck  # tsc project references
npm test           # Vitest unit tests
npm run test:coverage # tests + enforced coverage thresholds
npm run lint       # Biome
npm run lint:fix   # Biome with fixes
npm run cf-dry-run # validate the Worker bundle without deploying
npm run test:e2e        # Playwright browser smoke + axe (local Chrome / CI Chromium)
npm run test:e2e:pwa    # production preview + offline service worker test
npm run content:setup    # download/verify the MIT FluidR3Mono soundfont
npm run content:build    # re-render key variants/stems/charts (FluidSynth + ffmpeg)
npm run content:validate # validate lock hashes, variants, charts and catalogue
```

Do not deploy to Cloudflare unless explicitly asked.

## Conventions

- TypeScript strict mode; avoid `any` and non-null assertions where a check is practical.
- Keep `src/shared` platform-neutral: no DOM, no Worker globals, no `fetch`.
- Put pure, testable logic (scoring, transposition, chart parsing) in `src/shared` and
  test it with Vitest next to the source file.
- Keep browser audio and microphone code inside `src/client`.
- The Worker owns content metadata and future server-side processing. API routes are
  under `/api/*`; everything else is the SPA.
- Styling is Tailwind CSS 4 utility classes plus the tokens in `src/client/index.css`.
  Follow the existing dark stage visual language.
- No new dependencies without a clear reason; check whether the platform already
  provides the capability.

## Product constraints

- Phase 1 is in-browser only; persistence is `localStorage`/IndexedDB.
- No persistence layer or accounts until a later phase.
- Phase 1 tracks are pre-approved CC-licensed assets with pre-computed charts. Follow
  `docs/002. TRACK-CONTENT.md`; never add music with unclear licensing.
- Exit during a performance forfeits the score.
- Scoring must forgive differences in vocal/instrumental range. Phase 1 octave-fits the
  reference chart and allows vocal octave equivalence; do not loosen pitch accuracy.
  Semitone transposition would also require re-rendering the backing in the new key.
- Do not implement Phase 2 uploads or fal.ai integration during Phase 1 work.
- Keep privacy local-first: no audio uploads, no analytics/telemetry without a product
  decision, and keep the Privacy & data clear action working.
- Maintain the PWA service worker cache version when changing the shell; security headers
  live in `public/_headers`.
- Content changes: update `content/tracks/<id>/track.json`, run
  `npm run content:build`, and commit the rendered MP3s (including every key variant),
  charts, `content/content.lock.json` and generated catalogue. Keep source hashes current.
  Do not hand-edit `src/worker/catalog.generated.ts` or `content/content.lock.json`.
- Pre-rendered keys are part of content; keep all variants in the lock and catalogue.
- New screens use hash routes for deep links; the Worker serves static assets with a
  `404-page`, not an SPA fallback.
- Rendered audio uses the MIT-labelled FluidR3Mono soundfont (upstream licensing caveat;
  legal review pending). Keep
  `public/THIRD_PARTY_NOTICES.txt` and `content/SOUNDFONT-LICENSE.md` complete.

## Documentation workflow

Each phase starts with a design document in `docs/` before implementation. Update the
architecture document when a lasting technical decision changes.
