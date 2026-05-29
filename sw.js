/* ============================================================
   SmartStock Pro — Service Worker
   Version: 1.0.0
   Caches all app files for offline use.
   Update CACHE_NAME whenever you deploy new files.
   ============================================================ */

const CACHE_NAME = 'smartstock-v1';

// Files to cache on install
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/reset.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/forms.css',
  '/css/pages.css',
  '/css/print.css',
  '/js/app.js',
  '/manifest.json',
];

// ── INSTALL: cache all app files ──────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing SmartStock Pro v1');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Caching app files');
        // addAll fails if any file fails — use individual adds for resilience
        return Promise.allSettled(
          FILES_TO_CACHE.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Failed to cache:', url, err.message);
            });
          })
        );
      })
      .then(function() {
        console.log('[SW] Install complete');
        // Take control immediately without waiting for old SW to unload
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE: delete old caches ───────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating');
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function(name) { return name !== CACHE_NAME; })
            .map(function(name) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(function() {
        console.log('[SW] Now controlling all clients');
        return self.clients.claim();
      })
  );
});

// ── FETCH: cache-first for app files, network-only for API ─
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Never intercept:
  // 1. API calls (AI assistant serverless function)
  // 2. Firebase requests (realtime DB, auth, storage)
  // 3. Non-GET requests (POST, etc.)
  // 4. Chrome extensions
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('firebaseio') ||
    url.hostname.includes('firebaseapp') ||
    url.protocol === 'chrome-extension:'
  ) {
    // Let these go straight to network
    return;
  }

  // Cache-first strategy for app files
  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        if (cachedResponse) {
          // Serve from cache immediately
          // Also fetch fresh copy in background for next visit
          var fetchPromise = fetch(event.request)
            .then(function(networkResponse) {
              if (networkResponse && networkResponse.status === 200) {
                var responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                  cache.put(event.request, responseClone);
                });
              }
              return networkResponse;
            })
            .catch(function() {
              // Network failed — that's fine, we already have cache
            });

          return cachedResponse;
        }

        // Not in cache — fetch from network and cache it
        return fetch(event.request)
          .then(function(networkResponse) {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
              return networkResponse;
            }
            var responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseClone);
            });
            return networkResponse;
          })
          .catch(function() {
            // Completely offline and not in cache
            // Return a basic offline page for HTML requests
            if (event.request.destination === 'document') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});

// ── MESSAGE: force update from app ────────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(function() {
      console.log('[SW] Cache cleared');
    });
  }
});
