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
    const hintEl = document.getElementById('openings-section-hint');
    const badgeEl = document.getElementById('openings-section-badge');
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
      const msg = escapeHtml(payload.error);
      listEl.innerHTML = '<div class="drawer-worklist-empty">' + msg + '</div>';
      if (openingsSection) openingsSection.hidden = false;
      return;
    }
    const openings = payload.data?.openings || [];
    const hasMessage = payload.data?.message;
    const limits = payload.data?.limits;
    lastOpeningsPayload = payload;

    const processing = openings.filter((o) => !Number(o.current_match_score));
    const scored = openings.filter((o) => Number(o.current_match_score) > 0);

    const currentIsNowScored =
      currentAnalyzingOpening &&
      scored.some(
        (s) =>
          (s.id != null && s.id === currentAnalyzingOpening.id) ||
          normalizeUrlForCompare(s.url) === normalizeUrlForCompare(currentAnalyzingOpening.url)
      );
    if (currentIsNowScored) currentAnalyzingOpening = null;
    const hasTitleAndCompany = (o) =>
      o.title != null && String(o.title).trim() !== '' &&
      o.company != null && String(o.company).trim() !== '';
    // In Progress row = only the placeholder (no title/company yet). Once it has title+company it belongs in Queued list only.
    const placeholderOnly = currentAnalyzingOpening && !hasTitleAndCompany(currentAnalyzingOpening);
    const queuedItems = processing.filter((p) => hasTitleAndCompany(p));
    const queueRows = (placeholderOnly ? [currentAnalyzingOpening] : []).concat(queuedItems);

    if (queueRows.length > 0) {
      queueEl.innerHTML = queueRows.map((o, i) => queueItemHtml(o, placeholderOnly && i === 0)).join('');
      if (queueSection) queueSection.hidden = false;
    } else {
      queueEl.innerHTML = '';
      if (queueSection) queueSection.hidden = true;
    }

    if (badgeEl) badgeEl.innerHTML = usageBadgeHtml(limits);
    if (hintEl) {
      const atLimit = limits != null && typeof limits.remaining === 'number' && limits.remaining === 0;
      hintEl.innerHTML = atLimit
        ? '<p class="drawer-hint">You have reached your limit of openings. Upgrade to create more.</p>'
        : '';
    }

    const analyzeBtn = document.getElementById('analyze-job-posting-btn');
    if (analyzeBtn) {
      const pageAlreadyInList =
        currentPageUrl != null &&
        openings.some((o) => o.url != null && normalizeUrlForCompare(o.url) === normalizeUrlForCompare(currentPageUrl));
      analyzeBtn.disabled = !!pageAlreadyInList;
    }

    if (scored.length > 0) {
      const sortedScored = [...scored].sort((a, b) => {
        const aCurrent = currentPageUrl != null && a.url != null && normalizeUrlForCompare(a.url) === normalizeUrlForCompare(currentPageUrl);
        const bCurrent = currentPageUrl != null && b.url != null && normalizeUrlForCompare(b.url) === normalizeUrlForCompare(currentPageUrl);
        if (aCurrent && !bCurrent) return -1;
        if (!aCurrent && bCurrent) return 1;
        const scoreA = Number(a.current_match_score) || 0;
        const scoreB = Number(b.current_match_score) || 0;
        return scoreB - scoreA;
      });
      listEl.innerHTML = sortedScored.map(openingRowHtml).join('');
      if (openingsSection) openingsSection.hidden = false;
    } else {
      listEl.innerHTML = '<div class="drawer-worklist-empty">No openings yet.</div>';
      if (openingsSection) openingsSection.hidden = false;
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function usageBadgeHtml(limits) {
    if (limits == null || limits === '') return '';
    if (limits === 'unlimited' || limits.unlimited === true) {
      return '<span class="drawer-usage-badge drawer-usage-badge--unlimited">unlimited</span>';
    }
    const remaining = limits.remaining;
    const count = limits.count;
    const period = limits.period != null ? String(limits.period) : '';
    if (typeof remaining !== 'number' || typeof count !== 'number') return '';
    const label = remaining + '/' + count + ' ' + period;
    const modifier =
      remaining > 0 ? 'drawer-usage-badge--remaining' : 'drawer-usage-badge--limit';
    return (
      '<span class="drawer-usage-badge ' + modifier + '">' + escapeHtml(label) + '</span>'
    );
  }

  function normalizeUrlForCompare(url) {
    if (!url || typeof url !== 'string') return '';
    let u = url.trim().toLowerCase();
    try {
      const parsed = new URL(u);
      u = parsed.origin + parsed.pathname;
    } catch (_) {}
    return u.endsWith('/') && u.length > 1 ? u.slice(0, -1) : u;
  }

  const trashIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drawer-queue-item-trash-icon" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>';

  function queueItemHtml(o, isInProgress) {
    const inProgress = !!isInProgress;
    const title = [o.company, o.title].filter(Boolean).join(' - ') || '';
    const titleEscaped = escapeHtml(title || 'Job posting');
    const urlDisplay = o.url ? escapeHtml(o.url) : '';
    const badgeText = inProgress ? 'In Progress' : 'Queued';
    const modifier = inProgress ? 'drawer-queue-item--in-progress' : 'drawer-queue-item--queued';
    const dataUrl = o.url ? ' data-url="' + escapeHtml(o.url) + '"' : '';
    const urlRow = urlDisplay
      ? '<p class="drawer-queue-item-url">' + urlDisplay + '</p>'
      : '';
    return (
      '<div class="drawer-queue-item ' +
      modifier +
      '"' +
      dataUrl +
      '><div class="drawer-queue-item-main"><div class="drawer-queue-item-dot"></div><div class="drawer-queue-item-text"><p class="drawer-queue-item-title">' +
      titleEscaped +
      '</p>' +
      urlRow +
      '</div></div><span class="drawer-queue-item-badge">' +
      escapeHtml(badgeText) +
      '</span></div>'
    );
  }

  function openingRowHtml(o) {
    const company = escapeHtml(o.company || '');
    const position = escapeHtml(o.title || '');
    const score = o.current_match_score;
    const scoreNum =
      score != null && score !== '' && score != 0 ? Number(score) : null;
    const tier = (o.score_tier && escapeHtml(String(o.score_tier))) || 'muted';
    const scoreHtml =
      scoreNum != null
        ? '<span class="drawer-worklist-match-badge drawer-worklist-match-badge--' + tier + '">' + scoreNum + '%</span>'
        : '—';
    const isCurrentPage =
      currentPageUrl != null &&
      o.url != null &&
      normalizeUrlForCompare(o.url) === normalizeUrlForCompare(currentPageUrl);
    const rowClass =
      'drawer-worklist-item' + (isCurrentPage ? ' drawer-opening-item-current' : '');
    const dataUrl = o.url ? ' data-url="' + escapeHtml(o.url) + '"' : '';
    const dataOpeningId = o.id != null ? ' data-opening-id="' + escapeHtml(String(o.id)) + '"' : '';
    const resumeLine =
      o.cv_filename != null && String(o.cv_filename).trim() !== ''
        ? '<div class="drawer-worklist-item-resume">Resume: <span class="drawer-worklist-item-resume-name">' + escapeHtml(String(o.cv_filename)) + '</span></div>'
        : '';
    const deleteBtn =
      '<button type="button" class="drawer-worklist-item-delete" aria-label="Remove from worklist"' +
      dataOpeningId +
      '>' + trashIconSvg + '</button>';
    return (
      '<div class="' +
      rowClass +
      '"' +
      dataUrl +
      '><div class="drawer-worklist-item-top"><div class="drawer-worklist-item-left"><div class="drawer-worklist-item-company">' +
      company +
      '</div><div class="drawer-worklist-item-position">' +
      position +
      '</div></div><div class="drawer-worklist-item-score-wrap">' +
      scoreHtml +
      deleteBtn +
      '</div></div>' +
      (resumeLine ? resumeLine : '') +
      '</div>'
    );
  }

  let lastPersonas = [];

  async function updateProfileCard(persona) {
    const scoreEl = document.getElementById('applica-profile-score');
    const resumeEl = document.getElementById('applica-profile-resume');
    const linkEl = document.getElementById('applica-profile-manage-link');
    if (scoreEl) {
      const hasScore = persona && (persona.match_score != null || persona.match_score === 0);
      scoreEl.textContent = hasScore ? String(Math.round(Number(persona.match_score))) : '—';
      scoreEl.className = 'drawer-profile-score-value drawer-profile-score-value--' + (persona?.score_tier || 'muted');
    }
    if (resumeEl) {
      resumeEl.textContent = persona?.cv_filename ?? '—';
    }
    if (linkEl && window.ApplicaAPI && typeof window.ApplicaAPI.appUrl === 'function') {
      try {
        linkEl.href = await window.ApplicaAPI.appUrl('/dashboard');
      } catch (_) {}
    }
  }

  function renderPersonas(payload) {
    const picker = document.getElementById('applica-persona-picker');
    if (!picker) return;
    if (payload.error) {
      picker.innerHTML = `<option value="">${escapeHtml(payload.error)}</option>`;
      picker.disabled = true;
      updateProfileCard(null);
      return;
    }
    const personas = payload.data?.personas || [];
    lastPersonas = personas;
    picker.disabled = false;
    picker.innerHTML = personas.length
      ? personas.map((p) => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.title || p.name || 'Persona')}</option>`).join('')
      : '<option value="">No personas</option>';
    if (personas.length > 0) {
      picker.value = String(personas[0].id);
      updateProfileCard(personas[0]);
      fetchOpenings(personas[0].id);
    } else {
      updateProfileCard(null);
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
  let currentAnalyzingOpening = null;
  let lastOpeningsPayload = null;

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'applica-drawer-opened') {
      currentPageUrl = event.data.currentPageUrl || null;
      if (lastOpeningsPayload) renderOpenings(lastOpeningsPayload);
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
    currentAnalyzingOpening = { url, title: 'Analyzing job posting…', company: '' };
    renderOpenings(lastOpeningsPayload || { loggedIn: true, data: { openings: [], limits: {} } });
    try {
      const res = await window.ApplicaAPI.appFetch('/api/openings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, persona_id: personaId, html }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        currentAnalyzingOpening = null;
        renderOpenings(lastOpeningsPayload || { loggedIn: true, data: { openings: [], limits: {} } });
        setAnalyzeStatus('error', data.message || 'Failed to add opening');
        return;
      }
      if (data.opening) currentAnalyzingOpening = data.opening;
      fetchOpenings(personaId);
      startOpeningsPoll(personaId, 60000);
      setTimeout(() => setAnalyzeStatus('', ''), 3000);
    } catch (err) {
      currentAnalyzingOpening = null;
      renderOpenings(lastOpeningsPayload || { loggedIn: true, data: { openings: [], limits: {} } });
      setAnalyzeStatus('error', err?.message || 'Request failed');
    }
  }

  const personaPicker = document.getElementById('applica-persona-picker');
  if (personaPicker) {
    personaPicker.addEventListener('change', () => {
      stopOpeningsPoll();
      lastOpeningsSnapshot = null;
      const id = personaPicker.value;
      const persona = id ? lastPersonas.find((p) => String(p.id) === id) : null;
      updateProfileCard(persona || null);
      if (id) fetchOpenings(id);
    });
  }

  function navigateToUrl(url) {
    if (!url) return;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'applica-navigate-to', url }, '*');
    } else {
      window.location.href = url;
    }
  }

  async function handleDeleteQueueItem(openingId) {
    const personaId = personaPicker?.value;
    if (!personaId) return;
    try {
      const res = await window.ApplicaAPI.appFetch(`/api/openings/${openingId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchOpenings(personaId);
      } else {
        const data = await res.json().catch(() => ({}));
        setAnalyzeStatus('error', data.message || 'Could not remove.');
      }
    } catch (err) {
      setAnalyzeStatus('error', err?.message || 'Could not remove.');
    }
  }

  if (scoreQueueSection) {
    scoreQueueSection.addEventListener('click', (e) => {
      const worklistDeleteBtn = e.target.closest('button.drawer-worklist-item-delete');
      if (worklistDeleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const openingId = worklistDeleteBtn.getAttribute('data-opening-id');
        if (openingId) {
          handleDeleteQueueItem(openingId);
        }
        return;
      }
      const link = e.target.closest('a.drawer-opening-link');
      if (link?.href) {
        e.preventDefault();
        e.stopPropagation();
        navigateToUrl(link.href);
        return;
      }
      const row = e.target.closest('.drawer-worklist-item[data-url]');
      if (row) {
        e.preventDefault();
        navigateToUrl(row.getAttribute('data-url'));
        return;
      }
      const queueItem = e.target.closest('.drawer-queue-item[data-url]');
      if (queueItem) {
        e.preventDefault();
        navigateToUrl(queueItem.getAttribute('data-url'));
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

  function isContextInvalidated(e) {
    return String(e?.message ?? e).includes('Extension context invalidated');
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
      if (isContextInvalidated(e)) {
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
      if (isContextInvalidated(e)) {
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

  const authStorageChanged = (changes, areaName) => {
    if (areaName !== 'local') return;
    const keys = window.ApplicaAPI?.STORAGE_KEYS;
    if (keys && (changes[keys.AUTH_TOKEN] || changes[keys.USER])) {
      refreshAuthState();
    }
  };

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      try {
        authStorageChanged(changes, areaName);
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
