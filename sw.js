/* A versão e a lista de ficheiros vêm de js/config.js — o mesmo ficheiro
   que as páginas usam. Para lançar uma versão nova basta mudar APP_VERSAO
   lá: o nome da cache e todos os ?v= mudam juntos, e a cache antiga é
   apagada no "activate". */
importScripts('js/config.js');

const V = '?v=' + APP_VERSAO;
const CACHE = 'capoeira-' + APP_VERSAO;
const SCRIPTS = Array.from(new Set(SCRIPTS_BASE.concat(PAGINA_INDEX.scripts, ...PAGINAS.map(p => p.scripts))));
const FICHEIROS = [
  './', PAGINA_INDEX.ficheiro, ...PAGINAS.map(p => p.ficheiro),
  'css/style.css' + V,
  'js/config.js',
  ...SCRIPTS.map(n => 'js/' + n + '.js' + V),
  'servidor/01-esquema.sql', 'manifest.json'
];

self.addEventListener('install', e=>{
  /* Um ficheiro em falta (ex.: upload incompleto) não pode impedir a instalação. */
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FICHEIROS.map(f=>c.add(f).catch(()=>null)))));
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
  const url = new URL(e.request.url);
  /* Respostas das Functions podem conter documentos privados. Nunca as guardamos
     na cache offline da PWA, nem devolvemos uma cópia depois de terminar a sessão. */
  if(url.origin === location.origin && url.pathname.startsWith('/.netlify/functions/')){
    e.respondWith(fetch(e.request, {cache:'no-store'}));
    return;
  }
  e.respondWith(
    fetch(e.request, {cache:'no-cache'}).then(r=>{
      if(r.ok && url.origin === location.origin){
        const copia = r.clone();
        caches.open(CACHE).then(c=>c.put(e.request, copia));
      }
      return r;
    }).catch(()=>caches.match(e.request, {ignoreSearch:true}).then(r=>r || caches.match('index.html')))
  );
});
