/* MES Thermaclim – saisie des fiches de mise en service et édition des rapports PDF.
   Tout fonctionne hors ligne : données et photos dans IndexedDB, modèles PDF en cache. */
'use strict';
const VERSION = '1.2.1';
const DEFAULT_CHANTIERS = [
  'T26-CH0205_REPOSOIR 10 - 14B', "T26-CH0197_CLIM O'HANA", 'T26-CH0101_ARBORA B11', 'T26-CH0184_ASTERS 22',
  'T26-CH0123_SAPAY', 'T26-CH0122_MONNIAZ 121 - Jussy', 'T25-CH1209 BLANCHERIE 14-24', 'T26-CH0086_PREFAULLY 25',
  'T26-CH0104_ROVERAY 14', 'T25-CH1157_GRANGE LEVRIER 14-19 - VENT', 'T25-CH1164_Chemin de blonay 1, Veyrier', 'T25-CH1147_PRE-MONNARD'
];

/* ---------- stockage ---------- */
const DB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('mes-thermaclim', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const t = db.transaction('kv', mode); const s = t.objectStore('kv'); const q = fn(s);
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
})();

const S = { fiches: [], settings: null, chantiers: [], rapports: [], view: { name: 'home' } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const saveAll = () => Promise.all([DB.set('settings', S.settings), DB.set('chantiers', S.chantiers), DB.set('rapports', S.rapports)]);
let saveTimer; const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveAll, 400); };

function parseChantier(s) {
  const m = s.trim().match(/^(T\d{2}-CH\d+)[_\s-]*(.*)$/i);
  return { id: uid(), code: m ? m[1] : '', nom: m ? m[2].trim() : s.trim(), adresse: '' };
}

/* ---------- petits utilitaires DOM ---------- */
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
function toast(msg, ms = 2200) { const t = el('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), ms); }
function go(view) { S.view = view; render(); window.scrollTo(0, 0); }
const chantierLabel = c => [c.code, c.nom].filter(Boolean).join(' ');
const fiche = id => S.fiches.find(f => f.id === id);

/* ---------- pré-remplissage ---------- */
function prefillValue(key, ch, fi) {
  const lieu = S.settings.lieu || 'Genève';
  switch (key) {
    case 'affaire': return ch.nom || '';
    case 'numero': return ch.code || '';
    case 'adresse': return ch.adresse || '';
    case 'designation': return fi.designation || '';
    case 'nom': return S.settings.nom || '';
    case 'date': return today();
    case 'lieudate': return `${lieu}, ${today()}`;
  }
  return '';
}
function newRapport(ch, fi) {
  const r = { id: uid(), chantierId: ch.id, ficheId: fi.id, titre: '', values: {}, photos: {}, rows: {}, sig: S.settings.signature ? 'saved' : null, created: Date.now(), updated: Date.now() };
  for (const it of fi.items) if (it.prefill) r.values[it.f] = prefillValue(it.prefill, ch, fi);
  fi.items.forEach((it, i) => { if (it.k === 'table' && !it.rowLabels) r.rows[i] = 1; });
  return r;
}

/* ---------- écrans ---------- */
function header(title, left, right) {
  return el('header', {}, left || null, el('h1', {}, title), right || null);
}
function render() {
  const app = document.getElementById('app'); app.innerHTML = '';
  if (!navigator.onLine) app.append(el('div', { class: 'off' }, 'Hors ligne – tout est enregistré sur le téléphone'));
  const v = S.view;
  ({ home: viewHome, chantier: viewChantier, rapport: viewRapport, settings: viewSettings, newfiche: viewNewFiche }[v.name] || viewHome)(app);
}

function viewHome(app) {
  app.append(el('header', { class: 'home' }, el('img', { src: 'icons/logo.png', alt: 'Thermaclim Energies', class: 'logo' }), el('h1', {}, 'Mise en service'), el('button', { onclick: () => go({ name: 'settings' }) }, 'Réglages')));
  const m = el('main', { class: 'list' });
  if (!S.settings.nom) m.append(el('div', { class: 'card', onclick: () => go({ name: 'settings' }) }, el('div', { class: 't' }, el('b', {}, 'Première utilisation'), el('span', { class: 'mu' }, 'Indique ton nom et enregistre ta signature dans les Réglages.'))));
  m.append(el('h2', {}, 'Chantiers'));
  for (const c of S.chantiers) {
    const n = S.rapports.filter(r => r.chantierId === c.id).length;
    m.append(el('div', { class: 'card', onclick: () => go({ name: 'chantier', id: c.id }) },
      el('div', { class: 't' }, el('b', {}, c.nom || c.code), el('span', { class: 'mu' }, c.code + (c.adresse ? ' · ' + c.adresse : ''))),
      el('span', { class: 'badge' }, n ? `${n} fiche${n > 1 ? 's' : ''}` : '—')));
  }
  m.append(el('button', { class: 'btn sec wide', onclick: () => { const s = prompt('Nouveau chantier (ex. T26-CH0300_NOM DU CHANTIER)'); if (s) { S.chantiers.push(parseChantier(s)); saveAll(); render(); } } }, '+ Ajouter un chantier'));
  app.append(m);
}

function viewChantier(app) {
  const c = S.chantiers.find(x => x.id === S.view.id); if (!c) return go({ name: 'home' });
  const sel = S.view.sel || (S.view.sel = new Set());
  app.append(header(c.nom || c.code, el('button', { onclick: () => go({ name: 'home' }) }, '‹')));
  const m = el('main');
  const info = el('div', { class: 'card' },
    el('label', { class: 'f' }, el('span', {}, 'N° de dossier'), el('input', { value: c.code, oninput: e => { c.code = e.target.value; saveSoon(); } })),
    el('label', { class: 'f' }, el('span', {}, 'Affaire'), el('input', { value: c.nom, oninput: e => { c.nom = e.target.value; saveSoon(); } })),
    el('label', { class: 'f' }, el('span', {}, 'Adresse / situation'), el('input', { value: c.adresse, placeholder: 'Adresse du chantier', oninput: e => { c.adresse = e.target.value; saveSoon(); } })));
  m.append(info);
  const rs = S.rapports.filter(r => r.chantierId === c.id).sort((a, b) => b.updated - a.updated);
  m.append(el('h2', {}, 'Fiches de MES'));
  if (!rs.length) m.append(el('div', { class: 'empty' }, 'Aucune fiche pour ce chantier. Ajoute la première avec le bouton ci-dessous.'));
  for (const r of rs) {
    const fi = fiche(r.ficheId); const np = Object.values(r.photos).reduce((a, b) => a + b.length, 0);
    const cb = el('input', { type: 'checkbox', class: 'chk', onclick: e => e.stopPropagation(), onchange: e => { e.target.checked ? sel.add(r.id) : sel.delete(r.id); updBar(); } });
    cb.checked = sel.has(r.id);
    m.append(el('div', { class: 'card row', style: 'cursor:pointer', onclick: () => go({ name: 'rapport', id: r.id }) }, cb,
      el('div', { class: 't', style: 'flex:1;min-width:0' }, el('b', {}, fi.title, r.prepRef ? el('span', { class: 'badge', style: 'margin-left:6px' }, 'bureau') : null), el('span', { class: 'mu' }, [r.titre || r.values[fi.items.find(i => i.prefill === 'designation')?.f] || '', new Date(r.updated).toLocaleDateString('fr-CH'), np ? np + ' photo' + (np > 1 ? 's' : '') : ''].filter(Boolean).join(' · ')))));
  }
  m.append(el('button', { class: 'btn wide', onclick: () => go({ name: 'newfiche', id: c.id }) }, '+ Nouvelle fiche'));
  if (S.view.sel.size === 0 && rs.length) m.append(el('p', { class: 'mu', style: 'text-align:center' }, 'Coche plusieurs fiches pour les envoyer dans un seul mail.'));
  m.append(el('div', { style: 'height:20px' }), el('button', { class: 'btn del wide', onclick: () => { if (confirm('Supprimer ce chantier et toutes ses fiches ?')) { rs.forEach(delRapportPhotos); S.rapports = S.rapports.filter(r => r.chantierId !== c.id); S.chantiers = S.chantiers.filter(x => x !== c); saveAll(); go({ name: 'home' }); } } }, 'Supprimer le chantier'));
  app.append(m);
  const bar = el('div', { class: 'bar' }); app.append(bar);
  function updBar() {
    bar.innerHTML = ''; const n = sel.size;
    bar.style.display = n ? 'flex' : 'none';
    bar.append(el('button', { class: 'btn', onclick: () => sendRapports(rs.filter(r => sel.has(r.id)), c) }, `Envoyer ${n} fiche${n > 1 ? 's' : ''} par mail`));
  }
  updBar();
}

function viewNewFiche(app) {
  const c = S.chantiers.find(x => x.id === S.view.id);
  app.append(header('Nouvelle fiche', el('button', { onclick: () => go({ name: 'chantier', id: c.id }) }, '‹')));
  const m = el('main', { class: 'list' });
  const groups = [['Hydraulique', ['mise-en-eau-pression', 'mise-en-eau-rincage', 'circulateurs', 'vase', 'vanne-equilibrage', 'equilibrage-collecteurs', 'filtre', 'echangeurs', 'solaire', 'protocole-chape']],
    ['Ventilation', ['ventil-debit', 'ventil-bouche', 'ventil-reglage']], ['Attestations', ['attest-isolation', 'attest-ventilation', 'attest-etancheite', 'attest-cheminee']]];
  for (const [g, ids] of groups) {
    m.append(el('h2', {}, g));
    for (const id of ids) { const fi = fiche(id); if (!fi) continue;
      m.append(el('div', { class: 'card', onclick: () => { const r = newRapport(c, fi); S.rapports.push(r); saveAll(); go({ name: 'rapport', id: r.id }); } }, el('div', { class: 't' }, el('b', {}, fi.title)), el('span', { class: 'badge' }, '+'))); }
  }
  app.append(m);
}

/* ---------- édition d'une fiche ---------- */
function viewRapport(app) {
  const r = S.rapports.find(x => x.id === S.view.id); if (!r) return go({ name: 'home' });
  const fi = fiche(r.ficheId); const c = S.chantiers.find(x => x.id === r.chantierId);
  const touch = () => { r.updated = Date.now(); saveSoon(); };
  app.append(header(fi.title, el('button', { onclick: () => { saveAll(); go({ name: 'chantier', id: c.id }); } }, '‹')));
  const m = el('main');
  m.append(el('div', { class: 'mu', style: 'margin:0 4px 10px' }, chantierLabel(c)));
  if (r.bureau && Object.keys(r.bureau).length) m.append(el('div', { class: 'card burnote' }, el('b', {}, 'Fiche préparée par le bureau'), el('div', { class: 'mu' }, 'Les cases en jaune contiennent les valeurs théoriques à respecter. Complète les valeurs réelles mesurées.')));
  m.append(el('label', { class: 'f' }, el('span', {}, 'Nom de la fiche dans la liste (facultatif)'), el('input', { value: r.titre, placeholder: 'ex. Circulateur chauffage CH1', oninput: e => { r.titre = e.target.value; touch(); } })));

  const input = (it) => {
    const bur = r.bureau && it.f in r.bureau;
    const attrs = { value: r.values[it.f] || '', class: bur ? 'bur' : null, oninput: e => { r.values[it.f] = e.target.value; touch(); } };
    const inp = it.multi ? el('textarea', attrs) : el('input', Object.assign(attrs, { inputmode: /\((bar|kW|W|V|A|Hz|Pa|%|l\/h|m3\/h|mCE|kPa|Kpa)\)|°C|Nombre|DN|Débit|Pression|Puissance|Tension|Intensité|Volume|Qté/i.test(it.label) && !/Type|Marque|Vérification/.test(it.label) ? 'decimal' : null }));
    return inp;
  };
  let card = null; const flush = () => { if (card) { m.append(card); card = null; } };
  const ensure = () => card || (card = el('div', { class: 'card' }));
  fi.items.forEach((it, idx) => {
    if (it.k === 'section') { flush(); m.append(el('h2', {}, it.label)); return; }
    if (it.k === 'text') {
      const box = el('label', { class: 'f' }, el('span', {}, it.label), input(it));
      if (it.photo) box.append(photoBlock(r, 'f:' + it.f, touch));
      ensure().append(box); return;
    }
    if (it.k === 'check') {
      const cb = el('input', { type: 'checkbox', class: 'chk', onchange: e => { r.values[it.f] = e.target.checked; touch(); } }); cb.checked = !!r.values[it.f];
      ensure().append(el('label', { class: 'row f' }, cb, el('span', {}, it.label))); return;
    }
    if (it.k === 'choice') {
      const chips = el('div', { class: 'chips' });
      const draw = () => { chips.innerHTML = ''; for (const o of it.options) chips.append(el('button', { class: 'chip' + (r.values[o.f] ? ' on' : ''), onclick: () => { const was = r.values[o.f]; it.options.forEach(x => r.values[x.f] = false); r.values[o.f] = !was; touch(); draw(); } }, o.label)); };
      draw(); ensure().append(el('div', { class: 'f' }, el('span', { class: 'mu' }, it.label), chips)); return;
    }
    if (it.k === 'sign') { flush(); m.append(signBlock(r, it, touch)); return; }
    if (it.k === 'table') {
      flush();
      const fixed = !!it.rowLabels; const max = it.cells.length;
      const n = fixed ? max : Math.min(max, r.rows[idx] || 1);
      m.append(el('h2', {}, fixed ? 'Mesures' : `Mesures (${n}/${max} lignes)`));
      for (let j = 0; j < n; j++) {
        const cells = it.cells[j];
        const title = fixed ? it.rowLabels[j] : `Ligne ${j + 1}`;
        const rc = el('div', { class: 'card mrow' }, el('div', { class: 'hd' }, el('b', {}, title)));
        const g = el('div', { class: it.cols.length === 2 ? 'grid2' : '' });
        cells.forEach((f, k) => g.append(el('label', { class: 'f' }, el('span', {}, it.cols[k] || `Col. ${k + 1}`), input({ f, label: (it.cols[k] || '') + ' ' + (fixed ? it.rowLabels[j] : '') }))));
        rc.append(g, photoBlock(r, `t${idx}:r${j}`, touch));
        m.append(rc);
      }
      if (!fixed && n < max) m.append(el('button', { class: 'btn sec wide', style: 'margin-bottom:10px', onclick: () => { r.rows[idx] = n + 1; touch(); render(); } }, '+ Ajouter une ligne'));
      if (!fixed && n > 1) m.append(el('button', { class: 'btn sm del', style: 'margin-bottom:14px', onclick: () => { const last = it.cells[n - 1]; if (last.some(f => r.values[f]) && !confirm('Effacer la dernière ligne ?')) return; last.forEach(f => delete r.values[f]); r.rows[idx] = n - 1; touch(); render(); } }, 'Retirer la dernière ligne'));
    }
  });
  flush();
  m.append(el('div', { style: 'height:16px' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn sec', onclick: () => { const r2 = JSON.parse(JSON.stringify(r)); r2.id = uid(); r2.photos = {}; r2.titre = (r.titre || fi.title) + ' (copie)'; r2.created = r2.updated = Date.now(); S.rapports.push(r2); saveAll(); go({ name: 'rapport', id: r2.id }); toast('Fiche dupliquée (sans les photos)'); } }, 'Dupliquer'),
      el('button', { class: 'btn del', onclick: () => { if (confirm('Supprimer cette fiche ?')) { delRapportPhotos(r); if (r.prepRef) (S.settings.prepIgnored = S.settings.prepIgnored || []).push(r.prepRef); S.rapports = S.rapports.filter(x => x !== r); saveAll(); go({ name: 'chantier', id: c.id }); } } }, 'Supprimer')));
  app.append(m);
  app.append(el('div', { class: 'bar' },
    el('button', { class: 'btn sec', onclick: () => previewPdf(r) }, 'Aperçu PDF'),
    el('button', { class: 'btn', onclick: () => sendRapports([r], c) }, 'Envoyer par mail')));
}

/* ---------- photos ---------- */
const photoCache = new Map();
async function photoURL(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const b = await DB.get('p:' + id); if (!b) return '';
  const u = URL.createObjectURL(b); photoCache.set(id, u); return u;
}
function photoBlock(r, key, touch) {
  const wrap = el('div', {});
  const list = el('div', { class: 'photos' });
  const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none', onchange: async e => {
    for (const f of e.target.files) {
      try { const blob = await shrink(f); const id = uid(); await DB.set('p:' + id, blob); (r.photos[key] = r.photos[key] || []).push(id); }
      catch (err) { toast('Photo illisible : ' + err.message); }
    }
    e.target.value = ''; touch(); await saveAll(); draw();
  } });
  async function draw() {
    list.innerHTML = '';
    for (const id of r.photos[key] || []) {
      const img = el('img', { alt: 'photo' }); photoURL(id).then(u => img.src = u);
      list.append(el('div', { class: 'ph' }, img, el('button', { 'aria-label': 'Supprimer la photo', onclick: async ev => { ev.preventDefault(); if (!confirm('Supprimer cette photo ?')) return; r.photos[key] = r.photos[key].filter(x => x !== id); if (!r.photos[key].length) delete r.photos[key]; await DB.del('p:' + id); touch(); draw(); } }, '×')));
    }
  }
  draw();
  wrap.append(el('div', { class: 'row', style: 'justify-content:flex-start' }, el('button', { class: 'camb', style: 'flex:0 0 auto', onclick: e => { e.preventDefault(); file.click(); } }, '📷 Photo')), list, file);
  return wrap;
}
function delRapportPhotos(r) { for (const ids of Object.values(r.photos || {})) for (const id of ids) DB.del('p:' + id); }
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('format non pris en charge')); i.src = src; }); }
async function shrink(file, max = 1600) {
  const u = URL.createObjectURL(file);
  try {
    const img = await loadImage(u); const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.78));
  } finally { URL.revokeObjectURL(u); }
}

/* ---------- signature ---------- */
function signBlock(r, it, touch) {
  const card = el('div', { class: 'card' }, el('div', { class: 'mu', style: 'margin-bottom:6px' }, it.label));
  const box = el('div', { class: 'sig' }); card.append(box);
  const draw = () => {
    box.innerHTML = '';
    const src = r.sig === 'saved' ? S.settings.signature : r.sig;
    box.append(src ? el('img', { src, alt: 'signature' }) : el('span', { class: 'mu' }, 'Pas de signature'));
  };
  draw();
  card.append(el('div', { class: 'row', style: 'margin-top:8px' },
    S.settings.signature ? el('button', { class: 'btn sm sec', onclick: () => { r.sig = 'saved'; touch(); draw(); } }, 'Ma signature') : null,
    el('button', { class: 'btn sm sec', onclick: () => signPad(d => { r.sig = d; touch(); draw(); }) }, 'Signer ici'),
    el('button', { class: 'btn sm sec', onclick: () => { r.sig = null; touch(); draw(); } }, 'Effacer')));
  return card;
}
function signPad(done) {
  const cv = el('canvas', { class: 'pad' });
  const modal = el('div', { class: 'modal' }, el('div', { class: 'sheet' }, el('b', {}, 'Signe avec le doigt'), el('div', { style: 'height:8px' }), cv,
    el('div', { class: 'row', style: 'margin-top:10px' },
      el('button', { class: 'btn sec', onclick: () => modal.remove() }, 'Annuler'),
      el('button', { class: 'btn sec', onclick: () => ctx.clearRect(0, 0, cv.width, cv.height) }, 'Recommencer'),
      el('button', { class: 'btn', onclick: () => { const d = trimCanvas(cv); modal.remove(); if (d) done(d); } }, 'Valider'))));
  document.body.append(modal);
  const dpr = window.devicePixelRatio || 1; const rc = cv.getBoundingClientRect();
  cv.width = rc.width * dpr; cv.height = rc.height * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b2a6b';
  let down = false, last;
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener('pointerdown', e => { down = true; last = pt(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last[0], last[1], 1.1, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); });
  cv.addEventListener('pointermove', e => { if (!down) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; });
  cv.addEventListener('pointerup', () => down = false); cv.addEventListener('pointercancel', () => down = false);
}
function trimCanvas(cv) {
  const ctx = cv.getContext('2d'); const { width: w, height: h } = cv; const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const p = 6; x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(cv, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o.toDataURL('image/png');
}

/* ---------- réglages ---------- */
function viewSettings(app) {
  const st = S.settings;
  app.append(header('Réglages', el('button', { onclick: () => { saveAll(); go({ name: 'home' }); } }, '‹')));
  const m = el('main');
  const sigBox = el('div', { class: 'sig' });
  const drawSig = () => { sigBox.innerHTML = ''; sigBox.append(st.signature ? el('img', { src: st.signature, alt: 'signature' }) : el('span', { class: 'mu' }, 'Aucune signature enregistrée')); };
  drawSig();
  m.append(el('div', { class: 'card' },
    el('label', { class: 'f' }, el('span', {}, 'Ton nom (metteur au point)'), el('input', { value: st.nom, placeholder: 'Prénom Nom', oninput: e => { st.nom = e.target.value; saveSoon(); } })),
    el('label', { class: 'f' }, el('span', {}, 'Lieu par défaut pour « Lieu, Date »'), el('input', { value: st.lieu, oninput: e => { st.lieu = e.target.value; saveSoon(); } })),
    el('label', { class: 'f' }, el('span', {}, 'Texte du mail'), el('textarea', { value: st.mailText, oninput: e => { st.mailText = e.target.value; saveSoon(); } })),
    el('div', { class: 'mu', style: 'margin-bottom:6px' }, 'Ma signature (utilisée sur toutes les fiches)'), sigBox,
    el('div', { class: 'row', style: 'margin-top:8px' }, el('button', { class: 'btn sm sec', onclick: () => signPad(d => { st.signature = d; saveAll(); drawSig(); }) }, 'Enregistrer ma signature'))));
  m.append(el('h2', {}, 'Sauvegarde'),
    el('div', { class: 'card' }, el('p', { class: 'mu', style: 'margin-top:0' }, 'Les fiches sont enregistrées sur ce téléphone uniquement. Exporte une sauvegarde de temps en temps (sans les photos).'),
      el('div', { class: 'row' }, el('button', { class: 'btn sm sec', onclick: exportBackup }, 'Exporter'),
        el('button', { class: 'btn sm sec', onclick: importBackup }, 'Importer'))));
  m.append(el('p', { class: 'mu', style: 'text-align:center' }, S.settings.bureauSync ? `Préparations bureau : synchronisées le ${new Date(S.settings.bureauSync).toLocaleString('fr-CH')}` : 'Préparations bureau : jamais synchronisées'),
    el('div', { style: 'text-align:center;margin-bottom:10px' }, el('button', { class: 'btn sm sec', onclick: async () => { const n = await syncBureau(true); render(); } }, 'Synchroniser maintenant')));
  m.append(el('p', { class: 'mu', style: 'text-align:center' }, `Version ${VERSION} · ${S.fiches.length} modèles de fiches`));
  app.append(m);
}
function exportBackup() {
  const data = JSON.stringify({ v: 1, settings: S.settings, chantiers: S.chantiers, rapports: S.rapports.map(r => ({ ...r, photos: {} })) });
  shareOrDownload([new File([data], `sauvegarde-MES-${today()}.json`, { type: 'application/json' })], 'Sauvegarde MES');
}
function importBackup() {
  const i = el('input', { type: 'file', accept: '.json,application/json', onchange: async () => {
    try { const d = JSON.parse(await i.files[0].text()); if (!confirm('Remplacer les données actuelles par la sauvegarde ?')) return;
      Object.assign(S, { settings: d.settings, chantiers: d.chantiers, rapports: d.rapports }); await saveAll(); toast('Sauvegarde importée'); go({ name: 'home' }); }
    catch (e) { toast('Fichier invalide'); } } });
  i.click();
}

/* ---------- génération PDF ---------- */
const tplCache = {};
async function template(fi) { return tplCache[fi.id] || (tplCache[fi.id] = await (await fetch(fi.file)).arrayBuffer()); }
function sanitizer(font) {
  const ok = new Set(font.getCharacterSet());
  const map = { '≤': '<=', '≥': '>=', '≈': '~', '³': '3', ' ': ' ', ' ': ' ', ' ': ' ', '…': '...' };
  return s => Array.from(String(s ?? '')).map(ch => ok.has(ch.codePointAt(0)) || ch === '\n' ? ch : (map[ch] ?? (ok.has(ch.normalize('NFD').codePointAt(0)) ? ch.normalize('NFD')[0] : '?'))).join('');
}
async function buildPdf(r) {
  const { PDFDocument, StandardFonts, PDFName, rgb } = PDFLib;
  const fi = fiche(r.ficheId); const c = S.chantiers.find(x => x.id === r.chantierId);
  const doc = await PDFDocument.load(await template(fi));
  const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = sanitizer(font); const form = doc.getForm(); const pages = doc.getPages();
  const sigItems = fi.items.filter(i => i.k === 'sign');
  const checks = [];
  const multi = new Set(fi.items.filter(i => i.multi).map(i => i.f));
  for (const fld of form.getFields()) {
    const name = fld.getName();
    if (fld instanceof PDFLib.PDFCheckBox) {
      if (r.values[name]) for (const w of fld.acroField.getWidgets()) checks.push({ rect: w.getRectangle(), page: pageOfWidget(doc, w) });
      continue;
    }
    if (!(fld instanceof PDFLib.PDFTextField)) continue;
    for (const w of fld.acroField.getWidgets()) w.dict.delete(PDFName.of('MK'));
    const isSign = sigItems.some(s => s.f === name);
    const text = isSign ? '' : clean(r.values[name] || '');
    const w0 = fld.acroField.getWidgets()[0].getRectangle();
    if (multi.has(name)) { fld.enableMultiline(); fld.setFontSize(9); }
    else {
      fld.disableMultiline?.();
      const wid = font.widthOfTextAtSize(text || ' ', 1);
      fld.setFontSize(Math.max(5, Math.min(9, (w0.width - 4) / wid, w0.height - 3)));
    }
    fld.setText(text);
  }
  form.updateFieldAppearances(font);
  // signature(s)
  const sigSrc = r.sig === 'saved' ? S.settings.signature : r.sig;
  for (const s of sigItems) {
    let rect = s.rect;
    if (!rect) { const w = form.getTextField(s.f).acroField.getWidgets()[0].getRectangle(); const pi = 0; const pg = pages[findPage(doc, form.getTextField(s.f))]; rect = { page: pages.indexOf(pg), x: w.x, top: pg.getHeight() - w.y - w.height, w: w.width, h: w.height }; }
    const pg = pages[rect.page]; const H = pg.getHeight();
    let top = rect.top, h = rect.h;
    const withName = !s.rect && rect.h > 40 && S.settings.nom;
    if (withName) { pg.drawText(clean(S.settings.nom), { x: rect.x + 4, y: H - top - 11, size: 8.5, font }); top += 13; h -= 15; }
    if (sigSrc) {
      const img = await doc.embedPng(sigSrc); const k = Math.min((rect.w - 8) / img.width, (h - 4) / img.height);
      const iw = img.width * k, ih = img.height * k;
      pg.drawImage(img, { x: rect.x + (rect.w - iw) / 2, y: H - top - h + (h - ih) / 2, width: iw, height: ih });
    }
  }
  form.flatten();
  // les widgets supprimés restent parfois listés dans /Annots : on nettoie pour un PDF propre
  for (const p of pages) { const an = p.node.Annots(); if (!an) continue;
    const keep = an.asArray().filter(a => !(a instanceof PDFLib.PDFRef) || doc.context.lookup(a));
    p.node.set(PDFName.of('Annots'), doc.context.obj(keep)); }
  for (const k of checks) { const pg = pages[k.page], { x, y, width: w, height: h } = k.rect, o = { thickness: 1.3, color: rgb(0, 0, 0) };
    pg.drawLine({ start: { x: x + 1.5, y: y + 1.5 }, end: { x: x + w - 1.5, y: y + h - 1.5 }, ...o }); pg.drawLine({ start: { x: x + 1.5, y: y + h - 1.5 }, end: { x: x + w - 1.5, y: y + 1.5 }, ...o }); }
  // annexe photos
  const shots = [];
  for (const [key, ids] of Object.entries(r.photos || {})) for (const id of ids) shots.push({ key, id });
  if (shots.length) {
    let pg, slot = 0;
    for (let i = 0; i < shots.length; i++) {
      const blob = await DB.get('p:' + shots[i].id); if (!blob) continue;
      if (!pg || slot === 2) {
        pg = doc.addPage([595.28, 841.89]); slot = 0;
        pg.drawText(clean(`Annexe photos – ${fi.title}`), { x: 40, y: 800, size: 13, font: bold, color: rgb(0.1, 0.4, 0.45) });
        pg.drawText(clean(chantierLabel(c)), { x: 40, y: 784, size: 9, font });
      }
      const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const boxTop = 765 - slot * 375, bw = 515, bh = 335;
      const k = Math.min(bw / img.width, bh / img.height); const iw = img.width * k, ih = img.height * k;
      pg.drawText(clean(photoCaption(fi, r, shots[i].key)), { x: 40, y: boxTop - 10, size: 9.5, font: bold });
      pg.drawImage(img, { x: 40 + (bw - iw) / 2, y: boxTop - 18 - ih, width: iw, height: ih });
      slot++;
    }
  }
  doc.setTitle(clean(`${fi.title} – ${chantierLabel(c)}`)); doc.setAuthor(clean(S.settings.nom || 'Thermaclim Energies')); doc.setCreator('MES Thermaclim');
  return doc.save();
}
function findPage(doc, fld) { return pageOfWidget(doc, fld.acroField.getWidgets()[0]); }
function pageOfWidget(doc, w) {
  const ref = w.P(); const pages = doc.getPages(); let i = pages.findIndex(p => p.ref === ref);
  if (i < 0) i = pages.findIndex(p => (p.node.Annots()?.asArray() || []).some(a => doc.context.lookup(a) === w.dict));
  return i < 0 ? 0 : i;
}
function photoCaption(fi, r, key) {
  if (key.startsWith('f:')) { const it = fi.items.find(i => i.f === key.slice(2)); return 'Photo – ' + (it ? it.label : key) + (r.values[key.slice(2)] ? ' : ' + r.values[key.slice(2)] : ''); }
  const m = key.match(/^t(\d+):r(\d+)$/); const it = fi.items[+m[1]]; const j = +m[2];
  const lab = it.rowLabels ? it.rowLabels[j] : (r.values[it.cells[j][0]] || `Ligne ${j + 1}`);
  return 'Photo – ' + lab;
}
const fileName = (r) => { const fi = fiche(r.ficheId); const c = S.chantiers.find(x => x.id === r.chantierId);
  return `${c.code || c.nom} - MES ${fi.title}${r.titre ? ' - ' + r.titre : ''} - ${today()}.pdf`.replace(/[\\/:*?"<>|]/g, '-'); };

async function previewPdf(r) {
  await saveAll(); toast('Création du PDF…', 1200);
  try {
    const bytes = await buildPdf(r); const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = el('a', { href: url, target: '_blank', rel: 'noopener' }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { console.error(e); toast('Erreur PDF : ' + e.message, 4000); }
}
async function sendRapports(rs, c) {
  if (!rs.length) return; await saveAll(); toast('Préparation des PDF…', 1500);
  try {
    const files = [];
    for (const r of rs) files.push(new File([await buildPdf(r)], fileName(r), { type: 'application/pdf' }));
    const titles = rs.map(r => '- ' + fiche(r.ficheId).title + (r.titre ? ' (' + r.titre + ')' : '')).join('\n');
    const text = (S.settings.mailText || '').replace('{chantier}', chantierLabel(c)).replace('{fiches}', titles);
    await shareOrDownload(files, `MES ${chantierLabel(c)}`, text);
  } catch (e) { console.error(e); toast('Erreur : ' + e.message, 4000); }
}
async function shareOrDownload(files, title, text) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title, text }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) { const u = URL.createObjectURL(f); const a = el('a', { href: u, download: f.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); }
  toast('Fichier(s) téléchargé(s)');
}

/* ---------- fiches préparées au bureau (bureau.json) ---------- */
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’'`]/g, "'").replace(/[^a-z0-9%/'°]+/g, ' ').trim();
const lab = (a, b) => { const x = norm(a), y = norm(b); return x === y || (y.length >= 3 && x.startsWith(y)); };
/* Traduit une préparation lisible (libellés) en valeurs de champs PDF. Renvoie aussi les libellés non reconnus. */
function resolvePrep(fi, p) {
  const values = {}, rows = {}, unknown = [];
  const fields = fi.items.filter(i => i.k === 'text');
  for (const [k, v] of Object.entries(p.valeurs || {})) {
    const it = fields.find(i => norm(i.label) === norm(k)) || fields.find(i => lab(i.label, k));
    if (it) values[it.f] = String(v); else unknown.push(k);
  }
  const ti = fi.items.findIndex(i => i.k === 'table'); const t = fi.items[ti];
  const col = (k) => { let j = t.cols.findIndex(c => norm(c) === norm(k)); if (j < 0) j = t.cols.findIndex(c => lab(c, k)); return j; };
  const putRow = (cells, obj, where) => {
    if (Array.isArray(obj)) obj.forEach((v, j) => { if (v != null && v !== '' && cells[j]) values[cells[j]] = String(v); });
    else for (const [k, v] of Object.entries(obj || {})) { const j = col(k); if (j >= 0) values[cells[j]] = String(v); else unknown.push(where + ' › ' + k); }
  };
  if (p.lignes && !t) unknown.push('lignes (cette fiche n’a pas de tableau)');
  else if (p.lignes && t.rowLabels) {
    for (const [k, v] of Object.entries(p.lignes)) { const j = t.rowLabels.findIndex(x => norm(x) === norm(k)) >= 0 ? t.rowLabels.findIndex(x => norm(x) === norm(k)) : t.rowLabels.findIndex(x => lab(x, k));
      if (j >= 0) putRow(t.cells[j], v, k); else unknown.push('ligne ' + k); }
  } else if (p.lignes) {
    const ls = Array.isArray(p.lignes) ? p.lignes : [];
    if (ls.length > t.cells.length) unknown.push(`${ls.length} lignes alors que la fiche n’en a que ${t.cells.length}`);
    ls.slice(0, t.cells.length).forEach((l, j) => putRow(t.cells[j], l, 'ligne ' + (j + 1)));
    rows[ti] = Math.min(t.cells.length, Math.max(1, ls.length));
  }
  return { values, rows, unknown };
}
let syncing = false;
async function syncBureau(manual) {
  if (syncing || !navigator.onLine) { if (manual) toast('Pas de réseau'); return 0; }
  syncing = true;
  try {
    const res = await fetch('bureau.json?t=' + Date.now(), { cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status);
    const B = await res.json(); let added = 0, updated = 0;
    for (const bc of B.chantiers || []) {
      let c = S.chantiers.find(x => norm(x.code) === norm(bc.code));
      if (!c) { c = { id: uid(), code: bc.code, nom: bc.nom || '', adresse: bc.adresse || '' }; S.chantiers.push(c); }
      else { if (bc.adresse && (!c.adresse || c.adresse === c.bureauAdresse || /^Villa O'Hana, 1291/.test(c.adresse))) c.adresse = bc.adresse; if (bc.nom && !c.nom) c.nom = bc.nom; }
      c.bureauAdresse = bc.adresse || c.bureauAdresse;
    }
    const ignored = new Set(S.settings.prepIgnored || []);
    // une préparation avec plus de lignes que la fiche n'en contient est découpée en plusieurs fiches (1/2, 2/2…)
    const parts = [];
    for (const p of B.fiches || []) {
      const fi = fiche(p.type), t = fi && fi.items.find(i => i.k === 'table');
      if (t && !t.rowLabels && Array.isArray(p.lignes) && p.lignes.length > t.cells.length) {
        const n = Math.ceil(p.lignes.length / t.cells.length);
        for (let k = 0; k < n; k++) parts.push({ ...p, ref: `${p.ref}#${k + 1}`, titre: `${p.titre || fi.title} (${k + 1}/${n})`, lignes: p.lignes.slice(k * t.cells.length, (k + 1) * t.cells.length) });
      } else parts.push(p);
    }
    for (const p of parts) {
      const fi = fiche(p.type); if (!fi || !p.ref) { console.warn('Préparation ignorée', p); continue; }
      const c = S.chantiers.find(x => norm(x.code) === norm(p.chantier)); if (!c) { console.warn('Chantier inconnu', p.chantier); continue; }
      const { values, rows } = resolvePrep(fi, p);
      let r = S.rapports.find(x => x.prepRef === p.ref);
      if (!r) {
        if (ignored.has(p.ref)) continue;
        r = newRapport(c, fi); r.prepRef = p.ref; r.titre = p.titre || ''; r.bureau = {};
        S.rapports.push(r); added++;
      }
      const sig = JSON.stringify(p); if (r.prepSig === sig) continue;
      // les valeurs du bureau remplacent les anciennes, sauf si le metteur au point les a modifiées
      for (const [f, v] of Object.entries(values)) {
        const old = r.bureau[f];
        if (r.values[f] == null || r.values[f] === '' || r.values[f] === old || old === undefined && r.prepSig == null) r.values[f] = v;
        r.bureau[f] = v;
      }
      for (const [i, n] of Object.entries(rows)) r.rows[i] = Math.max(r.rows[i] || 1, n);
      if (p.titre && (!r.titre || r.titre === r.prepTitre)) r.titre = p.titre; r.prepTitre = p.titre;
      if (r.prepSig) updated++;
      r.prepSig = sig; r.updated = Date.now();
    }
    S.settings.bureauSync = Date.now(); await saveAll();
    if (added || updated) toast(`${added ? added + ' fiche(s) préparée(s) reçue(s) du bureau' : ''}${added && updated ? ', ' : ''}${updated ? updated + ' mise(s) à jour' : ''}`, 3500);
    else if (manual) toast('Tout est à jour');
    return added + updated;
  } catch (e) { console.warn('Synchro bureau', e); if (manual) toast('Synchro impossible : ' + e.message); return 0; }
  finally { syncing = false; }
}

/* ---------- démarrage ---------- */
async function init() {
  try { S.fiches = await (await fetch('fiches.json')).json(); }
  catch (e) { document.getElementById('app').textContent = 'Impossible de charger les modèles. Ouvre l’appli une fois avec du réseau.'; return; }
  S.settings = Object.assign({ nom: '', lieu: 'Genève', signature: null,
    mailText: 'Bonjour,\n\nVeuillez trouver ci-joint les fiches de mise en service pour le chantier {chantier} :\n{fiches}\n\nMeilleures salutations' }, await DB.get('settings') || {});
  S.chantiers = await DB.get('chantiers') || DEFAULT_CHANTIERS.map(parseChantier);
  S.rapports = await DB.get('rapports') || [];
  await saveAll();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  window.addEventListener('online', render); window.addEventListener('offline', render);
  window.addEventListener('pagehide', saveAll); document.addEventListener('visibilitychange', () => document.hidden && saveAll());
  render();
  syncBureau().then(n => { if (n) render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncBureau().then(n => { if (n) render(); }); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    // dès qu'une nouvelle version est installée, on recharge pour l'afficher tout de suite
    const had = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; saveAll().then(() => location.reload()); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); }));
  }
}
init();
