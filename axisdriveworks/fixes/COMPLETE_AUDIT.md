# 🔬 AXIS DRIVEWORKS — COMPLETE CODEBASE AUDIT

> **Generated:** September 30, 2026  
> **Audited:** 27 source files across `src/`, `public/`, and root config  
> **Total Issues:** 125 (classified by file, then by severity)  
> **Purpose:** Reference document for systematic fixes — list only, no code changes applied.

---

## TABLE OF CONTENTS

1. [Summary Dashboard](#summary-dashboard)
2. [Project File Map](#project-file-map)
3. [Recommended Fix Order](#recommended-fix-order)
4. [Issues by File](#issues-by-file)
   - [`.env`](#env)
   - [`index.html`](#indexhtml)
   - [`package.json`](#packagejson)
   - [`vite.config.js`](#viteconfigjs)
   - [`public/cardata.csv`](#publiccardatacsv)
   - [`src/main.jsx`](#srcmainjsx)
   - [`src/index.css`](#srcindexcss)
   - [`src/App.jsx`](#srcappjsx)
   - [`src/App.css`](#srcappcss)
   - [`src/Api/FetchApi.js`](#srcapifetchapijs)
   - [`src/sections/Hero.jsx`](#srcsectionsherojsx)
   - [`src/sections/Search.jsx`](#srcsectionssearchjsx)
   - [`src/sections/Search.css`](#srcsectionssearchcss)
   - [`src/sections/Showcase.jsx`](#srcsectionsshowcasejsx)
   - [`src/sections/Showcase.css`](#srcsectionsshowcasecss)
   - [`src/sections/VehicleCard.jsx`](#srcsectionsvehiclecardjsx)
   - [`src/sections/BrandCard.jsx`](#srcsectionsbrandcardjsx)
   - [`src/sections/BrandCard.css`](#srcsectionsbrandcardcss)
   - [`src/sections/BrandPage.jsx`](#srcsectionsbrandpagejsx)
   - [`src/sections/BrandPage.css`](#srcsectionsbrandpagecss)
   - [`src/sections/Footer.jsx`](#srcsectionsfooterjsx)
   - [`src/sections/Footer.css`](#srcsectionsfootercss)
   - [`src/sections/BookingsPage.jsx`](#srcsectionsbookingspagejsx)
   - [`src/sections/BookingsPage.css`](#srcsectionsbookingspagecss)
   - [`src/viewer/Vehicle3DViewer.jsx`](#srcviewervehicle3dviewerjsx)
   - [`src/viewer/ViewerPage.jsx`](#srcviewerviewerpagejsx)
   - [`src/viewer/ModelRegistry.jsx`](#srcviewermodelregistryjsx)
   - [`src/viewer/modelConfig.js`](#srcviewermodelconfigjs)
   - [`src/viewer/ModelsLibrary.jsx`](#srcviewermodelslibraryjsx)
5. [Missing Features](#missing-features)
6. [Full Checklist](#full-checklist)

---

## SUMMARY DASHBOARD

| Category | Count | Severity |
|----------|-------|----------|
| Security | 5 | 🔴 Critical |
| Bugs & Logic Errors | 13 | 🔴 Critical |
| Performance | 28 | 🔴–🔵 Mixed |
| Architecture & Design | 19 | 🟡 Medium |
| UX & Usability | 15 | 🟡 Medium |
| Code Quality | 13 | 🔵 Low |
| Accessibility | 8 | 🔵 Low |
| SEO | 4 | 🔵 Low |
| Missing Features | 20 | 🟣 Enhancement |
| **Total** | **125** | |

---

## PROJECT FILE MAP

```
axisdriveworks/
├── .env                          ← 2 issues (security)
├── index.html                    ← 2 issues (perf, SEO)
├── package.json                  ← 2 issues (quality)
├── vite.config.js                ← 1 issue (perf)
├── public/
│   ├── Logo.png
│   └── cardata.csv               ← 1 issue (29.8 MB!)
└── src/
    ├── main.jsx                  ← 1 issue (quality)
    ├── index.css                 ← 1 issue (empty/dead)
    ├── App.jsx                   ← 12 issues
    ├── App.css                   ← 3 issues (collisions, perf)
    ├── Api/
    │   └── FetchApi.js           ← 12 issues
    ├── sections/
    │   ├── Hero.jsx              ← 7 issues (perf heavy)
    │   ├── Search.jsx            ← 1 issue (a11y)
    │   ├── Search.css            ← 2 issues
    │   ├── Showcase.jsx          ← 11 issues
    │   ├── Showcase.css          ← 1 issue (collision)
    │   ├── VehicleCard.jsx       ← 2 issues
    │   ├── BrandCard.jsx         ← 1 issue (dead code)
    │   ├── BrandCard.css         ← 1 issue (collision)
    │   ├── BrandPage.jsx         ← 3 issues
    │   ├── BrandPage.css         ← 1 issue (collision)
    │   ├── Footer.jsx            ← 3 issues
    │   ├── Footer.css            ← 1 issue (duplicate CSS)
    │   ├── BookingsPage.jsx      ← 5 issues
    │   └── BookingsPage.css      ← 1 issue (duplicate CSS)
    └── viewer/
        ├── Vehicle3DViewer.jsx   ← 14 issues (most critical)
        ├── ViewerPage.jsx        ← 6 issues
        ├── ModelRegistry.jsx     ← 2 issues
        ├── modelConfig.js        ← 1 issue
        └── ModelsLibrary.jsx     ← 2 issues
```

---

## RECOMMENDED FIX ORDER

**Phase 1 — Critical (Do First)**
1. Security: API key exposure, fake auth, dead links
2. Critical bugs: shared material mutation, smart-match fallback, wrong model paths
3. Critical performance: 29MB CSV, no route splitting, `preserveDrawingBuffer`

**Phase 2 — High Priority**
4. Architecture: dead code, CSS collisions, file organization
5. Performance: particle animation, image fetching, GLTF disposal

**Phase 3 — Polish**
6. UX improvements (search, bookings, mobile support)
7. Accessibility (keyboard nav, focus traps, labels)
8. SEO (meta tags, robots.txt)
9. Code quality (unused imports, line endings, prop types)

**Phase 4 — Feature Development**
10. Missing features (auth, compare, favorites, filters, tests)

---

## ISSUES BY FILE

---

### `.env`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| S1 | 🔴 CRITICAL | Security | **API key committed in plaintext.** `VITE_PEXELS_ACCESS_KEY` and `VITE_PEXELS_API_KEY` contain the Pexels API key `rDjuTBde...`. Even though `.gitignore` lists `.env`, the file may already be in git history. **Action:** Revoke key on pexels.com, generate new one, purge `.env` from git history with BFG Repo-Cleaner, store secrets only in deployment environment variables. |
| S2 | 🟡 MEDIUM | Security | **Duplicate key definition.** Both `VITE_PEXELS_ACCESS_KEY` and `VITE_PEXELS_API_KEY` hold the identical value. `FetchApi.js:2-4` checks both with a fallback. Redundant and confusing. **Action:** Keep only `VITE_PEXELS_API_KEY`, remove the other, simplify the import in `FetchApi.js`. |

---

### `index.html`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| P3 | 🟡 HIGH | Performance | **Font Awesome loaded as render-blocking CSS from CDN** (line 13-16). Full library (~100KB+ CSS + web fonts) downloaded for only **4 icons** (`fa-facebook-f`, `fa-twitter`, `fa-instagram`, `fa-youtube`). **Action:** Replace with 4 inline SVG icons in `Footer.jsx`, delete the `<link>` tag. |
| P4 | 🔵 LOW | Performance | **`Inter` font referenced in CSS but never imported.** `App.css:5` declares `font-family: 'Inter'` but no Google Fonts `<link>` exists. Browser silently falls back to system fonts. **Action:** Either add `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;700;800;900&display=swap">` or remove `'Inter'` from the font stack. |
| M2 | 🟡 MEDIUM | SEO | **No `og:image` meta tag.** OG tags have title/description but no preview image. Sharing on social media shows no thumbnail. **Action:** Create a 1200×630 preview image and add `<meta property="og:image" content="...">`. |

---

### `package.json`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| C9 | 🔵 LOW | Quality | **Unused TypeScript dependencies.** `@types/react` and `@types/react-dom` are installed as devDependencies but the project doesn't use TypeScript. **Action:** `npm uninstall @types/react @types/react-dom`. |
| C11 | 🔵 LOW | Quality | **Dev script assumes relative backend path** (line 8): `"dev": "concurrently \"vite\" \"npm start --prefix ../axisdriveworks-backend\""`. If backend doesn't exist at that path, `concurrently` fails. No documentation about this requirement. **Action:** Add a README, split into `dev:frontend` and `dev:all` scripts. |

---

### `vite.config.js`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| P6 | 🔵 LOW | Performance | **No compression plugin.** No `vite-plugin-compression` for gzip/brotli pre-compression. Production build serves uncompressed JS/CSS unless the hosting CDN handles it. **Action:** Install and configure `vite-plugin-compression`. |

---

### `public/cardata.csv`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| P1 | 🔴 CRITICAL | Performance | **29.8 MB CSV file in `public/`.** Vite copies everything from `public/` into the production build. This file ships to every deployment, is accessible at `yourdomain.com/cardata.csv`, gets indexed by crawlers, and bloats CI/CD. **Action:** Move to backend project directory, serve via API with pagination. |

---

### `src/main.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D17 | 🔵 LOW | Architecture | **No `<React.StrictMode>` wrapper.** Strict mode helps catch side-effect bugs during development by double-rendering. **Action:** Wrap `<BrowserRouter><App /></BrowserRouter>` in `<React.StrictMode>`. |

---

### `src/index.css`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D7 | 🔵 LOW | Architecture | **File is completely empty (0 bytes).** Imported by `main.jsx` but serves no purpose — dead import. **Action:** Either delete the file and its import, or move global reset/base styles from `App.css` into it. |

---

### `src/App.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| B1 | 🔵 LOW | Bug | **`NotFound` used on line 141 but defined on line 164.** Works via hoisting but violates best practice. Could break if refactored to arrow function. **Action:** Move `NotFound` above `App` or extract to `src/sections/NotFound.jsx`. |
| B2 | 🔵 LOW | Bug | **`hideMobileNav` only checks exact `/viewer` path** (line 129). `/viewer/`, `/viewer?x=1` still show mobile nav over the 3D canvas. **Action:** Use `pathname.startsWith('/viewer')`. |
| B11 | 🟡 MEDIUM | Bug | **404 page uses `<a href="/">` instead of React Router** (line 179-195). Causes full page reload, losing all in-memory state. **Action:** Use `navigate("/")` from `useNavigate()`. |
| D1 | 🟡 MEDIUM | Architecture | **No global error boundary.** If any component throws, entire app goes white. Only `Vehicle3DViewer` has one. **Action:** Wrap `<Routes>` in a global `ErrorBoundary`. |
| D2 | 🟡 MEDIUM | Architecture | **`handleSearch` uses `alert()`** (line 119). Blocks thread, looks unprofessional. **Action:** Implement toast notifications. |
| D3 | 🟡 MEDIUM | Architecture | **No loading/error states for search.** Nothing visible happens while searching. **Action:** Add `isSearching` state with a spinner in Search component. |
| P2 | 🔴 CRITICAL | Performance | **No lazy loading for routes** (lines 1-13). All pages eagerly imported including entire Three.js pipeline (~600KB). **Action:** Use `React.lazy()` + `Suspense` for Showcase, BrandPage, ModelsLibrary, ViewerPage, BookingsPage. |
| U1 | 🟡 MEDIUM | UX | **Search only returns first result.** `handleSearch` navigates to Showcase with `results[0]` — all other results discarded. No search results page. **Action:** Create a SearchResults page. |
| U2 | 🟡 MEDIUM | UX | **Brand logos use external CDN URLs** (line 27-32). If CDN is down, broken images with no fallback. **Action:** Add `onError` handler or download logos locally. |
| U13 | 🔵 LOW | UX | **Nav links use `<a>` with `onClick preventDefault`** (lines 48-76) instead of React Router `<Link>`. Semantically confusing. **Action:** Use `<Link to="/models">`. |
| C1 | 🟡 MEDIUM | Quality | **Three components in one file** (`ScrollToTop`, `Home`, `App`, `NotFound`). Hard to navigate and test. **Action:** Extract `Home`, `NotFound`, `ScrollToTop` to their own files. |
| A2 | 🟡 MEDIUM | A11y | **Brand cards use `<div onClick>` instead of `<button>`** (lines 92-102). Not keyboard-navigable (no `tabIndex`, no `onKeyDown`). **Action:** Use `<button>` or add `role="button" tabIndex={0} onKeyDown`. |

---

### `src/App.css`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D12 | 🟡 MEDIUM | Architecture | **`.section-title` defined here (line 84) collides with `.section-title` in `Showcase.css` (line 162).** Different `font-size` values. Whichever loads last wins. **Action:** Scope class names (e.g. `.showcase-section-title`) or adopt CSS Modules. |
| P27 | 🔵 LOW | Performance | **`backdrop-filter: blur(30px) saturate(180%)` on sticky taskbar** (line 19-21). GPU-intensive blur on every scroll frame. **Action:** Reduce to `blur(10px)` or use solid semi-transparent background. |
| P28 | 🔵 LOW | Performance | **Infinite `box-shadow` animation on `.section-title::before`** (lines 110-113). `box-shadow` changes trigger paint (not just compositing). Runs forever even when off-screen. **Action:** Use `opacity`-only animation or add `will-change: box-shadow`. |

---

### `src/Api/FetchApi.js`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| S3 | 🟡 MEDIUM | Security | **Session token stored in `sessionStorage` with no protection** (line 16-66). No CSRF, no token expiry, no rotation. Accessible to XSS. **Action:** Add token expiry, consider HTTP-only cookies. |
| B13 | 🟡 MEDIUM | Bug | **Rate-limit backoff logic is inverted** (line 110). `Math.min(retryAfter * 1000, (2 ** attempt) * 1000)` picks the *shorter* delay, re-triggering the rate limit. **Action:** Change to `Math.max(...)`. |
| D4 | 🟡 MEDIUM | Architecture | **No `AbortController` on any fetch call.** Navigating away mid-request continues fetches, calling `setState` on unmounted components. **Action:** Pass `AbortController.signal` to all `fetch()` calls. |
| P7 | 🔴 CRITICAL | Performance | **All car images fetched in parallel with unbounded `Promise.all`** (called from Showcase/BrandPage). Each `getCarImage()` fires up to 3 HTTP requests. 20 cars = up to 60 simultaneous requests. **Action:** Add concurrency limiter (batch 3 at a time). |
| P8 | 🟡 HIGH | Performance | **Image cache is in-memory only** (line 73). `imageCache` Map lost on page refresh, all images re-fetched. **Action:** Persist to `localStorage` or `IndexedDB`. |
| P10 | 🟡 MEDIUM | Performance | **Pexels throttle is architecturally broken** (lines 88-100). 200ms serial delay + `Promise.all` concurrent calls = staircase delay, not actual protection. **Action:** Use a proper request queue with semaphore. |
| P12 | 🟡 MEDIUM | Performance | **No fetch cancellation on any API call.** Unmounted components still receive data. **Action:** Add `AbortController` cleanup in `useEffect` return. |
| P24 | 🟠 MEDIUM | Performance | **`imageCache` and `usedImagesByBrand` grow unbounded** (lines 73-75). Module-scoped Maps grow for lifetime of SPA. **Action:** Add max size limit (e.g. 200 entries, LRU eviction). |
| C6 | 🟡 MEDIUM | Quality | **417 lines handling 5 responsibilities** — session mgmt, image fetching, caching, car API, reservations. **Action:** Split into `session.js`, `images.js`, `cars.js`, `reservations.js`, `client.js`. |

---

### `src/sections/Hero.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D19 | 🔵 LOW | Quality | **Unused `useState` import** (line 1). Imported but never used. **Action:** Remove from import. |
| P13 | 🟡 HIGH | Performance | **O(n²) particle connection algorithm runs every frame** (lines 77-95). 45 particles = 990 distance checks per frame × 60fps = 59,400 calculations/second. **Action:** Reduce to 25-30 particles, skip `Math.sqrt()`, check every 2-3 frames. |
| P14 | 🟡 HIGH | Performance | **Particle animation never pauses when off-screen** (lines 34-122). `requestAnimationFrame` runs indefinitely regardless of scroll position. **Action:** Use `IntersectionObserver` to pause when Hero is not visible. |
| P15 | 🔵 LOW | Performance | **Canvas not scaled for `devicePixelRatio`** (lines 40-43). Particles look blurry on retina/HiDPI displays. **Action:** Scale canvas dimensions by `window.devicePixelRatio`. |
| P16 | 🔵 LOW | Performance | **Mousemove handler creates closure on every event** (lines 10-31). GC pressure from rapid allocation. **Action:** Use shared update function. |
| P17 | 🔵 LOW | Performance | **Resize handler not debounced** (lines 108-115). Fires for every pixel during resize drag. **Action:** Debounce with `setTimeout` (150ms). |
| A5 | 🔵 LOW | A11y | **Canvas has no `aria-hidden`** (line 131). Screen readers attempt to announce decorative canvas. **Action:** Add `aria-hidden="true" role="presentation"`. |

---

### `src/sections/Search.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| A1 | 🟡 MEDIUM | A11y | **Search input has no `<label>` or `aria-label`** (line 16). Screen readers can't identify purpose. **Action:** Add `aria-label="Search cars"` to the input. |

---

### `src/sections/Search.css`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D9 | 🔵 LOW | Architecture | **`.center-text` class unused, global `input` selector too broad** (lines 28-45). The global `input` style overrides form inputs in booking modal and auth gate. **Action:** Remove `.center-text`, scope `input` to `.search-input`. |
| U14 | 🔵 LOW | UX | **Search input uses `Times New Roman` font** (line 25). Clashes with `Inter`/sans-serif used elsewhere. **Action:** Change to `font-family: inherit`. |

---

### `src/sections/Showcase.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| B3 | 🟡 MEDIUM | Bug | **`Number(hero.msrp_usd)` can return `NaN`** (line 173). If API returns `null`/`undefined`, price displays as `$NaN`. **Action:** Add guard: `hero.msrp_usd ? \`$${Number(hero.msrp_usd).toLocaleString()}\` : 'Price on Request'`. |
| B4 | 🟡 MEDIUM | Bug | **Using array index `i` as React `key`** (line 249-251). Stale DOM nodes when `cars` re-fetches. **Action:** Use `car.id` or `\`${car.brand}-${car.model}\``. |
| B6 | 🟡 MEDIUM | Bug | **`navigate` in `useEffect` dependency array** (line 27). Can cause infinite loop in some React Router versions. **Action:** Remove `navigate` from deps array. |
| U3 | 🔵 LOW | UX | **Hero image uses `placehold.co` external service** (line 16). If service is down, initial image breaks. **Action:** Use local SVG placeholder. |
| U4 | 🟡 MEDIUM | UX | **"Interactive 3D Showroom" button misleads** (line 164-166). Navigates to models library, not the car's 3D viewer. **Action:** Either navigate to car's 3D viewer directly or rename to "Browse 3D Models". |
| U15 | 🔵 LOW | UX | **Loading overlay appears after content renders** (lines 264-269). Flash of content then blocking overlay. **Action:** Return `<LoadingOverlay>` before any content if loading. |
| P11 | 🔵 LOW | Performance | **Hero image re-fetched on every `hero` object change** (lines 59-63). Object reference changes on each navigation. **Action:** Use primitive dep: `const heroKey = hero ? \`${hero.brand}-${hero.model}\` : null`. |
| C2 | 🔵 LOW | Quality | **`Spec` component defined at bottom of file** (lines 274-279). **Action:** Move above `Showcase` or extract to own file. |
| C13 | 🟡 MEDIUM | Quality | **`state?.hero` object reference in `useEffect` dependency** (line 50). Triggers unnecessary re-fetches. **Action:** Use `state?.hero?.id` (a primitive). |
| A7 | 🟡 MEDIUM | A11y | **Booking modal has no focus trap** (lines 197-243). Tab can focus elements behind overlay. No Escape-to-close. **Action:** Implement focus trap, add `role="dialog" aria-modal="true"`, handle Escape key. |
| U8 | 🔵 LOW | UX | **No max date limit on booking** (line 232). Users can book years in the future. **Action:** Add `max` attribute (e.g. 3 months ahead). |

---

### `src/sections/Showcase.css`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D12b | 🟡 MEDIUM | Architecture | **`.section-title` re-defined** (line 162) — collides with `App.css` (line 84). Different font-size values. **Action:** Scope the class name. |

---

### `src/sections/VehicleCard.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D18 | 🔵 LOW | Quality | **Unused `useState` import** (line 1). `useState` imported but never used. **Action:** Remove from import. |
| A3 | 🟡 MEDIUM | A11y | **Card is a `<div>` with mouse-only events** (lines 38-43). Not focusable or keyboard-operable. **Action:** Add `tabIndex={0}`, `onKeyDown` for Enter/Space, `onFocus`/`onBlur`. |

---

### `src/sections/BrandCard.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D8 | 🔵 LOW | Architecture | **Component is never imported anywhere.** Dead code. `BrandCard.jsx` and `BrandCard.css` both unused (note: `App.jsx` line 9 imports it but never renders it — effectively dead). **Action:** Delete both files, remove the import from `App.jsx`. |

---

### `src/sections/BrandCard.css`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D13 | 🟡 MEDIUM | Architecture | **`.brand-grid` re-defined** (line 1) — collides with `.brand-grid` in `App.css` (line 121). Different `gap`, `padding`, `grid-template-columns`. **Action:** Delete this file (dead code via D8) or rename the class. |

---

### `src/sections/BrandPage.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| B5 | 🟡 MEDIUM | Bug | **Same `key={i}` problem as Showcase** (line 54-56). Array index as React key. **Action:** Use `car.id` or `\`${car.brand}-${car.model}\``. |
| P9 | 🟡 MEDIUM | Performance | **Duplicate image loading pattern.** Identical `Promise.all` → `getCarImage()` as Showcase. Both fetch independently. **Action:** Extract to shared `useCarImages()` custom hook. |
| F8 | 🔵 LOW | UX | **No error state for invalid brand URLs.** `/brand/InvalidBrand` shows empty page with no messaging. **Action:** Check `cars.length === 0` after loading and show "No cars found". |

---

### `src/sections/BrandPage.css`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D14 | 🟡 MEDIUM | Architecture | **`.car-grid` re-defined** (line 32) — collides with `.car-grid` in `Showcase.css` (line 169). Different `gap` and column values. **Action:** Scope class names. |

---

### `src/sections/Footer.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| S5 | 🔵 LOW | Security | **Dead links to `/privacy` and `/terms`** (lines 50-51). No corresponding routes exist. Users land on 404. **Action:** Create pages or remove links. |
| B12 | 🔵 LOW | Bug | **`scrollIntoView` for `#brands` won't work on non-Home pages** (lines 20-22). Element doesn't exist on Showcase, BrandPage, etc. Nothing happens — silent failure. **Action:** Navigate to `/` first if not on home page, then scroll. |
| U13b | 🔵 LOW | UX | **Footer "Home" link uses `<a href="/">` causing full page reload.** Loses in-memory state. **Action:** Use React Router `<Link>` or `navigate()`. |

---

### `src/sections/Footer.css`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D11 | 🔵 LOW | Architecture | **Duplicate `.footer-section h3` rule** — defined on line 17 and again on line 128 with additional properties. **Action:** Merge into one rule. |

---

### `src/sections/BookingsPage.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| S4 | 🔴 CRITICAL | Security | **No real authentication** (lines 38-47). Any email creates a session — no password, OTP, or verification. Anyone can view anyone's bookings. **Action:** Implement real auth (email+password, OAuth, or magic link). |
| U9 | 🟡 MEDIUM | UX | **No duplicate booking prevention.** Same user can book same car on same date unlimited times. **Action:** Check existing bookings before creating new one. |
| U10 | 🔵 LOW | UX | **No confirmation before clearing completed bookings** (lines 65-69). Instant delete, no undo. **Action:** Add confirmation modal. |
| C4 | 🔵 LOW | Quality | **Inline styles duplicated** (lines 75-78 and 111) between auth/unauth views. **Action:** Extract to `.bookings-top-bar` CSS class. |
| F20 | 🟡 MEDIUM | UX | **No booking cancellation.** Users can complete but not cancel upcoming test drives. **Action:** Add "Cancel Booking" button + API endpoint. |

---

### `src/sections/BookingsPage.css`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D10 | 🔵 LOW | Architecture | **Duplicate CSS rules.** `.bookings-grid` defined identically on lines 33-38 AND 263-268. `.booking-card` duplicated on lines 40-53 AND 270-283. **Action:** Remove the duplicate blocks. |

---

### `src/viewer/Vehicle3DViewer.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| B7 | 🔴 CRITICAL | Bug | **Smart match fallback never activates for manifest models** (lines 90-99). `Array.includes()` returns `false`, not `undefined`. `if (isPaint === undefined)` is always false when config exists. Unlisted parts never get colored. **Action:** Change condition to `if (!isPaint && !isWheel && !isGlass)`. |
| B8 | 🔴 CRITICAL | Bug | **Mutating shared material objects** (line 103). `scene.clone()` does shallow clone — materials are shared references. `child.material.color.set(color)` affects all meshes using the same material. Color bleeds across parts and models. **Action:** Clone material before modifying: `child.material = child.material.clone()`. |
| B9 | 🔵 LOW | Bug | **`window.innerWidth` called during initial render** (line 225). Crashes if server-rendered. **Action:** Initialize `useState(false)`, set in `useEffect`. |
| P18 | 🔴 CRITICAL | Performance | **`preserveDrawingBuffer: true` always on** (line 243). Prevents GPU from discarding back buffer after each frame. 10-30% rendering performance penalty for a feature (snapshot) rarely used. **Action:** Remove it; for snapshots, force-render an extra frame before `toDataURL()`. |
| P19 | 🟡 HIGH | Performance | **Full scene traversal on every color/finish/stance change** (lines 78-137). `model.traverse()` iterates 200-500+ meshes with string comparisons for each prop change. **Action:** Pre-classify meshes once into `paint[]`, `wheels[]`, `glass[]` arrays on load. |
| P20 | 🟡 MEDIUM | Performance | **`scene.clone()` doubles memory** (lines 50-76). Deep-clones geometry buffers, materials, textures. `Box3.setFromObject()` called twice. **Action:** Use `SkeletonUtils.clone()` or modify in-place. Combine Box3 calculations. |
| P21 | 🟡 MEDIUM | Performance | **ContactShadows re-mounts on stance/exploded change** (lines 275-284). `key` prop forces unmount/remount, re-rendering shadow map from scratch. **Action:** Remove `key` prop. |
| P25 | 🔴 CRITICAL | Performance | **GLTF models never disposed** (line 42). `useGLTF` caches models but GPU textures/geometry never freed on navigation. After 5-10 models, GPU memory hits 500MB+. Mobile devices crash. **Action:** Add `useEffect` cleanup that calls `.geometry.dispose()` and `.material.dispose()` on every mesh. |
| P26 | 🟡 MEDIUM | Performance | **DriveController uses `useState` for per-frame key input** (lines 143-160). Every keydown/keyup triggers React state update + re-render. With keys held = 60 re-renders/sec. **Action:** Use `useRef` instead — `keys.current.w = true`. |
| P23 | 🔵 LOW | Performance | **Environment HDR re-downloaded on switch** (lines 251-254). Switching DAYLIGHT↔MIDNIGHT downloads HDR (1-4MB). **Action:** Preload both on mount or accept the tradeoff. |
| C5 | 🟡 MEDIUM | Quality | **No CSS file at all.** 338 lines with all styling inline. No separation of concerns. **Action:** Create `Vehicle3DViewer.css`. |
| C12 | 🔵 LOW | Quality | **`e.key.toLowerCase()` for game controls** (line 150). Layout-dependent (AZERTY breaks). **Action:** Use `e.code` (`KeyW`, `ArrowUp`, etc.). |
| C7 | 🔵 LOW | Quality | **File extension `.jsx` but contains no JSX at top level** — the file *does* have JSX, but imported components like `Center` (line 8) is imported but never used. **Action:** Remove unused `Center` import. |

---

### `src/viewer/ViewerPage.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| U5 | 🟡 MEDIUM | UX | **Test Drive mode is keyboard-only (WASD).** No on-screen touch controls for mobile. **Action:** Add virtual joystick/D-pad for touch devices. |
| U6 | 🔵 LOW | UX | **No instructions for drive controls.** No tooltip showing how to use WASD/Arrows. **Action:** Show brief overlay on first entering drive mode. |
| U7 | 🔵 LOW | UX | **Snapshot can capture blank canvas** (lines 27-36). If triggered before model loads, black image saved. **Action:** Disable snapshot button while loading. |
| U11 | 🔵 LOW | UX | **No model name/label in viewer.** Only shows `ASSET_ID: 00`. **Action:** Pass `model.name` and `model.brand` via route state, display in sidebar header. |
| C3 | 🟡 MEDIUM | Quality | **Extensive inline styles** throughout JSX. Mixes with CSS file — inconsistent. **Action:** Move all inline styles to `ViewerPage.css`. |
| A4 | 🔵 LOW | A11y | **Color swatch `aria-label` uses hex values** (line 91). `"Color #ffffff"` is meaningless to screen readers. **Action:** Map hex to names: `{ "#ffffff": "White", "#111111": "Black" }`. |

---

### `src/viewer/ModelRegistry.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| B10 | 🔴 CRITICAL | Bug | **Mazda RX-7 and Subaru WRX point to `hyundai/` folder** (lines 25-26). URLs read `.../hyundai/mazda_rx-7_car.glb` and `.../hyundai/subaru_impreza_wrx.glb`. Wrong directory. **Action:** Either move files on backend to correct folders (`mazda/`, `subaru/`) or fix URLs here. |
| D16 | 🟡 MEDIUM | Architecture | **All 37 model URLs point to `localhost:5000`.** If backend isn't running, every model fails. No CDN fallback. **Action:** Use `VITE_API_URL` env variable (partially done), add graceful error messages. |

---

### `src/viewer/modelConfig.js`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| D15 | 🟡 MEDIUM | Architecture | **Manifest covers only 9 of 37 models.** The remaining 28 rely on `smartMatchMaterial()` — a heuristic. Many models will have broken color customization. **Action:** Gradually add entries for all models, or improve heuristic. |

---

### `src/viewer/ModelsLibrary.jsx`

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| P22 | 🟡 HIGH | Performance | **`useGLTF.preload()` fires on every `mouseenter`** (lines 33-37). No debounce. Rapidly hovering queues multiple 5-50MB GLB downloads. **Action:** Debounce with 500ms `setTimeout`. Clear on `mouseleave`. |
| U12 | 🟡 MEDIUM | UX | **No search/filter in models library.** User must scroll through all 37 models. **Action:** Add search bar and brand filter pills. |

---

### Cross-File Issues

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| C8 | 🔵 LOW | Quality | **Inconsistent line endings.** Some files use CRLF (`\r\n`): `Search.jsx`, `Search.css`, `BrandCard.jsx`, `BrandCard.css`, `BrandPage.css`, `Footer.css`, `ViewerPage.jsx`, `ModelRegistry.jsx`. Others use LF. **Action:** Add `.editorconfig` with `end_of_line = lf` and `.gitattributes` with `* text=auto eol=lf`, then `git add --renormalize .`. |
| C10 | 🟡 MEDIUM | Quality | **No prop validation on any component.** All props are implicitly `any`. **Action:** Add `PropTypes` or migrate to TypeScript. |
| A6 | 🔵 LOW | A11y | **No skip-to-content link** on any page. Keyboard users Tab through entire nav. **Action:** Add visually hidden `<a href="#main-content">Skip to main content</a>` as first child. |
| A8 | 🔵 LOW | A11y | **Mobile nav uses emoji as icons** (🏠🚗📅). Screen readers announce them inconsistently. **Action:** Add `aria-hidden="true"` to emoji spans. |
| M1 | 🟡 MEDIUM | SEO | **No dynamic meta tags on sub-pages.** All pages inherit generic `index.html` meta. **Action:** Install `react-helmet-async`, add per-page meta. |
| M3 | 🔵 LOW | SEO | **No `robots.txt` or `sitemap.xml`.** **Action:** Create both in `public/`. |
| M4 | 🟡 MEDIUM | SEO | **Client-rendered only.** Crawlers see blank `<div id="root">`. **Action:** Consider `react-snap` for pre-rendering, or accept tradeoff. |
| P5 | 🟡 MEDIUM | Performance | **Hero images unoptimized.** `car1.png` (1.36 MB), `car3.png` (852 KB) — total ~2.2 MB PNG. **Action:** Convert to WebP (saves ~80%). |

---

## MISSING FEATURES

| ID | Priority | Feature Description |
|----|----------|---------------------|
| F1 | 🔴 Critical | **Real authentication.** Currently email-only, no password/OTP/OAuth. Sessions are trivially forgeable. |
| F2 | 🟡 Medium | **Compare cars.** Side-by-side comparison of specs for 2-3 selected cars. |
| F3 | 🟡 Medium | **Favorites/wishlist.** Save cars for later. Persist in localStorage or backend. |
| F4 | 🟡 Medium | **Dedicated car detail page.** Showcase is overloaded — doubles as brand listing + detail view. Needs a `/car/:id` route. |
| F5 | 🟡 Medium | **Pagination/infinite scroll.** Brands with 100+ models render all at once. |
| F6 | 🟡 Medium | **Search autocomplete.** Debounced suggestions dropdown while typing. |
| F7 | 🟡 Medium | **Filter/sort on car listings.** By price, year, HP, body style, drivetrain. |
| F8 | 🔵 Low | **404 for invalid brand URLs.** `/brand/InvalidBrand` shows empty page. |
| F9 | 🟡 Medium | **Toast/notification system.** Replace all `alert()` with styled toasts. |
| F10 | 🔵 Low | **Dark/light theme toggle.** App is dark-only, no `prefers-color-scheme` detection. |
| F11 | 🟡 Medium | **Test suite.** Zero tests exist. Need Vitest + RTL for units, Playwright for E2E. |
| F12 | 🟡 Medium | **CI/CD pipeline.** No GitHub Actions or deployment automation. |
| F13 | 🔵 Low | **PWA support.** No `manifest.json`, no service worker, no offline capability. |
| F14 | 🟡 Medium | **README.md.** No documentation on setup, running, building, or contributing. |
| F15 | 🔵 Low | **Environment-specific configs.** Only one `.env`. No `.env.production`, `.env.example`. |
| F16 | 🔵 Low | **Reset camera button.** No way to snap back to default view in 3D viewer. |
| F17 | 🔵 Low | **Color picker.** Only 7 preset colors. No custom color input. |
| F18 | 🟡 Medium | **Share/export configurator.** Can't save or share custom car builds. |
| F19 | 🔵 Low | **Time slot booking.** Only date, no time selection. |
| F20 | 🟡 Medium | **Booking cancellation.** Can complete but can't cancel upcoming test drives. |

---

## FULL CHECKLIST

### 🔴 Critical (Do First — 12 items)
- [ ] S1 — Revoke & rotate Pexels API key, purge from git history
- [ ] S4 — Implement real authentication
- [ ] B7 — Fix smart match fallback condition (`!isPaint && !isWheel && !isGlass`)
- [ ] B8 — Clone materials before mutating (`child.material = child.material.clone()`)
- [ ] B10 — Fix Mazda/Subaru model URLs (wrong directory)
- [ ] P1 — Remove 29.8 MB CSV from `public/`
- [ ] P2 — Add `React.lazy()` route splitting
- [ ] P18 — Remove `preserveDrawingBuffer: true`
- [ ] P25 — Add GLTF model disposal on unmount
- [ ] P7 — Add concurrency limit to image fetches
- [ ] B13 — Fix rate-limit backoff (`Math.max` not `Math.min`)
- [ ] F1 — Real authentication system

### 🟡 High Priority (22 items)
- [ ] S2, S3, S5 — Duplicate key, session security, dead links
- [ ] B3, B4, B5, B6 — NaN guard, React keys, navigate deps
- [ ] B11, B12 — 404 navigation, footer scroll
- [ ] D1, D2, D3, D4 — Error boundary, alerts, loading, AbortController
- [ ] P13, P14 — Particle algorithm, off-screen pause
- [ ] P19, P22, P26 — Mesh pre-classification, preload debounce, useRef keys
- [ ] P8 — Persistent image cache
- [ ] U1, U4, U5, U9 — Search results, 3D button, mobile drive, duplicates

### 🔵 Medium & Low (remaining ~90 items)
- [ ] All architecture items (D7-D19)
- [ ] All remaining UX items (U2-U15)
- [ ] All performance low items (P4-P6, P9-P12, P15-P17, P20-P24, P27-P28)
- [ ] All code quality items (C1-C13)
- [ ] All accessibility items (A1-A8)
- [ ] All SEO items (M1-M4)

### 🟣 Features (20 items)
- [ ] F1-F20 — See Missing Features section above
