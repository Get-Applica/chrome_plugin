# Applica Chrome Extension — Privacy & data use

This document describes what the **Applica Chrome Extension** (Manifest V3) does with user data. It supplements the general [Applica Privacy Policy](https://www.getapplica.com/privacy-policy). Use it for the Chrome Web Store listing, support, and engineering reference.

## What the extension does

When you click the extension icon on a job site, Applica injects a drawer (sidebar) so you can:

- Sign in to your Applica account
- **Analyze** the current job posting (match score vs. your resume)
- View and manage your **processing queue** and **apply queue**
- **Fill** common application form fields on the page
- **Track** applications (status, notes, contacts)

The extension only runs its content script on job sites **after you click the icon** (or briefly re-injects after you open a job link from the drawer). It does not read every page you visit in the background.

## Data the extension collects or processes

| Data | When | Where it goes |
|------|------|----------------|
| **Account credentials** | Sign in (browser tab on Applica) | Sent to `https://app.getapplica.com` (or configured app origin) over HTTPS; not stored in extension code |
| **Auth token & user profile** | After successful login | Stored locally in `chrome.storage.local` (`applica_auth_token`, `applica_user`) on your device |
| **Current page URL** | Drawer open, analyze, URL matching | Sent to Applica API when you analyze or sync openings; used locally to highlight the current job |
| **Full page HTML** | When you click **Analyze job posting** | Sent to Applica servers to extract job title, company, description, etc. |
| **Resume / profile fields** | Form fill, scoring | Read from Applica API; may be written into form fields on the job application page you are viewing |
| **Application metadata** | You save status, notes, contacts | Sent to Applica API |
| **UI preferences** | Drawer navigation state | Stored locally in `chrome.storage.local` (e.g. selected profile, view state) |

Applica does **not** use the extension to sell browsing history to third parties. Processing is to provide job-search and application-tracking features for your account.

## Permissions (Chrome) and why they are needed

| Permission | Purpose |
|------------|---------|
| **activeTab** | Access the current tab only when you click the extension icon — inject drawer, read page HTML for analyze, fill forms |
| **scripting** | Inject the content script and styles into the active tab on demand |
| **storage** | Store login token, selected profile, and drawer state on your device |
| **tabs** | Open Applica sign-in and job posting URLs in new tabs when you choose |
| **Host: `https://app.getapplica.com/*`** | API calls and sign-in / OAuth callback on the Applica app |

Job boards (Greenhouse, Ashby, LinkedIn, etc.) are **not** listed as broad host permissions. The extension uses **activeTab** (user gesture) to run on those sites when you opt in by clicking the icon.

## Web-accessible resources

Drawer UI files (`drawer.html`, `drawer.js`, `drawer.css`, `lib/api.js`, etc.) are exposed so the extension iframe can load on HTTPS job pages. They do not grant websites access to your Applica token; API calls run in the extension context with stored credentials.

## Sign-in flow

Sign-in opens `https://app.getapplica.com` in a new tab. After login, you are redirected back to the extension (extension callback page or `auth.html`) to store a bearer token locally. Sign out clears the token from extension storage.

## Data retention and control

- **Server-side** openings, scores, and applications follow your Applica account and our main privacy policy.
- **Extension storage** can be cleared by signing out in the drawer or removing the extension.
- You can **remove** jobs from the processing or apply queue using the delete control in the drawer.

## Security practices in the extension

- API requests use HTTPS to the configured Applica origin.
- Messages between the page and the drawer iframe are filtered by `event.source` (only the trusted iframe / parent).
- User-controlled strings shown in the drawer UI are escaped before insertion into HTML.

## Chrome Web Store — suggested disclosure (short)

You may adapt this for the store “Privacy practices” / description fields:

> The Applica extension accesses the current tab only when you click the extension icon. If you analyze a job, we send the page URL and HTML to Applica to extract job details and score them against your resume. If you use form fill, we may enter your profile and resume into application fields on that page. We store your login token locally and sync openings and applications with your Applica account at app.getapplica.com. See https://www.getapplica.com/privacy-policy and the extension PRIVACY.md in our repository.

## Single purpose

The extension’s single purpose is to help users **analyze job postings, fill job application forms, and track applications** while browsing job sites, in connection with an Applica account.

## Contact

Privacy questions: use the contact method listed at [getapplica.com/privacy-policy](https://www.getapplica.com/privacy-policy).

## Production vs development builds

| Build | `config.js` default | `manifest.json` hosts |
|-------|---------------------|------------------------|
| **Production branch** | `https://app.getapplica.com` | `https://app.getapplica.com/*` |
| **Development** | Often `http://localhost:4000` | localhost + staging hosts |

Ship the **production** branch (or equivalent manifest) to the Chrome Web Store. Do not publish a build that defaults to localhost.
