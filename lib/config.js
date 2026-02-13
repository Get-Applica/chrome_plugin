/**
 * Default app origin when none is set in chrome.storage.
 * - Production: set this to your live API (e.g. https://app.applica.com).
 * - Local dev: either set this to http://localhost:4000, or leave as-is and
 *   set applica_app_origin in chrome.storage.local to http://localhost:4000
 *   (e.g. in DevTools → Application → Extension storage).
 */
window.APPLICA_DEFAULT_APP_ORIGIN = 'https://app.getapplica.com';
