# MASTER PROMPT: Axis DriveWorks data + security upgrade

You are a senior full-stack engineer. Read `AGENTS.md`, then the whole repo (axisdriveworks/ and
axisdriveworks-backend/) before touching anything. Work in PHASES. After each phase: summarise the
diff, run `npm run lint` and `npm run build` in axisdriveworks/, start the backend and smoke-test,
then STOP and wait for my "go".

## GOAL
Replace the fake 150k-row CSV/SQLite car dataset with:
(a) a clean list of car NAMES (already prepared in `axisdriveworks-backend/data/car_names.json`),
(b) live specs fetched per car through the Perplexity Sonar API, validated, and cached,
(c) cached images from licence-safe sources,
and fix the security/booking bugs found in the audit. No CSV dependence at the end.

## FILES ALREADY PROVIDED (do not rewrite from scratch; review and integrate)
- axisdriveworks-backend/data/car_names.json   1,462 names, 68 brands, 36 linked to 3D models via `model_3d_id`
- axisdriveworks-backend/scripts/seedCarNames.js   creates + fills `car_names`, also creates `reservations`
- axisdriveworks-backend/lib/suggestRoute.js   GET /api/suggest autocomplete
- axisdriveworks-backend/lib/perplexitySpecs.js   Perplexity call + JSON schema + validator
- .env.example files, tools/build_car_names.py (regenerates the names list), tools/data_report.md

## PHASE 0: SAFETY
1. `git init` if needed and make a backup commit. Confirm `.env` is gitignored.
2. Do NOT delete anything yet. List every file you plan to delete or change in Phase 1 and wait for "go".

## PHASE 1: REMOVE THE OLD DATA LAYER (after my "go")
- Delete `axisdriveworks/public/cardata.csv`, `axisdriveworks/dist/` (build output), and
  `axisdriveworks-backend/scripts/seedDatabase.js`.
- Remove all code reading the old `cars` table (`/api/search`, `/api/car/:id`, `/api/brands`).
  The old `cars` table is dropped LAST, in Phase 8, after the new flow works (`DROP TABLE cars; VACUUM;`).
- Remove dead code: `BrandCard.jsx/.css`, `getAllBrands()`, unused imports (`readline`, `Center`),
  legacy "autovision" names (snapshot filename, root .gitignore line).
- Keep `reservations` and its data.

## PHASE 2: NAMES + AUTOCOMPLETE
- Wire `seedCarNames.js` into the backend: `npm run seed` script, and in `render.yaml` use
  `buildCommand: npm install && node scripts/seedCarNames.js`.
- Register the suggest route from `lib/suggestRoute.js` in `server.js`.
- Brand pages: `GET /api/brand/:brand/cars?page=` (paginated, from `car_names`).
- Frontend: search box shows a dropdown from `/api/suggest` (debounced 250 ms, keyboard accessible,
  AbortController on stale requests). Selecting an item opens `/car/:brandSlug/:modelSlug`
  (a real, shareable URL; replace the router-state-only /showcase flow). Remove the `alert()`.
- Stable key: `spec_key = slug(brand + "-" + model)`. Use it everywhere (cache, reservations), NOT the numeric id.

## PHASE 3: SPECS ENDPOINT (Perplexity + cache)
Create tables on server startup with `CREATE TABLE IF NOT EXISTS` (a small migrations module):
- `car_specs(spec_key TEXT PRIMARY KEY, data TEXT, source_urls TEXT, confidence TEXT, fetched_at INTEGER)`
- `usage_counter(day TEXT PRIMARY KEY, lookups INTEGER)`
- `spec_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, spec_key TEXT, message TEXT, created_at INTEGER)`

`GET /api/car-specs?brand=&model=`:
1. Resolve the car in `car_names` (reject unknown cars; this blocks abuse and junk input).
2. Cache hit younger than 90 days -> return it with `cached: true`.
3. Miss -> check `DAILY_LOOKUP_LIMIT` in `usage_counter`; refuse politely if exceeded.
4. In-flight lock so concurrent requests for the same key share ONE Perplexity call.
5. Call `fetchSpecsFromPerplexity` from `lib/perplexitySpecs.js`. It already validates ranges, forces
   low confidence when fewer than 2 sources, and retries once. Review it; do not weaken it.
6. Save, then return `{ specs, confidence, source_urls, fetched_at, cached }`.
7. If Perplexity fails: return stale cache if any, otherwise a clear 502 message. Never return unvalidated data.
- `POST /api/car-specs/report` stores a "wrong data" report (length-limited, rate limited).
- `scripts/prefillSpecs.js`: pre-fills the cache for every row with `has_3d_model = 1`, sequentially,
  with a 2 s delay, resumable, and prints a table of confidence levels at the end.
- Perplexity facts to respect: POST https://api.perplexity.ai/chat/completions (OpenAI-style), Bearer key,
  `response_format: { type: "json_schema", json_schema: { schema } }`, `search_domain_filter` (prefix "-" excludes).
  If a model returns text instead of JSON, the extractor in the file handles code fences / <think> blocks.
  If the API differs from this, stop and ask me.

## PHASE 4: IMAGES (backend only, cached)
Table `car_images(spec_key PRIMARY KEY, url, source, author, licence, fetched_at)`.
Order of sources; pick the first acceptable candidate:
1. Wikimedia Commons API (search by "brand model", read `imageinfo` + `extmetadata` for author and licence;
   accept only free licences; store attribution).
2. Pexels or Unsplash called FROM THE BACKEND with a key in `.env` (respect their attribution rules and
   rate limits; Unsplash demo keys allow only ~50 requests/hour, so cache aggressively).
3. Placeholder.
Candidate scoring (no paid vision call): width >= 1200 px, landscape, no obvious watermark words, and the
title/description must contain the brand and the main model tokens. Compare candidates from up to 3 sources
and keep the best score. A later optional step may add a rendered still from the 3D model.
Remove `VITE_UNSPLASH_ACCESS_KEY` from the frontend and from `render.yaml`. Show attribution under the image.

## PHASE 5: FRONTEND
- New car page at `/car/:brandSlug/:modelSlug`: loading state ("Researching..."), error state, spec table
  showing ONLY fields that are not null, `variant_used`, confidence badge, "View sources" links,
  "Report wrong data" button. No fake defaults ("AWD", "Auto"). Consistent number/price formatting.
- "Interactive 3D Showroom" opens the viewer for THAT car using `model_3d_id` -> URL in `ModelRegistry.jsx`
  (pass `modelUrl` in router state). If the car has no 3D model, hide the button. Show `model_3d_label`
  (e.g. "3D model: 1990 Honda NSX") because 3D files are specific generations.
- Brand page: paginated list, deduplicated, no per-card AI calls; images come from the cached image endpoint.
- Lazy-load heavy routes with `React.lazy` (three.js/drei must not load on the landing page).
- Fix: Showcase redirect that never fires, setTimeout cleanup, double-submit on booking, `100vh` -> `100dvh`,
  aria-labels, keyboard access on brand cards, `/privacy` and `/terms` routes (simple pages).

## PHASE 6: SECURITY + BOOKINGS
- `/api/reserve`: validate email format, future date, max lengths, known `spec_key`; handle a missing JSON body.
- Reservations: the booking response returns a random `manage_token`; the browser stores it and sends it back,
  so users only see/complete/cancel THEIR bookings. Admin routes require `ADMIN_TOKEN`.
  `GET /api/reservations` must never return everyone's emails. Add cancel + reschedule.
- `PUT .../complete` must 404 on unknown ids. Frontend shows "Confirmed" ONLY if the API returned success.
- `app.set("trust proxy", 1)`, prune the rate-limit map, mount the limiter before `/assets`, add `helmet`,
  Cache-Control for `.glb` files, compression for JSON.
- `render.yaml`: SPA rewrite rule (`/*` -> `/index.html`), remove the hard-coded API key, and add a persistent
  disk (or move SQLite to a hosted DB) so reservations and cache survive redeploys.
- Run `npm audit fix` in both folders. Tell me to ROTATE the leaked Unsplash key.

## PHASE 7: 3D VIEWER BUGS (from the audit)
- `modelConfig.js`: the mesh names for ferrari_488 and honda_civic do not exist in the real GLB files, and the
  code only falls back to smart matching when NO manifest exists, so those cars never get painted.
  Make the fallback apply whenever the manifest finds zero matching meshes. Fix key matching for
  `tesla_cyber` and `vw_golf` (URLs contain `cybertruck` / `volkswagen_golf`). Remove the unused `porsche_911` entry.
- Clone materials per mesh so painting does not mutate the cached original or other meshes sharing a material;
  remember original colours so "stock" can be restored. Dispose geometries/materials on unmount.
- Drive mode: frame-rate independent friction, max speed, `preventDefault` for arrow keys, keys in a ref (not state),
  reset position on exit, touch controls for mobile.
- Show real `ASSET_ID`; rename snapshot file prefix; `dvh` units.

## PHASE 8: CLEANUP, TESTS, DOCS
- Drop the old `cars` table: `DROP TABLE cars; VACUUM;` (first show me the DB size before/after).
- Tests (node:test or vitest): validator ranges, cache TTL, daily limit, in-flight lock, suggest escaping,
  reservation ownership. Fix the 2 existing ESLint errors; lint + build must pass.
- Rewrite README.md to match reality (ports, env vars, setup) and write METHODOLOGY.md:
  data flow, cache rules, validation ranges, source priority, image order, cost guards, refresh policy,
  and "how to add a new car".
- Final summary: files deleted/created, env vars I must set, anything unfinished.

## DEFINITION OF DONE
No `cardata.csv` anywhere; `grep -r "cardata"` finds nothing; lint and build pass; search -> car page works
for a cold car (live Perplexity lookup) and a warm car (instant cache); a user cannot read other people's
reservations; no API key appears in the frontend bundle (`grep` the built `dist/`).
