const CACHE = 'slots-main-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.sample.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k!==CACHE ? caches.delete(k) : null)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  // Network-first for HTML, cache-first for others
  if(req.headers.get('accept')?.includes('text/html')){
    e.respondWith(fetch(req).then(res=>{
      const copy = res.clone(); caches.open(CACHE).then(c=>c.put(req, copy));
      return res;
    }).catch(()=>caches.match(req)));
  }else{
    e.respondWith(caches.match(req).then(cached=> cached || fetch(req).then(res=>{
      const copy = res.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); return res;
    })));
  }
});
