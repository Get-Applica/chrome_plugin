/**
 * Applica Extension - API client for the app backend
 * Configure app origin in storage; defaults to localhost:4000 for development.
 */

const APPLICA_STORAGE_KEYS = {
  APP_ORIGIN: 'applica_app_origin',
  AUTH_TOKEN: 'applica_auth_token',
  USER: 'applica_user',
};

const DEFAULT_APP_ORIGIN = 'http://localhost:4000';

async function getAppOrigin() {
  return new Promise((resolve) => {
    chrome.storage.local.get([APPLICA_STORAGE_KEYS.APP_ORIGIN], (data) => {
      resolve(data[APPLICA_STORAGE_KEYS.APP_ORIGIN] || DEFAULT_APP_ORIGIN);
    });
  });
}

async function setAppOrigin(origin) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [APPLICA_STORAGE_KEYS.APP_ORIGIN]: origin }, resolve);
  });
}

/**
 * Build full URL for an app path (e.g. "/user/log_in").
 */
async function appUrl(path) {
  const origin = await getAppOrigin();
  const base = origin.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get([APPLICA_STORAGE_KEYS.AUTH_TOKEN], (data) => {
      resolve(data[APPLICA_STORAGE_KEYS.AUTH_TOKEN] || null);
    });
  });
}

async function setAuthToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [APPLICA_STORAGE_KEYS.AUTH_TOKEN]: token }, resolve);
  });
}

async function getStoredUser() {
  return new Promise((resolve) => {
    chrome.storage.local.get([APPLICA_STORAGE_KEYS.USER], (data) => {
      resolve(data[APPLICA_STORAGE_KEYS.USER] || null);
    });
  });
}

async function setStoredUser(user) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [APPLICA_STORAGE_KEYS.USER]: user }, resolve);
  });
}

async function clearAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      [APPLICA_STORAGE_KEYS.AUTH_TOKEN, APPLICA_STORAGE_KEYS.USER],
      resolve
    );
  });
}

/**
 * Log in via the app API. On success, stores the token for future appFetch calls.
 * Returns { ok: true, user } or { ok: false, message }.
 */
async function login(email, password) {
  const res = await fetch(await appUrl('/api/auth'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, message: data.message || 'Login failed' };
  }
  if (data.token) {
    await setAuthToken(data.token);
  }
  if (data.user) {
    await setStoredUser(data.user);
  }
  return { ok: true, user: data.user, token: data.token };
}

/**
 * Fetch from the app. Sends stored auth token in Authorization header when present.
 */
async function appFetch(path, options = {}) {
  const url = await appUrl(path);
  const token = await getAuthToken();
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    ...options,
    headers,
  });
  return response;
}

// Export for use in drawer (and potentially other extension pages)
window.ApplicaAPI = {
  getAppOrigin,
  setAppOrigin,
  appUrl,
  appFetch,
  getAuthToken,
  setAuthToken,
  getStoredUser,
  setStoredUser,
  clearAuthToken,
  login,
  DEFAULT_APP_ORIGIN,
  STORAGE_KEYS: APPLICA_STORAGE_KEYS,
};
