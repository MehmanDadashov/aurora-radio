/* AURORA RADIO — service worker.
   Стратегия: HTML всегда с сети (network-first), статика и данные — с кеша.
   Версия кеша поднята при каждом ре-deploy, чтобы старый UI не залипал. */
const CACHE = 'aurora-radio-v7';
const CORE = [
  '/js/app.js?v=4', '/js/i18n.js?v=4', '/js/i18n-en.js?v=4', '/js/i18n-ru.js?v=4', '/js/aurora-ads.js?v=4',
  '/icon.png', '/manifest.json',
  '/data/countries.json.gz', '/data/genres.json.gz', '/data/languages.json.gz', '/data/meta.json'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;

  /* навигация: сначала сеть, иначе кеш (чтобы не отдавать устаревший index.html) */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put('/index.html', cp));
        return r;
      }).catch(() => caches.match('/index.html').then(c => c || caches.match('/')))
    );
    return;
  }

  /* каталог: кеш-first, обновление в фоне */
  if (u.pathname.startsWith('/data/')) {
    e.respondWith(
      caches.match(req).then(c => c || fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(x => x.put(req, cp));
        return r;
      }))
    );
    return;
  }

  /* статика: кеш-first (версионируется через ?v=) */
  e.respondWith(
    caches.match(req).then(c => c || fetch(req).then(r => {
      if (r.ok) {
        const cp = r.clone();
        caches.open(CACHE).then(x => x.put(req, cp));
      }
      return r;
    }))
  );
});
