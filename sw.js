const CACHE = 'capoeira-v4';
const FICHEIROS = [
  './', 'index.html', 'inicio.html', 'gestao.html', 'alimentacao.html',
  'producao.html', 'financas.html', 'relatorios.html', 'css/style.css',
  'js/db.js', 'js/icons.js', 'js/calc.js', 'js/common.js', 'js/index.js',
  'js/inicio.js', 'js/gestao.js', 'js/alimentacao.js', 'js/producao.js',
  'js/financas.js', 'js/relatorios.js', 'manifest.json'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FICHEIROS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

/* Primeiro tenta a rede (para veres sempre a versão mais recente);
   sem internet, usa a cópia guardada. */
self.addEventListener('fetch', e=>{
  if(e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok && new URL(e.request.url).origin === location.origin){
        const copia = r.clone();
        caches.open(CACHE).then(c=>c.put(e.request, copia));
      }
      return r;
    }).catch(()=>caches.match(e.request).then(r=>r || caches.match('index.html')))
  );
});
