// Service Worker for DPT-AlaDin RT/RW Net
// Handles Background Push Notifications, Offline Caching & Notification Clicks

const CACHE_NAME = 'dpt-aladin-sw-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/api/app-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png'
];

// Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('SW: Cache pre-fill skipped for some assets', err);
      });
    })
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Push Event: Received push payload from server / gateway
self.addEventListener('push', (event) => {
  let data = {
    title: '🚨 Tugas Planning Baru Diterima!',
    body: 'Anda memiliki tugas planning pekerjaan baru. Ketuk untuk melihat detail.',
    icon: '/api/app-icon.png',
    badge: '/pwa-192x192.png',
    tag: 'planning-task-notification',
    url: '/'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      const text = event.data.text();
      if (text) data.body = text;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/api/app-icon.png',
    badge: data.badge || '/pwa-192x192.png',
    vibrate: [200, 100, 200, 100, 200, 100, 400],
    tag: data.tag || `planning-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/',
      planId: data.planId,
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'view_planning',
        title: '📋 Buka Tugas'
      },
      {
        action: 'dismiss',
        title: 'Tutup'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Handler: Opens/focuses the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';
  const planData = event.notification.data;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and post a navigation message
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_OPEN_PLANNING',
            payload: planData
          });
          return client.focus();
        }
      }

      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Fetch Event: Network-first with cache fallback for offline support
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and http/https schemes
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Skip caching API/backend dynamic requests
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// Message listener from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_LOCAL_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, {
      icon: '/api/app-icon.png',
      badge: '/pwa-192x192.png',
      vibrate: [200, 100, 200, 100, 200],
      ...options
    });
  }
});
