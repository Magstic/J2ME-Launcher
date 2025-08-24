// Extract MIDlet-1 (or first MIDlet-*) label as canonical config name
async function getConfigGameName(jarPath, fallbackName) {
  const yauzl = require('yauzl');
  return await new Promise((resolve) => {
    try {
      yauzl.open(jarPath, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) return resolve(fallbackName);
        let done = false;
        const finish = (name) => { if (!done) { done = true; try { zipfile.close(); } catch(_){} resolve(name || fallbackName); } };
        zipfile.on('error', () => finish(fallbackName));
        zipfile.on('entry', (entry) => {
          if (done) return;
          const name = entry.fileName.replace(/\\/g, '/');
          if (name.toUpperCase() === 'META-INF/MANIFEST.MF') {
            zipfile.openReadStream(entry, (err2, rs) => {
              if (err2 || !rs) return finish(fallbackName);
              const chunks = [];
              rs.on('data', (c) => chunks.push(c));
              rs.on('end', () => {
                const content = Buffer.concat(chunks).toString();
                const lines = content.split(/\r?\n/);
                let label = null;
                let firstAny = null;
                for (const line of lines) {
                  const idx = line.indexOf(':');
                  if (idx > 0) {
                    const key = line.slice(0, idx).trim();
                    if (/^MIDlet-\d+$/i.test(key)) {
                      const value = line.slice(idx + 1).trim();
                      if (!firstAny) firstAny = value;
                      if (/^MIDlet-1$/i.test(key)) {
                        const parts = value.split(',');
                        if (parts.length > 0) label = parts[0].trim();
                        break;
                      }
                    }
                  }
                }
                if (!label && firstAny) {
                  const parts = firstAny.split(',');
                  if (parts.length > 0) label = parts[0].trim();
                }
                finish(label || fallbackName);
              });
              rs.on('error', () => finish(fallbackName));
            });
          } else {
            zipfile.readEntry();
          }
        });
        zipfile.on('end', () => finish(fallbackName));
        zipfile.readEntry();
      });
    } catch (_) {
      resolve(fallbackName);
    }
  });
}

module.exports = { getConfigGameName };
