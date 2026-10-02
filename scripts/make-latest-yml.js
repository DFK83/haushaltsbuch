'use strict';
/* Erzeugt latest.yml für electron-updater aus einer (signierten) Setup-EXE.
   Nötig, weil das Signieren die EXE verändert und die von electron-builder
   erzeugte latest.yml dann eine falsche Prüfsumme/Größe enthält.
   Aufruf: node scripts/make-latest-yml.js <setup-exe> <version>  (Ausgabe nach stdout) */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function buildYml(file, version, now) {
  const buf = fs.readFileSync(file);
  const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
  const name = path.basename(file);
  return [
    'version: ' + version,
    'files:',
    '  - url: ' + name,
    '    sha512: ' + sha512,
    '    size: ' + buf.length,
    'path: ' + name,
    'sha512: ' + sha512,
    "releaseDate: '" + now + "'",
    ''
  ].join('\n');
}

if (require.main === module) {
  const [file, version] = process.argv.slice(2);
  if (!file || !version) { console.error('Aufruf: make-latest-yml.js <setup-exe> <version>'); process.exit(1); }
  process.stdout.write(buildYml(file, version, new Date().toISOString()));
}

module.exports = { buildYml };
