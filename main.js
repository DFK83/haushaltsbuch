'use strict';
/* Haushaltsbuch – Electron-Hauptprozess.
   Standardfenster 1400×700; Größe/Position werden gemerkt.
   Daten werden im Programmordner (bzw. Portable-Unterordner) gespeichert. */

const { app, BrowserWindow, ipcMain, shell, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const DATA_FILE = 'haushaltsbuch-daten.json';
const WINDOW_STATE_FILE = 'fenster.json';
const PORTABLE_SUBDIR = 'Haushaltsbuch-Daten';

const DEFAULT_WIDTH = 1400;
const DEFAULT_HEIGHT = 700;
const MIN_WIDTH = 640;
const MIN_HEIGHT = 460;
// Wird erhöht, wenn sich die Standard-Fenstergröße ändert. Ältere gespeicherte
// Größen werden dann einmalig ignoriert, damit der neue Standard sicher greift.
const STATE_VERSION = 2;

// Speicherort der Datendatei:
//  • Portable-EXE  → Unterordner „Haushaltsbuch-Daten“ neben der EXE (wird angelegt).
//  • Installiert   → direkt im Programmverzeichnis (Ordner der EXE).
//  • Entwicklung   → Projektverzeichnis.
function dataDir() {
  // Portable-EXE: Daten im Unterordner neben der EXE (bleibt self-contained).
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const dir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, PORTABLE_SUBDIR);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
    return dir;
  }
  // Installiert & Entwicklung: %LOCALAPPDATA%\Haushaltsbuch (nicht im Programmordner,
  // der unter Program Files schreibgeschützt bzw. UAC-geschützt ist).
  const base = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  const dir = path.join(base, 'Haushaltsbuch');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
  return dir;
}

// Einmalige Migration: Daten aus dem alten Speicherort (Programmordner neben der EXE)
// in den neuen Ort kopieren, falls dort noch nichts liegt. Verhindert Datenverlust
// beim Update einer installierten Version. Portable ist nicht betroffen.
function migrateFromLegacyLocation() {
  try {
    if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
    if (fs.existsSync(dataFilePath())) return;
    const legacyDir = path.dirname(app.getPath('exe'));
    const legacyData = path.join(legacyDir, DATA_FILE);
    if (!fs.existsSync(legacyData)) return;
    fs.copyFileSync(legacyData, dataFilePath());
    const legacyState = path.join(legacyDir, WINDOW_STATE_FILE);
    if (fs.existsSync(legacyState)) fs.copyFileSync(legacyState, windowStatePath());
  } catch (e) { /* Migration ist best effort */ }
}
function dataFilePath() {
  return path.join(dataDir(), DATA_FILE);
}
function windowStatePath() {
  return path.join(dataDir(), WINDOW_STATE_FILE);
}

// ── Fenster-Zustand merken (Größe + Position) ────────────────────────────
function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    // Nur übernehmen, wenn die Zustandsversion zur aktuellen passt – so wird eine
    // alte gemerkte Größe nach einer Standard-Änderung einmalig verworfen.
    if (s && s.v === STATE_VERSION && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch (e) { /* keine/ungültige/alte Datei → Standard */ }
  return null;
}
function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const maximized = win.isMaximized();
    // Bei maximiert die "normalen" Bounds merken, damit das Wiederherstellen sinnvoll ist.
    const b = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(windowStatePath(), JSON.stringify({
      v: STATE_VERSION, x: b.x, y: b.y, width: b.width, height: b.height, maximized
    }, null, 2), 'utf8');
  } catch (e) { /* ignore */ }
}
// Liegt das Fenster (zumindest teilweise) auf einem sichtbaren Bildschirm?
function isOnScreen(b) {
  return screen.getAllDisplays().some(d => {
    const w = d.workArea;
    return b.x < w.x + w.width && b.x + b.width > w.x &&
           b.y < w.y + w.height && b.y + b.height > w.y;
  });
}

function createWindow() {
  const saved = loadWindowState();
  const opts = {
    width: (saved && saved.width) || DEFAULT_WIDTH,
    height: (saved && saved.height) || DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'Haushaltsbuch',
    autoHideMenuBar: true,
    backgroundColor: '#f3f2f1',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  // Gemerkte Position nur übernehmen, wenn sie auf einem Bildschirm liegt.
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) &&
      isOnScreen({ x: saved.x, y: saved.y, width: opts.width, height: opts.height })) {
    opts.x = saved.x; opts.y = saved.y;
  } else {
    opts.center = true;
  }

  const win = new BrowserWindow(opts);
  win.setMenuBarVisibility(false);
  if (saved && saved.maximized) win.maximize();

  win.once('ready-to-show', () => win.show());

  // Externe http(s)-Links im Standardbrowser öffnen; alles andere (file:, data: …)
  // wird nicht in einem neuen Fenster geöffnet.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Navigation des Hauptfensters unterbinden (die App ist eine einzelne lokale Seite).
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Änderungen entprellt speichern; beim Schließen final sichern.
  let stateTimer = null;
  const scheduleSave = () => {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(() => saveWindowState(win), 400);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('maximize', scheduleSave);
  win.on('unmaximize', scheduleSave);
  win.on('close', () => { clearTimeout(stateTimer); saveWindowState(win); });

  win.loadFile(path.join(__dirname, 'index.html'));
}

// ── IPC: Daten laden / speichern / Pfad ──────────────────────────────────
ipcMain.handle('hb-load', () => {
  try {
    const p = dataFilePath();
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  } catch (e) { /* Datei fehlt oder unlesbar → null */ }
  return null;
});

ipcMain.handle('hb-save', (_e, text) => {
  try {
    fs.writeFileSync(dataFilePath(), String(text), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('hb-path', () => dataFilePath());

// ── Auto-Update (nur installierte Version) ───────────────────────────────
// Prüft beim Start auf eine neuere Version in den GitHub-Releases, lädt sie im
// Hintergrund und bietet nach dem Download einen Neustart zum Installieren an.
// Die Portable-EXE kann sich nicht selbst aktualisieren und wird übersprungen;
// Fehler (offline, keine Rechte) werden still ignoriert.
function setupAutoUpdate() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    const win = BrowserWindow.getAllWindows()[0] || null;
    dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Update verfügbar',
      message: 'Version ' + info.version + ' wurde heruntergeladen.',
      detail: 'Soll Haushaltsbuch jetzt neu gestartet und aktualisiert werden? ' +
              'Andernfalls wird das Update beim nächsten Beenden installiert.'
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); })
      .catch(() => { /* Dialog-Fehler ignorieren */ });
  });
  autoUpdater.on('error', () => { /* offline / nicht erreichbar → still */ });
  autoUpdater.checkForUpdates().catch(() => { /* Netzwerkfehler ignorieren */ });
}

// ── App-Lebenszyklus ─────────────────────────────────────────────────────
app.whenReady().then(() => {
  migrateFromLegacyLocation();
  createWindow();
  setupAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
