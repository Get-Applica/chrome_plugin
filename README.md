# Applica Chrome Extension (v3)

Chrome extension with a **right-hand drawer** for scoring job postings against your resume, filling application forms, and tracking applications.

**Privacy:** See **[PRIVACY.md](./PRIVACY.md)** for data collection, permissions, and Chrome Web Store disclosure text. General policy: [getapplica.com/privacy-policy](https://www.getapplica.com/privacy-policy).

## Behavior

- **Toggle drawer**: Click the extension icon on a job site. The content script is injected on demand (`activeTab` + `scripting`); the drawer slides in from the right.
- **Sign in**: Opens Applica login in a new tab; a bearer token is stored locally for API calls.
- **Profile picker**: Choose which persona (profile) you are working in.
- **Analyze job posting**: Sends the **current page URL and HTML** to the Applica API for extraction and scoring.
- **Processing queue**: Jobs being analyzed or waiting for a score; remove stuck items from the queue.
- **Apply queue**: Scored openings; open detail, fill forms, upload a custom resume per job.
- **Recent applications**: List with status; open detail for notes and contacts.
- **Close**: × in the header.

## Setup

1. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked** → select this `chrome_plugin` folder.
2. Use the **production** branch/manifest for `app.getapplica.com`, or the dev branch for localhost (see [Configuration](#configuration)).
3. On a job listing page, click the extension icon.

## Configuration

- **App origin**: `lib/config.js` → `APPLICA_DEFAULT_APP_ORIGIN` (production: `https://app.getapplica.com`).
- **Override**: `chrome.storage.local` key `applica_app_origin` (DevTools → Application → Extension storage).
- **Auth**: Token in `applica_auth_token`; set by login. Drawer API calls use `lib/api.js` → `appFetch` / `appFetchJson`.

## Permissions (production manifest)

| Permission | Why |
|------------|-----|
| `activeTab` | Run on the job page only when the user clicks the extension icon |
| `scripting` | Inject `content/content.js` and CSS on that tab |
| `storage` | Auth token, profile selection, drawer view state |
| `tabs` | Open sign-in and job URLs in new tabs |
| `host_permissions`: `https://app.getapplica.com/*` | HTTPS API and sign-in callback on the Applica app |

Job boards are **not** granted blanket host access. Injection on Greenhouse, Ashby, Workday, etc. relies on **activeTab** after the user clicks the icon.

A `content_scripts` entry on `https://app.getapplica.com/*` handles the login callback on the Applica site only.

`web_accessible_resources` expose drawer assets to HTTPS pages so the iframe can load; see [PRIVACY.md](./PRIVACY.md).

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for layout modes (`applyDrawerLayout`), file layout, and refactor notes.

## File overview

| Path | Purpose |
|------|--------|
| `manifest.json` | MV3 config, permissions, web-accessible drawer assets |
| `PRIVACY.md` | Extension data use and store listing disclosure |
| `background.js` | Icon click → inject content script; optional reopen after navigation |
| `content/content.js` | Drawer shell, page scrape, ATS form fill |
| `drawer/drawer.html`, `drawer.js`, `drawer.css` | Signed-in UI |
| `lib/api.js` | `appFetch`, `appFetchJson`, auth storage |
| `lib/constants.js` | Application statuses, storage keys |
| `lib/util.js` | `escapeHtml`, `setVisible` |
| `lib/config.js` | Default app origin |
| `auth.html` | Extension OAuth redirect target (`redirect_uri`) |

## Contributing

Match existing vanilla JS patterns. Reload the extension after changing `drawer.html` script tags or `manifest.json`. For new API endpoints, coordinate with the Phoenix app and add tests under `app/test/you_web/controllers/api/`.

Before a Chrome Web Store release, verify `config.js` and `host_permissions` match production, and review [PRIVACY.md](./PRIVACY.md).
