/**
 * Applica Extension - Content Script
 * Injects a left-hand drawer that pops out when the extension is activated.
 * Also detects the app's extension callback page and stores the token so the background can close the tab.
 */

(function () {
  const DRAWER_WIDTH = 360;
  const EXTENSION_CALLBACK_PATH = '/user/log_in/extension_callback';
  const STORAGE_KEYS = { AUTH_TOKEN: 'applica_auth_token', APP_ORIGIN: 'applica_app_origin', REOPEN_DRAWER_TS: 'applica_reopen_drawer_ts' };
  const REOPEN_DRAWER_TTL_MS = 3000;
  const DEFAULT_ORIGIN = (typeof window !== 'undefined' && window.APPLICA_DEFAULT_APP_ORIGIN) || 'https://app.applica.com';

  // Detect app extension callback: same-origin page with token in URL (avoids blocked redirect to chrome-extension://)
  const params = new URLSearchParams(window.location.search);
  if (window.location.pathname === EXTENSION_CALLBACK_PATH && params.get('token')) {
    const token = params.get('token');
    let user = null;
    try {
      const userParam = params.get('user');
      if (userParam) user = JSON.parse(decodeURIComponent(userParam));
    } catch (_) {}
    chrome.storage.local.set({
      applica_auth_token: token,
      applica_user: user || undefined
    }, () => {
      chrome.runtime.sendMessage({ type: 'APPLICA_STORE_TOKEN_DONE', closeTab: true });
    });
  }
  const ANIMATION_MS = 250;

  let drawerEl = null;
  let overlayEl = null;
  let iframeEl = null;
  let isOpen = false;

  function createDrawer() {
    if (drawerEl) return drawerEl;

    overlayEl = document.createElement('div');
    overlayEl.id = 'applica-drawer-overlay';
    overlayEl.className = 'applica-overlay';
    overlayEl.addEventListener('click', closeDrawer);

    drawerEl = document.createElement('div');
    drawerEl.id = 'applica-drawer';
    drawerEl.className = 'applica-drawer';

    const header = document.createElement('div');
    header.className = 'applica-drawer-header';
    header.innerHTML = `
      <span class="applica-drawer-title">Applica</span>
      <button type="button" class="applica-drawer-close" aria-label="Close drawer">&times;</button>
    `;
    header.querySelector('.applica-drawer-close').addEventListener('click', closeDrawer);

    iframeEl = document.createElement('iframe');
    iframeEl.id = 'applica-drawer-frame';
    iframeEl.className = 'applica-drawer-frame';
    iframeEl.src = chrome.runtime.getURL('drawer.html');
    iframeEl.addEventListener('load', function onLoad() {
      if (isOpen) notifyDrawerOpened();
    });

    drawerEl.appendChild(header);
    drawerEl.appendChild(iframeEl);

    document.body.appendChild(overlayEl);
    document.body.appendChild(drawerEl);

    return drawerEl;
  }

  function notifyDrawerOpened() {
    try {
      if (iframeEl?.contentWindow) {
        iframeEl.contentWindow.postMessage({ type: 'applica-drawer-opened' }, '*');
      }
    } catch (e) {
      console.debug('Applica: could not notify drawer', e);
    }
  }

  function openDrawer() {
    if (isOpen) return;
    createDrawer();
    isOpen = true;
    document.body.classList.add('applica-drawer-open');
    overlayEl.classList.add('applica-overlay-visible');
    drawerEl.classList.add('applica-drawer-visible');
    document.documentElement.style.setProperty('--applica-drawer-width', `${DRAWER_WIDTH}px`);
    notifyDrawerOpened();
  }

  function closeDrawer() {
    if (!isOpen) return;
    isOpen = false;
    document.body.classList.remove('applica-drawer-open');
    overlayEl.classList.remove('applica-overlay-visible');
    drawerEl.classList.remove('applica-drawer-visible');
  }

  function toggleDrawer() {
    isOpen ? closeDrawer() : openDrawer();
  }

  window.addEventListener('applica-drawer-toggle', toggleDrawer);

  // Listen for messages from the drawer iframe
  window.addEventListener('message', (event) => {
    if (event.source !== iframeEl?.contentWindow) return;
    if (event.data?.type === 'applica-drawer-close') {
      closeDrawer();
      return;
    }
    if (event.data?.type === 'applica-drawer-ready') {
      if (isOpen) {
        notifyDrawerOpened();
        handleGetPersonas(event.source);
      }
      return;
    }
    if (event.data?.type === 'applica-get-openings') {
      handleGetOpenings(event.source, event.data.persona_id);
    }
    if (event.data?.type === 'applica-get-personas') {
      handleGetPersonas(event.source);
    }
    if (event.data?.type === 'applica-analyze-current-page') {
      try {
        const url = window.location.href;
        const html = document.documentElement.outerHTML;
        event.source.postMessage({ type: 'applica-page-data', url, html }, '*');
      } catch (e) {
        console.debug('Applica: could not get page HTML', e);
        event.source.postMessage({ type: 'applica-page-data', error: (e && e.message) || 'Failed to get page' }, '*');
      }
    }
    if (event.data?.type === 'applica-navigate-to' && event.data.url) {
      chrome.storage.local.set({ [STORAGE_KEYS.REOPEN_DRAWER_TS]: Date.now() }, () => {
        window.location.href = event.data.url;
      });
    }
  });

  function isLoggedIn(cb) {
    chrome.storage.local.get([STORAGE_KEYS.AUTH_TOKEN], (data) => {
      cb(!!(data[STORAGE_KEYS.AUTH_TOKEN]));
    });
  }

  function apiGet(path, cb) {
    chrome.storage.local.get([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.APP_ORIGIN], (data) => {
      const token = data[STORAGE_KEYS.AUTH_TOKEN];
      const origin = (data[STORAGE_KEYS.APP_ORIGIN] || DEFAULT_ORIGIN).replace(/\/$/, '');
      if (!token) {
        cb({ loggedIn: false });
        return;
      }
      fetch(`${origin}${path}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((body) => cb({ loggedIn: true, data: body }))
        .catch((err) => cb({ loggedIn: true, error: err.message }));
    });
  }

  function fetchPersonas(cb) {
    apiGet('/api/personas', cb);
  }

  function fetchOpenings(personaId, cb) {
    if (!personaId) {
      cb({ loggedIn: true, error: 'persona_id is required' });
      return;
    }
    apiGet(`/api/openings?persona_id=${encodeURIComponent(personaId)}`, cb);
  }

  function handleGetPersonas(targetWindow) {
    fetchPersonas((result) => {
      try {
        targetWindow.postMessage({ type: 'applica-personas', ...result }, '*');
      } catch (e) {
        console.debug('Applica: could not post personas to drawer', e);
      }
    });
  }

  function handleGetOpenings(targetWindow, personaId) {
    fetchOpenings(personaId, (result) => {
      try {
        targetWindow.postMessage({ type: 'applica-openings', ...result }, '*');
      } catch (e) {
        console.debug('Applica: could not post openings to drawer', e);
      }
    });
  }

  // Re-open drawer on this page if we just navigated here from a drawer link
  chrome.storage.local.get([STORAGE_KEYS.REOPEN_DRAWER_TS], (data) => {
    const ts = data[STORAGE_KEYS.REOPEN_DRAWER_TS];
    if (ts && Date.now() - ts < REOPEN_DRAWER_TTL_MS) {
      chrome.storage.local.remove([STORAGE_KEYS.REOPEN_DRAWER_TS]);
      openDrawer();
    }
  });
})();
