/**
 * Applica Extension - Background Service Worker
 * Toggles the drawer when the extension icon is clicked. On non-app pages we inject
 * the content script on demand (activeTab grants access); the callback tab closes itself.
 */

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
