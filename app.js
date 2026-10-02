'use strict';
/* ═══════════ Haushaltsbuch – Vanilla-JS-App (lokale Datendatei) ══════════ */

const DATA_FILENAME = 'haushaltsbuch-daten.json';
const JSON_TYPE = { description: 'Haushaltsbuch-Daten', accept: { 'application/json': ['.json'] } };
const WARN_PCT = 80; // Warnschwelle Budgets in %

const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
}
function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

/* ── Daten ──────────────────────────────────────────────────────────────── */
function seed() {
  // Leerer Startzustand: nur die 10 Standardkategorien.
  const cats = [
    ['gehalt', 'Gehalt', 'einnahme'], ['sonst-ein', 'Sonstige Einnahmen', 'einnahme'],
    ['lebensmittel', 'Lebensmittel', 'ausgabe'], ['wohnen', 'Wohnen', 'ausgabe'], ['transport', 'Transport', 'ausgabe'],
    ['freizeit', 'Freizeit', 'ausgabe'], ['gesundheit', 'Gesundheit', 'ausgabe'], ['versicherung', 'Versicherungen', 'ausgabe'],
    ['kleidung', 'Kleidung', 'ausgabe'], ['sonstiges', 'Sonstiges', 'ausgabe']
  ].map(c => ({ id: c[0], name: c[1], typ: c[2], custom: false }));
  const persons = [{ id: 'p-1', name: 'Ich' }];
  return { tx: [], cats, persons, budgets: {}, rec: [], settings: { showBudgets: false } };
}
function normalize(d) {
  d = d || {};
  return {
    tx: Array.isArray(d.tx) ? d.tx : [],
    cats: (Array.isArray(d.cats) && d.cats.length) ? d.cats : seed().cats,
    persons: (Array.isArray(d.persons) && d.persons.length) ? d.persons : [{ id: 'p-1', name: 'Ich' }],
    budgets: (d.budgets && typeof d.budgets === 'object') ? d.budgets : {},
    rec: Array.isArray(d.rec) ? d.rec : [],
    settings: { showBudgets: !!(d.settings && d.settings.showBudgets) }
  };
}

let data = seed();
const ui = {
  section: 'uebersicht',
  month: todayISO().slice(0, 7),
  year: new Date().getFullYear(),
  yearPerson: '', yearCat: '',
  viewMode: 'monat',
  sortKey: 'datum', sortDir: 'desc',
  fTyp: 'ausgabe',
  editId: null
};
const cat = id => data.cats.find(c => c.id === id);
const person = id => data.persons.find(p => p.id === id);
const personName = id => (person(id) || {}).name || '—';
const defaultPersonId = () => (data.persons[0] || {}).id || '';
const sumTyp = (arr, typ) => arr.filter(t => t.typ === typ).reduce((a, t) => a + t.betrag, 0);

/* ── Persistenz ─────────────────────────────────────────────────────────────
   'native' = Desktop-App (Electron): Datei im Programmordner, automatisch.
   'fs'     = Browser mit File System Access API (Datei im gewählten Ordner).
   'memory' = Browser-Fallback ohne Datei-Zugriff (manueller JSON-Export). */
let fileHandle = null;
let persistMode = 'init';
let saveTimer = null;
let nativePath = '';        // Pfad der Datendatei im Desktop-Modus

// Datei-Handle dauerhaft merken (IndexedDB, da Handles nicht in localStorage passen).
function idbHandle(method, value) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open('hb-fs', 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const op = method === 'set' ? store.put(value, 'handle')
               : method === 'del' ? store.delete('handle')
               : store.get('handle');
      op.onsuccess = () => resolve(op.result);
      op.onerror = () => reject(op.error);
    };
  });
}

async function ensurePermission(handle, request) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (request && (await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

async function readHandle(handle) {
  const file = await handle.getFile();
  const text = (await file.text()).replace(/^﻿/, '');
  if (!text.trim()) return null;               // frisch angelegte, leere Datei
  try { return JSON.parse(text); }
  catch (e) { throw new Error('Die Datei enthält kein gültiges Haushaltsbuch-Format.'); }
}

async function writeHandle() {
  const w = await fileHandle.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

// Handle übernehmen: Rechte prüfen, Daten laden bzw. aktuelle Daten hineinschreiben.
async function useHandle(handle, preferFileData) {
  if (!(await ensurePermission(handle, true))) throw new Error('Kein Schreibzugriff auf die Datei erlaubt.');
  let next = data;
  if (preferFileData) {
    const fromFile = await readHandle(handle);   // kann Parse-Fehler werfen
    next = fromFile ? normalize(fromFile) : seed();
  }
  fileHandle = handle;
  persistMode = 'fs';
  data = next;
  try { await idbHandle('set', handle); } catch (e) {}
  await writeHandle();                            // legt Datei an / spiegelt aktuellen Stand
  updateFileInfo();
}

function updateFileInfo(msg) {
  if (persistMode === 'native') {
    const fname = (nativePath.split(/[\\/]/).pop()) || DATA_FILENAME;
    $('fileInfo').textContent = msg ? msg : '📄 ' + fname;
    $('katFootNote').textContent = 'Alle Daten werden automatisch gespeichert' + (nativePath ? ' (' + nativePath + ')' : '') + '. Kein Browser-Speicher.';
    $('switchFileBtn').classList.add('hidden');
  } else if (persistMode === 'fs') {
    $('fileInfo').textContent = msg ? msg : '📄 ' + fileHandle.name;
    $('katFootNote').textContent = 'Alle Daten liegen in der Datei „' + fileHandle.name + '“ (Ordner Dokumente o. Ä.) und werden nach jeder Änderung automatisch gespeichert. Kein Browser-Speicher.';
    $('switchFileBtn').textContent = 'Datendatei wechseln';
    $('switchFileBtn').classList.remove('hidden');
  } else {
    $('fileInfo').textContent = '⚠ Kein Datei-Zugriff';
    $('katFootNote').textContent = 'Dein Browser kann keine lokale Datei beschreiben – sichere die Daten manuell als JSON.';
    $('switchFileBtn').textContent = 'Daten als JSON sichern';
    $('switchFileBtn').classList.remove('hidden');
  }
}

let saveFlashTimer = null;
function flashSaved() {
  if (persistMode !== 'fs' && persistMode !== 'native') return;
  $('fileInfo').textContent = '✓ gespeichert';
  clearTimeout(saveFlashTimer);
  saveFlashTimer = setTimeout(() => updateFileInfo(), 1200);
}

// Schreibt den aktuellen Stand je nach Modus in die Datei.
async function persistWrite() {
  if (persistMode === 'native') {
    const r = await window.hbNative.save(JSON.stringify(data, null, 2));
    if (r && r.ok === false) throw new Error(r.error || 'unbekannter Fehler');
  } else if (persistMode === 'fs' && fileHandle) {
    await writeHandle();
  }
}

async function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  if (persistMode !== 'fs' && persistMode !== 'native') return;
  try { await persistWrite(); flashSaved(); }
  catch (e) { onWriteError(e); }
}

// Von überall aufgerufen: schreibt entprellt in die Datei.
function save() {
  if (persistMode !== 'fs' && persistMode !== 'native') return;   // Memory-Modus: nur manueller JSON-Export
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveNow(); }, 250);
}

function onWriteError(e) {
  const detail = e && e.message ? e.message : e;
  if (persistMode === 'native') {
    showInfo('Speichern fehlgeschlagen', 'Die Datei im Programmordner konnte nicht geschrieben werden (' + detail + ').');
    return;
  }
  showInfo('Speichern fehlgeschlagen', 'Die Datei konnte nicht geschrieben werden (' + detail + '). Wähle die Datendatei bitte erneut aus.')
    .then(() => renderPickerOverlay(true));
}

// Manueller JSON-Download (Memory-Fallback).
function downloadJson() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = DATA_FILENAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ── Bestätigungs-Dialog ────────────────────────────────────────────────── */
function askConfirm(title, message, opts) {
  const o = Object.assign({ confirmLabel: 'Löschen', cancel: true, danger: true }, opts);
  return new Promise(resolve => {
    const dlg = $('confirmDlg');
    $('dlgTitle').textContent = title;
    $('dlgBody').textContent = message;
    $('dlgOk').textContent = o.confirmLabel;
    $('dlgOk').className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');
    $('dlgCancel').classList.toggle('hidden', !o.cancel);
    const inp = $('dlgInput'), hasInput = o.input !== undefined;
    inp.classList.toggle('hidden', !hasInput);
    inp.value = hasInput ? o.input : '';
    // Mit Eingabefeld: liefert den getrimmten Text (oder false bei Abbruch).
    const done = ok => { cleanup(); dlg.close(); resolve(ok && hasInput ? inp.value.trim() : ok); };
    const onOk = () => done(true);
    const onEnter = e => { if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    const onCancelBtn = () => done(false);
    const onEsc = e => { e.preventDefault(); done(false); };
    const onBackdrop = e => { if (e.target === dlg) done(false); };
    function cleanup() {
      $('dlgOk').removeEventListener('click', onOk);
      $('dlgCancel').removeEventListener('click', onCancelBtn);
      dlg.removeEventListener('cancel', onEsc);
      dlg.removeEventListener('click', onBackdrop);
      inp.removeEventListener('keydown', onEnter);
    }
    $('dlgOk').addEventListener('click', onOk);
    $('dlgCancel').addEventListener('click', onCancelBtn);
    dlg.addEventListener('cancel', onEsc);
    dlg.addEventListener('click', onBackdrop);
    inp.addEventListener('keydown', onEnter);
    dlg.showModal();
    if (hasInput) inp.select();
    else (o.cancel ? $('dlgCancel') : $('dlgOk')).focus();
  });
}
function showInfo(title, message) {
  return askConfirm(title, message, { confirmLabel: 'OK', cancel: false, danger: false });
}
function askName(title, current) {
  return askConfirm(title, 'Neuer Name:', { confirmLabel: 'Speichern', danger: false, input: current });
}

/* ── Daueraufträge automatisch buchen ───────────────────────────────────── */
function applyRecurring() {
  const today = todayISO();
  const curMonth = today.slice(0, 7);
  let changed = false;
  data.rec.forEach(r => {
    if (!r.aktiv) return;
    let [y, mo] = (r.von || curMonth).split('-').map(Number);
    if (!y || !mo) return;
    while (true) {
      const mk = y + '-' + String(mo).padStart(2, '0');
      if (mk > curMonth) break;
      const datum = mk + '-' + String(r.tag).padStart(2, '0');
      if (datum <= today && !data.tx.some(t => t.recId === r.id && t.datum.slice(0, 7) === mk)) {
        data.tx.push({ id: uid(), datum, typ: r.typ, catId: r.catId, text: r.name, betrag: r.betrag, recId: r.id, personId: r.personId || defaultPersonId() });
        changed = true;
      }
      mo++; if (mo > 12) { mo = 1; y++; }
    }
  });
  if (changed) save();
}

/* ── Render: Header & Sidebar ───────────────────────────────────────────── */
function renderHeader() {
  const total = data.tx.reduce((a, t) => a + (t.typ === 'einnahme' ? t.betrag : -t.betrag), 0);
  $('saldoVal').textContent = fmt(total);
  $('saldoTag').className = 'tag ' + (total >= 0 ? 'tag-accent' : 'tag-accent-2');
  $('saldoTag').style.cssText = 'font-size: 14px; display: inline-flex; gap: 5px;';
}

function monthSums(mk) {
  const mt = data.tx.filter(t => t.datum.slice(0, 7) === mk);
  const ein = mt.filter(t => t.typ === 'einnahme').reduce((a, t) => a + t.betrag, 0);
  const aus = mt.filter(t => t.typ === 'ausgabe').reduce((a, t) => a + t.betrag, 0);
  return { ein, aus };
}

function renderSidebar() {
  const { ein, aus } = monthSums(ui.month);
  $('sideMonthLabel').textContent = monthLabel(ui.month);
  $('sideEin').textContent = fmt(ein);
  $('sideAus').textContent = fmt(aus);
  $('sideSaldo').textContent = fmt(ein - aus);
}

function renderNav() {
  const budOn = data.settings.showBudgets !== false;
  document.querySelector('#mainNav [data-section="budgets"]').classList.toggle('hidden', !budOn);
  if (!budOn && ui.section === 'budgets') ui.section = 'uebersicht';
  document.querySelectorAll('#mainNav .navbtn').forEach(b => {
    const active = b.dataset.section === ui.section;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const show = {
    'sec-uebersicht': ui.section === 'uebersicht',
    'sec-jahr': ui.section === 'jahr',
    'sec-form': ui.section === 'buchungen',
    'sec-table': ui.section === 'buchungen',
    'sec-budgets': ui.section === 'budgets',
    'sec-rec': ui.section === 'rec',
    'sec-kategorien': ui.section === 'kategorien'
  };
  Object.entries(show).forEach(([id, on]) => $(id).classList.toggle('hidden', !on));
}

/* ── Render: Übersicht ──────────────────────────────────────────────────── */
function renderUebersicht() {
  $('uebMonthLabel').textContent = monthLabel(ui.month);
  const { ein, aus } = monthSums(ui.month);
  $('kpiEin').textContent = fmt(ein);
  $('kpiAus').textContent = fmt(aus);
  $('kpiSaldo').textContent = fmt(ein - aus);

  // Ausgaben nach Kategorie
  const spent = spentByCat(ui.month);
  const entries = Object.entries(spent).sort((a, b) => b[1] - a[1]);
  const maxSpent = Math.max(1, ...entries.map(e => e[1]));
  $('catBars').innerHTML = entries.map(([id, v]) => `
    <div class="catbar-row">
      <span class="catbar-name">${esc((cat(id) || {}).name || '?')}</span>
      <div class="catbar-track"><div class="catbar-fill" style="width: ${Math.round(v / maxSpent * 100)}%;"></div></div>
      <span class="catbar-amt">${fmt(v)}</span>
    </div>`).join('');
  $('noCatBars').classList.toggle('hidden', entries.length > 0);

  renderPersonOverview();

  // Verlauf 12 Monate
  const [cy, cm] = ui.month.split('-').map(Number);
  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(cy, cm - 1 - i, 1);
    const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    const s = monthSums(mk);
    trend.push({ label: dt.toLocaleDateString('de-DE', { month: 'short' }), ein: s.ein, aus: s.aus });
  }
  const maxTrend = Math.max(1, ...trend.map(t => Math.max(t.ein, t.aus)));
  const h = v => Math.max(3, Math.round(v / maxTrend * 110));
  $('trendChart').innerHTML = trend.map(t => `
    <div class="trend-col">
      <div class="trend-bars">
        <div class="trend-bar" style="background: var(--color-accent-500); height: ${h(t.ein)}px;" title="Einnahmen"></div>
        <div class="trend-bar" style="background: var(--color-accent-2-500); height: ${h(t.aus)}px;" title="Ausgaben"></div>
      </div>
      <span class="trend-label">${esc(t.label)}</span>
    </div>`).join('');
}

function spentByCat(mk) {
  const out = {};
  data.tx.filter(t => t.typ === 'ausgabe' && t.datum.slice(0, 7) === mk)
    .forEach(t => { out[t.catId] = (out[t.catId] || 0) + t.betrag; });
  return out;
}

function renderPersonOverview() {
  const monthTx = data.tx.filter(t => t.datum.slice(0, 7) === ui.month);
  const rows = data.persons.map(p => {
    const pt = monthTx.filter(t => t.personId === p.id);
    return { name: p.name, ein: sumTyp(pt, 'einnahme'), aus: sumTyp(pt, 'ausgabe') };
  });
  const orphan = monthTx.filter(t => !data.persons.some(p => p.id === t.personId));
  if (orphan.length) rows.push({ name: 'Ohne Person', ein: sumTyp(orphan, 'einnahme'), aus: sumTyp(orphan, 'ausgabe') });
  $('personOverview').innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td style="color: var(--color-accent-700);">${fmt(r.ein)}</td>
      <td style="color: var(--color-accent-2-700);">${fmt(r.aus)}</td>
      <td style="font-weight: 600;">${fmt(r.ein - r.aus)}</td>
    </tr>`).join('');
}

/* ── Render: Buchungen (Formular) ───────────────────────────────────────── */
function renderForm() {
  $('formTitle').textContent = ui.editId ? 'Buchung bearbeiten' : 'Neue Buchung';
  $('submitBtn').textContent = ui.editId ? 'Speichern' : 'Buchung hinzufügen';
  $('cancelBtn').classList.toggle('hidden', !ui.editId);
  $('typAus').className = 'pillbtn' + (ui.fTyp === 'ausgabe' ? ' active-red' : '');
  $('typEin').className = 'pillbtn' + (ui.fTyp === 'einnahme' ? ' active-green' : '');
  $('typAus').setAttribute('aria-pressed', ui.fTyp === 'ausgabe');
  $('typEin').setAttribute('aria-pressed', ui.fTyp === 'einnahme');
}

function fillSelect(sel, cats, keep, extraFirst) {
  const prev = keep !== undefined ? keep : sel.value;
  const options = cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  // Zeigt die gemerkte Auswahl nicht mehr existiert (z. B. gelöschte Kategorie/Person),
  // einen klaren Platzhalter voranstellen statt still auf die erste Option zu fallen.
  const orphan = prev && !cats.some(c => c.id === prev);
  sel.innerHTML = (extraFirst || '') +
    (orphan ? '<option value="" disabled selected>— nicht mehr vorhanden —</option>' : '') +
    options;
  if (prev && !orphan && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

// Füllt das Kategorie-Feld der Buchung und hängt die Option „+ Neue Kategorie …" an,
// damit man beim Buchen direkt eine neue Kategorie anlegen kann.
function fillCatSelect(keep) {
  fillSelect($('fCat'), data.cats.filter(c => c.typ === ui.fTyp), keep);
  $('fCat').insertAdjacentHTML('beforeend', '<option value="__newcat__">+ Neue Kategorie …</option>');
}
function renderCatSelects() {
  fillCatSelect();
  fillSelect($('fFCat'), data.cats, undefined, '<option value="">Alle Kategorien</option>');
  fillSelect($('rCat'), data.cats.filter(c => c.typ === $('rTyp').value));
}

function renderPersonSelects() {
  fillSelect($('fPerson'), data.persons);
  fillSelect($('rPerson'), data.persons);
  fillSelect($('fFPerson'), data.persons, undefined, '<option value="">Alle Personen</option>');
}

/* ── Render: Buchungen (Tabelle) ────────────────────────────────────────── */
const COLS = [['datum', 'Datum'], ['text', 'Beschreibung'], ['kategorie', 'Kategorie'], ['person', 'Person'], ['typ', 'Typ'], ['betrag', 'Betrag']];

function visibleRows() {
  let rows = data.tx.slice();
  if (ui.viewMode === 'monat') {
    rows = rows.filter(t => t.datum.slice(0, 7) === ui.month);
  } else {
    const von = $('fVon').value, bis = $('fBis').value;
    if (von) rows = rows.filter(t => t.datum >= von);
    if (bis) rows = rows.filter(t => t.datum <= bis);
  }
  const q = $('fQ').value.trim().toLowerCase();
  if (q) rows = rows.filter(t => (t.text || '').toLowerCase().includes(q) || ((cat(t.catId) || {}).name || '').toLowerCase().includes(q) || personName(t.personId).toLowerCase().includes(q));
  const fc = $('fFCat').value;
  if (fc) rows = rows.filter(t => t.catId === fc);
  const fp = $('fFPerson').value;
  if (fp) rows = rows.filter(t => t.personId === fp);
  const ft = $('fFTyp').value;
  if (ft) rows = rows.filter(t => t.typ === ft);
  const dir = ui.sortDir === 'asc' ? 1 : -1, k = ui.sortKey;
  rows.sort((a, b) => {
    if (k === 'betrag') return (a.betrag - b.betrag) * dir;
    if (k === 'kategorie') return (((cat(a.catId) || {}).name || '').localeCompare((cat(b.catId) || {}).name || '')) * dir;
    if (k === 'person') return (personName(a.personId).localeCompare(personName(b.personId))) * dir;
    if (k === 'text') return ((a.text || '').localeCompare(b.text || '')) * dir;
    if (k === 'typ') return a.typ.localeCompare(b.typ) * dir;
    return a.datum.localeCompare(b.datum) * dir;
  });
  return rows;
}

function renderTable() {
  $('tblMonthLabel').textContent = monthLabel(ui.month);
  $('tablePager').classList.toggle('hidden', ui.viewMode !== 'monat');
  $('rangeWrap').classList.toggle('hidden', ui.viewMode !== 'alle');
  $('modeMonat').className = 'pillbtn' + (ui.viewMode === 'monat' ? ' active-green' : '');
  $('modeAlle').className = 'pillbtn' + (ui.viewMode === 'alle' ? ' active-green' : '');
  $('modeMonat').setAttribute('aria-pressed', ui.viewMode === 'monat');
  $('modeAlle').setAttribute('aria-pressed', ui.viewMode === 'alle');

  $('theadRow').innerHTML = COLS.map(([k, label]) => {
    const ind = ui.sortKey === k ? (ui.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    const sort = ui.sortKey === k ? (ui.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th data-sort="${k}" tabindex="0" role="button" aria-sort="${sort}" ` +
      `style="text-align: ${k === 'betrag' ? 'right' : 'left'};">${label}${ind}</th>`;
  }).join('') + '<th></th>';

  const rows = visibleRows();
  $('tbody').innerHTML = rows.map(t => {
    const c = cat(t.catId);
    const datumFmt = new Date(t.datum + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const ein = t.typ === 'einnahme';
    return `<tr>
      <td style="white-space: nowrap;">${datumFmt}</td>
      <td>${esc(t.text || '–')}</td>
      <td><span class="tag ${ein ? 'tag-accent' : 'tag-neutral'}">${esc(c ? c.name : '?')}</span></td>
      <td class="text-muted" style="white-space: nowrap;">${esc(personName(t.personId))}</td>
      <td class="text-muted">${ein ? 'Einnahme' : 'Ausgabe'}</td>
      <td style="text-align: right; font-weight: 600; white-space: nowrap; color: var(${ein ? '--color-accent-700' : '--color-accent-2-700'});">${(ein ? '+' : '−') + fmt(t.betrag).replace('-', '')}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${esc(t.id)}">Bearbeiten</button>
        <button class="btn btn-ghost btn-sm danger" data-act="del" data-id="${esc(t.id)}">Löschen</button>
      </td>
    </tr>`;
  }).join('');

  $('noRows').classList.toggle('hidden', rows.length > 0);
  $('rowCount').textContent = rows.length + ' Buchungen';
  const sumView = rows.reduce((a, t) => a + (t.typ === 'einnahme' ? t.betrag : -t.betrag), 0);
  $('sumView').textContent = fmt(sumView);
}

/* ── Render: Budgets ────────────────────────────────────────────────────── */
function renderBudgets() {
  $('budMonthLabel').textContent = monthLabel(ui.month);
  const spent = spentByCat(ui.month);
  $('budgetList').innerHTML = data.cats.filter(c => c.typ === 'ausgabe').map(c => {
    const budget = data.budgets[c.id] || 0;
    const sp = spent[c.id] || 0;
    const pct = budget > 0 ? sp / budget * 100 : 0;
    const over = pct > 100, warned = pct >= WARN_PCT;
    const color = over ? 'var(--color-accent-2-700)' : warned ? 'var(--color-accent-2-400)' : 'var(--color-accent-500)';
    const status = budget > 0
      ? fmt(sp) + ' von ' + fmt(budget) + (over ? ' – überschritten!' : ' (' + Math.round(pct) + ' %)')
      : (sp > 0 ? fmt(sp) + ' – kein Budget' : 'kein Budget');
    return `<div class="budget-row">
      <span class="budget-name">${esc(c.name)}</span>
      <div class="budget-mid">
        <div class="budget-track"><div class="budget-fill" style="width: ${Math.min(100, Math.round(pct))}%; background: ${color};"></div></div>
        <span class="budget-status">${esc(status)}</span>
      </div>
      <input class="input" type="number" min="0" step="10" data-budget-cat="${esc(c.id)}" value="${budget || ''}" style="width: 100px; text-align: right;" placeholder="–" aria-label="Budget für ${esc(c.name)}">
    </div>`;
  }).join('');
}

/* ── Render: Daueraufträge ──────────────────────────────────────────────── */
function renderRec() {
  $('recList').innerHTML = data.rec.map(r => {
    const c = cat(r.catId);
    const ein = r.typ === 'einnahme';
    return `<div class="rec-row">
      <label class="radio"><input type="checkbox" data-rec-toggle="${esc(r.id)}"${r.aktiv ? ' checked' : ''}><span style="font-weight: 600;">${esc(r.name)}</span></label>
      <span class="tag ${ein ? 'tag-accent' : 'tag-neutral'}">${esc(c ? c.name : '?')}</span>
      <span class="rec-day">${esc(personName(r.personId))}</span>
      <span class="rec-day">am ${esc(r.tag)}. des Monats</span>
      <span class="rec-spacer"></span>
      <strong style="white-space: nowrap; color: var(${ein ? '--color-accent-700' : '--color-accent-2-700'});">${(ein ? '+' : '−') + fmt(r.betrag)}</strong>
      <button class="btn btn-ghost btn-sm danger" data-rec-del="${esc(r.id)}">Löschen</button>
    </div>`;
  }).join('');
}

/* ── Render: Kategorien ─────────────────────────────────────────────────── */
function renderCats() {
  const mk = (c, tagClass) =>
    `<span class="tag ${tagClass}">${esc(c.name)}<button class="tag-x" data-cat-edit="${esc(c.id)}" title="Umbenennen" aria-label="${esc(c.name)} umbenennen">✎</button><button class="tag-x" data-cat-del="${esc(c.id)}" title="Löschen" aria-label="${esc(c.name)} löschen">×</button></span>`;
  $('catsAus').innerHTML = data.cats.filter(c => c.typ === 'ausgabe').map(c => mk(c, 'tag-accent-2')).join('');
  $('catsEin').innerHTML = data.cats.filter(c => c.typ === 'einnahme').map(c => mk(c, 'tag-accent')).join('');
}

/* ── Render: Personen ───────────────────────────────────────────────────── */
function renderPersons() {
  $('personList').innerHTML = data.persons.map(p =>
    `<span class="tag tag-neutral">${esc(p.name)}<button class="tag-x" data-person-edit="${esc(p.id)}" title="Umbenennen" aria-label="${esc(p.name)} umbenennen">✎</button><button class="tag-x" data-person-del="${esc(p.id)}" title="Löschen" aria-label="${esc(p.name)} löschen">×</button></span>`).join('');
}

/* ── Render: Einstellungen ──────────────────────────────────────────────── */
function renderSettings() {
  $('toggleBudgets').checked = data.settings.showBudgets !== false;
}

/* ── Render: alles ──────────────────────────────────────────────────────── */
// Buchungen des gewählten Jahres unter Berücksichtigung der Jahr-Filter.
function yearTx() {
  return data.tx.filter(t =>
    Number(t.datum.slice(0, 4)) === ui.year &&
    (!ui.yearPerson || t.personId === ui.yearPerson) &&
    (!ui.yearCat || t.catId === ui.yearCat));
}
function renderYear() {
  const y = ui.year;
  $('jahrLabel').textContent = String(y);
  fillSelect($('jahrFPerson'), data.persons, ui.yearPerson, '<option value="">Alle Personen</option>');
  fillSelect($('jahrFCat'), data.cats, ui.yearCat, '<option value="">Alle Kategorien</option>');

  const tx = yearTx();
  // Monatswerte
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const mt = tx.filter(t => Number(t.datum.slice(5, 7)) === m);
    months.push({
      name: new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long' }),
      short: new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short' }),
      ein: sumTyp(mt, 'einnahme'), aus: sumTyp(mt, 'ausgabe')
    });
  }
  const tEin = months.reduce((a, m) => a + m.ein, 0);
  const tAus = months.reduce((a, m) => a + m.aus, 0);
  $('jahrEin').textContent = fmt(tEin);
  $('jahrAus').textContent = fmt(tAus);
  $('jahrSaldo').textContent = fmt(tEin - tAus);

  // Statistiken
  $('statAvgEin').textContent = fmt(tEin / 12);
  $('statAvgAus').textContent = fmt(tAus / 12);
  $('statSpar').textContent = (tEin > 0 ? Math.round((tEin - tAus) / tEin * 100) : 0) + '%';
  const catSpent = {};
  tx.filter(t => t.typ === 'ausgabe').forEach(t => { catSpent[t.catId] = (catSpent[t.catId] || 0) + t.betrag; });
  const catEntries = Object.entries(catSpent).sort((a, b) => b[1] - a[1]);
  $('statTopCat').textContent = catEntries.length ? ((cat(catEntries[0][0]) || {}).name || '?') : '–';
  // Bester / schwächster Monat nach Saldo (nur Monate mit Buchungen)
  const withData = months.map((m, i) => ({ i, s: m.ein - m.aus, any: m.ein || m.aus })).filter(m => m.any);
  if (withData.length) {
    const best = withData.reduce((a, b) => b.s > a.s ? b : a);
    const worst = withData.reduce((a, b) => b.s < a.s ? b : a);
    $('jahrStatsNote').textContent = 'Bester Monat: ' + months[best.i].name + ' (' + fmt(best.s) + ') · Schwächster: ' + months[worst.i].name + ' (' + fmt(worst.s) + ')';
  } else {
    $('jahrStatsNote').textContent = 'Noch keine Buchungen in diesem Jahr.';
  }

  // Ausgaben nach Kategorie (Pivot über das Jahr)
  const maxCat = Math.max(1, ...catEntries.map(e => e[1]));
  $('jahrCatBars').innerHTML = catEntries.map(([id, v]) => `
    <div class="catbar-row">
      <span class="catbar-name">${esc((cat(id) || {}).name || '?')}</span>
      <div class="catbar-track"><div class="catbar-fill" style="width: ${Math.round(v / maxCat * 100)}%;"></div></div>
      <span class="catbar-amt">${fmt(v)}</span>
    </div>`).join('');
  $('jahrNoCat').classList.toggle('hidden', catEntries.length > 0);

  // Monatsverlauf-Diagramm
  const maxM = Math.max(1, ...months.map(m => Math.max(m.ein, m.aus)));
  const h = v => Math.max(3, Math.round(v / maxM * 110));
  $('jahrChart').innerHTML = months.map(m => `
    <div class="trend-col">
      <div class="trend-bars">
        <div class="trend-bar" style="background: var(--color-accent-500); height: ${h(m.ein)}px;" title="Einnahmen"></div>
        <div class="trend-bar" style="background: var(--color-accent-2-500); height: ${h(m.aus)}px;" title="Ausgaben"></div>
      </div>
      <span class="trend-label">${esc(m.short)}</span>
    </div>`).join('');

  // Monatstabelle
  const rows = months.map(m => `<tr><td>${esc(m.name)}</td><td>${fmt(m.ein)}</td><td>${fmt(m.aus)}</td><td>${fmt(m.ein - m.aus)}</td></tr>`);
  rows.push(`<tr style="font-weight: 700; border-top: 2px solid var(--color-divider);"><td>Summe</td><td>${fmt(tEin)}</td><td>${fmt(tAus)}</td><td>${fmt(tEin - tAus)}</td></tr>`);
  $('jahrTable').innerHTML = rows.join('');
}
function renderAll() {
  renderHeader(); renderSidebar(); renderNav();
  renderUebersicht(); renderYear(); renderForm(); renderCatSelects(); renderPersonSelects();
  renderTable(); renderBudgets(); renderRec(); renderCats(); renderPersons(); renderSettings();
}
function renderMonthDependent() {
  renderSidebar(); renderUebersicht(); renderTable(); renderBudgets();
}

/* ── CSV-Export ─────────────────────────────────────────────────────────── */
// CSV-Zelle: immer quoten und bei formelauslösenden Anfangszeichen (= + - @ Tab CR)
// ein ' voranstellen, damit Excel/Calc den Inhalt nicht als Formel ausführt.
function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportCsv() {
  const lines = ['Datum;Typ;Kategorie;Beschreibung;Betrag;Person'];
  data.tx.slice().sort((a, b) => a.datum.localeCompare(b.datum)).forEach(t => {
    const c = cat(t.catId);
    const pn = (person(t.personId) || {}).name || '';
    lines.push([
      t.datum,
      t.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe',
      csvCell(c ? c.name : ''),
      csvCell(t.text || ''),
      String(t.betrag.toFixed(2)).replace('.', ','),
      csvCell(pn)
    ].join(';'));
  });
  const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'haushaltsbuch-' + todayISO() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ── CSV-Import ─────────────────────────────────────────────────────────── */
function splitCsv(line, delim) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}

function importFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result.replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { alert('0 Buchungen importiert.'); return; }
    const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    let added = 0;
    lines.forEach((line, i) => {
      const parts = splitCsv(line, delim);
      if (i === 0 && /datum/i.test(parts[0])) return;
      if (parts.length < 5) return;
      const [datum, typRaw, katName, text2, betragRaw, personRaw] = parts;
      if (!/^\d{4}-\d{2}-\d{2}/.test(datum)) return;
      const typ = /ein/i.test(typRaw) ? 'einnahme' : 'ausgabe';
      const betrag = parseFloat(betragRaw.replace(/\./g, '').replace(',', '.'));
      if (!(betrag > 0)) return;
      let c = data.cats.find(x => x.typ === typ && x.name.toLowerCase() === katName.trim().toLowerCase());
      if (!c) { c = { id: uid(), name: katName.trim() || 'Sonstiges', typ, custom: true }; data.cats.push(c); }
      let pid = defaultPersonId();
      if (personRaw && personRaw.trim()) {
        let p = data.persons.find(x => x.name.toLowerCase() === personRaw.trim().toLowerCase());
        if (!p) { p = { id: uid(), name: personRaw.trim() }; data.persons.push(p); }
        pid = p.id;
      }
      data.tx.push({ id: uid(), datum: datum.slice(0, 10), typ, catId: c.id, text: text2, betrag, personId: pid });
      added++;
    });
    save(); renderAll();
    alert(added + ' Buchungen importiert.');
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ── Events ─────────────────────────────────────────────────────────────── */
// Navigation
$('mainNav').addEventListener('click', e => {
  const b = e.target.closest('.navbtn'); if (!b) return;
  ui.section = b.dataset.section;
  renderNav();
});

// Monats-Pager (Übersicht + Tabelle)
document.querySelectorAll('[data-shift]').forEach(b => b.addEventListener('click', () => {
  const [y, m] = ui.month.split('-').map(Number);
  const d = new Date(y, m - 1 + Number(b.dataset.shift), 1);
  ui.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  renderMonthDependent();
}));
// Jahr-Pager (Jahresübersicht)
document.querySelectorAll('[data-yshift]').forEach(b => b.addEventListener('click', () => {
  ui.year += Number(b.dataset.yshift);
  renderYear();
}));
// Jahr-Filter (Person / Kategorie)
$('jahrFPerson').addEventListener('change', () => { ui.yearPerson = $('jahrFPerson').value; renderYear(); });
$('jahrFCat').addEventListener('change', () => { ui.yearCat = $('jahrFCat').value; renderYear(); });

// Formular: Typ-Umschalter
$('typAus').addEventListener('click', () => { ui.fTyp = 'ausgabe'; renderForm(); fillCatSelect(''); });
$('typEin').addEventListener('click', () => { ui.fTyp = 'einnahme'; renderForm(); fillCatSelect(''); });

// Neue Kategorie direkt beim Buchen anlegen (Option „+ Neue Kategorie …").
let lastCatValue = '';
$('fCat').addEventListener('focus', () => { if ($('fCat').value !== '__newcat__') lastCatValue = $('fCat').value; });
$('fCat').addEventListener('change', () => {
  if ($('fCat').value !== '__newcat__') { lastCatValue = $('fCat').value; return; }
  askName('Neue Kategorie', '').then(name => {
    if (!name) { fillCatSelect(lastCatValue); return; }
    if (nameExists(data.cats.filter(c => c.typ === ui.fTyp), name)) {
      showInfo('Name schon vergeben', 'Es gibt bereits eine ' + (ui.fTyp === 'einnahme' ? 'Einnahme' : 'Ausgabe') + '-Kategorie „' + name + '“.');
      fillCatSelect(lastCatValue); return;
    }
    const c = { id: uid(), name, typ: ui.fTyp, custom: true };
    data.cats.push(c); save();
    fillCatSelect(c.id); renderCats();
  });
});

// Formular: Absenden / Abbrechen
$('submitBtn').addEventListener('click', () => {
  const betrag = parseFloat(String($('fBetrag').value).replace(',', '.'));
  const datum = $('fDatum').value;
  if (!(betrag > 0) || !datum) { alert('Bitte Betrag und Datum angeben.'); return; }
  let catId = $('fCat').value;
  if (!catId || catId === '__newcat__') catId = (data.cats.find(c => c.typ === ui.fTyp) || {}).id;
  const personId = $('fPerson').value || defaultPersonId();
  const text = $('fText').value;
  if (ui.editId) {
    const t = data.tx.find(x => x.id === ui.editId);
    if (t) Object.assign(t, { typ: ui.fTyp, betrag, datum, catId, text, personId });
  } else {
    data.tx.push({ id: uid(), typ: ui.fTyp, betrag, datum, catId, text, personId });
  }
  ui.editId = null;
  $('fBetrag').value = ''; $('fText').value = '';
  save(); renderAll();
});
$('cancelBtn').addEventListener('click', () => {
  ui.editId = null;
  $('fBetrag').value = ''; $('fText').value = '';
  renderForm();
});

// Tabelle: Sortierung
function sortBy(th) {
  if (!th) return;
  const k = th.dataset.sort;
  ui.sortDir = (ui.sortKey === k && ui.sortDir === 'desc') ? 'asc' : 'desc';
  ui.sortKey = k;
  renderTable();
}
$('theadRow').addEventListener('click', e => sortBy(e.target.closest('th[data-sort]')));
// Tastaturbedienung: Enter/Leertaste sortiert die fokussierte Spaltenüberschrift.
$('theadRow').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const th = e.target.closest('th[data-sort]'); if (!th) return;
  e.preventDefault(); sortBy(th);
});

// Tabelle: Bearbeiten / Löschen
$('tbody').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const t = data.tx.find(x => x.id === b.dataset.id); if (!t) return;
  if (b.dataset.act === 'edit') {
    ui.editId = t.id; ui.fTyp = t.typ; ui.section = 'buchungen';
    renderNav(); renderForm();
    fillCatSelect(t.catId);
    fillSelect($('fPerson'), data.persons, t.personId || defaultPersonId());
    $('fBetrag').value = String(t.betrag);
    $('fDatum').value = t.datum;
    $('fText').value = t.text || '';
    $('sec-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    const datumFmt = new Date(t.datum + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    askConfirm('Buchung löschen', '„' + (t.text || '–') + '“ vom ' + datumFmt + ' über ' + fmt(t.betrag) + ' wirklich löschen?').then(ok => {
      if (!ok) return;
      data.tx = data.tx.filter(x => x.id !== t.id);
      save(); renderAll();
    });
  }
});

// Filter
$('modeMonat').addEventListener('click', () => { ui.viewMode = 'monat'; renderTable(); });
$('modeAlle').addEventListener('click', () => { ui.viewMode = 'alle'; renderTable(); });
['fQ', 'fFCat', 'fFPerson', 'fFTyp', 'fVon', 'fBis'].forEach(id => {
  $(id).addEventListener('input', renderTable);
  $(id).addEventListener('change', renderTable);
});

// CSV
$('exportBtn').addEventListener('click', exportCsv);
$('importBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', importFile);

// JSON-Datenbank: Export / Import (vollständige Sicherung)
$('exportJsonBtn').addEventListener('click', async () => {
  const text = JSON.stringify(data, null, 2);
  if (window.hbNative && window.hbNative.exportJson) {
    const r = await window.hbNative.exportJson(text);
    if (r && r.ok) showInfo('Export erfolgreich', 'Die Daten wurden gespeichert:\n' + r.path);
    else if (r && !r.canceled) showInfo('Export fehlgeschlagen', String((r && r.error) || 'Unbekannter Fehler'));
  } else {
    downloadJson();
  }
});
$('importJsonBtn').addEventListener('click', async () => {
  if (window.hbNative && window.hbNative.importJson) {
    const r = await window.hbNative.importJson();
    if (!r || !r.ok) { if (r && !r.canceled) showInfo('Import fehlgeschlagen', String((r && r.error) || 'Unbekannter Fehler')); return; }
    applyImportedJson(r.text);
  } else {
    $('jsonFileInput').click();
  }
});
$('jsonFileInput').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => applyImportedJson(String(reader.result));
  reader.readAsText(f);
  e.target.value = '';
});
// Importierte JSON-Datenbank prüfen, bestätigen und übernehmen.
function applyImportedJson(text) {
  let parsed;
  try { parsed = JSON.parse(String(text).replace(/^﻿/, '')); }
  catch (e) { showInfo('Import fehlgeschlagen', 'Die Datei ist keine gültige JSON-Datei.'); return; }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tx)) {
    showInfo('Import fehlgeschlagen', 'Die Datei enthält keine gültigen Haushaltsbuch-Daten.'); return;
  }
  askConfirm('Daten importieren', 'Die aktuellen Daten werden vollständig durch den Import ersetzt. Fortfahren?', { confirmLabel: 'Importieren', danger: false })
    .then(ok => {
      if (!ok) return;
      data = normalize(parsed);
      saveNow(); renderAll();
      showInfo('Import erfolgreich', 'Die Daten wurden übernommen.');
    });
}

// Budgets
$('budgetList').addEventListener('change', e => {
  const inp = e.target.closest('input[data-budget-cat]'); if (!inp) return;
  const v = parseFloat(String(inp.value).replace(',', '.'));
  if (v > 0) data.budgets[inp.dataset.budgetCat] = v;
  else delete data.budgets[inp.dataset.budgetCat];
  save(); renderBudgets();
});

// Daueraufträge
$('recList').addEventListener('change', e => {
  const cb = e.target.closest('input[data-rec-toggle]'); if (!cb) return;
  const r = data.rec.find(x => x.id === cb.dataset.recToggle); if (!r) return;
  r.aktiv = !r.aktiv;
  save();
  if (r.aktiv) applyRecurring();
  renderAll();
});
$('recList').addEventListener('click', e => {
  const b = e.target.closest('button[data-rec-del]'); if (!b) return;
  const r = data.rec.find(x => x.id === b.dataset.recDel); if (!r) return;
  askConfirm('Dauerauftrag löschen', '„' + r.name + '“ (' + fmt(r.betrag) + ' am ' + r.tag + '. des Monats) wirklich löschen? Bereits erstellte Buchungen bleiben erhalten.').then(ok => {
    if (!ok) return;
    data.rec = data.rec.filter(x => x.id !== r.id);
    save(); renderAll();
  });
});
$('rTyp').addEventListener('change', () => fillSelect($('rCat'), data.cats.filter(c => c.typ === $('rTyp').value), ''));
$('addRecBtn').addEventListener('click', () => {
  const name = $('rName').value.trim();
  const betrag = parseFloat(String($('rBetrag').value).replace(',', '.'));
  if (!name || !(betrag > 0)) { alert('Bitte Name und Betrag angeben.'); return; }
  const typ = $('rTyp').value;
  const catId = $('rCat').value || (data.cats.find(c => c.typ === typ) || {}).id;
  const personId = $('rPerson').value || defaultPersonId();
  const tag = Math.min(28, Math.max(1, parseInt($('rTag').value) || 1));
  data.rec.push({ id: uid(), name, betrag, typ, catId, personId, tag, aktiv: true, von: ui.month });
  $('rName').value = ''; $('rBetrag').value = '';
  save(); applyRecurring(); renderAll();
});

// Datumsfelder: Kalender bei Klick irgendwo ins Feld öffnen, nicht nur auf das Symbol.
document.addEventListener('click', e => {
  if (e.target.matches('input[type="date"]')) try { e.target.showPicker(); } catch (err) { /* schon offen */ }
});

// Personen
// Prüft, ob ein Name (case-insensitiv) schon in der Liste existiert – außer beim Objekt exceptId.
function nameExists(list, name, exceptId) {
  const n = name.trim().toLowerCase();
  return list.some(x => x.id !== exceptId && x.name.trim().toLowerCase() === n);
}
$('addPersonBtn').addEventListener('click', () => {
  const name = $('pName').value.trim();
  if (!name) return;
  if (nameExists(data.persons, name)) {
    showInfo('Name schon vergeben', 'Es gibt bereits eine Person „' + name + '“.');
    return;
  }
  data.persons.push({ id: uid(), name });
  $('pName').value = '';
  save(); renderAll();
});
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-person-del]'); if (!b) return;
  const p = person(b.dataset.personDel); if (!p) return;
  if (data.persons.length <= 1) {
    showInfo('Löschen nicht möglich', 'Es muss mindestens eine Person geben.');
    return;
  }
  const nTx = data.tx.filter(t => t.personId === p.id).length;
  const nRec = data.rec.filter(r => r.personId === p.id).length;
  let msg = 'Person „' + p.name + '“ wirklich löschen?';
  if (nTx || nRec) {
    const parts = [];
    if (nTx) parts.push(nTx + (nTx === 1 ? ' Buchung' : ' Buchungen'));
    if (nRec) parts.push(nRec + (nRec === 1 ? ' Dauerauftrag' : ' Daueraufträgen'));
    msg += ' Sie ist ' + parts.join(' und ') + ' zugeordnet; diese bleiben erhalten (Person wird als „—“ angezeigt).';
  }
  askConfirm('Person löschen', msg).then(ok => {
    if (!ok) return;
    data.persons = data.persons.filter(x => x.id !== p.id);
    save(); renderAll();
  });
});

document.addEventListener('click', e => {
  const b = e.target.closest('button[data-person-edit]'); if (!b) return;
  const p = person(b.dataset.personEdit); if (!p) return;
  askName('Person umbenennen', p.name).then(name => {
    if (!name) return;
    if (nameExists(data.persons, name, p.id)) {
      showInfo('Name schon vergeben', 'Es gibt bereits eine Person „' + name + '“.');
      return;
    }
    p.name = name;
    save(); renderAll();
  });
});

// Kategorien
$('addCatBtn').addEventListener('click', () => {
  const name = $('kName').value.trim();
  if (!name) return;
  const typ = $('kTyp').value;
  if (nameExists(data.cats.filter(c => c.typ === typ), name)) {
    showInfo('Name schon vergeben', 'Es gibt bereits eine ' + (typ === 'einnahme' ? 'Einnahme' : 'Ausgabe') + '-Kategorie „' + name + '“.');
    return;
  }
  data.cats.push({ id: uid(), name, typ, custom: true });
  $('kName').value = '';
  save(); renderAll();
});
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-cat-del]'); if (!b) return;
  const c = cat(b.dataset.catDel); if (!c) return;
  if (data.cats.filter(x => x.typ === c.typ).length <= 1) {
    showInfo('Löschen nicht möglich', 'Die letzte Kategorie dieses Typs kann nicht gelöscht werden.');
    return;
  }
  const nTx = data.tx.filter(t => t.catId === c.id).length;
  const nRec = data.rec.filter(r => r.catId === c.id).length;
  let msg = 'Kategorie „' + c.name + '“ wirklich löschen?';
  if (nTx || nRec) {
    const parts = [];
    if (nTx) parts.push(nTx + (nTx === 1 ? ' Buchung' : ' Buchungen'));
    if (nRec) parts.push(nRec + (nRec === 1 ? ' Dauerauftrag' : ' Daueraufträgen'));
    msg += ' Sie wird von ' + parts.join(' und ') + ' verwendet; diese bleiben erhalten (Kategorie wird als „?“ angezeigt).';
  }
  askConfirm('Kategorie löschen', msg).then(ok => {
    if (!ok) return;
    data.cats = data.cats.filter(x => x.id !== c.id);
    delete data.budgets[c.id];
    save(); renderAll();
  });
});
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-cat-edit]'); if (!b) return;
  const c = cat(b.dataset.catEdit); if (!c) return;
  askName('Kategorie umbenennen', c.name).then(name => {
    if (!name) return;
    if (nameExists(data.cats.filter(x => x.typ === c.typ), name, c.id)) {
      showInfo('Name schon vergeben', 'Es gibt bereits eine ' + (c.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe') + '-Kategorie „' + name + '“.');
      return;
    }
    c.name = name;
    save(); renderAll();
  });
});
$('clearAllBtn').addEventListener('click', () => {
  askConfirm('Alle Daten löschen', 'Wirklich alle Buchungen, Budgets und Daueraufträge löschen? Dies kann nicht rückgängig gemacht werden.', { confirmLabel: 'Alles löschen' }).then(ok => {
    if (!ok) return;
    data = seed();
    saveNow(); renderAll();
  });
});

// Einstellung: Budgets ein-/ausblenden
$('toggleBudgets').addEventListener('change', () => {
  data.settings.showBudgets = $('toggleBudgets').checked;
  save(); renderAll();
});

// Datendatei wechseln (bzw. im Memory-Modus: JSON sichern)
$('switchFileBtn').addEventListener('click', () => {
  if (persistMode === 'fs') renderPickerOverlay(true);
  else downloadJson();
});

// JSON-Import im Memory-Fallback
$('jsonInput').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { data = normalize(JSON.parse(reader.result.replace(/^﻿/, ''))); }
    catch (err) { showInfo('Fehler', 'Die JSON-Datei konnte nicht gelesen werden.'); return; }
    hideOverlay(); startApp();
  };
  reader.readAsText(file);
});

/* ── Start-Overlay & Boot ───────────────────────────────────────────────── */
function showOverlay() { $('startOverlay').classList.remove('hidden'); }
function hideOverlay() { $('startOverlay').classList.add('hidden'); }
function setOverlay(text, buttons) {
  $('startText').textContent = text;
  const wrap = $('startActions'); wrap.innerHTML = '';
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.primary ? 'btn-primary' : 'btn-secondary');
    el.textContent = b.label;
    el.addEventListener('click', b.onClick);
    wrap.appendChild(el);
  });
  showOverlay();
}

function renderPickerOverlay(isSwitch) {
  setOverlay(
    isSwitch
      ? 'Wähle eine andere Datendatei aus oder lege eine neue an. Beim Anlegen wird der aktuelle Stand hineingeschrieben; beim Öffnen wird er durch den Inhalt der gewählten Datei ersetzt.'
      : 'Wo sollen deine Haushaltsbuch-Daten gespeichert werden? Der Dialog öffnet im Ordner „Dokumente“ und schlägt „' + DATA_FILENAME + '“ vor. Danach wird nach jeder Änderung automatisch in diese Datei gespeichert – nichts landet im Browser.',
    [
      { label: 'Neue Datendatei anlegen', primary: true, onClick: () => pick('new') },
      { label: 'Bestehende Datei öffnen', onClick: () => pick('open') },
      ...(isSwitch ? [{ label: 'Abbrechen', onClick: hideOverlay }] : [])
    ]
  );
}

function renderReconnectOverlay(handle) {
  setOverlay(
    'Deine Datendatei „' + handle.name + '“ ist noch verknüpft. Bestätige den Zugriff, um weiterzuarbeiten.',
    [
      { label: 'Fortsetzen', primary: true, onClick: async () => {
          try { await useHandle(handle, true); hideOverlay(); startApp(); }
          catch (e) { showInfo('Fehler', e && e.message ? e.message : String(e)).then(() => renderPickerOverlay()); }
        } },
      { label: 'Andere Datei wählen', onClick: () => renderPickerOverlay() }
    ]
  );
}

function renderFallbackOverlay() {
  persistMode = 'memory';
  setOverlay(
    'Dein Browser unterstützt keine direkte Datei-Speicherung (dafür Chrome oder Edge nutzen). Du kannst eine vorhandene JSON-Datei laden; zum Sichern exportierst du die Daten anschließend über „Daten als JSON sichern“.',
    [
      { label: 'JSON-Datei laden', primary: true, onClick: () => $('jsonInput').click() },
      { label: 'Leer starten', onClick: () => { data = seed(); hideOverlay(); startApp(); } }
    ]
  );
  updateFileInfo();
}

async function pick(kind) {
  try {
    let handle;
    if (kind === 'new') handle = await window.showSaveFilePicker({ suggestedName: DATA_FILENAME, startIn: 'documents', types: [JSON_TYPE] });
    else [handle] = await window.showOpenFilePicker({ startIn: 'documents', types: [JSON_TYPE], multiple: false });
    await useHandle(handle, kind === 'open');
    hideOverlay(); startApp();
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // Dialog abgebrochen
    showInfo('Fehler', 'Die Datei konnte nicht verwendet werden: ' + (e && e.message ? e.message : e));
  }
}

let booted = false;
function startApp() {
  if (!booted) { booted = true; $('fDatum').value = todayISO(); }
  applyRecurring();
  renderAll();
}

// In-App-Updater: Statusanzeige und Buttons in den Einstellungen verdrahten.
function setUpdateStatus(txt) { const el = $('updateStatus'); if (el) el.textContent = txt || ''; }
function setupUpdateUI() {
  if (!window.hbNative || !window.hbNative.onUpdate) return;
  $('updateBox').classList.remove('hidden');
  if (window.hbNative.version) {
    window.hbNative.version().then(v => { $('appVersion').textContent = v || '–'; }).catch(() => {});
  }
  window.hbNative.onUpdate((p) => {
    if (!p) return;
    if (p.state === 'checking') setUpdateStatus('Suche nach Updates …');
    else if (p.state === 'available') setUpdateStatus('Version ' + p.version + ' wird heruntergeladen …');
    else if (p.state === 'downloading') setUpdateStatus('Lädt … ' + (p.percent != null ? p.percent + '%' : ''));
    else if (p.state === 'downloaded') { setUpdateStatus('Version ' + p.version + ' ist bereit.'); $('updateInstallBtn').classList.remove('hidden'); }
    else if (p.state === 'none') setUpdateStatus('Du hast die aktuelle Version.');
    else if (p.state === 'error') setUpdateStatus('Update derzeit nicht möglich (offline?).');
  });
  $('updateCheckBtn').addEventListener('click', async () => {
    setUpdateStatus('Suche nach Updates …');
    try {
      const r = await window.hbNative.updateCheck();
      if (r && r.supported === false) setUpdateStatus('Automatische Updates gibt es nur in der installierten Version.');
      else if (r && r.error) setUpdateStatus('Update derzeit nicht möglich (offline?).');
      // Verfügbar/aktuell melden die Update-Events.
    } catch (e) { setUpdateStatus('Update derzeit nicht möglich.'); }
  });
  $('updateInstallBtn').addEventListener('click', () => {
    setUpdateStatus('Installiere …');
    window.hbNative.updateInstall();
  });
}

async function initPersistence() {
  // Desktop-App (Electron): Datei im Programmordner, ohne Nachfrage.
  if (window.hbNative) {
    persistMode = 'native';
    setupUpdateUI();
    try { nativePath = await window.hbNative.path(); } catch (e) { nativePath = ''; }
    let txt = null;
    try { txt = await window.hbNative.load(); } catch (e) {}
    if (txt) {
      try { data = normalize(JSON.parse(txt.replace(/^﻿/, ''))); }
      catch (e) { data = seed(); }
    } else {
      data = seed();
    }
    try { await persistWrite(); } catch (e) {}   // legt Datei beim ersten Start an
    updateFileInfo();
    hideOverlay();
    startApp();
    return;
  }
  if (!window.showSaveFilePicker) { renderFallbackOverlay(); return; }
  let handle = null;
  try { handle = await idbHandle('get'); } catch (e) {}
  if (handle) {
    let perm = 'prompt';
    try { perm = await handle.queryPermission({ mode: 'readwrite' }); } catch (e) {}
    if (perm === 'granted') {
      try { await useHandle(handle, true); startApp(); return; }
      catch (e) { /* Datei weg/defekt → unten neu wählen */ }
    }
    renderReconnectOverlay(handle);
    return;
  }
  renderPickerOverlay();
}

renderAll();          // leeres Grundgerüst hinter dem Overlay
initPersistence();
