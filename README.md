# Applica Chrome Extension

Chrome extension that shows a **right-hand drawer** when active. Use it to grade your resume against a job description that has been navigated to. 

TODO - Fill out the form with the users/profile info

## Behavior

- **Toggle drawer**: Click the extension icon in the toolbar. A drawer slides in from the right.
- **Sign in**: The drawer shows the app’s login page in an iframe (or you can open “Open login in new tab”). Session cookies are set for the app’s origin, so when you open the app in a normal tab you’re logged in.
- **Profile picker: A drop down to choose which profile you're actively working in.
- **Analyze listing: The button grabs the current page which should be a job listing, sends it via API for testing against your default resume.
- **Close**: Use the × in the drawer header or the “Close drawer” button.

## Setup

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `chrome_plugin` folder (this repo’s `chrome_plugin` directory).
4. Ensure the app is running (e.g. `cd app && mix phx.server`) at `http://localhost:4000`. Or change `lib/config.js` to point to a different location.
5. Click the extension icon on any page to open the drawer.

## Configuration

- **App origin**: Set in `lib/config.js` as `APPLICA_DEFAULT_APP_ORIGIN`. The shipped extension should use your production API (e.g. `https://app.applica.com`). At runtime the extension uses `chrome.storage.local` key `applica_app_origin` if set; otherwise it uses the default from `lib/config.js`.
- **Local development**: Either set `APPLICA_DEFAULT_APP_ORIGIN` in `lib/config.js` to `http://localhost:4000`, or leave the production default and set `applica_app_origin` in storage to `http://localhost:4000` (e.g. in DevTools → Application → Extension storage for your extension).

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
   - Use `lib/api.js`’s `appFetch(path, { headers: { Authorization: "Bearer " + token } })` for authenticated requests.

The existing `lib/api.js` and `ApplicaAPI` helpers are set up for this: `getAppOrigin()`, `appUrl(path)`, and `appFetch(path, options)`.

## File overview

| Path | Purpose |
|------|--------|
| `manifest.json` | Extension config: permissions, background script, content script, host permissions for the app. |
| `background.js` | Service worker: on icon click, tells the content script to toggle the drawer. |
| `content/content.js`, `content/content.css` | Injected into every page; build the right-hand drawer and iframe, open/close on message. |
| `drawer/drawer.html` | UI inside the drawer: login iframe + “Open login in new tab” and “Close drawer”. |
| `drawer/drawer.js` | Sets login iframe `src` from app origin, wires buttons. |
| `drawer/drawer.css` | Styles for the drawer panel. |
| `lib/config.js` | Default app origin (one place to change for production vs dev). |
| `lib/api.js` | App base URL (storage or config default) and `appFetch()` for calling the app; ready for token auth. |
| `auth.html` | OAuth/callback helper page; loads `lib/api.js`. |
| `images/` | Extension icon and drawer logo. |

## Contributing

We welcome contributions. To get started:

1. **Fork and clone** the repo, then load the `chrome_plugin` folder as an unpacked extension (see [Setup](#setup)).
2. **Open an issue** to discuss bigger changes or report bugs before sending a PR.
3. **Submit a PR** with a clear description of the change. Keep the scope small where possible so reviews are straightforward.

There’s no formal style guide; match the existing code and keep the extension’s permissions and behavior as minimal as possible.

> **Disclosure:** If it's not obvious, I am not a front end dev and most of this was vibe coded. If you need API support for anything new, please send an email to bart@getapplica.com and link back to an issue here so I can get the context. Thanks!

## Host permissions

- `http://localhost:4000/*` — local app.
- `https://*.fly.dev/*` — production on Fly (adjust if your domain differs).

Add or change `host_permissions` in `manifest.json` if you use another origin.
