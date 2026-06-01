# Chrome extension architecture (v3)

## Runtime layout

```
background.js          → injects content script on icon click / job-tab reopen
content/content.js     → drawer shell (iframe), page scrape, form fill
drawer/drawer.html     → signed-in UI (loaded in iframe)
drawer/drawer.js       → all drawer logic today (~1.8k lines)
lib/api.js             → auth token + appFetch / appFetchJson
lib/constants.js       → status options, storage keys
lib/util.js            → escapeHtml, setVisible
lib/config.js          → default app origin
```

The drawer runs in an **extension-origin iframe** on arbitrary job sites. The content script owns open/close, postMessage to the iframe, and `fillApplicationForm` on the host page.

## Drawer navigation (single source of truth)

`applyDrawerLayout()` in `drawer.js` reads `getDrawerLayoutMode()`:

| Mode | When | Profile / analyze | Queue | Openings | Applications |
|------|------|-------------------|-------|----------|--------------|
| `main` | Default lists | ✓ | if queue has rows | list | list |
| `opening-detail` | Opening card opened | hidden | hidden | detail | hidden |
| `application-detail` | Application card opened | hidden | hidden | hidden | detail |

After any navigation or list refresh that affects chrome, call **`applyDrawerLayout()`** — do not toggle section `hidden` elsewhere.

State variables: `drawerViewMemory`, `applicationsViewMemory`, `selectedOpening`, `selectedApplication`, `openingsSectionAvailable`, `applicationsSectionAvailable`.

## Recommended refactors (priority order)

### 1. Split `drawer.js` (highest impact)

One file makes regressions likely. Suggested modules (load order in `drawer.html`):

| File | Responsibility |
|------|----------------|
| `drawer/state.js` | View memory, `applyDrawerLayout`, `getDrawerLayoutMode` |
| `drawer/scoring.js` | Score colors, badges, category bars, `openingRowHtml` helpers |
| `drawer/openings.js` | Fetch/render openings, poll, opening detail population |
| `drawer/applications.js` | Applications list/detail, PATCH, status dropdown |
| `drawer/personas.js` | Personas picker, profile card |
| `drawer/init.js` | Event listeners, auth, `refreshAuthState` |

Use a namespace: `window.ApplicaDrawer = { state, openings, applications, init }` with a mutable `state` object passed by reference.

### 2. API layer

Prefer `ApplicaAPI.appFetchJson()` for JSON endpoints (see `updateApplication`). Remaining `appFetch` + manual `res.json()` should migrate over time.

Optional: thin resource helpers (`openings.list(personaId)`, `applications.update(id, attrs)`) to document the API surface in one place.

### 3. Content script

`content.js` (~970 lines) mixes drawer chrome, messaging, and form fill. Split:

- `content/drawer-shell.js` — iframe, toggle, reopen timestamp
- `content/form-fill.js` — ATS selectors and field mapping (changes most often)

Share `lib/constants.js` for storage keys (already started).

### 4. DOM access

~100 `getElementById` calls in `drawer.js`. A one-time `cacheDrawerElements()` returning `{ personaPicker, openingsList, ... }` reduces typos and aids splitting.

### 5. HTML / CSS

- Subtitle copy and section titles are scattered; keep copy in HTML where possible.
- CSS is one large `drawer.css`; consider sections mirroring JS modules when splitting.

### 6. Docs and manifest

- `README.md` and `PRIVACY.md` describe permissions, data use, and production vs dev manifests.
- **Production** `content_scripts` matches `https://app.getapplica.com/*` (callback); job boards use `scripting` + `activeTab` on icon click.
- **Development** branches may use localhost hosts in `manifest.json` and `config.js` — do not ship those to the Chrome Web Store.

### 7. Testing

No automated tests today. High-value targets:

- `normalizeApplicationStatus`, `normalizeUrlForCompare`, `getDrawerLayoutMode` (pure functions once extracted)
- Form-fill label matching with fixture HTML snippets

## What not to do yet

- Build tooling (bundler/TypeScript) unless the team commits to it for v3 — script tag order works and keeps debugging simple.
- Framework in the drawer iframe — vanilla JS matches current size and load model.

## Version checklist

- [ ] Reload extension after any `drawer.html` script list change
- [ ] Exercise: main → opening detail → back → application detail → save → list status change
- [ ] Exercise: form fill on Greenhouse + one other ATS
- [ ] Confirm auth callback on app origin still stores token
