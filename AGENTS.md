# Agent guide

## Project

Music Performance is a browser game built as a Cloudflare Worker with static assets.
Players perform a backing track on an instrument or with their voice and are scored on
pitch and timing. Audio processing stays in the browser.

Read `docs/000. ARCHITECTURE.md` before making structural changes, and the relevant
phase design document before implementing a feature.

## Commands

Run these from the repository root:

```bash
npm run dev        # Vite + real Worker via @cloudflare/vite-plugin
npm run build      # type-check + production build
npm run typecheck  # tsc project references
npm test           # Vitest unit tests
npm run lint       # Biome
npm run lint:fix   # Biome with fixes
npm run cf-dry-run # validate the Worker bundle without deploying
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
- Scoring must forgive differences in vocal/instrumental range. Range fitting is done by
  transposing the reference chart, not by loosening pitch accuracy.
- Do not implement Phase 2 uploads or fal.ai integration during Phase 1 work.

## Documentation workflow

Each phase starts with a design document in `docs/` before implementation. Update the
architecture document when a lasting technical decision changes.
