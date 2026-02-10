# Applica Chrome Extension

Chrome extension that shows a **right-hand drawer** when active. Use it to sign in to the Applica app and (later) interact with the app API from any tab.

## Behavior

- **Toggle drawer**: Click the extension icon in the toolbar. A drawer slides in from the right.
- **Sign in**: The drawer shows the app’s login page in an iframe (or you can open “Open login in new tab”). Session cookies are set for the app’s origin, so when you open the app in a normal tab you’re logged in.
- **Close**: Use the × in the drawer header or the “Close drawer” button.

## Setup

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `chrome_plugin` folder (this repo’s `chrome_plugin` directory).
4. Ensure the app is running (e.g. `cd app && mix phx.server`) at `http://localhost:4000`.
5. Click the extension icon on any page to open the drawer.

## Configuration

- **App origin**: Set in `config.js` as `APPLICA_DEFAULT_APP_ORIGIN`. The shipped extension should use your production API (e.g. `https://app.applica.com`). At runtime the extension uses `chrome.storage.local` key `applica_app_origin` if set; otherwise it uses the default from `config.js`.
- **Local development**: Either set `APPLICA_DEFAULT_APP_ORIGIN` in `config.js` to `http://localhost:4000`, or leave the production default and set `applica_app_origin` in storage to `http://localhost:4000` (e.g. in DevTools → Application → Extension storage for your extension).

## Interacting with the app API

The app currently uses **session (cookie) auth** and no JSON API. The drawer works by:

- Embedding the app’s login page in an iframe so users can sign in; cookies are set for the app’s origin.
- Offering “Open login in new tab” for a full-page login.

To have the extension call the app directly (e.g. from the background script or from the drawer without an iframe), add a small **token-based API** in the app, for example:

1. **In the app** (e.g. in `app/lib/you_web/router.ex`):
   - `scope "/api", YouWeb.Api do` with a pipeline that accepts JSON.
   - `POST /api/session` — body `%{email: "...", password: "..."}`; on success return `%{token: "..."}` and store the token in the same way you do for sessions (or a dedicated API token table).
   - `GET /api/me` — `Authorization: Bearer <token>`; return current user JSON.
   - `DELETE /api/session` — invalidate the token.

2. **In the extension**:
   - After login (via your API), store the token in `chrome.storage.local`.
   - Use `api.js`’s `appFetch(path, { headers: { Authorization: "Bearer " + token } })` for authenticated requests.

The existing `api.js` and `ApplicaAPI` helpers are set up for this: `getAppOrigin()`, `appUrl(path)`, and `appFetch(path, options)`.

## File overview

| File | Purpose |
|------|--------|
| `manifest.json` | Extension config: permissions, background script, content script, host permissions for the app. |
| `background.js` | Service worker: on icon click, tells the content script to toggle the drawer. |
| `content.js` + `content.css` | Injected into every page; build the right-hand drawer and iframe, open/close on message. |
| `drawer.html` | UI inside the drawer: login iframe + “Open login in new tab” and “Close drawer”. |
| `drawer.js` | Sets login iframe `src` from app origin, wires buttons. |
| `drawer.css` | Styles for the drawer panel. |
| `config.js` | Default app origin (one place to change for production vs dev). |
| `api.js` | App base URL (storage or config default) and `appFetch()` for calling the app; ready for token auth. |

## Host permissions

- `http://localhost:4000/*` — local app.
- `https://*.fly.dev/*` — production on Fly (adjust if your domain differs).

Add or change `host_permissions` in `manifest.json` if you use another origin.
