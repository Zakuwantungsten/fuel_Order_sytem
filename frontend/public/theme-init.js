// Runs synchronously before React to prevent flash of wrong theme.
// Kept as an external file so Content-Security-Policy script-src 'self'
// is satisfied without needing 'unsafe-inline'.
(function () {
  try {
    var theme = localStorage.getItem('fuel_order_theme');
    if (
      theme === 'dark' ||
      (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
