// src/main/backup/providers/dropbox.js
// Minimal Dropbox provider wrapper using HTTPS (no extra deps)
// Implements the same interface as s3.js: readText, writeText, uploadFile, deleteFile, downloadFile, list
// Notes:
// - Designed for an "App folder" scoped Dropbox app. All paths are relative to the app folder root.
// - Large files (>150MB) require upload session API. This implementation handles small/medium files directly.
// - Token refresh is optional; if refreshToken + clientId are provided, a refresh attempt will be made on 401.

const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const fse = require('fs-extra');

const API_CONTENT = 'https://content.dropboxapi.com';
const API_RPC = 'https://api.dropboxapi.com';

function joinPosix(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return `${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`;
}

function normalizePrefix(p) {
  if (!p) return '';
  return p.replace(/^\/+/, '').replace(/\/+$/, '');
}

function httpRequest({ method, url, headers = {}, body = null, stream = null }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method,
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        resolve({ status: res.statusCode || 0, headers: res.headers, buffer: buf, text });
      });
    });
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

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createDropboxProvider(params = {}) {
  const {
    accessToken, // required (initial)
    refreshToken, // optional
    clientId, // optional (for refresh)
    clientSecret, // optional (if using confidential app; not needed for PKCE public apps)
    prefix = '', // optional remote base path inside app folder
  } = params;

  if (!accessToken) throw new Error('dropbox: missing accessToken');

  const base = normalizePrefix(prefix);
  let tokenState = { accessToken, refreshToken };

  const toPath = (relPath) => {
    const p = base ? '/' + joinPosix(base, relPath) : '/' + relPath.replace(/^\/+/, '');
    return p;
  };

  async function getToken() {
    return tokenState.accessToken;
  }

  async function tryRefreshToken() {
    if (!tokenState.refreshToken || !clientId) return false;
    const form = new URLSearchParams();
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', tokenState.refreshToken);
    form.set('client_id', clientId);
    if (clientSecret) form.set('client_secret', clientSecret);
    const res = await httpRequest({
      method: 'POST',
      url: API_RPC + '/oauth2/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: Buffer.from(form.toString(), 'utf8'),
    });
    if (res.status >= 200 && res.status < 300) {
      const json = parseJsonSafe(res.text) || {};
      if (json.access_token) tokenState.accessToken = json.access_token;
      if (json.refresh_token) tokenState.refreshToken = json.refresh_token;
      try {
        console.log('[backup:dropbox] token refreshed');
      } catch (_) {}
      return true;
    } else {
      try {
        console.log('[backup:dropbox] token refresh failed', {
          status: res.status,
          body: res.text,
        });
      } catch (_) {}
      return false;
    }
  }

  async function apiContent(method, path, bodyStreamOrBuffer, extraHeaders = {}) {
    const token = await getToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
      ...extraHeaders,
    };
    let body = null,
      stream = null;
    if (Buffer.isBuffer(bodyStreamOrBuffer)) body = bodyStreamOrBuffer;
    else if (bodyStreamOrBuffer && typeof bodyStreamOrBuffer.pipe === 'function')
      stream = bodyStreamOrBuffer;

    const url =
      API_CONTENT +
      (method === 'POST' && extraHeaders['Content-Type'] === 'application/octet-stream'
        ? '/2/files/upload'
        : method === 'POST' && extraHeaders['Dropbox-API-Arg']
          ? '/2/files/download'
          : '/2/files/download');

    // For download, Dropbox wants POST to /2/files/download with no body
    const finalUrl =
      method === 'POST' && extraHeaders['Dropbox-API-Arg']
        ? API_CONTENT + '/2/files/download'
        : url;

    const res = await httpRequest({ method, url: finalUrl, headers, body, stream });
    if (res.status === 401 && (await tryRefreshToken())) {
      return apiContent(method, path, bodyStreamOrBuffer, extraHeaders);
    }
    return res;
  }

  async function apiRpc(pathname, json) {
    const token = await getToken();
    const res = await httpRequest({
      method: 'POST',
      url: API_RPC + pathname,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify(json || {}), 'utf8'),
    });
    if (res.status === 401 && (await tryRefreshToken())) {
      return apiRpc(pathname, json);
    }
    return res;
  }

  return {
    async readText(relPath) {
      const dp = toPath(relPath);
      try {
        console.log('[backup:dropbox] readText', { path: dp });
      } catch (_) {}
      const res = await httpRequest({
        method: 'POST',
        url: API_CONTENT + '/2/files/download',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          'Dropbox-API-Arg': JSON.stringify({ path: dp }),
        },
      });
      if (res.status === 401 && (await tryRefreshToken())) return this.readText(relPath);
      if (res.status === 409 || res.status === 404) return null; // not found
      if (res.status < 200 || res.status >= 300) {
        try {
          console.log('[backup:dropbox] readText error', { status: res.status, body: res.text });
        } catch (_) {}
        return null;
      }
      return res.text;
    },

    async writeText(relPath, text) {
      const dp = toPath(relPath);
      const body = Buffer.from(String(text || ''), 'utf8');
      try {
        console.log('[backup:dropbox] writeText', { path: dp, bytes: body.length });
      } catch (_) {}
      const res = await httpRequest({
        method: 'POST',
        url: API_CONTENT + '/2/files/upload',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            path: dp,
            mode: { '.tag': 'overwrite' },
            mute: true,
          }),
        },
        body,
      });
      if (res.status === 401 && (await tryRefreshToken())) return this.writeText(relPath, text);
      if (res.status < 200 || res.status >= 300)
        throw new Error(`dropbox writeText failed: ${res.status}`);
    },

    async uploadFile(relPath, localPath, size, onProgress) {
      const dp = toPath(relPath);
      const stream = fs.createReadStream(localPath);
      // Note: no progress events via raw https without extra work; call onProgress at start/end
      try {
        console.log('[backup:dropbox] uploadFile start', { path: dp, localPath, size });
      } catch (_) {}
      if (onProgress) onProgress(0);
      const res = await httpRequest({
        method: 'POST',
        url: API_CONTENT + '/2/files/upload',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            path: dp,
            mode: { '.tag': 'overwrite' },
            mute: true,
          }),
        },
        stream,
      });
      if (res.status === 401 && (await tryRefreshToken()))
        return this.uploadFile(relPath, localPath, size, onProgress);
      if (res.status < 200 || res.status >= 300)
        throw new Error(`dropbox uploadFile failed: ${res.status} ${res.text}`);
      if (onProgress) onProgress(100);
      try {
        console.log('[backup:dropbox] uploadFile done', { path: dp });
      } catch (_) {}
    },

    async deleteFile(relPath) {
      const dp = toPath(relPath);
      try {
        console.log('[backup:dropbox] deleteFile', { path: dp });
      } catch (_) {}
      const res = await apiRpc('/2/files/delete_v2', { path: dp });
      if (res.status === 409 || res.status === 404) return; // not found
      if (res.status < 200 || res.status >= 300) {
        try {
          console.log('[backup:dropbox] deleteFile error', { status: res.status, body: res.text });
        } catch (_) {}
      }
    },

    async downloadFile(relPath, localPath) {
      const dp = toPath(relPath);
      try {
        console.log('[backup:dropbox] downloadFile start', { path: dp, localPath });
      } catch (_) {}
      const res = await httpRequest({
        method: 'POST',
        url: API_CONTENT + '/2/files/download',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          'Dropbox-API-Arg': JSON.stringify({ path: dp }),
        },
      });
      if (res.status === 401 && (await tryRefreshToken()))
        return this.downloadFile(relPath, localPath);
      if (res.status < 200 || res.status >= 300)
        throw new Error(`dropbox downloadFile failed: ${res.status}`);
      await new Promise((resolve, reject) => {
        try {
          fse.ensureDirSync(require('path').dirname(localPath));
        } catch (_) {}
        fs.writeFile(localPath, res.buffer, (err) => (err ? reject(err) : resolve()));
      });
      try {
        console.log('[backup:dropbox] downloadFile done', { path: dp });
      } catch (_) {}
    },

    async list(prefixRel = '') {
      const dp = toPath(prefixRel).replace(/\/+$/, '');
      const pathArg = dp === '/' ? '' : dp; // Dropbox app folder root is empty string
      try {
        console.log('[backup:dropbox] list', { path: pathArg });
      } catch (_) {}
      const entries = [];
      let hasMore = true;
      let cursor = null;
      if (pathArg && pathArg !== '') {
        // Ensure parent folder exists logically; Dropbox list_folder needs path or empty for root
      }
      // First call
      let res = await apiRpc('/2/files/list_folder', {
        path: pathArg,
        recursive: true,
        include_deleted: false,
      });
      if (res.status === 409) return [];
      if (res.status < 200 || res.status >= 300) {
        try {
          console.log('[backup:dropbox] list error', { status: res.status, body: res.text });
        } catch (_) {}
        return [];
      }
      let json = parseJsonSafe(res.text) || {};
      (json.entries || []).forEach((e) => {
        if (e['.tag'] === 'file') {
          entries.push({
            filename: e.path_lower,
            basename: e.name,
            isDirectory: false,
            size: Number(e.size || 0),
          });
        }
      });
      hasMore = !!json.has_more;
      cursor = json.cursor;
      // Continue
      while (hasMore && cursor) {
        res = await apiRpc('/2/files/list_folder/continue', { cursor });
        if (res.status < 200 || res.status >= 300) break;
        json = parseJsonSafe(res.text) || {};
        (json.entries || []).forEach((e) => {
          if (e['.tag'] === 'file') {
            entries.push({
              filename: e.path_lower,
              basename: e.name,
              isDirectory: false,
              size: Number(e.size || 0),
            });
          }
        });
        hasMore = !!json.has_more;
        cursor = json.cursor;
      }
      return entries;
    },
  };
}

module.exports = { createDropboxProvider };
