/**
 * Applica Extension - Drawer UI logic
 * Sign-in opens the app in a new tab. After login the app redirects to auth.html
 * with the token; that page stores it and closes. Drawer shows signed-in state when
 * a token is stored.
 */

(function () {
  const loginSection = document.getElementById('login-section');
  const scoreQueueSection = document.getElementById('score-queue-section');
  const signedInSection = document.getElementById('signed-in-section');
  const signedInEmail = document.getElementById('signed-in-email');
  const openLoginTabBtn = document.getElementById('open-login-tab');
  const signOutBtn = document.getElementById('sign-out-btn');
  const closeDrawerBtn = document.getElementById('close-drawer');

  function showSection(section) {
    loginSection.hidden = section !== 'login';
    scoreQueueSection.hidden = section !== 'signed-in';
    signedInSection.hidden = section !== 'signed-in';
  }

  async function fetchPersonas() {
    const picker = document.getElementById('applica-persona-picker');
    if (picker) picker.innerHTML = '<option value="">Loading…</option>';
    try {
      const res = await window.ApplicaAPI.appFetch('/api/personas');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        renderPersonas({ loggedIn: false, error: data.message || 'Failed to load' });
        return;
      }
      renderPersonas({ loggedIn: true, data });
    } catch (err) {
      const msg = err?.message || 'Failed to load personas';
      const hint = msg.includes('failed') || msg.includes('CORS') || msg.includes('fetch')
        ? ' Check that the app is running and the app URL is correct.'
        : '';
      renderPersonas({ loggedIn: false, error: msg + hint });
    }
  }

  function openingsSnapshot(openings) {
    if (!openings || !openings.length) return '';
    return JSON.stringify(
      openings
        .map((o) => ({ id: o.id, current_match_score: o.current_match_score }))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
    );
  }

  let lastOpeningsSnapshot = null;

  async function fetchOpenings(personaId, options = {}) {
    if (!personaId) return;
    const showLoading = options.silent !== true;
    const queueEl = document.getElementById('score-queue-list');
    const listEl = document.getElementById('openings-list');
    if (showLoading && queueEl) queueEl.innerHTML = '<p class="drawer-hint">Loading…</p>';
    if (showLoading && listEl) listEl.innerHTML = '<p class="drawer-hint">Loading…</p>';
    try {
      const res = await window.ApplicaAPI.appFetch(`/api/openings?persona_id=${encodeURIComponent(personaId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastOpeningsSnapshot = null;
        renderOpenings({ loggedIn: true, error: data.message || 'Failed to load' });
        return;
      }
      const openings = data?.openings || [];
      const snapshot = openingsSnapshot(openings);
      const unchanged = snapshot === lastOpeningsSnapshot;
      if (unchanged && options.silent === true) {
        return;
      }
      lastOpeningsSnapshot = snapshot;
      renderOpenings({ loggedIn: true, data });
    } catch (err) {
      lastOpeningsSnapshot = null;
      const msg = err?.message || 'Failed to load openings';
      const hint = msg.includes('failed') || msg.includes('CORS') || msg.includes('fetch')
        ? ' Check that the app is running.'
        : '';
      renderOpenings({ loggedIn: true, error: msg + hint });
    }
  }

  function renderOpenings(payload) {
    const queueEl = document.getElementById('score-queue-list');
    const listEl = document.getElementById('openings-list');
    if (!queueEl || !listEl) return;
    const queueSection = document.getElementById('score-queue-section-content');
    const openingsSection = document.getElementById('openings-section-content');

    if (!payload.loggedIn) {
      queueEl.innerHTML = '';
      listEl.innerHTML = '';
      if (queueSection) queueSection.hidden = true;
      if (openingsSection) openingsSection.hidden = true;
      return;
    }
    if (payload.error) {
      const msg = `<p class="drawer-hint">${escapeHtml(payload.error)}</p>`;
      listEl.innerHTML = msg;
      if (openingsSection) openingsSection.hidden = false;
      return;
    }
    const openings = payload.data?.openings || [];
    const hasMessage = payload.data?.message;

    const processing = openings.filter((o) => o.current_match_score == null || o.current_match_score === undefined || Number(o.current_match_score) === 0);
    const scored = openings.filter((o) => Number(o.current_match_score) > 0);

    if (processing.length > 0) {
      queueEl.innerHTML = processing.map(openingItemHtml).join('');
      if (queueSection) queueSection.hidden = false;
    } else {
      queueEl.innerHTML = '<p class="drawer-hint">No postings being analyzed.</p>';
      if (queueSection) queueSection.hidden = true;
    }

    if (scored.length > 0) {
      listEl.innerHTML = scored.map(openingItemHtml).join('');
      if (openingsSection) openingsSection.hidden = false;
    } else {
      listEl.innerHTML = '<p class="drawer-hint">No openings yet.</p>';
      if (openingsSection) openingsSection.hidden = true;
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function normalizeUrlForCompare(url) {
    if (!url || typeof url !== 'string') return '';
    const u = url.trim().toLowerCase();
    return u.endsWith('/') && u.length > 1 ? u.slice(0, -1) : u;
  }

  function openingItemHtml(o) {
    let text = (o.company || '') + ' - ' + (o.title || '');
    const score = o.current_match_score;
    if (score != null && score !== '' && score != 0) {
      text += ': ' + Number(score) + '%';
    }
    const label = escapeHtml(text);
    const isCurrentPage =
      currentPageUrl != null &&
      o.url != null &&
      normalizeUrlForCompare(o.url) === normalizeUrlForCompare(currentPageUrl);
    const itemClass = 'drawer-opening-item' + (isCurrentPage ? ' drawer-opening-item-current' : '');
    if (o.url) {
      const href = escapeHtml(o.url);
      return `<div class="${itemClass}"><a href="${href}" class="drawer-opening-link">${label}</a></div>`;
    }
    return `<div class="${itemClass}">${label}</div>`;
  }

  function renderPersonas(payload) {
    const picker = document.getElementById('applica-persona-picker');
    if (!picker) return;
    if (payload.error) {
      picker.innerHTML = `<option value="">${escapeHtml(payload.error)}</option>`;
      picker.disabled = true;
      return;
    }
    const personas = payload.data?.personas || [];
    picker.disabled = false;
    picker.innerHTML = personas.length
      ? personas.map((p) => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.title || p.name || 'Persona')}</option>`).join('')
      : '<option value="">No personas</option>';
    if (personas.length > 0) {
      picker.value = String(personas[0].id);
      fetchOpenings(personas[0].id);
    } else {
      const listEl = document.getElementById('openings-list');
      if (listEl) listEl.innerHTML = '';
    }
  }

  async function refreshAuthState() {
    const user = await window.ApplicaAPI.getStoredUser();
    if (user && user.email) {
      signedInEmail.textContent = user.email;
      showSection('signed-in');
      fetchPersonas();
    } else {
      showSection('login');
    }
  }

  let currentPageUrl = null;

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'applica-drawer-opened') {
      currentPageUrl = event.data.currentPageUrl || null;
      refreshAuthState();
    }
    if (event.data?.type === 'applica-page-data') {
      handlePageDataForAnalyze(event.data);
    }
  });

  let pendingAnalyzePersonaId = null;
  let openingsPollIntervalId = null;
  let openingsPollStopId = null;

  function startOpeningsPoll(personaId, durationMs) {
    stopOpeningsPoll();
    openingsPollIntervalId = setInterval(() => {
      fetchOpenings(personaId, { silent: true });
    }, 2000);
    if (durationMs > 0) {
      openingsPollStopId = setTimeout(stopOpeningsPoll, durationMs);
    }
  }

  function stopOpeningsPoll() {
    if (openingsPollIntervalId != null) {
      clearInterval(openingsPollIntervalId);
      openingsPollIntervalId = null;
    }
    if (openingsPollStopId != null) {
      clearTimeout(openingsPollStopId);
      openingsPollStopId = null;
    }
  }

  function handlePageDataForAnalyze(data) {
    const personaId = pendingAnalyzePersonaId;
    pendingAnalyzePersonaId = null;
    const btn = document.getElementById('analyze-job-posting-btn');
    if (btn) btn.disabled = false;
    if (data.error) {
      setAnalyzeStatus('error', data.error);
      return;
    }
    if (!personaId) {
      setAnalyzeStatus('error', 'No profile selected.');
      return;
    }
    submitOpeningFromPage(data.url, data.html, personaId, btn);
  }

  function setAnalyzeStatus(kind, message) {
    const el = document.getElementById('analyze-status');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
    el.className = 'drawer-hint' + (kind === 'error' ? ' drawer-status-error' : '');
  }

  async function submitOpeningFromPage(url, html, personaId, btn) {
    setAnalyzeStatus('info', 'Getting data from the page…');
    try {
      const res = await window.ApplicaAPI.appFetch('/api/openings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, persona_id: personaId, html }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnalyzeStatus('error', data.message || 'Failed to add opening');
        return;
      }
      setAnalyzeStatus('info', data.message || 'Opening added.');
      fetchOpenings(personaId);
      startOpeningsPoll(personaId, 60000);
      setTimeout(() => setAnalyzeStatus('', ''), 3000);
    } catch (err) {
      setAnalyzeStatus('error', err?.message || 'Request failed');
    }
  }

  const personaPicker = document.getElementById('applica-persona-picker');
  if (personaPicker) {
    personaPicker.addEventListener('change', () => {
      stopOpeningsPoll();
      lastOpeningsSnapshot = null;
      const id = personaPicker.value;
      if (id) fetchOpenings(id);
    });
  }

  // Navigate host tab to job URL when a listing link is clicked (not the iframe)
  if (scoreQueueSection) {
    scoreQueueSection.addEventListener('click', (e) => {
      const link = e.target.closest('a.drawer-opening-link');
      if (!link || !link.href) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'applica-navigate-to', url: link.href }, '*');
      } else {
        window.location.href = link.href;
      }
    });
  }

  const analyzeBtn = document.getElementById('analyze-job-posting-btn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      const personaId = personaPicker?.value;
      if (!personaId) {
        setAnalyzeStatus('error', 'Select a profile first.');
        return;
      }
      pendingAnalyzePersonaId = personaId;
      analyzeBtn.disabled = true;
      setAnalyzeStatus('', '');
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'applica-analyze-current-page' }, '*');
      } else {
        pendingAnalyzePersonaId = null;
        analyzeBtn.disabled = false;
        setAnalyzeStatus('error', 'Open the drawer on a job page to analyze it.');
      }
    });
  }

  openLoginTabBtn.addEventListener('click', async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome?.runtime?.getURL) {
        alert('Extension context unavailable. Open the drawer from the extension icon on a page.');
        return;
      }
      const origin = await ApplicaAPI.getAppOrigin();
      const base = origin.replace(/\/$/, '');
      const redirectUri = encodeURIComponent(chrome.runtime.getURL('auth.html'));
      const loginUrl = `${base}/user/log_in?redirect_extension=1&redirect_uri=${redirectUri}`;
      chrome.tabs.create({ url: loginUrl });
    } catch (e) {
      if (String(e?.message || e).includes('Extension context invalidated')) {
        alert('Extension was reloaded. Please close the drawer and open it again.');
      } else {
        throw e;
      }
    }
  });

  signOutBtn.addEventListener('click', async () => {
    try {
      await window.ApplicaAPI.clearAuthToken();
      refreshAuthState();
    } catch (e) {
      if (String(e?.message || e).includes('Extension context invalidated')) {
        alert('Extension was reloaded. Please close the drawer and open it again.');
      } else {
        throw e;
      }
    }
  });

  closeDrawerBtn.addEventListener('click', () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'applica-drawer-close' }, '*');
    }
  });

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      try {
        if (areaName === 'local' && (changes[window.ApplicaAPI?.STORAGE_KEYS?.AUTH_TOKEN] || changes[window.ApplicaAPI?.STORAGE_KEYS?.USER])) {
          refreshAuthState();
        }
      } catch (_) {
        // Extension context invalidated (e.g. extension reloaded)
      }
    });
  } catch (_) {
    // Extension context invalidated
  }

  refreshAuthState();

  // Tell parent we're ready so it can send drawer-opened and/or push personas (avoids race after extension reload)
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'applica-drawer-ready' }, '*');
  }
})();
