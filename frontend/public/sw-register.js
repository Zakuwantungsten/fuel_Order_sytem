// Registers the service worker after the page loads.
// Kept as an external file so Content-Security-Policy script-src 'self'
// is satisfied without needing 'unsafe-inline'.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js');
  });
}
