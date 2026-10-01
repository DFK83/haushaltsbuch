# Claude Code Prompt

Kopiere den folgenden Prompt in Claude Code (im entpackten Ordner ausführen):

---

Baue mir eine Haushaltsbuch-Web-App exakt nach der Design-Referenz in diesem Ordner.

Lies zuerst `README.md` vollständig — es enthält die komplette Spezifikation (Layout, Design-Tokens, alle Screens, Verhalten, Datenmodell). `Haushaltsbuch.dc.html` ist der HTML-Prototyp (Markup + Logik als Referenz), `styles.css` das Basis-Stylesheet.

Anforderungen:
1. Setze **ausschließlich das Sidebar-Layout** um (Header oben, 230px-Sidebar links mit Navigation + Monats-Zusammenfassung, Content rechts). Den Layout-Umschalter im Header des Prototyps weglassen.
2. Pixelgenaue Umsetzung: exakt die Farben, Fonts (Source Serif 4 / Source Sans 3), Abstände, Radii und Hover-Zustände aus dem README. Einnahmen grün, Ausgaben rot, Excel-Grün #217346 als Primärfarbe.
3. Voller Funktionsumfang: Buchungen anlegen/bearbeiten/löschen, sortierbare Tabelle mit allen Filtern (Monat/Zeitraum, Suche, Kategorie, Typ), Monatsbudgets mit Warnschwellen-Balken, Daueraufträge mit automatischer monatlicher Buchung, Standard- + eigene Kategorien, Übersichts-Diagramme (Kategoriebalken + 12-Monats-Verlauf), CSV-Import/-Export (Excel-kompatibel, Details im README).
4. Persistenz lokal im Browser (localStorage), Datenmodell wie im README beschrieben. Kein Server, keine externen Abhängigkeiten außer Google Fonts.
5. Stack: Vanilla HTML/CSS/JS als einzelne `index.html` (oder Vite + React, falls du das für wartbarer hältst — dann ohne UI-Bibliotheken). Die App muss per Doppelklick auf die HTML-Datei im Browser laufen.
6. Starte ohne Beispieldaten (leerer Zustand mit den 10 Standardkategorien), das €-Favicon aus dem Prototyp übernehmen.

Vergleiche dein Ergebnis am Ende Screen für Screen mit der Spezifikation im README.
