/**
 * Applica Extension - Drawer UI logic
 *
 * Navigation chrome is driven by applyDrawerLayout() — see chrome_plugin/ARCHITECTURE.md.
 * Sign-in opens the app in a new tab; auth.html stores the token. Shared helpers live in
 * lib/api.js, lib/constants.js, and lib/util.js.
 */

(function () {
  const { escapeHtml, setVisible } = window.ApplicaUtil;
  const { APPLICATION_STATUS_OPTIONS, STORAGE } = window.ApplicaConstants;

  const loginSection = document.getElementById('login-section');
  const scoreQueueSection = document.getElementById('score-queue-section');
  const signedInSection = document.getElementById('signed-in-section');
  const signedInEmail = document.getElementById('signed-in-email');
  const openLoginTabBtn = document.getElementById('open-login-tab');
  const signOutBtn = document.getElementById('sign-out-btn');
  const closeDrawerBtn = document.getElementById('close-drawer');
  const apiErrorBanner = document.getElementById('api-error-banner');

  let apiErrorBannerTimeout = null;

  function showApiErrorBanner() {
    if (!apiErrorBanner) return;
    if (apiErrorBannerTimeout) clearTimeout(apiErrorBannerTimeout);
    apiErrorBanner.hidden = false;
    apiErrorBannerTimeout = setTimeout(() => {
      apiErrorBanner.hidden = true;
      apiErrorBannerTimeout = null;
    }, 5000);
  }

  function showSection(section) {
    loginSection.hidden = section !== 'login';
    scoreQueueSection.hidden = section !== 'signed-in';
    signedInSection.hidden = section !== 'signed-in';
  }

  async function fetchPersonas() {
    const picker = document.getElementById('applica-persona-picker');
    if (picker) picker.innerHTML = '<option value="">Loading…</option>';
    try {
      const data = await window.ApplicaAPI.appFetchJson('/api/personas');
      await renderPersonas({ loggedIn: true, data });
    } catch (err) {
      showApiErrorBanner();
      const msg = err?.message || 'Failed to load personas';
      const hint = msg.includes('failed') || msg.includes('CORS') || msg.includes('fetch')
        ? ' Check that the app is running and the app URL is correct.'
        : '';
      await renderPersonas({ loggedIn: false, error: msg + hint });
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

  function openingHasScore(opening) {
    return opening != null && Number(opening.current_match_score) > 0;
  }

  function isOpeningScoring(opening) {
    if (!opening || openingHasScore(opening)) return false;
    if (pollingWatchOpeningId && String(pollingWatchOpeningId) === String(opening.id)) return true;
    const fromApi = findOpeningById(opening.id);
    if (fromApi && !openingHasScore(fromApi)) {
      const hasTitleAndCompany =
        fromApi.title != null && String(fromApi.title).trim() !== '' &&
        fromApi.company != null && String(fromApi.company).trim() !== '';
      if (hasTitleAndCompany) return true;
    }
    if (
      currentAnalyzingOpening &&
      opening.url &&
      normalizeUrlForCompare(currentAnalyzingOpening.url) === normalizeUrlForCompare(opening.url)
    ) {
      return true;
    }
    return false;
  }

  function updateOpeningDetailScoringIndicator(opening) {
    const scoringEl = document.getElementById('opening-detail-scoring');
    if (!scoringEl) return;
    scoringEl.hidden = !isOpeningScoring(opening);
  }

  function findOpeningById(openingId) {
    const openings = lastOpeningsPayload?.data?.openings || [];
    return openings.find((o) => o != null && String(o.id) === String(openingId));
  }

  async function fetchOpenings(personaId, options = {}) {
    if (!personaId) return;
    const showLoading = options.silent !== true;
    const queueEl = document.getElementById('score-queue-list');
    const listEl = document.getElementById('openings-list');
    if (showLoading && queueEl) queueEl.innerHTML = '<p class="drawer-hint">Loading…</p>';
    if (showLoading && listEl) listEl.innerHTML = '<p class="drawer-hint">Loading…</p>';
    try {
      const data = await window.ApplicaAPI.appFetchJson(
        `/api/openings?persona_id=${encodeURIComponent(personaId)}`
      );
      const openings = data?.openings || [];
      const snapshot = openingsSnapshot(openings);
      const unchanged = snapshot === lastOpeningsSnapshot;
      if (unchanged && options.silent === true) {
        return;
      }
      lastOpeningsSnapshot = snapshot;
      renderOpenings({ loggedIn: true, data });
      const watchId = options.watchOpeningId || pollingWatchOpeningId;
      if (watchId && openingHasScore(findOpeningById(watchId))) {
        stopOpeningsPoll();
      }
    } catch (err) {
      showApiErrorBanner();
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
      openingsSectionAvailable = false;
      applyDrawerLayout();
      return;
    }
    openingsSectionAvailable = true;
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
    } else {
      queueEl.innerHTML = '';
    }

    if (badgeEl) badgeEl.innerHTML = usageBadgeHtml(limits);
    if (hintEl) {
      const atLimit = limits != null && typeof limits.remaining === 'number' && limits.remaining === 0;
      hintEl.innerHTML = atLimit
        ? '<p class="drawer-hint">You have reached your limit of openings. Upgrade to create more.</p>'
        : '';
    }

    const bulkToolbar = document.getElementById('openings-bulk-delete-toolbar');
    if (bulkToolbar) bulkToolbar.hidden = openings.length === 0;

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
    } else {
      listEl.innerHTML = '<div class="drawer-worklist-empty">No openings yet.</div>';
    }
    if (isApplicationDetailActive()) {
      applyDrawerLayout();
    } else {
      applyDrawerViewStateSync();
    }
  }

  function tryShowDetailViewForCurrentPage() {
    if (!currentPageUrl) return;
    const openings = lastOpeningsPayload?.data?.openings;
    if (!Array.isArray(openings)) return;
    const normalized = normalizeUrlForCompare(currentPageUrl);
    const opening = openings.find((o) => o && o.url && normalizeUrlForCompare(o.url) === normalized);
    if (opening) showOpeningDetail(opening);
  }

  function tryShowApplicationDetailForCurrentPage() {
    if (!currentPageUrl || isOpeningDetailActive()) return;
    const apps = lastApplicationsPayload?.data?.applications;
    if (!Array.isArray(apps)) return;
    const normalized = normalizeUrlForCompare(currentPageUrl);
    const app = apps.find((a) => a?.link && normalizeUrlForCompare(a.link) === normalized);
    if (app) showApplicationDetail(app);
  }

  function applyDrawerViewStateSync() {
    if (isApplicationDetailActive()) {
      applyDrawerLayout();
      return;
    }
    const openings = lastOpeningsPayload?.data?.openings || [];
    if (drawerViewMemory.view === 'list') {
      showOpeningsList();
      return;
    }
    if (drawerViewMemory.view === 'detail' && drawerViewMemory.openingId != null) {
      const opening = openings.find(
        (o) => o != null && String(o.id) === String(drawerViewMemory.openingId)
      );
      if (opening) {
        showOpeningDetail(opening);
        return;
      }
      saveDrawerViewState('list', null);
    }
    showOpeningsList();
  }

  function normalizeApplicationStatus(status) {
    if (status == null || String(status).trim() === '') return 'applied';
    const normalized = String(status).trim().toLowerCase();
    if (APPLICATION_STATUS_OPTIONS.some(([, value]) => value === normalized)) return normalized;
    return 'applied';
  }

  function populateStatusSelect(selectEl, selectedStatus) {
    if (!selectEl) return;
    const status = normalizeApplicationStatus(selectedStatus);
    selectEl.innerHTML = APPLICATION_STATUS_OPTIONS.map(
      ([label, value]) =>
        '<option value="' +
        escapeHtml(value) +
        '">' +
        escapeHtml(label) +
        '</option>'
    ).join('');
    selectEl.value = status;
    if (!selectEl.value && APPLICATION_STATUS_OPTIONS.length > 0) {
      selectEl.value = APPLICATION_STATUS_OPTIONS[0][1];
    }
  }

  function initApplicationFormSelects() {
    populateStatusSelect(document.getElementById('application-detail-status'), 'applied');
  }

  function statusOptionsHtml(selectedStatus) {
    const status = normalizeApplicationStatus(selectedStatus);
    return APPLICATION_STATUS_OPTIONS.map(
      ([label, value]) =>
        '<option value="' +
        escapeHtml(value) +
        '"' +
        (value === status ? ' selected' : '') +
        '>' +
        escapeHtml(label) +
        '</option>'
    ).join('');
  }

  function formatAppliedDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) {
      return String(iso).slice(0, 10);
    }
  }

  const APPLICATION_DETAIL_PREFIX = 'application-detail';

  function applicationFieldId(name) {
    return APPLICATION_DETAIL_PREFIX + '-' + name;
  }

  function readApplicationFields() {
    return {
      status: document.getElementById(applicationFieldId('status'))?.value,
      notes: document.getElementById(applicationFieldId('notes'))?.value || '',
      contact_name: document.getElementById(applicationFieldId('contact-name'))?.value || '',
      contact_email: document.getElementById(applicationFieldId('contact-email'))?.value || '',
      contact_url: document.getElementById(applicationFieldId('contact-url'))?.value || ''
    };
  }

  function fillApplicationFields(app) {
    populateStatusSelect(document.getElementById(applicationFieldId('status')), app?.status || 'applied');
    const notesEl = document.getElementById(applicationFieldId('notes'));
    const contactNameEl = document.getElementById(applicationFieldId('contact-name'));
    const contactEmailEl = document.getElementById(applicationFieldId('contact-email'));
    const contactUrlEl = document.getElementById(applicationFieldId('contact-url'));
    if (notesEl) notesEl.value = app?.notes || '';
    if (contactNameEl) contactNameEl.value = app?.contact_name || '';
    if (contactEmailEl) contactEmailEl.value = app?.contact_email || '';
    if (contactUrlEl) contactUrlEl.value = app?.contact_url || '';
  }

  let applicationsViewMemory = { view: 'list', applicationId: null };
  let lastApplicationsPayload = null;
  let selectedApplication = null;
  let applicationsSectionAvailable = true;
  let openingsSectionAvailable = true;
  let drawerViewMemory = { view: 'list', openingId: null };
  let selectedOpening = null;

  /** Single source of truth for which drawer chrome is visible. */
  const DrawerLayoutMode = {
    MAIN: 'main',
    OPENING_DETAIL: 'opening-detail',
    APPLICATION_DETAIL: 'application-detail'
  };

  function getDrawerLayoutMode() {
    if (
      applicationsViewMemory.view === 'detail' &&
      applicationsViewMemory.applicationId != null
    ) {
      return DrawerLayoutMode.APPLICATION_DETAIL;
    }
    if (drawerViewMemory.view === 'detail' && selectedOpening != null) {
      return DrawerLayoutMode.OPENING_DETAIL;
    }
    return DrawerLayoutMode.MAIN;
  }

  function isOpeningDetailActive() {
    return getDrawerLayoutMode() === DrawerLayoutMode.OPENING_DETAIL;
  }

  function isApplicationDetailActive() {
    return getDrawerLayoutMode() === DrawerLayoutMode.APPLICATION_DETAIL;
  }

  function queuePanelHasContent() {
    const queueEl = document.getElementById('score-queue-list');
    return !!(queueEl && queueEl.innerHTML.trim());
  }

  /**
   * Apply layout from getDrawerLayoutMode(). Call after any navigation or list refresh
   * that might affect chrome visibility — do not toggle sections ad hoc elsewhere.
   */
  function applyDrawerLayout() {
    const mode = getDrawerLayoutMode();
    const isMain = mode === DrawerLayoutMode.MAIN;
    const isOpeningDetail = mode === DrawerLayoutMode.OPENING_DETAIL;
    const isAppDetail = mode === DrawerLayoutMode.APPLICATION_DETAIL;

    setVisible(document.getElementById('drawer-list-only-block'), isMain);
    setVisible(
      document.getElementById('openings-section-content'),
      openingsSectionAvailable && (isMain || isOpeningDetail)
    );
    setVisible(
      document.getElementById('applications-section-content'),
      applicationsSectionAvailable && (isMain || isAppDetail)
    );
    setVisible(
      document.getElementById('score-queue-section-content'),
      isMain && queuePanelHasContent()
    );

    setVisible(document.getElementById('openings-list-view'), isMain);
    setVisible(document.getElementById('opening-detail-view'), isOpeningDetail);
    setVisible(document.getElementById('applications-list-view'), isMain);
    setVisible(document.getElementById('application-detail-view'), isAppDetail);
  }

  async function fetchApplications(personaId, options = {}) {
    if (!personaId) return;
    const listEl = document.getElementById('applications-list');
    if (options.silent !== true && listEl) {
      listEl.innerHTML = '<p class="drawer-hint">Loading…</p>';
    }
    try {
      const data = await window.ApplicaAPI.appFetchJson(
        `/api/applications?persona_id=${encodeURIComponent(personaId)}`
      );
      renderApplications({ loggedIn: true, data });
    } catch (err) {
      renderApplications({ loggedIn: true, error: err?.message || 'Failed to load applications' });
    }
  }

  function applicationRowHtml(app) {
    const company = escapeHtml(app.company || '—');
    const title = escapeHtml(app.title || '');
    const appliedAt = formatAppliedDate(app.applied_at);
    const appliedMeta = appliedAt
      ? '<div class="drawer-worklist-item-applied">Applied ' + escapeHtml(appliedAt) + '</div>'
      : '';
    const dataApplicationId =
      app.id != null ? ' data-application-id="' + escapeHtml(String(app.id)) + '"' : '';
    const statusSelect =
      '<select class="drawer-application-row-status drawer-field-select" data-application-id="' +
      escapeHtml(String(app.id)) +
      '" aria-label="Application status for ' +
      escapeHtml(app.company || 'application') +
      '">' +
      statusOptionsHtml(normalizeApplicationStatus(app.status)) +
      '</select>';
    const isCurrentPage = applicationMatchesCurrentPage(app);
    const rowClass =
      'drawer-worklist-item drawer-application-item' +
      (isCurrentPage ? ' drawer-opening-item-current' : '');
    const dataLink = app.link ? ' data-link="' + escapeHtml(app.link) + '"' : '';
    return (
      '<div class="' +
      rowClass +
      '"' +
      dataApplicationId +
      dataLink +
      '><div class="drawer-worklist-item-top"><div class="drawer-worklist-item-left"><div class="drawer-worklist-item-company">' +
      company +
      '</div><div class="drawer-worklist-item-position">' +
      title +
      '</div>' +
      appliedMeta +
      '</div><div class="drawer-worklist-item-score-wrap drawer-application-item-status-wrap">' +
      statusSelect +
      '</div></div></div>'
    );
  }

  function renderApplications(payload) {
    const listEl = document.getElementById('applications-list');
    const section = document.getElementById('applications-section-content');
    if (!listEl) return;
    if (!payload.loggedIn) {
      listEl.innerHTML = '';
      applicationsSectionAvailable = false;
      applyDrawerLayout();
      return;
    }
    applicationsSectionAvailable = true;
    if (payload.error) {
      listEl.innerHTML = '<div class="drawer-worklist-empty">' + escapeHtml(payload.error) + '</div>';
      applyDrawerLayout();
      return;
    }
    lastApplicationsPayload = payload;
    const apps = payload.data?.applications || [];
    if (apps.length === 0) {
      listEl.innerHTML = '<div class="drawer-worklist-empty">No applications yet.</div>';
      applyDrawerLayout();
      return;
    }
    const sortedApps = [...apps].sort((a, b) => {
      const aCurrent = applicationMatchesCurrentPage(a);
      const bCurrent = applicationMatchesCurrentPage(b);
      if (aCurrent && !bCurrent) return -1;
      if (!aCurrent && bCurrent) return 1;
      return 0;
    });
    listEl.innerHTML = sortedApps.slice(0, 12).map(applicationRowHtml).join('');
    applyDrawerLayout();
    if (
      applicationsViewMemory.view === 'detail' &&
      applicationsViewMemory.applicationId != null
    ) {
      const active = sortedApps.find(
        (a) => a != null && String(a.id) === String(applicationsViewMemory.applicationId)
      );
      if (active) showApplicationDetail(active, { skipSaveState: true });
      else showApplicationsList();
    }
  }

  function upsertApplicationInList(application) {
    if (!application?.id) return;
    const existing = lastApplicationsPayload?.data?.applications || [];
    const apps = [...existing];
    const idx = apps.findIndex((a) => a != null && String(a.id) === String(application.id));
    if (idx >= 0) apps[idx] = application;
    else apps.unshift(application);
    renderApplications({ loggedIn: true, data: { applications: apps } });
  }

  function patchApplicationInList(applicationId, partial) {
    const existing = lastApplicationsPayload?.data?.applications || [];
    const apps = existing.map((a) =>
      a != null && String(a.id) === String(applicationId) ? { ...a, ...partial } : a
    );
    if (lastApplicationsPayload?.data) {
      lastApplicationsPayload = {
        ...lastApplicationsPayload,
        data: { ...lastApplicationsPayload.data, applications: apps }
      };
    }
  }

  async function updateApplication(applicationId, attrs) {
    const data = await window.ApplicaAPI.appFetchJson(
      '/api/applications/' + encodeURIComponent(applicationId),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attrs)
      }
    );
    if (!data.application) {
      throw new Error('Invalid response from server');
    }
    return data.application;
  }

  function syncOpeningDetailApplicationActions(opening) {
    const applyBtn = document.getElementById('opening-detail-remove');
    const hasApp = !!(opening?.has_application || opening?.linked_application?.id);
    if (applyBtn) applyBtn.hidden = hasApp;
  }

  async function renderCustomResumeSection(opening) {
    const section = document.getElementById('opening-detail-custom-resume');
    const locked = document.getElementById('opening-detail-custom-resume-locked');
    const uploadInput = document.getElementById('opening-detail-resume-upload');
    const uploadBtn = document.getElementById('opening-detail-upload-resume');
    const upgradeLink = document.getElementById('opening-detail-upgrade-link');
    if (!section) return;
    const hasApp = opening?.has_application || opening?.linked_application;
    if (hasApp || isOpeningScoring(opening)) {
      section.hidden = true;
      if (uploadInput) uploadInput.value = '';
      if (uploadBtn) uploadBtn.hidden = true;
      return;
    }
    const canCustomize = lastOpeningsPayload?.data?.entitlements?.custom_resume_scoring === true;
    section.hidden = false;
    if (upgradeLink && window.ApplicaAPI?.appUrl) {
      try {
        upgradeLink.href = await window.ApplicaAPI.appUrl('/dashboard/settings#billing');
      } catch (_) {}
    }
    if (canCustomize) {
      if (locked) locked.hidden = true;
      if (uploadBtn) uploadBtn.hidden = false;
      const aside = section.querySelector('.drawer-custom-resume-aside');
      if (aside) aside.hidden = false;
    } else {
      if (locked) locked.hidden = false;
      if (uploadBtn) uploadBtn.hidden = true;
      const aside = section.querySelector('.drawer-custom-resume-aside');
      if (aside) aside.hidden = true;
    }
  }

  async function submitCustomResumeUpload(file) {
    if (!selectedOpening?.id || !file) return;
    const uploadBtn = document.getElementById('opening-detail-upload-resume');
    const uploadInput = document.getElementById('opening-detail-resume-upload');
    setAnalyzeStatus('', 'Uploading resume…');
    if (uploadBtn) uploadBtn.disabled = true;
    try {
      const updatedOpening = await uploadCustomResumeForOpening(selectedOpening, file);
      selectedOpening = { ...selectedOpening, ...updatedOpening };
      if (uploadInput) uploadInput.value = '';
      showOpeningDetail(selectedOpening);
      const personaId = personaPicker?.value;
      if (personaId) {
        startOpeningsPoll(personaId, { openingId: selectedOpening.id });
        await fetchOpenings(personaId, { silent: true, watchOpeningId: selectedOpening.id });
      }
      setAnalyzeStatus('', 'Resume uploaded. Re-scoring…');
      setTimeout(() => setAnalyzeStatus('', ''), 4000);
    } catch (err) {
      showApiErrorBanner();
      setAnalyzeStatus('error', err?.message || 'Upload failed.');
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
    }
  }

  async function uploadCustomResumeForOpening(opening, file) {
    const formData = new FormData();
    formData.append('resume', file);
    const data = await window.ApplicaAPI.appFetchJson(
      '/api/openings/' + encodeURIComponent(opening.id) + '/resume_upload',
      { method: 'POST', body: formData }
    );
    return data.opening;
  }

  function showApplicationDetail(app, options = {}) {
    if (!app) return;
    selectedApplication = app;
    if (!options.skipSaveState) {
      applicationsViewMemory = { view: 'detail', applicationId: app.id ?? null };
      saveApplicationsViewState();
      setApplicationDetailSaveStatus('', '');
    }
    applyDrawerLayout();
    const companyEl = document.getElementById('application-detail-company');
    const titleEl = document.getElementById('application-detail-title');
    const appliedEl = document.getElementById('application-detail-applied');
    const salaryEl = document.getElementById('application-detail-salary');
    if (companyEl) companyEl.textContent = app.company || '—';
    if (titleEl) titleEl.textContent = app.title || '';
    if (appliedEl) {
      const appliedAt = formatAppliedDate(app.applied_at);
      appliedEl.textContent = appliedAt ? 'Applied ' + appliedAt : '';
      appliedEl.hidden = !appliedAt;
    }
    if (salaryEl) {
      if (app.salary) {
        salaryEl.textContent = 'Salary: ' + app.salary;
        salaryEl.hidden = false;
      } else {
        salaryEl.textContent = '';
        salaryEl.hidden = true;
      }
    }
    if (!options.skipFormFill) {
      fillApplicationFields(app);
    }
    const openLink = document.getElementById('application-detail-open-link');
    if (openLink) {
      openLink.href = app.link || '#';
      openLink.hidden = !app.link;
    }
  }

  function showApplicationsList() {
    applicationsViewMemory = { view: 'list', applicationId: null };
    saveApplicationsViewState();
    applyDrawerLayout();
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

  function applicationMatchesCurrentPage(app) {
    return (
      currentPageUrl != null &&
      app?.link != null &&
      normalizeUrlForCompare(app.link) === normalizeUrlForCompare(currentPageUrl)
    );
  }

  /** Score colors and badges — mirrors YouWeb.Helpers.LiveHelpers + ScoreSentiment */
  function scoreColor(score) {
    const n = Number(score);
    if (n !== n) return '#333333';
    if (n >= 80) return '#70C494';
    if (n >= 65) return '#EAB308';
    if (n >= 50) return '#F29A4B';
    return '#D94A3A';
  }

  function scoreLabel(score) {
    const n = Number(score);
    if (n !== n) return null;
    if (n >= 90) return 'Excellent';
    if (n >= 80) return 'Great';
    if (n >= 70) return 'Good';
    if (n >= 55) return 'Review';
    return 'Needs Work';
  }

  function hexToRgb(hex) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!match) return null;
    return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
  }

  function rgbToHex(r, g, b) {
    return (
      '#' +
      [r, g, b]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  function darkenRgb(rgb, amount) {
    const factor = 1 - amount;
    return {
      r: Math.round(rgb.r * factor),
      g: Math.round(rgb.g * factor),
      b: Math.round(rgb.b * factor)
    };
  }

  function scoreBadgeStyle(score) {
    if (score == null || Number(score) !== Number(score)) {
      return 'background-color: rgba(51, 51, 51, 0.12); color: #333333; border-color: rgba(51, 51, 51, 0.2);';
    }
    const color = scoreColor(score);
    const rgb = hexToRgb(color);
    if (!rgb) return '';
    const text = darkenRgb(rgb, 0.2);
    return (
      'background-color: rgba(' +
      rgb.r +
      ', ' +
      rgb.g +
      ', ' +
      rgb.b +
      ', 0.18); color: ' +
      rgbToHex(text.r, text.g, text.b) +
      '; border-color: rgba(' +
      rgb.r +
      ', ' +
      rgb.g +
      ', ' +
      rgb.b +
      ', 0.35);'
    );
  }

  function scoreSentimentBadgeStyle(score) {
    const n = Number(score);
    if (n !== n) return null;
    if (n >= 90) return { color: '#AFDFDF', background: 'rgba(175, 223, 223, 0.1)' };
    if (n >= 80) return { color: '#70C494', background: 'rgba(112, 196, 148, 0.1)' };
    if (n >= 70) return { color: '#a16207', background: '#fef9c3' };
    if (n >= 55) return { color: '#ea580c', background: '#ffedd5' };
    return { color: '#dc2626', background: '#fee2e2' };
  }

  function applyScoreSentimentBadge(el, score) {
    if (!el) return;
    const label = scoreLabel(score);
    const style = scoreSentimentBadgeStyle(score);
    if (!label || !style) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = label;
    el.style.color = style.color;
    el.style.backgroundColor = style.background;
  }

  function applyCompactScoreDisplay(valueEl, badgeEl, score) {
    const n = score != null && score !== '' ? Math.round(Number(score)) : null;
    if (valueEl) {
      if (n == null || Number.isNaN(n)) {
        valueEl.textContent = '—';
        valueEl.style.color = '#333333';
      } else {
        valueEl.textContent = String(n);
        valueEl.style.color = scoreColor(n);
      }
    }
    applyScoreSentimentBadge(badgeEl, n);
  }

  /** Normalize score like app: 0–10 scale becomes 0–100 for display */
  function normalizeScore(score) {
    const n = Number(score);
    if (n !== n) return 0;
    if (n > 10) return Math.round(n);
    return Math.round(n * 10);
  }

  function getScoreFromAnalysis(analysis, key) {
    if (!analysis || typeof analysis !== 'object') return null;
    const raw = analysis[key] ?? analysis.analysis?.[key];
    if (raw == null) return null;
    const n = normalizeScore(raw);
    return n > 0 ? n : null;
  }

  function setCategoryScore(name, score) {
    const wrap = document.getElementById('opening-detail-score-' + name);
    const barEl = document.getElementById('opening-detail-score-' + name + '-bar');
    if (!wrap) return;
    if (score != null && score > 0) {
      wrap.hidden = false;
      const label =
        name === 'skill' ? 'Skill' : name === 'experience' ? 'Experience' : 'Education';
      wrap.setAttribute('aria-label', label + ' match ' + score + ' out of 100');
      if (barEl) {
        barEl.style.width = Math.min(100, Math.max(0, score)) + '%';
        barEl.style.backgroundColor = scoreColor(score);
      }
    } else {
      wrap.hidden = true;
    }
    refreshCategoriesCompactVisibility();
  }

  function refreshCategoriesCompactVisibility() {
    const container = document.getElementById('opening-detail-score-categories');
    if (!container) return;
    const anyVisible = ['skill', 'experience', 'education'].some((name) => {
      const wrap = document.getElementById('opening-detail-score-' + name);
      return wrap && !wrap.hidden;
    });
    container.hidden = !anyVisible;
  }

  const trashIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drawer-queue-item-trash-icon" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>';

  const matchingAppsWarningIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drawer-worklist-matching-apps-warning" aria-label="Has matching applications at this company"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

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
      score != null && score !== '' && score != 0 ? Math.round(Number(score)) : null;
    const hasMatchingApps = Array.isArray(o.matching_applications) && o.matching_applications.length > 0;
    const matchingAppsWarning = hasMatchingApps
      ? '<span class="drawer-worklist-matching-apps-wrap" title="You have applied to roles at this company">' + matchingAppsWarningIconSvg + '</span>'
      : '';
    const scoreHtml =
      scoreNum != null
        ? '<span class="drawer-worklist-match-badge" style="' + scoreBadgeStyle(scoreNum) + '">' + scoreNum + '</span>'
        : '—';
    const isCurrentPage =
      currentPageUrl != null &&
      o.url != null &&
      normalizeUrlForCompare(o.url) === normalizeUrlForCompare(currentPageUrl);
    const rowClass =
      'drawer-worklist-item' + (isCurrentPage ? ' drawer-opening-item-current' : '');
    const dataUrl = o.url ? ' data-url="' + escapeHtml(o.url) + '"' : '';
    const dataOpeningId = o.id != null ? ' data-opening-id="' + escapeHtml(String(o.id)) + '"' : '';
    const hasResume = o.cv_filename != null && String(o.cv_filename).trim() !== '';
    const resumeName = hasResume ? escapeHtml(String(o.cv_filename)) : '';
    const resumePart = hasResume
      ? (o.cv_url
          ? '<div class="drawer-worklist-item-resume">Resume: <a class="drawer-worklist-item-resume-name" href="' + escapeHtml(o.cv_url) + '" target="_blank" rel="noopener">' + resumeName + '</a></div>'
          : '<div class="drawer-worklist-item-resume">Resume: <span class="drawer-worklist-item-resume-name">' + resumeName + '</span></div>')
      : '';
    const deleteBtn =
      '<button type="button" class="drawer-worklist-item-delete" aria-label="Remove from worklist"' +
      dataOpeningId +
      '>' + trashIconSvg + '</button>';
    const hasBottom = !!hasResume;
    const bottomRow = hasBottom
      ? '<div class="drawer-worklist-item-bottom">' + resumePart + '</div>'
      : '';
    return (
      '<div class="' +
      rowClass +
      '"' +
      dataUrl +
      dataOpeningId +
      '><div class="drawer-worklist-item-top"><div class="drawer-worklist-item-left"><div class="drawer-worklist-item-company">' +
      company +
      '</div><div class="drawer-worklist-item-position">' +
      position +
      '</div></div><div class="drawer-worklist-item-score-wrap">' +
      matchingAppsWarning +
      scoreHtml +
      deleteBtn +
      '</div></div>' +
      bottomRow +
      '</div>'
    );
  }

  let lastPersonas = [];

  function syncProfilePickerLayout() {
    const singleProfile = lastPersonas.length === 1;
    const pickerBlock = document.getElementById('drawer-profile-picker-block');
    const resumeRow = document.getElementById('drawer-profile-resume-row');
    const resumeSingle = document.getElementById('drawer-profile-resume-single');
    const profileCard = document.getElementById('drawer-profile-card');
    if (pickerBlock) pickerBlock.hidden = singleProfile;
    if (resumeRow) resumeRow.hidden = singleProfile;
    if (resumeSingle) resumeSingle.hidden = !singleProfile;
    if (profileCard) profileCard.classList.toggle('drawer-profile-card--single', singleProfile);
  }

  async function updateProfileCard(persona) {
    const scoreEl = document.getElementById('applica-profile-score');
    const scoreBadgeEl = document.getElementById('applica-profile-score-badge');
    const resumeEl = document.getElementById('applica-profile-resume');
    const resumeSingleEl = document.getElementById('drawer-profile-resume-single');
    const linkEl = document.getElementById('applica-profile-manage-link');
    const hiringCafeLink = document.getElementById('applica-profile-hiring-cafe-link');
    if (scoreEl) {
      const hasScore = persona && persona.match_score != null && persona.match_score !== '';
      applyCompactScoreDisplay(scoreEl, scoreBadgeEl, hasScore ? persona.match_score : null);
    }
    const resumeName = persona?.cv_filename ?? '—';
    const resumeTitle = resumeName !== '—' ? resumeName : '';
    if (resumeEl) {
      resumeEl.textContent = resumeName;
      resumeEl.title = resumeTitle;
    }
    if (resumeSingleEl) {
      resumeSingleEl.textContent = resumeName;
      resumeSingleEl.title = resumeTitle;
    }
    if (linkEl && window.ApplicaAPI && typeof window.ApplicaAPI.appUrl === 'function') {
      try {
        linkEl.href = await window.ApplicaAPI.appUrl('/dashboard');
      } catch (_) {}
    }
    if (hiringCafeLink) {
      const url = persona?.hiring_cafe_url;
      if (url) {
        hiringCafeLink.href = url;
        hiringCafeLink.hidden = false;
      } else {
        hiringCafeLink.href = '#';
        hiringCafeLink.hidden = true;
      }
    }
  }

  function saveSelectedPersonaId(personaId) {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        chrome.storage.local.set({
          [STORAGE.DRAWER_SELECTED_PERSONA]: personaId ? String(personaId) : null
        }, () => {});
      }
    } catch (_) {}
  }

  function loadSelectedPersonaId() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
          resolve(null);
          return;
        }
        chrome.storage.local.get([STORAGE.DRAWER_SELECTED_PERSONA], (data) => {
          try {
            const raw = data?.[STORAGE.DRAWER_SELECTED_PERSONA];
            resolve(raw != null && raw !== '' ? String(raw) : null);
          } catch (_) {
            resolve(null);
          }
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function renderPersonas(payload) {
    const picker = document.getElementById('applica-persona-picker');
    if (!picker) return;
    if (payload.error) {
      lastPersonas = [];
      syncProfilePickerLayout();
      picker.innerHTML = `<option value="">${escapeHtml(payload.error)}</option>`;
      picker.disabled = true;
      updateProfileCard(null);
      return;
    }
    const personas = payload.data?.personas || [];
    lastPersonas = personas;
    syncProfilePickerLayout();
    picker.disabled = false;
    picker.innerHTML = personas.length
      ? personas.map((p) => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.title || p.name || 'Persona')}</option>`).join('')
      : '<option value="">No personas</option>';
    if (personas.length > 0) {
      const savedPersonaId = await loadSelectedPersonaId();
      const selectedPersona =
        (savedPersonaId && personas.find((p) => String(p.id) === savedPersonaId)) || personas[0];
      picker.value = String(selectedPersona.id);
      saveSelectedPersonaId(selectedPersona.id);
      updateProfileCard(selectedPersona);
      fetchOpenings(selectedPersona.id);
      fetchApplications(selectedPersona.id);
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

  function saveDrawerViewState(view, openingId) {
    drawerViewMemory = { view, openingId: openingId ?? null };
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        chrome.storage.local.set({
          [STORAGE.DRAWER_VIEW_STATE]: drawerViewMemory
        }, () => {});
      }
    } catch (_) {}
  }

  function saveApplicationsViewState() {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        chrome.storage.local.set({
          [STORAGE.DRAWER_APPLICATIONS_VIEW]: applicationsViewMemory
        }, () => {});
      }
    } catch (_) {}
  }

  function loadApplicationsViewState() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
          resolve(null);
          return;
        }
        chrome.storage.local.get([STORAGE.DRAWER_APPLICATIONS_VIEW], (data) => {
          try {
            const raw = data?.[STORAGE.DRAWER_APPLICATIONS_VIEW];
            if (raw && (raw.view === 'list' || raw.view === 'detail')) {
              resolve({
                view: raw.view,
                applicationId: raw.applicationId ?? null
              });
            } else {
              resolve(null);
            }
          } catch (_) {
            resolve(null);
          }
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function loadDrawerViewState() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
          resolve(null);
          return;
        }
        chrome.storage.local.get([STORAGE.DRAWER_VIEW_STATE], (data) => {
          try {
            const raw = data?.[STORAGE.DRAWER_VIEW_STATE];
            if (raw && (raw.view === 'list' || raw.view === 'detail')) {
              resolve({ view: raw.view, openingId: raw.openingId ?? null });
            } else {
              resolve(null);
            }
          } catch (_) {
            resolve(null);
          }
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  let currentPageUrl = null;
  let currentAnalyzingOpening = null;
  let lastOpeningsPayload = null;

  window.addEventListener('message', async (event) => {
    if (event.data?.type === 'applica-drawer-opened') {
      currentPageUrl = event.data.currentPageUrl || null;
      if (lastOpeningsPayload) renderOpenings(lastOpeningsPayload);
      if (lastApplicationsPayload) renderApplications(lastApplicationsPayload);
      refreshAuthState();
      const storedApps = await loadApplicationsViewState();
      if (storedApps) {
        applicationsViewMemory = storedApps;
      }
      const storedOpenings = await loadDrawerViewState();
      if (storedOpenings) {
        drawerViewMemory = storedOpenings;
      }
      if (isApplicationDetailActive()) {
        applyDrawerLayout();
      } else if (storedOpenings) {
        applyDrawerViewStateSync();
      } else {
        tryShowDetailViewForCurrentPage();
        if (!isOpeningDetailActive()) {
          tryShowApplicationDetailForCurrentPage();
        }
      }
      return;
    }
    if (event.data?.type === 'applica-page-data') {
      handlePageDataForAnalyze(event.data);
    }
    if (event.data?.type === 'applica-show-api-error-banner') {
      showApiErrorBanner();
    }
    if (event.data?.type === 'applica-fill-form-result') {
      const r = event.data;
      if (r.error) {
        showApiErrorBanner();
        setAnalyzeStatus('error', r.error);
      } else if (r.filled != null && r.total != null) {
        let msg = r.filled > 0 ? `Filled ${r.filled} of ${r.total} fields.` : 'No matching form fields found.';
        if (r.resumeAttached > 0) {
          msg += ' Resume attached.';
        } else if (r.resumeAttached === 0 && r.total > 0) {
          msg += ' No resume file input found.';
        }
        setAnalyzeStatus('', msg);
        setTimeout(() => setAnalyzeStatus('', ''), 4000);
      }
    }
  });

  let pendingAnalyzePersonaId = null;
  let openingsPollIntervalId = null;
  let openingsPollDelayId = null;
  let openingsPollStopId = null;
  let pollingWatchOpeningId = null;

  const OPENINGS_POLL_INTERVAL_MS = 2000;
  const OPENINGS_POLL_INITIAL_DELAY_MS = 30000;
  const OPENINGS_POLL_MAX_DURATION_MS = 90000;

  function startOpeningsPoll(personaId, options = {}) {
    stopOpeningsPoll();
    if (!personaId) return;

    const delayMs =
      options.delayMs != null ? options.delayMs : OPENINGS_POLL_INITIAL_DELAY_MS;
    const maxPollMs =
      options.maxPollMs != null ? options.maxPollMs : OPENINGS_POLL_MAX_DURATION_MS;
    pollingWatchOpeningId = options.openingId ?? null;

    const beginPolling = () => {
      const pollOnce = () => {
        fetchOpenings(personaId, {
          silent: true,
          watchOpeningId: pollingWatchOpeningId
        });
      };
      pollOnce();
      openingsPollIntervalId = setInterval(pollOnce, OPENINGS_POLL_INTERVAL_MS);
      openingsPollStopId = setTimeout(stopOpeningsPoll, maxPollMs);
    };

    if (delayMs > 0) {
      openingsPollDelayId = setTimeout(beginPolling, delayMs);
    } else {
      beginPolling();
    }
  }

  function stopOpeningsPoll() {
    if (openingsPollDelayId != null) {
      clearTimeout(openingsPollDelayId);
      openingsPollDelayId = null;
    }
    if (openingsPollIntervalId != null) {
      clearInterval(openingsPollIntervalId);
      openingsPollIntervalId = null;
    }
    if (openingsPollStopId != null) {
      clearTimeout(openingsPollStopId);
      openingsPollStopId = null;
    }
    pollingWatchOpeningId = null;
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
    el.className = 'drawer-hint drawer-global-status' + (kind === 'error' ? ' drawer-status-error' : '');
  }

  function setApplicationDetailSaveStatus(kind, message) {
    const el = document.getElementById('application-detail-save-status');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
    el.classList.remove('is-error', 'is-success');
    if (kind === 'error') el.classList.add('is-error');
    if (kind === 'success') el.classList.add('is-success');
  }

  function setDrawerFeedback(kind, message) {
    setAnalyzeStatus(kind === 'success' ? '' : kind, message);
    if (isApplicationDetailActive()) {
      setApplicationDetailSaveStatus(kind, message);
    }
  }

  async function submitOpeningFromPage(url, html, personaId, btn) {
    currentAnalyzingOpening = { url, title: 'Analyzing job posting…', company: '' };
    renderOpenings(lastOpeningsPayload || { loggedIn: true, data: { openings: [], limits: {} } });
    try {
      const data = await window.ApplicaAPI.appFetchJson('/api/openings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, persona_id: personaId, html })
      });
      if (data.opening) currentAnalyzingOpening = data.opening;
      fetchOpenings(personaId);
      const watchId = data.opening?.id ?? null;
      startOpeningsPoll(personaId, { openingId: watchId });
      setTimeout(() => setAnalyzeStatus('', ''), 3000);
    } catch (err) {
      showApiErrorBanner();
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
      saveSelectedPersonaId(id || null);
      const persona = id ? lastPersonas.find((p) => String(p.id) === id) : null;
      updateProfileCard(persona || null);
      if (id) {
        fetchOpenings(id);
        fetchApplications(id);
      }
    });
  }

  function openUrlInNewTab(url) {
    openJobPostingUrl(url, { sameTab: false });
  }

  /**
   * Open a job URL and keep drawer context (application detail, etc.) across navigation.
   * Same-tab: navigates the host page and reopens the drawer there (default from application detail).
   * New tab: opens a tab with drawer auto-open; persisted view state restores application detail.
   */
  function openJobPostingUrl(url, options = {}) {
    if (!url) return;
    const sameTab = options.sameTab === true;
    saveApplicationsViewState();
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: sameTab ? 'applica-navigate-to' : 'applica-open-tab', url },
        '*'
      );
    } else if (sameTab) {
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function handleDeleteQueueItem(openingId) {
    const personaId = personaPicker?.value;
    if (!personaId) return;
    try {
      await window.ApplicaAPI.appFetchJson(`/api/openings/${openingId}`, { method: 'DELETE' });
      fetchOpenings(personaId);
    } catch (err) {
      showApiErrorBanner();
      setAnalyzeStatus('error', err?.message || 'Could not remove.');
    }
  }

  async function handleBulkDeleteBelowScore(threshold) {
    const personaId = personaPicker?.value;
    if (!personaId) return;
    const confirmed = window.confirm(
      'Delete all jobs with a match score below ' + threshold + '? This cannot be undone.'
    );
    if (!confirmed) return;
    try {
      const data = await window.ApplicaAPI.appFetchJson(
        '/api/openings/bulk?persona_id=' +
          encodeURIComponent(personaId) +
          '&score=' +
          encodeURIComponent(String(threshold)),
        { method: 'DELETE' }
      );
      if (selectedOpening) showOpeningsList();
      setAnalyzeStatus('', data.message || 'Deleted.');
      fetchOpenings(personaId);
      setTimeout(() => setAnalyzeStatus('', ''), 4000);
    } catch (err) {
      showApiErrorBanner();
      setAnalyzeStatus('error', err?.message || 'Could not delete openings.');
    }
  }

  function closeBulkDeleteMenu() {
    const menu = document.getElementById('openings-bulk-delete-menu');
    const toggle = document.getElementById('openings-bulk-delete-toggle');
    const chevron = document.getElementById('openings-bulk-delete-chevron');
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (chevron) chevron.innerHTML = '<path d="m6 9 6 6 6-6"></path>';
  }

  function openBulkDeleteMenu() {
    const menu = document.getElementById('openings-bulk-delete-menu');
    const toggle = document.getElementById('openings-bulk-delete-toggle');
    const chevron = document.getElementById('openings-bulk-delete-chevron');
    if (menu) menu.hidden = false;
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (chevron) chevron.innerHTML = '<path d="m18 15-6-6-6 6"></path>';
  }

  const bulkDeleteToggle = document.getElementById('openings-bulk-delete-toggle');
  const bulkDeleteMenu = document.getElementById('openings-bulk-delete-menu');
  const bulkDeleteWrap = document.querySelector('.drawer-bulk-delete-wrap');

  if (bulkDeleteMenu) {
    bulkDeleteMenu.querySelectorAll('[data-bulk-delete-score]').forEach((btn) => {
      const score = Number(btn.getAttribute('data-bulk-delete-score'));
      btn.style.cssText = scoreBadgeStyle(score);
    });
  }

  if (bulkDeleteToggle && bulkDeleteMenu) {
    bulkDeleteToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (bulkDeleteMenu.hidden) openBulkDeleteMenu();
      else closeBulkDeleteMenu();
    });

    bulkDeleteMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bulk-delete-score]');
      if (!btn) return;
      e.stopPropagation();
      closeBulkDeleteMenu();
      const threshold = btn.getAttribute('data-bulk-delete-score');
      if (threshold) handleBulkDeleteBelowScore(threshold);
    });
  }

  document.addEventListener('click', (e) => {
    if (bulkDeleteWrap && !bulkDeleteWrap.contains(e.target)) closeBulkDeleteMenu();
  });

  function showOpeningDetail(opening) {
    selectedOpening = opening;
    applicationsViewMemory = { view: 'list', applicationId: null };
    saveDrawerViewState('detail', opening.id ?? null);
    applyDrawerLayout();
    const matchingAppsEl = document.getElementById('opening-detail-matching-apps');
    const matchingAppsTitleEl = matchingAppsEl?.querySelector('.drawer-detail-matching-apps-title');
    const matchingAppsListEl = matchingAppsEl?.querySelector('.drawer-detail-matching-apps-list');
    const apps = opening.matching_applications;
    if (matchingAppsEl && Array.isArray(apps) && apps.length > 0) {
      matchingAppsEl.hidden = false;
      if (matchingAppsTitleEl) {
        matchingAppsTitleEl.textContent = 'You have applied at this company:';
      }
      if (matchingAppsListEl) {
        matchingAppsListEl.innerHTML = apps.map((a) => {
          const company = escapeHtml(a.company || '');
          const title = escapeHtml(a.title || '');
          const appliedAt = a.applied_at ? escapeHtml(String(a.applied_at).slice(0, 10)) : '';
          return '<li class="drawer-detail-matching-apps-item">' +
            (company ? '<span class="drawer-detail-matching-apps-company">' + company + '</span>' : '') +
            (title ? ' – ' + title : '') +
            (appliedAt ? ' <span class="drawer-detail-matching-apps-date">(' + appliedAt + ')</span>' : '') +
            '</li>';
        }).join('');
      }
    } else if (matchingAppsEl) {
      matchingAppsEl.hidden = true;
    }

    document.getElementById('opening-detail-company').textContent = opening.company || '—';
    document.getElementById('opening-detail-position').textContent = opening.title || '—';
    const resumeEl = document.getElementById('opening-detail-resume');
    if (opening.cv_filename) {
      if (opening.cv_url) {
        resumeEl.innerHTML =
          'Resume: <a href="' + escapeHtml(opening.cv_url) + '" class="drawer-opening-detail-resume-link" download target="_blank" rel="noopener">' + escapeHtml(opening.cv_filename) + '</a>';
      } else {
        resumeEl.textContent = 'Resume: ' + opening.cv_filename;
      }
      resumeEl.hidden = false;
    } else {
      resumeEl.textContent = '';
      resumeEl.hidden = true;
    }
    let mainScore = null;
    if (opening.current_match_score != null && opening.current_match_score !== '') {
      const n = Number(opening.current_match_score);
      mainScore = n > 10 ? Math.round(n) : Math.round(n * 10);
    } else {
      mainScore = getScoreFromAnalysis(opening.resume_analysis, 'match_score');
    }
    const scoreWrap = document.getElementById('opening-detail-score-wrap');
    if (scoreWrap) {
      if (mainScore != null && mainScore > 0) {
        scoreWrap.hidden = false;
        const scoreValueEl = document.getElementById('opening-detail-score-value');
        const scoreBarEl = document.getElementById('opening-detail-score-bar');
        const scoreLabelEl = document.getElementById('opening-detail-score-label');
        const color = scoreColor(mainScore);
        if (scoreValueEl) {
          scoreValueEl.textContent = mainScore;
          scoreValueEl.style.color = color;
        }
        if (scoreBarEl) {
          scoreBarEl.style.width = Math.min(100, Math.max(0, mainScore)) + '%';
          scoreBarEl.style.backgroundColor = color;
        }
        applyScoreSentimentBadge(scoreLabelEl, mainScore);
        const analysis = opening.resume_analysis || {};
        const skillScore = getScoreFromAnalysis(analysis, 'skill_match_score');
        const experienceScore = getScoreFromAnalysis(analysis, 'experience_match_score');
        const educationScore = getScoreFromAnalysis(analysis, 'education_match_score');
        setCategoryScore('skill', skillScore);
        setCategoryScore('experience', experienceScore);
        setCategoryScore('education', educationScore);
      } else {
        scoreWrap.hidden = true;
      }
    }
    updateOpeningDetailScoringIndicator(opening);
    const openLink = document.getElementById('opening-detail-open-url');
    openLink.href = opening.url || '#';
    openLink.hidden = !opening.url;
    syncOpeningDetailApplicationActions(opening);
    renderCustomResumeSection(opening);
    applyDrawerLayout();
  }

  function showOpeningsList() {
    selectedOpening = null;
    saveDrawerViewState('list', null);
    applyDrawerLayout();
    const personaId = document.getElementById('applica-persona-picker')?.value;
    if (personaId) fetchApplications(personaId, { silent: true });
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
      const row = e.target.closest('.drawer-worklist-item[data-url]');
      if (row) {
        e.preventDefault();
        e.stopPropagation();
        const openingId = row.getAttribute('data-opening-id');
        const url = row.getAttribute('data-url');
        let opening = null;
        if (openingId) {
          const openings = lastOpeningsPayload?.data?.openings;
          opening = Array.isArray(openings)
            ? openings.find((o) => o != null && String(o.id) === openingId)
            : null;
          if (!opening) {
            const companyEl = row.querySelector('.drawer-worklist-item-company');
            const positionEl = row.querySelector('.drawer-worklist-item-position');
            const resumeEl = row.querySelector('.drawer-worklist-item-resume-name');
            const scoreBadge = row.querySelector('.drawer-worklist-match-badge');
            opening = {
              id: openingId,
              url: url || undefined,
              company: companyEl?.textContent?.trim() || '',
              title: positionEl?.textContent?.trim() || '',
              cv_filename: resumeEl?.textContent?.trim() || undefined,
              current_match_score: scoreBadge?.textContent?.trim()?.replace(/%$/, '') || undefined
            };
          }
        }
        if (opening) {
          showOpeningDetail(opening);
        } else {
          openUrlInNewTab(url);
        }
        return;
      }
      const link = e.target.closest('a.drawer-opening-link');
      if (link?.href) {
        e.preventDefault();
        e.stopPropagation();
        openUrlInNewTab(link.href);
        return;
      }
      const queueItem = e.target.closest('.drawer-queue-item[data-url]');
      if (queueItem) {
        e.preventDefault();
        openUrlInNewTab(queueItem.getAttribute('data-url'));
      }
    });
  }

  const applicationDetailBack = document.getElementById('application-detail-back');
  if (applicationDetailBack) {
    applicationDetailBack.addEventListener('click', () => showApplicationsList());
  }

  const applicationsSection = document.getElementById('applications-section-content');
  const applicationsList = document.getElementById('applications-list');
  if (applicationsSection) {
    applicationsSection.addEventListener('click', (e) => {
      if (e.target.closest('#application-detail-view')) return;
      if (e.target.closest('select.drawer-application-row-status')) return;
      const row = e.target.closest('.drawer-application-item[data-application-id]');
      if (!row) return;
      e.preventDefault();
      const applicationId = row.getAttribute('data-application-id');
      const apps = lastApplicationsPayload?.data?.applications || [];
      const app = apps.find((a) => a != null && String(a.id) === applicationId);
      if (app) showApplicationDetail(app);
    });
  }

  if (applicationsList) {
    applicationsList.addEventListener('mousedown', (e) => {
      if (e.target.closest('select.drawer-application-row-status')) {
        e.stopPropagation();
      }
    });
    applicationsList.addEventListener('change', async (e) => {
      const select = e.target.closest('select.drawer-application-row-status');
      if (!select) return;
      const applicationId = select.getAttribute('data-application-id');
      const status = select.value;
      if (!applicationId || !status) return;
      select.disabled = true;
      try {
        const updated = await updateApplication(applicationId, { status });
        patchApplicationInList(applicationId, { status: updated.status });
        if (selectedApplication != null && String(selectedApplication.id) === applicationId) {
          selectedApplication = { ...selectedApplication, status: updated.status };
          if (isApplicationDetailActive()) {
            fillApplicationFields(selectedApplication);
          }
        }
        if (!isApplicationDetailActive()) {
          setDrawerFeedback('success', 'Status updated.');
          setTimeout(() => setDrawerFeedback('', ''), 2500);
        }
      } catch (err) {
        const apps = lastApplicationsPayload?.data?.applications || [];
        const app = apps.find((a) => a != null && String(a.id) === applicationId);
        if (app) select.value = normalizeApplicationStatus(app.status);
        setDrawerFeedback('error', err?.message || 'Could not update status.');
      } finally {
        select.disabled = false;
      }
    });
  }

  initApplicationFormSelects();

  const applicationDetailSave = document.getElementById('application-detail-save');
  if (applicationDetailSave) {
    applicationDetailSave.addEventListener('click', async () => {
      const appId = selectedApplication?.id;
      if (!appId) {
        setDrawerFeedback('error', 'Could not save — open the application again.');
        return;
      }
      const saveLabel = applicationDetailSave.textContent;
      applicationDetailSave.disabled = true;
      setApplicationDetailSaveStatus('', 'Saving…');
      try {
        const fields = readApplicationFields();
        if (!fields.status) {
          throw new Error('Status is required.');
        }
        const updated = await updateApplication(appId, fields);
        selectedApplication = updated;
        upsertApplicationInList(updated);
        fillApplicationFields(updated);
        setApplicationDetailSaveStatus('success', 'Application saved.');
        setTimeout(() => setApplicationDetailSaveStatus('', ''), 3000);
      } catch (err) {
        setApplicationDetailSaveStatus('error', err?.message || 'Could not save application.');
      } finally {
        applicationDetailSave.disabled = false;
        applicationDetailSave.textContent = saveLabel;
      }
    });
  }

  const applicationDetailOpenLink = document.getElementById('application-detail-open-link');
  if (applicationDetailOpenLink) {
    applicationDetailOpenLink.addEventListener('click', (e) => {
      e.preventDefault();
      const href = applicationDetailOpenLink.getAttribute('href');
      if (!href || href === '#') return;
      const sameTab = !(e.metaKey || e.ctrlKey || e.shiftKey);
      openJobPostingUrl(href, { sameTab });
    });
  }

  const openingDetailBack = document.getElementById('opening-detail-back');
  if (openingDetailBack) {
    openingDetailBack.addEventListener('click', () => showOpeningsList());
  }

  const openingDetailFillForm = document.getElementById('opening-detail-fill-form');
  if (openingDetailFillForm) {
    openingDetailFillForm.addEventListener('click', async () => {
      if (!selectedOpening?.id || window.parent === window) return;
      setAnalyzeStatus('', 'Filling form…');
      try {
        const data = await window.ApplicaAPI.appFetchJson(
          '/api/openings/' + encodeURIComponent(selectedOpening.id) + '/form_details'
        );
        const formData = data.form_data;
        if (!formData || typeof formData !== 'object') {
          showApiErrorBanner();
          setAnalyzeStatus('error', 'Invalid response: form_data missing.');
          return;
        }
        window.parent.postMessage({ type: 'applica-fill-form-with-data', form_data: formData }, '*');
      } catch (err) {
        showApiErrorBanner();
        setAnalyzeStatus('error', err?.message || 'Request failed.');
      }
    });
  }

  const openingDetailOpenUrl = document.getElementById('opening-detail-open-url');
  if (openingDetailOpenUrl) {
    openingDetailOpenUrl.addEventListener('click', (e) => {
      e.preventDefault();
      if (selectedOpening?.url) openUrlInNewTab(selectedOpening.url);
    });
  }

  const openingDetailRemove = document.getElementById('opening-detail-remove');
  if (openingDetailRemove) {
    openingDetailRemove.addEventListener('click', async () => {
      if (!selectedOpening?.id) return;
      setAnalyzeStatus('', 'Recording application…');
      try {
        const data = await window.ApplicaAPI.appFetchJson('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opening_id: String(selectedOpening.id) })
        });
        const personaId = personaPicker?.value;
        selectedApplication = data.application || null;
        selectedOpening = {
          ...selectedOpening,
          has_application: true,
          linked_application: data.application || null
        };
        upsertApplicationInList(data.application);
        syncOpeningDetailApplicationActions(selectedOpening);
        renderCustomResumeSection(selectedOpening);
        if (personaId) {
          await fetchApplications(personaId, { silent: true });
          await fetchOpenings(personaId, { silent: true });
        }
        setAnalyzeStatus('', 'Application recorded.');
        setTimeout(() => setAnalyzeStatus('', ''), 3000);
      } catch (err) {
        showApiErrorBanner();
        setAnalyzeStatus('error', err?.message || 'Request failed.');
      }
    });
  }

  const openingDetailResumeUpload = document.getElementById('opening-detail-resume-upload');
  const openingDetailUploadResumeBtn = document.getElementById('opening-detail-upload-resume');
  if (openingDetailUploadResumeBtn && openingDetailResumeUpload) {
    openingDetailUploadResumeBtn.addEventListener('click', () => {
      openingDetailResumeUpload.click();
    });
    openingDetailResumeUpload.addEventListener('change', () => {
      const file = openingDetailResumeUpload.files?.[0];
      if (!file) return;
      submitCustomResumeUpload(file);
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
