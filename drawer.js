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

  function requestPersonas() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'applica-get-personas' }, '*');
    }
  }

  function requestOpenings(personaId) {
    if (window.parent !== window && personaId) {
      window.parent.postMessage({ type: 'applica-get-openings', persona_id: personaId }, '*');
    }
  }

  function renderOpenings(payload) {
    const listEl = document.getElementById('score-queue-list');
    if (!listEl) return;
    if (!payload.loggedIn) {
      listEl.innerHTML = '';
      return;
    }
    if (payload.error) {
      listEl.innerHTML = `<p class="drawer-hint">${payload.error}</p>`;
      return;
    }
    const data = payload.data;
    if (data?.openings && data.openings.length > 0) {
      listEl.innerHTML = data.openings.map((o) => `<div class="drawer-opening-item">${escapeHtml(o.title || o.name || 'Opening')}</div>`).join('');
    } else if (data?.message) {
      listEl.innerHTML = `<p class="drawer-hint">${escapeHtml(data.message)}</p>`;
    } else {
      listEl.innerHTML = '<p class="drawer-hint">No openings yet.</p>';
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderPersonas(payload) {
    const picker = document.getElementById('applica-persona-picker');
    if (!picker) return;
    if (!payload.loggedIn || payload.error) {
      picker.innerHTML = '<option value="">Not signed in</option>';
      picker.disabled = true;
      return;
    }
    const personas = payload.data?.personas || [];
    picker.disabled = false;
    picker.innerHTML = personas.length
      ? personas.map((p) => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.name || p.title || 'Persona')}</option>`).join('')
      : '<option value="">No personas</option>';
    if (personas.length > 0) {
      picker.value = String(personas[0].id);
      requestOpenings(personas[0].id);
    }
  }

  async function refreshAuthState() {
    const user = await window.ApplicaAPI.getStoredUser();
    if (user && user.email) {
      signedInEmail.textContent = user.email;
      showSection('signed-in');
      requestPersonas();
    } else {
      showSection('login');
    }
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'applica-drawer-opened') {
      refreshAuthState();
    }
    if (event.data?.type === 'applica-personas') {
      renderPersonas(event.data);
    }
    if (event.data?.type === 'applica-openings') {
      renderOpenings(event.data);
    }
  });

  const personaPicker = document.getElementById('applica-persona-picker');
  if (personaPicker) {
    personaPicker.addEventListener('change', () => {
      const id = personaPicker.value;
      if (id) requestOpenings(id);
    });
  }

  openLoginTabBtn.addEventListener('click', async () => {
    const origin = await ApplicaAPI.getAppOrigin();
    const base = origin.replace(/\/$/, '');
    const redirectUri = encodeURIComponent(chrome.runtime.getURL('auth.html'));
    const loginUrl = `${base}/user/log_in?redirect_extension=1&redirect_uri=${redirectUri}`;
    chrome.tabs.create({ url: loginUrl });
  });

  signOutBtn.addEventListener('click', async () => {
    await window.ApplicaAPI.clearAuthToken();
    refreshAuthState();
  });

  closeDrawerBtn.addEventListener('click', () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'applica-drawer-close' }, '*');
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes[window.ApplicaAPI.STORAGE_KEYS.AUTH_TOKEN] || changes[window.ApplicaAPI.STORAGE_KEYS.USER])) {
      refreshAuthState();
    }
  });

  refreshAuthState();

  // Tell parent we're ready so it can send drawer-opened and/or push personas (avoids race after extension reload)
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'applica-drawer-ready' }, '*');
  }
})();
