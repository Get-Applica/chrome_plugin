/**
 * Applica Extension - Content Script
 * Injects a left-hand drawer that pops out when the extension is activated.
 * Also detects the app's extension callback page and stores the token so the background can close the tab.
 */

(function () {
  const DRAWER_WIDTH = 500;
  const EXTENSION_CALLBACK_PATH = '/user/log_in/extension_callback';
  const STORAGE_KEYS = { AUTH_TOKEN: 'applica_auth_token', APP_ORIGIN: 'applica_app_origin', REOPEN_DRAWER_TS: 'applica_reopen_drawer_ts' };
  const REOPEN_DRAWER_TTL_MS = 3000;
  const DEFAULT_ORIGIN = (typeof window !== 'undefined' && window.APPLICA_DEFAULT_APP_ORIGIN) || 'https://app.applica.com';

  // Detect app extension callback: same-origin page with one-time code in URL; exchange for token via API.
  const params = new URLSearchParams(window.location.search);
  if (window.location.pathname === EXTENSION_CALLBACK_PATH && params.get('code')) {
    const code = params.get('code');
    const origin = window.location.origin;
    (async function () {
      try {
        const res = await fetch(origin + '/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ code: code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showCallbackError(data.message || 'Could not complete sign-in.');
          return;
        }
        const token = data.token;
        const user = data.user ?? null;
        if (!token) {
          showCallbackError('Invalid response from server.');
          return;
        }
        await new Promise((resolve) => {
          chrome.storage.local.set(
            { applica_auth_token: token, applica_user: user || undefined },
            resolve
          );
        });
        chrome.runtime.sendMessage({ type: 'APPLICA_STORE_TOKEN_DONE', closeTab: true });
      } catch (err) {
        showCallbackError(err?.message || 'Request failed.');
      }
    })();
  }

  function showCallbackError(message) {
    try {
      const el = document.body || document.documentElement;
      const msg = document.createElement('p');
      msg.style.color = '#b91c1c';
      msg.style.marginTop = '1rem';
      msg.textContent = message;
      el.appendChild(msg);
    } catch (_) {}
  }
  const ANIMATION_MS = 250;

  let drawerEl = null;
  let overlayEl = null;
  let iframeEl = null;
  let isOpen = false;

  function getExtensionURL(path) {
    try {
      var rt = typeof chrome !== 'undefined' ? chrome.runtime : undefined;
      if (rt && typeof rt.getURL === 'function') {
        return rt.getURL(path);
      }
      return '';
    } catch (_) {
      return '';
    }
  }

  function createDrawer() {
    if (drawerEl) return drawerEl;

    overlayEl = document.createElement('div');
    overlayEl.id = 'applica-drawer-overlay';
    overlayEl.className = 'applica-overlay';
    /* Overlay is visual only; no click-to-close so the page stays interactive */

    drawerEl = document.createElement('div');
    drawerEl.id = 'applica-drawer';
    drawerEl.className = 'applica-drawer';

    const logoUrl = getExtensionURL('images/applica_logo.png');
    const header = document.createElement('div');
    header.className = 'applica-drawer-header';
    header.innerHTML = `
      <img src="${logoUrl}" alt="Applica" class="applica-drawer-logo" />
      <p class="applica-drawer-header-desc">Turn job hunting into a strategic advantage. Smart analysis meets effortless tracking.</p>
      <button type="button" class="applica-drawer-close" aria-label="Close drawer">&times;</button>
    `;
    header.querySelector('.applica-drawer-close').addEventListener('click', closeDrawer);

    iframeEl = document.createElement('iframe');
    iframeEl.id = 'applica-drawer-frame';
    iframeEl.className = 'applica-drawer-frame';
    iframeEl.src = getExtensionURL('drawer/drawer.html');
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
        iframeEl.contentWindow.postMessage(
          { type: 'applica-drawer-opened', currentPageUrl: window.location.href },
          '*'
        );
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
        // Do not fetch personas from content script: fetch runs in page context and is blocked by CORS
        // on strict sites (e.g. Workday). The drawer iframe (extension origin) will fetch on applica-drawer-opened.
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
        event.source.postMessage({ type: 'applica-page-data', error: e?.message || 'Failed to get page' }, '*');
      }
    }
    if (event.data?.type === 'applica-navigate-to' && event.data.url) {
      chrome.storage.local.set({ [STORAGE_KEYS.REOPEN_DRAWER_TS]: Date.now() }, () => {
        window.location.href = event.data.url;
      });
    }
    if (event.data?.type === 'applica-fill-form-with-data' && event.data.form_data) {
      handleFillFormWithData(event.source, event.data.form_data);
    }
  });

  /**
   * Fill matching form fields on the page using form_data from the drawer.
   * The drawer (extension iframe) fetches form_details; we only run in page context to access the DOM.
   */
  function handleFillFormWithData(drawerWindow, formData) {
    const sendResult = (result) => {
      try {
        drawerWindow.postMessage({ type: 'applica-fill-form-result', ...result }, '*');
      } catch (e) {
        console.debug('Applica: could not send fill-form result', e);
      }
    };
    try {
      const enrichedFormData = enrichFormDataWithSplitNames(formData);
      const filled = fillFormFields(document, enrichedFormData);
      const total = Object.keys(enrichedFormData).length;
      sendResult({ filled, total });
    } catch (e) {
      sendResult({ error: e?.message || 'Failed to fill form.' });
    }
  }

  /** Map our form_data keys to possible input name/id/placeholder/aria-label values (lowercase). */
  const FORM_FIELD_MATCHERS = {
    full_name: ['full_name', 'fullname', 'name', 'applicant_name', 'full-name'],
    first_name: ['first_name', 'firstname', 'first-name', 'givenname', 'given_name', 'fname', 'first'],
    last_name: ['last_name', 'lastname', 'last-name', 'surname', 'familyname', 'family_name', 'lname', 'last'],
    email: ['email', 'e-mail', 'mail'],
    phone: ['phone', 'telephone', 'mobile', 'cell', 'phonenumber'],
    linkedin_url: ['linkedin', 'linked_in', 'linkedin_url', 'linkedinurl', 'linkedin_url'],
    address: ['address', 'street', 'address1', 'address_line_1', 'address_line1'],
    city: ['city'],
    state: ['state', 'region', 'province'],
    zip: ['zip', 'postal', 'postal_code', 'zipcode', 'postalcode'],
    preferred_salary: ['salary', 'preferred_salary', 'compensation', 'expected_salary', 'salaryexpectation'],
    is_willing_to_relocate: ['relocate', 'relocation', 'willingtorelocate', 'willing_to_relocate', 'open_to_relocation'],
    willing_to_travel: ['travel', 'willingtotravel', 'willing_to_travel', 'travelrequired', 'travel_required'],
    gender: ['gender', 'sex', 'eeogender', 'gender_identity'],
    race: ['race', 'ethnicity', 'ethnic', 'eeorace', 'ethnicity_race', 'demographic'],
    is_disabled: ['disability', 'disabled', 'eeodisability', 'has_disability', 'disability_status'],
    disabilities: ['disabilities', 'disability_description', 'disability_detail', 'accommodation'],
    is_veteran: ['veteran', 'veteranstatus', 'veteran_status', 'military', 'protected_veteran'],
    requires_sponsorship: ['sponsorship', 'sponsor', 'work_authorization', 'workauthorization', 'visa', 'require_sponsorship', 'authorized_to_work']
  };

  function splitFullName(fullName) {
    if (fullName == null || typeof fullName !== 'string') {
      return { first_name: '', last_name: '' };
    }
    const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first_name: '', last_name: '' };
    if (parts.length === 1) return { first_name: parts[0], last_name: '' };
    return {
      first_name: parts[0],
      last_name: parts.slice(1).join(' ')
    };
  }

  function enrichFormDataWithSplitNames(formData) {
    const enriched = { ...formData };
    const full = formData.full_name;
    if (full != null && String(full).trim() !== '') {
      const { first_name, last_name } = splitFullName(full);
      if (enriched.first_name == null) enriched.first_name = first_name;
      if (enriched.last_name == null) enriched.last_name = last_name;
    }
    return enriched;
  }

  function normalizeForMatch(s) {
    if (s == null || typeof s !== 'string') return '';
    return s.toLowerCase().replace(/[\s_-]/g, '');
  }

  /** Keys that are booleans in form_data; their dropdowns often use Yes/No or similar. */
  const BOOLEAN_SELECT_KEYS = ['is_disabled', 'is_veteran', 'is_willing_to_relocate', 'willing_to_travel', 'requires_sponsorship'];

  /**
   * Find the best matching <option> in a select for our form_data value.
   * - Booleans: match "Yes"/"No", "True"/"False", "I don't wish to answer", etc.
   * - Strings (gender, race): exact normalized match, or option text contains our value / our value contains option.
   */
  function findMatchingOption(selectEl, key, value, strVal) {
    const options = Array.from(selectEl.options).filter((o) => !o.disabled);
    if (options.length === 0) return null;
    const isBooleanKey = BOOLEAN_SELECT_KEYS.includes(key);
    const normalizedStrVal = normalizeForMatch(strVal);

    if (isBooleanKey && typeof value === 'boolean') {
      const forTrue = ['yes', 'true', '1', 'y'];
      const forFalse = ['no', 'false', '0', 'n', 'prefernottosay', 'decline', 'dontwish', 'idontwish', 'rathernot', 'choosenot', 'noanswer', 'notspecified', 'none', 'na'];
      const accept = value ? forTrue : forFalse;
      const optMatches = (o) => {
        const v = normalizeForMatch((o.value != null && o.value !== '' ? o.value : o.text) || '');
        if (!v) return false;
        return accept.includes(v) || accept.some((a) => v.includes(a) || a.includes(v));
      };
      return options.find(optMatches) || null;
    }

    for (const o of options) {
      const optVal = (o.value != null && o.value !== '' ? o.value : o.text) || '';
      const optNorm = normalizeForMatch(optVal);
      if (optNorm && optNorm === normalizedStrVal) return o;
    }
    for (const o of options) {
      const optVal = (o.value != null && o.value !== '' ? o.value : o.text) || '';
      const optNorm = normalizeForMatch(optVal);
      if (!optNorm || !normalizedStrVal) continue;
      if (optNorm.includes(normalizedStrVal) || normalizedStrVal.includes(optNorm)) return o;
    }
    return null;
  }

  /**
   * Get label text associated with a form field (for matching when name/id/placeholder are missing).
   * Checks: label[for=id], parent <label>, preceding sibling <label>, and label in previous sibling container.
   */
  function getLabelTextForField(root, el) {
    const parts = [];
    const id = el.getAttribute('id');
    if (id) {
      const labelByFor = root.querySelector('label[for="' + CSS.escape(id) + '"]');
      if (labelByFor && labelByFor.textContent) parts.push(labelByFor.textContent.trim());
    }
    let parent = el.parentElement;
    if (parent && parent.tagName === 'LABEL' && parent.textContent) {
      parts.push(parent.textContent.trim());
    }
    let prev = el.previousElementSibling;
    if (prev && prev.tagName === 'LABEL' && prev.textContent) {
      parts.push(prev.textContent.trim());
    }
    while (parent && parent !== root) {
      const prevCell = parent.previousElementSibling;
      if (prevCell && prevCell.tagName === 'LABEL' && prevCell.textContent) {
        parts.push(prevCell.textContent.trim());
      }
      parent = parent.parentElement;
    }
    return parts.join(' ');
  }

  function fillFormFields(root, formData) {
    const inputs = Array.from(root.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'));
    const used = new Set();
    let filledCount = 0;
    for (const key of Object.keys(formData)) {
      const value = formData[key];
      if (value == null) continue;
      const strVal = typeof value === 'boolean' ? (value ? 'yes' : '') : String(value).trim();
      const matchers = FORM_FIELD_MATCHERS[key];
      if (!matchers || matchers.length === 0) continue;
      const normalizedMatchers = matchers.map(normalizeForMatch);
      for (const el of inputs) {
        if (used.has(el)) continue;
        const name = normalizeForMatch(el.getAttribute('name'));
        const id = normalizeForMatch(el.getAttribute('id') || '');
        const placeholder = normalizeForMatch(el.getAttribute('placeholder') || '');
        const ariaLabel = normalizeForMatch(el.getAttribute('aria-label') || '');
        const labelText = normalizeForMatch(getLabelTextForField(root, el));
        const type = (el.getAttribute('type') || '').toLowerCase();
        const combined = name + id + placeholder + ariaLabel + labelText + (type === 'email' && key === 'email' ? 'email' : '');
        const matches = normalizedMatchers.some((m) => combined.includes(m) || (key === 'email' && type === 'email'));
        if (!matches) continue;
        try {
          if (el.tagName === 'SELECT') {
            const opt = findMatchingOption(el, key, value, strVal);
            if (opt) {
              opt.selected = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              filledCount++;
            }
          } else if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = !!value;
            filledCount++;
          } else {
            el.value = strVal;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            filledCount++;
          }
          used.add(el);
          break;
        } catch (_) {}
      }
    }
    return filledCount;
  }

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

  function showDrawerApiErrorBanner(targetWindow) {
    try {
      if (targetWindow) targetWindow.postMessage({ type: 'applica-show-api-error-banner' }, '*');
    } catch (e) {
      console.debug('Applica: could not show API error banner in drawer', e);
    }
  }

  function handleGetPersonas(targetWindow) {
    fetchPersonas((result) => {
      try {
        if (result.error) showDrawerApiErrorBanner(targetWindow);
        targetWindow.postMessage({ type: 'applica-personas', ...result }, '*');
      } catch (e) {
        console.debug('Applica: could not post personas to drawer', e);
      }
    });
  }

  function handleGetOpenings(targetWindow, personaId) {
    fetchOpenings(personaId, (result) => {
      try {
        if (result.error) showDrawerApiErrorBanner(targetWindow);
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
