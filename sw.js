// shortcut: cache-first; bump CACHE on every deploy or phones keep the old version.
const CACHE = 'money-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'ui.js', 'store.js', 'logic.js',
  'screens/entry-form.js', 'screens/home.js', 'screens/history.js', 'screens/debts.js', 'screens/todo.js', 'screens/settings.js',
  'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', e =>
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request))));
