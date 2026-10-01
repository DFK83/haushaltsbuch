# Haushaltsbuch

Lokale Desktop-App (Windows) zur Verwaltung von Einnahmen und Ausgaben. Kein Server, kein Konto, keine Cloud – alle Daten bleiben in einer JSON-Datei auf dem eigenen Rechner.

## Funktionen

- **Übersicht** – Einnahmen, Ausgaben und Saldo pro Monat, Ausgaben nach Kategorie, Auswertung nach Person, Verlauf über 12 Monate
- **Buchungen** – erfassen, bearbeiten, löschen, filtern und sortieren; CSV-Import und -Export
- **Budgets** – Monatsbudgets je Kategorie mit Warnung bei Überschreitung
- **Daueraufträge** – wiederkehrende Buchungen, die automatisch angelegt werden
- **Kategorien & Einstellungen** – eigene Kategorien und Personen, Anzeigeoptionen, Datendatei wechseln
- Fenstergröße und -position werden gespeichert

## Download

Unter [Releases](../../releases) gibt es jede Version in zwei Varianten:

| Datei | Beschreibung |
|---|---|
| `Haushaltsbuch-Setup-<version>-x64.exe` | Installer mit Startmenü- und Desktop-Verknüpfung, Installationsordner wählbar |
| `Haushaltsbuch-Portable.exe` | Ohne Installation, z. B. für einen USB-Stick |

## Speicherort der Daten

| Variante | Ort |
|---|---|
| Installiert | `haushaltsbuch-daten.json` im Programmordner |
| Portable | Unterordner `Haushaltsbuch-Daten\` neben der EXE |
| Entwicklung | Projektordner |

Zum Sichern reicht es, diese Datei zu kopieren.

## Entwicklung

Voraussetzung: [Node.js](https://nodejs.org/) (LTS)

```bash
npm install
npm start      # App starten
npm run dist   # Installer + Portable-EXE nach dist/ bauen
```

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Komplette Oberfläche und Logik (Vanilla JS) |
| `main.js` | Electron-Hauptprozess: Fenster, Lesen und Schreiben der Datendatei |
| `preload.js` | Sichere IPC-Brücke (`window.hbNative`) |
| `icon.ico` | App-Icon |
| `design_handoff_haushaltsbuch/` | Ursprüngliche Design-Vorlage |

Technik: Electron 33, electron-builder (NSIS + Portable), Windows x64.

## Lizenz

© 2026 Daniel Kronawitter – alle Rechte vorbehalten.
