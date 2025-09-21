// src/main/backup/providers/webdav.js
// Minimal WebDAV provider using HTTP(S) with Basic Auth or Bearer token
// Exposes the same interface as s3.js/dropbox.js: readText, writeText, uploadFile, deleteFile, downloadFile, list

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

function normalizePrefix(p) {
  if (!p) return '';
  return p.replace(/^\/+/, '').replace(/\/+$/, '');
}

function joinPosix(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return `${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`;
}

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}

function buildAuthHeader({ username, password, bearerToken }) {
  if (bearerToken) return `Bearer ${bearerToken}`;
  if (username || password) {
    const token = Buffer.from(`${username || ''}:${password || ''}`, 'utf8').toString('base64');
    return `Basic ${token}`;
  }
  return undefined;
}

function requestRaw({ method, url, headers = {}, body = null, stream = null }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === 'http:' ? http : https;
    const req = client.request(
      {
        method,
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + (u.search || ''),
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString('utf8');
          resolve({ status: res.statusCode || 0, headers: res.headers, buffer, text });
        });
      }
    );
    req.on('error', reject);
    if (stream) {
      stream.on('error', (e) => req.destroy(e));
      stream.pipe(req);
    } else if (body) {
      req.write(body);
      req.end();
    } else {
      req.end();
    }
  });
}

function ensureLeadingSlash(p) {
  if (!p) return '/';
  return p.startsWith('/') ? p : '/' + p;
}

function createWebdavProvider(params = {}) {
  const {
    baseUrl, // required, e.g. https://webdav.example.com/remote.php/dav/files/user
    username, // optional if bearerToken provided
    password, // optional if bearerToken provided
    bearerToken, // optional
    prefix = '', // optional directory under the baseUrl to store files
  } = params;

  if (!baseUrl) throw new Error('webdav: missing baseUrl');

  const base = String(baseUrl).replace(/\/+$/, '');
  const root = normalizePrefix(prefix);
  const authHeader = buildAuthHeader({ username, password, bearerToken });

  const toUrl = (relPath) => {
    const rel = root ? joinPosix(root, relPath) : relPath;
    // WebDAV paths are URL paths; we should encode each segment but keep '/'
    const safeRel = toPosix(rel).split('/').map(encodeURIComponent).join('/');
    return base + ensureLeadingSlash(safeRel);
  };

  function debugLog(tag, obj) {
    try {
      console.log(`[backup:webdav] ${tag}`, obj);
    } catch (_) {}
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function isRetryableStatus(s) {
    if (!s) return true; // network
    if (s === 409 || s === 412 || s === 423 || s === 425 || s === 429) return true;
    if (s >= 500 && s <= 599) return true;
    return false;
  }

  // Issue MKCOL with basic redirect handling and conflict-tolerant semantics.
  async function mkcolOnce(url) {
    const headers = authHeader
      ? { Authorization: authHeader, 'If-None-Match': '*' }
      : { 'If-None-Match': '*' };
    const res = await requestRaw({ method: 'MKCOL', url, headers });
    // Follow one redirect if provided
    if (
      (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) &&
      res.headers &&
      res.headers.location
    ) {
      let next = res.headers.location;
      if (!next.endsWith('/')) next += '/';
      return await requestRaw({ method: 'MKCOL', url: next, headers });
    }
    return res;
  }

  // Ensure the configured prefix chain and the file's parent directories exist via MKCOL.
  async function ensureParentDirs(relPath) {
    try {
      // Build full directory chain: prefix parts + parent parts of relPath
      const rootParts = root ? toPosix(root).split('/').filter(Boolean) : [];
      const fileParts = toPosix(relPath).split('/').filter(Boolean);
      const parentParts = fileParts.slice(0, Math.max(0, fileParts.length - 1));
      // Create prefix chain first
      for (let i = 1; i <= rootParts.length; i++) {
        const dirRel = rootParts.slice(0, i).join('/');
        let url = base + ensureLeadingSlash(dirRel.split('/').map(encodeURIComponent).join('/'));
        if (!url.endsWith('/')) url += '/'; // many servers require trailing slash for MKCOL targets
        debugLog('mkcol prefix', { url });
        const res = await mkcolOnce(url);
        if (res.status >= 200 && res.status < 300) continue;
        if (res.status === 405 || res.status === 409 || res.status === 412) continue; // exists or precondition
        debugLog('mkcol prefix non-success', { url, status: res.status });
      }
      // Then create parent directories under prefix
      for (let i = 1; i <= parentParts.length; i++) {
        const underRoot = root
          ? joinPosix(root, parentParts.slice(0, i).join('/'))
          : parentParts.slice(0, i).join('/');
        let url = base + ensureLeadingSlash(underRoot.split('/').map(encodeURIComponent).join('/'));
        if (!url.endsWith('/')) url += '/';
        debugLog('mkcol parent', { url });
        const res = await mkcolOnce(url);
        if (res.status >= 200 && res.status < 300) continue;
        if (res.status === 405 || res.status === 409 || res.status === 412) continue;
        debugLog('mkcol parent non-success', { url, status: res.status });
      }
    } catch (e) {
      // Non-fatal: attempt PUT anyway
      debugLog('ensureParentDirs error', { message: e && e.message });
    }
  }

  return {
    async readText(relPath) {
      const url = toUrl(relPath);
      debugLog('readText', { url });
      const res = await requestRaw({
        method: 'GET',
        url,
        headers: authHeader
          ? { Authorization: authHeader, Accept: 'text/*' }
          : { Accept: 'text/*' },
      });
      if (res.status === 404) return null;
      if (res.status < 200 || res.status >= 300) {
        debugLog('readText error', { status: res.status });
        return null;
      }
      return res.text;
    },

    async writeText(relPath, text) {
      await ensureParentDirs(relPath);
      const url = toUrl(relPath);
      const body = Buffer.from(String(text || ''), 'utf8');
      const baseHeaders = authHeader
        ? {
            Authorization: authHeader,
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': String(body.length),
          }
        : { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(body.length) };
      let lastErrText = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        debugLog('writeText attempt', { url, attempt });
        const res = await requestRaw({ method: 'PUT', url, headers: baseHeaders, body });
        if (res.status >= 200 && res.status < 300) return;
        lastErrText = (res.text || '').slice(0, 200);
        if ((res.status === 409 || res.status === 412) && attempt < 2) {
          // Parent may not exist yet or precondition failed; ensure and retry
          await ensureParentDirs(relPath);
        }
        if (!isRetryableStatus(res.status) || attempt === 2) {
          throw new Error(`webdav writeText failed: ${res.status} ${lastErrText}`);
        }
        await sleep(250 * (attempt + 1));
      }
    },

    async uploadFile(relPath, localPath, size, onProgress) {
      await ensureParentDirs(relPath);
      const url = toUrl(relPath);
      if (onProgress) onProgress(0);
      let contentLength = null;
      try {
        if (typeof size === 'number' && size >= 0) contentLength = size;
        else contentLength = fs.statSync(localPath).size;
      } catch (_) {
        contentLength = null;
      }
      const baseHeaders = authHeader
        ? {
            Authorization: authHeader,
            'Content-Type': 'application/octet-stream',
            ...(contentLength != null ? { 'Content-Length': String(contentLength) } : {}),
          }
        : {
            'Content-Type': 'application/octet-stream',
            ...(contentLength != null ? { 'Content-Length': String(contentLength) } : {}),
          };
      let lastErrText = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        const stream = fs.createReadStream(localPath);
        debugLog('uploadFile attempt', { url, localPath, size, attempt });
        const res = await requestRaw({ method: 'PUT', url, headers: baseHeaders, stream });
        if (res.status >= 200 && res.status < 300) {
          if (onProgress) onProgress(100);
          debugLog('uploadFile done', { url });
          return;
        }
        lastErrText = (res.text || '').slice(0, 200);
        if ((res.status === 409 || res.status === 412) && attempt < 2) {
          await ensureParentDirs(relPath);
        }
        if (!isRetryableStatus(res.status) || attempt === 2) {
          throw new Error(`webdav uploadFile failed: ${res.status} ${lastErrText}`);
        }
        await sleep(250 * (attempt + 1));
      }
    },

    async deleteFile(relPath) {
      const url = toUrl(relPath);
      debugLog('deleteFile', { url });
      const res = await requestRaw({
        method: 'DELETE',
        url,
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      // many servers return 204/200 or 404 if absent
      if (res.status >= 400 && res.status !== 404)
        debugLog('deleteFile error', { status: res.status });
    },

    async downloadFile(relPath, localPath) {
      const url = toUrl(relPath);
      debugLog('downloadFile start', { url, localPath });
      const res = await requestRaw({
        method: 'GET',
        url,
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      if (res.status < 200 || res.status >= 300)
        throw new Error(`webdav downloadFile failed: ${res.status}`);
      await new Promise((resolve, reject) => {
        try {
          fse.ensureDirSync(path.dirname(localPath));
        } catch (_) {}
        fs.writeFile(localPath, res.buffer, (err) => (err ? reject(err) : resolve()));
      });
      debugLog('downloadFile done', { url });
    },

    async list(prefixRel = '') {
      // Use PROPFIND Depth: infinity to list all files under prefixRel
      const rel = toPosix(prefixRel).replace(/\/+$/, '');
      const relUrl = toUrl(rel || '');
      debugLog('list', { url: relUrl });
      const headers = { Depth: 'infinity' };
      if (authHeader) headers['Authorization'] = authHeader;
      headers['Content-Type'] = 'text/xml; charset="utf-8"';
      const body = Buffer.from(
        `<?xml version="1.0" encoding="utf-8"?>\n` +
          `<d:propfind xmlns:d="DAV:">\n` +
          `  <d:prop>\n` +
          `    <d:displayname/>\n` +
          `    <d:getcontentlength/>\n` +
          `    <d:resourcetype/>\n` +
          `  </d:prop>\n` +
          `</d:propfind>\n`,
        'utf8'
      );
      const res = await requestRaw({ method: 'PROPFIND', url: relUrl, headers, body });
      if (res.status < 200 || res.status >= 300) {
        debugLog('list error', { status: res.status, text: res.text });
        return [];
      }
      const text = res.text || '';
      // Very small XML parse: extract href, getcontentlength, resourcetype collection
      const entries = [];
      const hrefRe =
        /<d:response>[\s\S]*?<d:href>([\s\S]*?)<\/d:href>[\s\S]*?<d:propstat>[\s\S]*?<d:prop>[\s\S]*?<d:getcontentlength>([0-9]+)?<[\s\S]*?<d:resourcetype>([\s\S]*?)<\/d:resourcetype>[\s\S]*?<\/d:prop>[\s\S]*?<\/d:propstat>[\s\S]*?<\/d:response>/gi;
      const baseU = new URL(relUrl);
      const basePath = baseU.pathname.replace(/\/+$/, '') + (rel ? '' : '');
      let m;
      const seen = new Set();
      while ((m = hrefRe.exec(text)) !== null) {
        const href = m[1] || '';
        let sizeStr = m[2] || '';
        const resType = m[3] || '';
        // Normalize and decode href
        let hrefPath;
        try {
          const abs = new URL(href, base).pathname; // absolute path
          hrefPath = decodeURIComponent(abs);
        } catch {
          hrefPath = decodeURIComponent(href);
        }
        // Skip the directory itself
        if (hrefPath.replace(/\/+$/, '') === basePath.replace(/\/+$/, '')) continue;
        const isDir = /<d:collection\b/i.test(resType);
        const name = hrefPath.split('/').filter(Boolean).pop() || '';
        // Only include files; directories are not needed in our interface
        if (!isDir) {
          // Build rel filename relative to root+prefix
          let relFull = hrefPath;
          // Strip base root path part
          if (hrefPath.startsWith(baseU.pathname)) relFull = hrefPath.slice(baseU.pathname.length);
          relFull = relFull.replace(/^\/+/, '');
          // Prepend prefix root for consistency with other providers: we expect provider to return keys (filenames) as remote full paths
          const filename = (root ? joinPosix(root, relFull) : relFull).replace(/^\/+/, '');
          if (!seen.has(filename)) {
            seen.add(filename);
            entries.push({
              filename,
              basename: name,
              isDirectory: false,
              size: Number(sizeStr || 0),
            });
          }
        }
      }
      return entries;
    },
  };
}

module.exports = { createWebdavProvider };
