const CACHE = 'point-of-sale-umkm-v1-7';
const OFFLINE = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ponytail: /api/* & lintas-origin tidak dicache (data toko tidak boleh tersimpan di perangkat bersama).
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const ambil = () => fetch(req);
  event.respondWith(
    // ponytail: navigasi dicoba ulang sekali agar sinyal putus-nyambung tidak langsung ke halaman offline.
    ambil()
      .catch(() => req.mode === 'navigate' ? new Promise(r => setTimeout(r, 800)).then(ambil) : Promise.reject())
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(c => c || (req.mode === 'navigate' ? caches.match(OFFLINE) : Response.error())))
  );
});
