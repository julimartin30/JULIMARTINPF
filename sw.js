/* Permite abrir la app sin cobertura (tras haberla abierto una vez con conexión). */
const CACHE = 'entreno-v1';
const BASE = [
  './',
  'index.html',
  'css/estilos.css',
  'js/cripto.js',
  'js/util.js',
  'js/github.js',
  'js/figuras.js',
  'js/datos.js',
  'js/app.js',
  'assets/icono.svg',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Red primero (para tener siempre la última versión); caché si no hay conexión. Los datos (data/) no se cachean aquí.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/data/')) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req.url.split('?')[0], copia));
        }
        return r;
      })
      .catch(() => caches.match(req.url.split('?')[0]).then((r) => r || caches.match('index.html')))
  );
});
