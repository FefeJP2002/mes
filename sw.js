// Cache hors ligne : change CACHE à chaque nouvelle version
const CACHE='mes-v1.1.1';
const FILES=["./", "index.html", "app.js", "pdf-lib.min.js", "fiches.json", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "templates/attest-cheminee.pdf", "templates/attest-etancheite.pdf", "templates/attest-isolation.pdf", "templates/attest-ventilation.pdf", "templates/circulateurs.pdf", "templates/echangeurs.pdf", "templates/equilibrage-collecteurs.pdf", "templates/filtre.pdf", "templates/mise-en-eau-pression.pdf", "templates/mise-en-eau-rincage.pdf", "templates/protocole-chape.pdf", "templates/solaire.pdf", "templates/vanne-equilibrage.pdf", "templates/vase.pdf", "templates/ventil-bouche.pdf", "templates/ventil-debit.pdf", "templates/ventil-reglage.pdf"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
  if(new URL(e.request.url).pathname.endsWith('/bureau.json'))return; // toujours depuis le réseau
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{if(res.ok&&new URL(e.request.url).origin===location.origin){const cl=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cl));}return res;})));});
