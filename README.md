# Applica Chrome Extension (v3)

Chrome extension with a **right-hand drawer** for scoring job postings against your resume, filling application forms, and tracking applications.

## Behavior

- **Toggle drawer**: Click the extension icon. On most sites the content script is injected on demand; the drawer slides in from the right.
- **Sign in**: Opens the app login flow in a new tab; `auth.html` / the app callback stores a bearer token for API calls.
- **Profile picker**: Choose which persona (profile) you are working in.
- **Analyze job posting**: Sends the current page URL and HTML to the API for scoring.
- **Apply queue**: Scored openings; click for detail, form fill, custom resume upload.
- **Recent applications**: List with inline status; click for notes and contacts.
- **Close**: × in the header or “Close drawer”.

## Setup

1. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked** → select this `chrome_plugin` folder.
2. Run the app locally (`mix phx.server` at `http://localhost:4000`) or point at production via `lib/config.js` / storage override.
3. Click the extension icon on a job listing page.

## Configuration

- **App origin**: `lib/config.js` → `APPLICA_DEFAULT_APP_ORIGIN`. Override at runtime with `chrome.storage.local` key `applica_app_origin`.
- **Auth**: Token in `applica_auth_token`; set by login callback. All drawer API calls use `lib/api.js` → `appFetch` / `appFetchJson`.

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for layout modes (`applyDrawerLayout`), file layout, and a prioritized refactor roadmap for v3.

## File overview

| Path | Purpose |
|------|--------|
| `manifest.json` | MV3 config, permissions, web-accessible drawer assets |
| `background.js` | Icon click → inject content script; job-tab reopen |
| `content/content.js` | Drawer shell, page scrape, ATS form fill |
| `drawer/drawer.html`, `drawer.js`, `drawer.css` | Signed-in UI |
| `lib/api.js` | `appFetch`, `appFetchJson`, auth storage |
| `lib/constants.js` | Application statuses, storage keys |
| `lib/util.js` | `escapeHtml`, `setVisible` |
| `lib/config.js` | Default app origin |
| `auth.html` | Extension OAuth redirect helper |

## Host permissions

Adjust `host_permissions` in `manifest.json` for your app origin (localhost, Fly, production domain).

## Contributing

Match existing vanilla JS patterns. Reload the extension after changing `drawer.html` script tags or manifest. For new API endpoints, coordinate with the Phoenix app and add tests under `app/test/you_web/controllers/api/`.
