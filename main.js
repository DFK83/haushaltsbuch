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
function localBase() {
  return process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
}
function dataDir() {
  // Portable-EXE: Daten im Unterordner neben der EXE (bleibt self-contained).
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const dir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, PORTABLE_SUBDIR);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
    return dir;
  }
  // Installiert & Entwicklung: %LOCALAPPDATA%\DFK83\Haushaltsbuch
  // (Vendor-Ordner, passend zum Installationsordner; nicht im Programmordner,
  // der unter Program Files schreibgeschützt bzw. UAC-geschützt ist).
  const dir = path.join(localBase(), 'DFK83', 'Haushaltsbuch');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
  return dir;
}

// Migration beim Start: Liegt am aktuellen Speicherort noch keine Datendatei,
// werden die bekannten Speicherorte früherer Versionen der Reihe nach geprüft
// (neueste zuerst) und die Daten von dort übernommen. So wandern die Daten bei
// jeder Änderung der Installations-/Speichermethode automatisch mit.
// Portable bleibt außen vor (dort liegen die Daten immer neben der EXE).
function migrateFromLegacyLocation() {
  try {
    if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
    if (fs.existsSync(dataFilePath())) return;
    const legacyDirs = [
      path.join(localBase(), 'Haushaltsbuch'),   // 1.0.3–1.0.5
      path.dirname(app.getPath('exe'))           // 1.0.0–1.0.2 (neben der EXE)
    ];
    const src = legacyDirs.find(d => fs.existsSync(path.join(d, DATA_FILE)));
    if (!src) return;
    fs.copyFileSync(path.join(src, DATA_FILE), dataFilePath());
    const legacyState = path.join(src, WINDOW_STATE_FILE);
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
      nodeIntegration: false,
      // Sandbox aus: das Preload muss die Datei-Bruecke (window.hbNative) zuverlaessig
      // bereitstellen, damit automatisch gespeichert wird. Der Renderer laedt nur
      // lokale, vertrauenswuerdige Inhalte und ist per strikter CSP abgesichert.
      sandbox: false
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

ipcMain.handle('hb-version', () => app.getVersion());

// JSON-Datenbank an einen gewählten Ort exportieren.
ipcMain.handle('hb-export', async (_e, text) => {
  try {
    const win = BrowserWindow.getAllWindows()[0] || null;
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(win, {
      title: 'Daten exportieren',
      defaultPath: 'haushaltsbuch-' + stamp + '.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, String(text), 'utf8');
    return { ok: true, path: r.filePath };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// JSON-Datenbank aus einer gewählten Datei importieren (Inhalt an den Renderer geben).
ipcMain.handle('hb-import', async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0] || null;
    const r = await dialog.showOpenDialog(win, {
      title: 'Daten importieren',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
    const text = fs.readFileSync(r.filePaths[0], 'utf8');
    return { ok: true, text };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// ── In-App-Update (nur installierte Version) ─────────────────────────────
// Prüft beim Start und auf Knopfdruck auf eine neuere GitHub-Release, lädt sie
// im Hintergrund und installiert sie auf Wunsch still aus der App heraus
// (ohne Installer-Fenster). Der Fortschritt wird an die Oberfläche gemeldet.
// Portable/Entwicklung können sich nicht selbst aktualisieren.
function sendUpdate(payload) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send('hb-update', payload);
}
function setupAutoUpdate() {
  const updatable = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
  ipcMain.handle('hb-update-check', async () => {
    if (!updatable) return { supported: false };
    try {
      const r = await autoUpdater.checkForUpdates();
      return { supported: true, version: r && r.updateInfo && r.updateInfo.version };
    } catch (e) { return { supported: true, error: String((e && e.message) || e) }; }
  });
  // Stille Installation (kein Installer-Fenster), direkt aus der App.
  ipcMain.handle('hb-update-install', () => {
    if (!updatable) return false;
    autoUpdater.quitAndInstall(true, true);
    return true;
  });
  if (!updatable) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdate({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdate({ state: 'downloaded', version: info.version }));
  autoUpdater.on('error', (e) => sendUpdate({ state: 'error', error: String((e && e.message) || e) }));
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
