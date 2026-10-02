# Code-Signing über SignPath (kostenlos für Open Source)

Ziel: Die Windows-Warnung **„Der Computer wurde durch Windows geschützt" (SmartScreen)**
loswerden, indem die EXE mit einem vertrauenswürdigen Zertifikat signiert wird.

[SignPath Foundation](https://signpath.org/) stellt Open-Source-Projekten dafür ein
kostenloses Code-Signing-Zertifikat bereit. Signiert wird **nicht lokal**, sondern im
GitHub-Actions-Build (der Workflow dafür liegt unter `.github/workflows/release.yml`).

> Solange SignPath noch nicht eingerichtet ist, veröffentlicht der Workflow die
> Releases **unsigniert** – alles funktioniert weiter, nur die Warnung bleibt.

## Einmalige Einrichtung (dein Teil)

1. **Registrieren:** Auf <https://about.signpath.io/product/open-source> das kostenlose
   OSS-Programm beantragen und dich mit dem GitHub-Konto anmelden. SignPath prüft das
   Projekt manuell – das kann ein paar Tage dauern.
2. **Organisation anlegen** (bzw. der genehmigten OSS-Organisation beitreten) und die
   `organization-id` notieren (SignPath → Organization → Settings).
3. **Projekt anlegen:** Projekt `haushaltsbuch` mit dem GitHub-Repo `DFK83/haushaltsbuch`
   verknüpfen. Dabei entstehen:
   - eine **Artifact Configuration** (Typ: einzelne Dateien / ZIP mit `.exe`) – deren Slug notieren,
   - eine **Signing Policy** (z. B. `release-signing`, nutzt das Foundation-Zertifikat) – deren Slug notieren.
4. **GitHub konfigurieren** unter *Repo → Settings → Secrets and variables → Actions*:
   - **Secret**
     - `SIGNPATH_API_TOKEN` – API-Token aus SignPath (User → API Tokens)
   - **Variables**
     - `SIGNPATH_ORGANIZATION_ID`
     - `SIGNPATH_PROJECT_SLUG` = `haushaltsbuch`
     - `SIGNPATH_SIGNING_POLICY_SLUG` = z. B. `release-signing`
     - `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` = Slug aus Schritt 3

Danach ist nichts weiter nötig – der Workflow erkennt das Secret automatisch und signiert.

## Release bauen (ab jetzt)

Releases laufen über GitHub Actions, damit SignPath den Build nachvollziehen kann:

```bash
# Version in package.json erhöhen, committen, dann taggen und pushen:
git tag v1.0.9
git push origin v1.0.9
```

Der Workflow baut dann, signiert (sobald eingerichtet), erzeugt `latest.yml` für die
signierte Datei neu (sonst würde das Auto-Update fehlschlagen) und veröffentlicht das
Release mit Setup- und Portable-EXE.

Lokales `npm run dist` funktioniert weiterhin zum **Testen** – diese Builds sind aber
unsigniert und sollten nicht als Release verteilt werden.

## Hinweise

- **Reputation:** Mit dem SignPath-Foundation-Zertifikat signierte Dateien werden von
  SmartScreen in der Regel sofort akzeptiert. In seltenen Fällen baut sich die Reputation
  erst über einige Downloads auf.
- **Auto-Update:** Der Workflow erzeugt `latest.yml` passend zur signierten EXE
  (`scripts/make-latest-yml.js`), damit `electron-updater` die Datei akzeptiert.
- **Portable-EXE** wird ebenfalls signiert, aktualisiert sich aber weiterhin nicht selbst.
