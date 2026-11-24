const CACHE = 'bumbum-v3';
const FILES = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/core.js', 'js/dsp.js', 'js/audio.js', 'js/sequencer.js', 'js/ui.js', 'js/pianoroll.js', 'js/sampler.js', 'js/synth.js', 'js/library.js', 'js/main.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    if (r.ok && new URL(e.request.url).origin === location.origin) caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
