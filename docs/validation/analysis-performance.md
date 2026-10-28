# Análisis: Perfil y Año — issue #1

Validated locally on 2026-10-28. Source baseline: `4c2d5bada046667e3d95fdfb2b77c73bea4ccac0`.

## Scope and implementation

- Profile queries eight disjoint time windows concurrently, with cursor pagination inside each window. Half-open internal boundaries and an inclusive final boundary preserve every reading exactly once, even under a Data API page cap below 1,000.
- Year uses a bounded pool of 32 page requests instead of waiting for entire batches. Results are aggregated in chronological order. The observed first-page size governs subsequent offsets; missing rows or failed pages reject the result.
- Year reuses local-date and midnight formatting while preserving local-midnight clipping, gap caps, duration weighting, and all existing clinical formulas.
- The authenticated page owns separate Profile/Year resources, with at most 16 completed results each and equivalent pending requests deduplicated. Keys include identity, patient, timezone and all targets through the owning resource scope. Year selection survives navigation.
- Server caches are bounded to 64 entries each. Successful responses add `validForMs` to the existing contract; the optional final `refresh` argument bypasses and invalidates the authenticated user's server results. No database schema changes are required by this change.
- Client expiry is conservatively anchored to request start, never extending server freshness. An expired-in-transit hit triggers at most one forced server refresh. Invalidation tokens are scoped to authenticated users, so another account's sync cannot invalidate an in-flight result.
- Login/logout, identity/patient/target/timezone changes and successful Monitor refreshes discard incompatible client resources. Logout clears clinical cache before awaiting remote revocation. Pending old resources cannot repopulate cleared caches.
- Explicit analysis refresh discards both client modes and bypasses the server cache. Successful provider ingestion clears this user's server analysis caches. Existing external imports become visible on refresh or expiry; no realtime subscription was added.
- Analysis graphs and range bars draw immediately, without entry animations delaying cached results. Monitor animations are unchanged. Errors have retry controls; year navigation remains enabled during loads.

## Controlled synthetic measurement

These are **synthetic measurements**, not evidence of real Supabase or LibreLinkUp latency. The user explicitly chose synthetic validation. No authenticated real-data browser session was used.

Both versions ran as production Next.js builds on this Mac, in the same in-app Chromium browser/default desktop viewport, with fixed fixture data and reference time `2026-10-28T12:00:00Z`. The fixture has 105,120 five-minute readings across 365 days, deterministic values 60–260 mg/dL, timezone America/Argentina/Buenos_Aires, and a 40 ms simulated database delay per query. Authentication/provider work is also simulated. Each scenario has five repetitions. Both client and server result caches are empty for the cold selection; companion selections are outside that cache key. Year 2026 contains 86,509 readings. Profile windows contain 2,017 / 4,033 / 8,641 / 25,921 readings, including both period endpoints.

The browser probe records selection to three stable animation frames of chart path/calendar availability without a loading spinner. The final probe also observes chart geometry and SVG clipping. Tooltips and navigation were exercised separately, not included as a new synthetic hover on each timed repetition. Treat these as reproducible rendering-readiness timings, not a substitute for authenticated end-to-end production measurements. Earlier baseline samples used the path/calendar predicate without the additional geometry/clip checks.

| Cold selection | Before median (range), ms | After median (range), ms | Reduction |
|---|---:|---:|---:|
| Profile 7 days | 449 (449–458) | 392 (386–397) | 13% |
| Profile 14 days | 541 (541–549) | 393 (391–397) | 27% |
| Profile 30 days | 733 (724–734) | 441 (433–442) | 40% |
| Profile 90 days | 1,531 (1,523–1,549) | 542 (540–548) | 65% |
| Year 2026 | 1,124 (1,116–1,125) | 540 (537–559) | 52% |

Client-cache returns, even while clearing the server cache, had the following five-sample medians/ranges: Profile 7 days 29 ms (25–32), 14 days 33 ms (27–33), 30 days 27 ms (27–33), 90 days 30 ms (25–32). The first 7-day sample contained preceding probe output; its final recorded return was 32 ms. Year and mode returns were observed at 30–39 ms; five controlled year-return samples remain to be recorded. These results support fast client reuse but do not establish every acceptance criterion as completely validated.

The standalone action benchmark separately measured cold/warm-server actions. Initial cold Profile 90 median was 1,689 ms, versus about 511 ms after partitioning. Year initially measured 1,133 ms; the final pool/formatter implementation measured 517 ms (513–539). Warm-server Profile remains around 222 ms because authentication/provider checks still run; warm Year is around 42 ms. Client reuse avoids that round trip entirely. These action samples run the actual action code with simulated system boundaries, outside the production browser build; do not confuse them with the browser table.

## Validation evidence

- Full suite: `node --test scripts/test-*.cjs scripts/test-*.mjs` — 42 passed.
- TypeScript: `pnpm exec tsc --noEmit` — passed.
- Production application: `pnpm exec next build --webpack` — passed, including TypeScript. The application build does not ignore type errors.
- Changed analysis components/resource: targeted ESLint — passed.
- Historical integrity tests still include every page under a 731-row cap, foreign-user/out-of-period exclusion, failed later page, and empty period.
- New annual public-action tests fail on the baseline (63,375 instead of 86,509 readings at a 731-row cap; silently accepted truncated page) and pass after the fix. They also verify error/retry without caching partial success.
- Exact JSON equivalence against baseline Profile and Year results: four periods, Buenos Aires/New York/Kathmandu, two target configurations, gaps >15 minutes and gaps crossing local midnight/DST. No metric formulas or thresholds changed.
- Browser: Profile error shown without an empty-period message; retry restores the graph. Rapid 90→14-day selection shows 14 days. Rapid prior→current year shows 2026. Profile keyboard tooltip displays percentile values. Annual keyboard tooltip displays date, mean, readings and coverage. Annual day→Monitor→Analysis returns to the cached year. No error-level console entries observed in that sequence.
- Mobile: 390×844; document width/scroll width 390/390, graph width 368, usable 30-day Profile visibly rendered.
- Outstanding: authenticated real-data latency and visual checks, a five-repeat cached-year return series, browser expiry/invalidation and logout-with-pending-request scenarios. Cache expiry/invalidation code was reviewed, but these browser scenarios must not be described as completed validation.

## Reproduction

`prepare.mjs` creates an isolated copy with synthetic auth/database boundaries and a benchmark overlay. It never changes the working application's auth or production routes. The copy deliberately skips typechecking because its database adapter is minimal; typecheck/build the real application separately as above. No production secrets are copied.

```sh
node scripts/analysis-performance/prepare.mjs /tmp/gluco-analysis-demo
cd /tmp/gluco-analysis-demo
pnpm exec next build --webpack
pnpm exec next start -p 3011
```

Open `http://localhost:3011/#analisis`. Use the ordinary Profile/Year controls. The overlay can clear server caches or simulate a database error. To clear both client result modes, use the application's refresh control. To measure a cold target, refresh a companion period, clear the server cache, wait for reset completion, then select the target. Revisit it to observe client reuse. Reloading the document clears client resources. `GLUCO_BENCH_TTL_MS=2000` when starting the isolated server provides a short server lifetime for expiry checks.

```sh
# From the repository, with /tmp/gluco-analysis-before holding baseline sources:
node scripts/analysis-performance/measure-actions.mjs /tmp/gluco-analysis-before
node scripts/analysis-performance/measure-actions.mjs
node scripts/analysis-performance/verify-equivalence.mjs /tmp/gluco-analysis-before
node --test scripts/test-analysis-history.mjs scripts/test-analysis-year.mjs
```

For a new baseline reproduction, export the baseline revision to a temporary folder, copy `scripts/analysis-performance/` there from the current revision, then run its preparation script in that folder. Keep the same machine/browser, viewport, fixed fixture and cache conditions for both builds.

## Review

Two independent code-review agents reviewed Standards and Spec against the starting revision. Standards: no documented-standard breaches; duplicated client clearing was consolidated. Spec/correctness: global invalidation and expired-in-transit retry risks were fixed. Follow-up validation added midnight/gap equivalence, SVG clipping/geometry observation and a real keyboard tooltip interaction. The measurement limitations above remain explicit.

## Production release isolation

The user requested production deployment of Analysis only. The release is based on `origin/main` at `067e059`, with the analysis change cherry-picked from development commit `867d19d`. It excludes the pre-existing unpublished wearable commit `4c2d5ba` and its migration. The isolated release passes its full **38-test** suite, TypeScript and production build. The 42-test result above refers to the development checkout, which also contains four wearable tests. No database migration is part of this release.
