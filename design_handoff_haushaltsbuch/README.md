# Handoff: Haushaltsbuch (Sidebar-Layout)

## Overview
Ein lokales Haushaltsbuch als Single-Page-App im Browser: Einnahmen/Ausgaben erfassen, filtern, sortieren, Monatsbudgets, wiederkehrende Buchungen (Daueraufträge), eigene Kategorien, Diagramme und CSV-Import/-Export. Alle Daten werden lokal gespeichert (localStorage), kein Server.

**Umzusetzen ist ausschließlich das Sidebar-Layout** (der Prototyp enthält zusätzlich Tabs/Dashboard-Varianten und einen Layout-Umschalter im Header — beides weglassen).

## About the Design Files
Die Dateien in diesem Bundle sind **Design-Referenzen in HTML** — Prototypen, die Aussehen und Verhalten zeigen, kein Produktionscode zum Kopieren. Aufgabe: die Designs 1:1 in der Zielumgebung nachbauen (React, Vue, Svelte …) mit deren etablierten Patterns. Existiert noch keine Umgebung, wähle einen passenden Stack (Empfehlung: Vite + React, oder Vanilla JS — die App ist klein genug).

- `Haushaltsbuch.dc.html` — der Prototyp. Das Markup steht in `<x-dc>…</x-dc>` (Template mit `{{ holes }}` und `<sc-if>`/`<sc-for>` als Conditional/Loop), die komplette Logik als React-ähnliche Klasse `Component` im `<script>`-Block. Die gesamte Geschäftslogik (CSV-Parser, Daueraufträge, Sortierung, Budgets) kann fast 1:1 übernommen werden.
- `styles.css` — Basis-Stylesheet (Klassen `.card`, `.btn`, `.input`, `.tag`, `.table`, `.field`). **Wichtig:** Der Prototyp überschreibt dessen `:root`-Variablen in einem eigenen `<style>`-Block (Excel-Farbpalette + Fonts) — die Overrides gelten, nicht die Originalwerte in styles.css.

## Fidelity
**High-fidelity.** Farben, Typografie, Abstände, Radii und Zustände sind final und sollen pixelgenau übernommen werden.

## Design Tokens (finale Werte, nach Override)
Farben:
- Hintergrund Seite: #f3f2f1 · Karten/Flächen: #ffffff · Text: #252423
- Primär/Grün (UI, Einnahmen): 100 #e8f5ec, 200 #cfe8d7, 300 #a4d3b4, 400 #6fb587, 500 #3d9163, 600 #217346, 700 #175c38, 800 #10432a, 900 #0a2c1c
- Rot (Ausgaben, Löschen, Budget überschritten): 100 #fdecea, 200 #f9d3cf, 300 #f0aba4, 400 #e07d73, 500 #cc5449, 600 #b03a30, 700 #8f2b23, 800 #671e18, 900 #43130f
- Neutral: 100 #f7f7f6, 200 #ecebe9, 300 #d9d7d4, 400 #bcbab6, 500 #9d9a95, 600 #7d7a75, 700 #605d58, 800 #43413d, 900 #2b2927
- Divider: color-mix(in srgb, #252423 16%, transparent)

Typografie (Google Fonts):
- Headings: "Source Serif 4", Georgia, serif — weight 600. H1 28px, Karten-H2 21px, Abschnitts-H3 13px uppercase, letter-spacing 0.08em, opacity 0.6
- Body: "Source Sans 3", "Segoe UI", system-ui, sans-serif — 14px Standard, Tabellen 14px, Kleintext 12–13px
- KPI-Zahlen: 24px / 700

Sonstiges: Radius md ~10px, lg ~16px, Pills 999px; Karten weiß mit dezentem Schatten (siehe .card in styles.css); Fokus-Ring 2px grün.

Favicon: SVG-Data-URI, €-Zeichen weiß auf #217346, border-radius 14/64.

## Screens / Views (Sidebar-Layout)
Grundgerüst: Header oben (volle Breite), darunter flex-row aus fester Sidebar (230px) links und Content-Spalte rechts (padding 10px 32px 40px, Karten untereinander mit gap 20px).

### Header
- H1 „Haushaltsbuch" (Serif 28px), daneben Saldo-Gesamt als Tag-Pill (grün bei ≥0, rot bei <0), Format „Saldo 1.234,56 €".
- Layout-Umschalter rechts im Prototyp: **weglassen**.

### Sidebar (230px, fix)
- Navigation als vertikale Pill-Buttons: Übersicht, Buchungen, Budgets, Daueraufträge, Kategorien. Aktiv: Grün #3d9163, weiße Schrift. Hover: #217346 + weiße Schrift. Inaktiv: transparent, Textfarbe. Padding 10px 18px, 14px/600, radius 999px.
- Darunter Monats-Zusammenfassung als weiße Karte (radius lg): Monatslabel (12px uppercase), Zeilen Einnahmen (grün 700), Ausgaben (rot 700), Saldo (Trennlinie oben).

### Übersicht
- Kopf: H2 + Monats-Pager (‹ Monatsname Jahr ›).
- 3 KPI-Boxen (grid 3 Spalten, gap 14px): Einnahmen (bg grün-100, Zahl grün-800), Ausgaben (bg rot-100, Zahl rot-800), Saldo Monat (bg neutral/weiß). Label 12px uppercase, Zahl 24px/700.
- 2-spaltiges Grid (`minmax(0,1fr) minmax(0,1fr)`, gap 28px — minmax ist wichtig, sonst kollabiert die linke Spalte):
  - Links „Ausgaben nach Kategorie": horizontale Balken, Zeile = Name (110px) + Track (16px hoch, bg neutral-200, radius 999px) + Betrag (80px, rechtsbündig). Füllung rot-500, Breite relativ zum Maximum.
  - Rechts „Verlauf – 12 Monate": 12 Monatsgruppen, je 2 vertikale Balken (10px breit, radius oben 999px): Einnahmen grün-500, Ausgaben rot-500, Höhe relativ zum Maximum (max 110px, min 3px), Monatskürzel darunter (11px). Legende mit Farbpunkten.

### Buchungen
Zwei Karten:
1. **Formular** „Neue Buchung" / „Buchung bearbeiten":
   - Segmented-Pill Ausgabe/Einnahme (aktiv: Ausgabe rot-500, Einnahme grün-500, weiße Schrift; Container bg neutral-100, radius 999px)
   - Felder: Betrag (number, step 0.01), Datum (date), Kategorie (select, gefiltert nach Typ), Beschreibung (text). Labels über den Feldern.
   - Primärbutton grün „Buchung hinzufügen" / „Speichern", bei Bearbeitung zusätzlich „Abbrechen" (ghost).
   - Validierung: Betrag > 0 und Datum erforderlich (sonst Hinweis).
2. **Tabelle** mit Toolbar:
   - Kopfzeile: H2 „Buchungen", Buttons „CSV exportieren" / „CSV importieren" (secondary, Import über verstecktes file-input).
   - Filterzeile: Pill-Umschalter Monat/Alle; bei „Monat" Monats-Pager, bei „Alle" zwei Datumsfelder von–bis; Suchfeld (Beschreibung + Kategoriename); Kategorie-Select; Typ-Select (Alle/Einnahmen/Ausgaben).
   - Spalten: Datum, Beschreibung, Kategorie (Tag-Pill: Einnahme grün, Ausgabe neutral), Typ, Betrag (rechtsbündig, „+"/„−"-Präfix, Einnahme grün-700 / Ausgabe rot-700, weight 600), Aktionen (Bearbeiten / Löschen, Löschen rot).
   - Alle Spaltenköpfe klickbar sortierbar, Toggle asc/desc mit ↑/↓-Indikator. Default: Datum desc.
   - Tabelle horizontal scrollbar (overflow-x auto). Fußzeile: „N Buchungen · Summe: X €" (Summe = Einnahmen − Ausgaben der gefilterten Ansicht). Leerzustand: „Keine Buchungen im gewählten Zeitraum."

### Budgets
- Pro **Ausgaben**-Kategorie eine Zeile: Name (130px) + Fortschrittsbalken (12px, bg neutral-200) + Status („X € von Y € (Z %)" bzw. „– überschritten!" / „kein Budget") + Zahleneingabe (100px, rechtsbündig) für den Budgetbetrag.
- Balkenfarbe: grün-500 normal, rot-400 ab Warnschwelle (Default 80 %), rot-700 über 100 % (Breite gedeckelt bei 100 %).
- Budget leeren/0 = kein Budget.

### Daueraufträge
- Liste: je Eintrag eine weiße Zeile (radius md, padding 10px 16px) mit Checkbox (aktiv/pausiert) + Name (bold), Kategorie-Tag, „am N. des Monats", Betrag (+grün/−rot), Löschen.
- Formular darunter: Name, Betrag, Typ (select), Kategorie (nach Typ gefiltert), Tag (1–28), Button „Hinzufügen".
- **Verhalten:** Beim App-Start (und nach Anlegen/Aktivieren) werden für jeden aktiven Dauerauftrag ab seinem Startmonat für alle Monate bis heute fehlende Buchungen automatisch erzeugt (Duplikatschutz über recId + Monat; nur wenn Fälligkeitsdatum ≤ heute).

### Kategorien
- Zwei Spalten „Ausgaben" / „Einnahmen" mit Tag-Pills (Ausgaben rötlich, Einnahmen grün). Eigene (custom) Kategorien haben ein ×-Icon zum Löschen; Standardkategorien nicht.
- Formular: Name + Typ-Select + „Anlegen".
- Fußbereich: Hinweis „Alle Daten liegen lokal in deinem Browser…" + Button „Alle Daten löschen" (rot, mit confirm(), setzt auf Seed-Daten zurück).

## Interactions & Behavior
- Sofortiges Speichern jeder Änderung nach localStorage (Key z. B. `hb-data-v1`), ein JSON-Objekt `{ tx, cats, budgets, rec }`.
- Beträge in EUR formatieren via `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`; Datum `dd.mm.yyyy`.
- Eingabe akzeptiert Komma als Dezimaltrenner.
- Monats-Pager wirkt global auf Übersicht, Sidebar-Karte, Buchungen (Monatsmodus) und Budgets.
- Hover: Nav/Pills → dunkelgrün #217346 + weiß; Buttons gemäß styles.css.
- CSV-Export: Semikolon-getrennt, Header `Datum;Typ;Kategorie;Beschreibung;Betrag`, Datum ISO, Betrag mit Komma, UTF-8 mit BOM (Excel-kompatibel), Dateiname `haushaltsbuch-YYYY-MM-DD.csv`.
- CSV-Import: erkennt Delimiter (;/,), überspringt Headerzeile, quoted fields mit ""-Escape, legt unbekannte Kategorien automatisch an, validiert Datum (ISO) und Betrag > 0, meldet Anzahl importierter Zeilen.

## State Management
- `data`: { tx: [{id, datum ISO, typ 'einnahme'|'ausgabe', catId, text, betrag, recId?}], cats: [{id, name, typ, custom}], budgets: {catId: number}, rec: [{id, name, betrag, typ, catId, tag 1–28, aktiv, von 'YYYY-MM'}] } — persistiert.
- UI-State: aktiver Abschnitt, Monat (YYYY-MM), Ansichtsmodus monat/alle, Filter (Suche, Kategorie, Typ, von, bis), Sortierung (key, dir), Formularfelder, editId.
- Seed-Daten beim ersten Start: 10 Standardkategorien (Gehalt, Sonstige Einnahmen / Lebensmittel, Wohnen, Transport, Freizeit, Gesundheit, Versicherungen, Kleidung, Sonstiges), Beispielbuchungen, 4 Daueraufträge (Miete 950 €, Gehalt 2800 €, Streaming 12,99 €, Haftpflicht 8,90 €), Beispielbudgets. In Produktion optional durch leeren Zustand ersetzen.

## Assets
Keine Bilddateien. Favicon als inline SVG-Data-URI (siehe Prototyp-Helmet). Fonts via Google Fonts (Source Serif 4: 400/600/700, Source Sans 3: 400/600/700).

## Files
- `Haushaltsbuch.dc.html` — Prototyp (Markup + komplette Logik + Farb-/Font-Overrides im Helmet)
- `styles.css` — Basis-Stylesheet (Komponentenklassen; :root-Variablen werden vom Prototyp überschrieben)
