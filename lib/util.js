/**
 * Small DOM helpers shared by the drawer (and future extension pages).
 */
(function () {
  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
  }

  window.ApplicaUtil = {
    escapeHtml,
    setVisible
  };
})();
