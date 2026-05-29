/* SmartStock Pro — Service Worker
   Phase 4 will add offline caching here */
self.addEventListener('install', () => {});
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
