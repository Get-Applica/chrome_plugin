/**
 * Applica Extension - Background Service Worker
 * Toggles the left-hand drawer when the extension icon is clicked.
 * Closes the tab after the content script stores the auth token from the app callback.
 */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
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

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'APPLICA_STORE_TOKEN_DONE' && msg.closeTab && sender.tab?.id) {
    chrome.tabs.remove(sender.tab.id);
  }
});
