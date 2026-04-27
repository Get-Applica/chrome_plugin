/**
 * Applica Extension - Background Service Worker
 * Toggles the drawer when the extension icon is clicked. On non-app pages we inject
 * the content script on demand (activeTab grants access); the callback tab closes itself.
 * When the user navigates from the drawer (e.g. "Open job posting"), we re-inject on
 * the new page so the drawer reopens there.
 */

const REOPEN_DRAWER_TS_KEY = 'applica_reopen_drawer_ts';
const REOPEN_DRAWER_TTL_MS = 20000; // 20 seconds to prevent re-injection on every page load

// Content script asks us to set the reopen timestamp before navigating (avoids "Extension context invalidated")
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'applica-will-navigate' && message.url) {
    chrome.storage.local.set({ [REOPEN_DRAWER_TS_KEY]: Date.now() }, () => {
      sendResponse({ ok: true });
    });
    return true; // keep channel open for async sendResponse
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    // Inject script and CSS so the drawer works on any page (content_scripts only run on app.getapplica.com)
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/content.css'],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/config.js', 'content/content.js'],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.dispatchEvent(new CustomEvent('applica-drawer-toggle'));
      },
    });
  } catch (e) {
    // Tab may not allow scripting (e.g. chrome://); ignore
    console.debug('Applica: could not toggle drawer', e);
  }
});

// When user clicks "Open job posting" (or similar), content script sets REOPEN_DRAWER_TS and navigates.
// The new page does not have our content script by default; inject it here so the drawer reopens.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab?.url?.startsWith('http')) return;
  chrome.storage.local.get([REOPEN_DRAWER_TS_KEY], (data) => {
    const ts = data[REOPEN_DRAWER_TS_KEY];
    if (!ts || Date.now() - ts > REOPEN_DRAWER_TTL_MS) return;
    try {
      chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] });
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['lib/config.js', 'content/content.js'],
      });
      // Content script will see REOPEN_DRAWER_TS and call openDrawer() on load
    } catch (e) {
      console.debug('Applica: could not re-inject for reopen', e);
    }
  });
});
