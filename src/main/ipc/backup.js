// src/main/ipc/backup.js
// 備份功能（S3 / Dropbox）IPC：提供規格查詢、備份/還原，以及 Dropbox OAuth（PKCE）登入與憑證保存。

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL, URLSearchParams } = require('url');
const crypto = require('crypto');
const { shell, app: electronApp } = require('electron');

// 與渲染端共享的備份規格，維持單檔模組化（移到 src/shared 以便主進程打包引用）
const { BACKUP_SPEC } = require('../../shared/backup/spec');
const { runBackup, planRestore, runRestore } = require('../backup/core');

const META_DIR = 'j2me-launcher';
const META_FILE = 'backup-meta.json';
const AUTH_DIR = 'auth';
const DROPBOX_AUTH = 'dropbox.json';
const S3_AUTH = 's3.json';
const WEBDAV_AUTH = 'webdav.json';

function getMetaPath(app) {
  return path.join(app.getPath('userData'), META_DIR, META_FILE);
}

function readMeta(app) {
  try {
    const p = getMetaPath(app);
    if (!fs.existsSync(p)) return { lastBackupAt: 0 };
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt) || { lastBackupAt: 0 };
  } catch (_) { return { lastBackupAt: 0 }; }
}

function writeMeta(app, meta) {
  const p = getMetaPath(app);
  fse.ensureDirSync(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(meta || {}, null, 2), 'utf8');
}

function getDropboxAuthPath(app) {
  return path.join(app.getPath('userData'), META_DIR, AUTH_DIR, DROPBOX_AUTH);
}

function readDropboxAuth(app) {
  try {
    const p = getDropboxAuthPath(app);
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt) || null;
  } catch (_) { return null; }
}

function writeDropboxAuth(app, data) {
  const p = getDropboxAuthPath(app);
  fse.ensureDirSync(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data || {}, null, 2), 'utf8');
}

function getProviderAuthPath(app, provider) {
  if (provider === 's3') return path.join(app.getPath('userData'), META_DIR, AUTH_DIR, S3_AUTH);
  if (provider === 'webdav') return path.join(app.getPath('userData'), META_DIR, AUTH_DIR, WEBDAV_AUTH);
  return null;
}

function readProviderParams(app, provider) {
  try {
    const p = getProviderAuthPath(app, provider);
    if (!p || !fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt) || null;
  } catch (_) { return null; }
}

function writeProviderParams(app, provider, data) {
  const p = getProviderAuthPath(app, provider);
  if (!p) return false;
  fse.ensureDirSync(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data || {}, null, 2), 'utf8');
  return true;
}

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

function createCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

async function exchangeCodeForToken({ code, clientId, redirectUri }) {
  const form = new URLSearchParams();
  form.set('code', code);
  form.set('grant_type', 'authorization_code');
  form.set('client_id', clientId);
  form.set('redirect_uri', redirectUri);
  // PKCE: send code_verifier
  // We stash verifier in closure where used
  return await new Promise((resolve) => resolve(null));
}

async function httpPostToken(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method: 'POST',
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        resolve({ status: res.statusCode || 0, text });
      });
    });
    req.on('error', reject);
    req.write(Buffer.from(body, 'utf8'));
    req.end();
  });
}

function register({ ipcMain, app }) {
  // 取得要備份的項目規格（讓前端渲染清單與切換）
  ipcMain.handle('backup:get-spec', async () => BACKUP_SPEC);

  // 取得最後備份時間
  ipcMain.handle('backup:get-last', async () => {
    const meta = readMeta(app);
    try { console.log('[backup:get-last]', meta); } catch (_) {}
    return meta;
  });

  // 讀寫本機保存的 Provider 參數（S3 / WebDAV）
  ipcMain.handle('backup:get-provider-params', async (_e, provider) => {
    if (!provider) return null;
    if (provider !== 's3' && provider !== 'webdav') return null;
    return readProviderParams(app, provider);
  });
  ipcMain.handle('backup:set-provider-params', async (_e, { provider, params }) => {
    if (!provider || (provider !== 's3' && provider !== 'webdav')) return { ok: false };
    try {
      writeProviderParams(app, provider, params || {});
      return { ok: true };
    } catch (e) {
      try { console.log('[backup:set-provider-params] error', e && e.message); } catch (_) {}
      return { ok: false };
    }
  });

  // Dropbox auth status
  ipcMain.handle('dropbox:get-auth', async () => {
    const auth = readDropboxAuth(app);
    return { linked: !!(auth && auth.accessToken), clientId: auth && auth.clientId ? auth.clientId : null };
  });
  ipcMain.handle('dropbox:unlink', async () => {
    const p = getDropboxAuthPath(app);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
    return { ok: true };
  });

  // Dropbox current account info
  ipcMain.handle('dropbox:get-account', async () => {
    let auth = readDropboxAuth(app);
    if (!auth || !auth.accessToken) return null;
    // Helper to call users/get_current_account using given token
    const callGetAccount = (token) => new Promise((resolve, reject) => {
      const u = new URL('https://api.dropboxapi.com/2/users/get_current_account');
      const req = https.request({
        method: 'POST', protocol: u.protocol, hostname: u.hostname, port: 443, path: u.pathname,
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      }, (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end();
    });

    let res = await callGetAccount(auth.accessToken);
    if (res.status === 401 && auth.refreshToken && auth.clientId) {
      // Try refresh
      try {
        const form = new URLSearchParams();
        form.set('grant_type', 'refresh_token');
        form.set('refresh_token', auth.refreshToken);
        form.set('client_id', auth.clientId);
        const tokenRes = await httpPostToken('https://api.dropboxapi.com/oauth2/token', form.toString());
        if (tokenRes.status >= 200 && tokenRes.status < 300) {
          const json = JSON.parse(tokenRes.text);
          if (json && json.access_token) {
            auth = { ...auth, accessToken: json.access_token };
            writeDropboxAuth(app, auth);
            res = await callGetAccount(auth.accessToken);
          }
        } else {
          try { console.log('[dropbox:get-account] refresh fail', tokenRes.status, tokenRes.text); } catch (_) {}
        }
      } catch (e) {
        try { console.log('[dropbox:get-account] refresh error', e && e.message); } catch (_) {}
      }
    }
    if (res.status < 200 || res.status >= 300) {
      try { console.log('[dropbox:get-account] http', res.status, res.text); } catch (_) {}
      return null;
    }
    try { return JSON.parse(res.text); } catch (e) {
      try { console.log('[dropbox:get-account] parse error', e && e.message); } catch (_) {}
      return null;
    }
  });

  // Download account photo and return as data URL (follow redirects, avoid CORS in renderer)
  ipcMain.handle('dropbox:get-account-photo', async (_e, urlStr) => {
    try {
      if (!urlStr) return null;
      const fetchWithRedirects = async (startUrl, maxRedirects = 5) => {
        let current = startUrl;
        for (let i = 0; i <= maxRedirects; i++) {
          const u = new URL(current);
          const client = u.protocol === 'http:' ? http : https;
          const result = await new Promise((resolve, reject) => {
            const req = client.request({
              method: 'GET',
              protocol: u.protocol,
              hostname: u.hostname,
              port: u.port || (u.protocol === 'http:' ? 80 : 443),
              path: u.pathname + (u.search || ''),
              headers: {
                'Accept': 'image/*',
                'User-Agent': 'J2ME-GUI-Electron/1.0'
              }
            }, (res) => {
              const status = res.statusCode || 0;
              if (status >= 300 && status < 400 && res.headers.location) {
                resolve({ redirect: res.headers.location });
                return;
              }
              const chunks = [];
              res.on('data', (c) => chunks.push(c));
              res.on('end', () => resolve({
                buffer: Buffer.concat(chunks),
                contentType: res.headers['content-type'] || 'image/jpeg',
                status
              }));
            });
            req.on('error', reject);
            req.end();
          });
          if (result && result.redirect) { current = result.redirect; continue; }
          return result;
        }
        return null;
      };

      const r = await fetchWithRedirects(urlStr, 5);
      if (!r || !(r.status >= 200 && r.status < 300) || !r.buffer) return null;
      const prefix = `data:${r.contentType};base64,`;
      return prefix + r.buffer.toString('base64');
    } catch (e) {
      try { console.log('[dropbox:get-account-photo] error', e && e.message); } catch (_) {}
      return null;
    }
  });

  // Dropbox OAuth (PKCE, loopback redirect)
  ipcMain.handle('dropbox:oauth-start', async (_e, payload) => {
    const { clientId, port = 53789 } = payload || {};
    if (!clientId) throw new Error('dropbox oauth: missing clientId (App Key)');
    // Start a tiny HTTP server for the redirect
    const redirectUri = `http://127.0.0.1:${port}/dropbox/callback`;
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('token_access_type', 'offline');
    // Request scopes explicitly so we can read basic account info and manage files
    authUrl.searchParams.set('scope', [
      'files.content.read',
      'files.content.write',
      'files.metadata.read',
      'files.metadata.write',
      'account_info.read'
    ].join(' '));

    let server;
    const result = await new Promise((resolve, reject) => {
      server = http.createServer(async (req, res) => {
        try {
          const u = new URL(req.url, `http://127.0.0.1:${port}`);
          if (u.pathname !== '/dropbox/callback') { res.statusCode = 404; res.end('Not Found'); return; }
          const code = u.searchParams.get('code');
          const err = u.searchParams.get('error');
          if (err || !code) {
            res.statusCode = 400;
            res.end('Authorization failed. You can close this window.');
            resolve({ ok: false, error: err || 'no_code' });
            return;
          }
          // Exchange code -> token
          const form = new URLSearchParams();
          form.set('code', code);
          form.set('grant_type', 'authorization_code');
          form.set('client_id', clientId);
          form.set('redirect_uri', redirectUri);
          form.set('code_verifier', codeVerifier);
          const tokenRes = await httpPostToken('https://api.dropboxapi.com/oauth2/token', form.toString());
          if (tokenRes.status < 200 || tokenRes.status >= 300) {
            try { console.log('[dropbox:oauth] token error', tokenRes.status, tokenRes.text); } catch (_) {}
            res.statusCode = 500; res.end('Token exchange failed. You can close this window.');
            resolve({ ok: false, error: 'token_exchange_failed' });
            return;
          }
          let json = null;
          try { json = JSON.parse(tokenRes.text); } catch (_) { json = null; }
          if (!json || !json.access_token) {
            res.statusCode = 500; res.end('Invalid token response. You can close this window.');
            resolve({ ok: false, error: 'invalid_token_response' });
            return;
          }
          // Persist tokens
          const auth = {
            accessToken: json.access_token,
            refreshToken: json.refresh_token || null,
            tokenType: json.token_type || 'bearer',
            scope: json.scope || null,
            acquiredAt: Date.now(),
            clientId
          };
          writeDropboxAuth(app, auth);
          res.statusCode = 200;
          res.end('Dropbox linked successfully. You can close this window.');
          resolve({ ok: true });
        } catch (e) {
          try { console.log('[dropbox:oauth] error', e && e.message); } catch (_) {}
          res.statusCode = 500; res.end('Internal error. You can close this window.');
          resolve({ ok: false, error: 'exception' });
        } finally {
          setTimeout(() => { try { server.close(); } catch (_) {} }, 50);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        try { shell.openExternal(authUrl.toString()); } catch (_) {}
      });
      server.on('error', (e) => { try { console.log('[dropbox:oauth] server error', e && e.message); } catch (_) {} reject(e); });
    });
    return result;
  });

  // 執行備份（僅存根：更新最後備份時間，不做實際上載）
  ipcMain.handle('backup:run', async (e, payload) => {
    // payload: { mode: 'full'|'incremental', provider: 'webdav'|..., params: {}, groups: ['config','database'] }
    const { mode = 'incremental', provider, params = {}, groups = [] } = payload || {};
    const redacted = { ...params };
    if (redacted.accessKeyId) redacted.accessKeyId = '***';
    if (redacted.secretAccessKey) redacted.secretAccessKey = '***';
    try { console.log('[backup:run] start', { mode, provider, params: redacted, groups }); } catch (_) {}
    // Auto-fill Dropbox tokens from storage if not provided
    let providerParams = { ...params };
    if (provider === 'dropbox') {
      const auth = readDropboxAuth(app);
      if (auth && !providerParams.accessToken) {
        providerParams = { ...providerParams, accessToken: auth.accessToken, refreshToken: auth.refreshToken, clientId: auth.clientId };
      }
    } else if (provider === 's3' || provider === 'webdav') {
      const stored = readProviderParams(app, provider);
      if (stored && typeof stored === 'object') {
        providerParams = { ...stored, ...providerParams }; // UI 參數優先，補齊缺省
      }
    }
    const result = await runBackup({
      app,
      mode,
      providerName: provider,
      providerParams,
      groups,
      ipcSender: e && e.sender,
      onProgress: (p) => { try { console.log('[backup:progress]', p); } catch (_) {} }
    });
    const meta = readMeta(app);
    meta.lastBackupAt = Date.now();
    writeMeta(app, meta);
    try { console.log('[backup:run] done', { ...result, lastBackupAt: meta.lastBackupAt }); } catch (_) {}
    return { ...result, lastBackupAt: meta.lastBackupAt };
  });

  // 規劃恢復（僅計算是否有衝突與時間對比）
  ipcMain.handle('backup:restore-plan', async (_e, payload) => {
    const { provider, params = {}, groups = [] } = payload || {};
    const redacted = { ...params };
    if (redacted.accessKeyId) redacted.accessKeyId = '***';
    if (redacted.secretAccessKey) redacted.secretAccessKey = '***';
    try { console.log('[restore:plan] start', { provider, params: redacted, groups }); } catch (_) {}
    let providerParams = { ...params };
    if (provider === 'dropbox') {
      const auth = readDropboxAuth(app);
      if (auth && !providerParams.accessToken) {
        providerParams = { ...providerParams, accessToken: auth.accessToken, refreshToken: auth.refreshToken, clientId: auth.clientId };
      }
    } else if (provider === 's3' || provider === 'webdav') {
      const stored = readProviderParams(app, provider);
      if (stored && typeof stored === 'object') {
        providerParams = { ...stored, ...providerParams };
      }
    }
    const res = await planRestore({ app, providerName: provider, providerParams, groups });
    try { console.log('[restore:plan] done', res); } catch (_) {}
    return res;
  });

  // 執行恢復（下載覆蓋本地）
  ipcMain.handle('backup:restore-run', async (_e, payload) => {
    const { provider, params = {}, groups = [], force = false, includePaths = null } = payload || {};
    const redacted = { ...params };
    if (redacted.accessKeyId) redacted.accessKeyId = '***';
    if (redacted.secretAccessKey) redacted.secretAccessKey = '***';
    try { console.log('[restore:run] start', { provider, params: redacted, groups, force, includePaths: Array.isArray(includePaths) ? includePaths.length : null }); } catch (_) {}
    let providerParams = { ...params };
    if (provider === 'dropbox') {
      const auth = readDropboxAuth(app);
      if (auth && !providerParams.accessToken) {
        providerParams = { ...providerParams, accessToken: auth.accessToken, refreshToken: auth.refreshToken, clientId: auth.clientId };
      }
    } else if (provider === 's3' || provider === 'webdav') {
      const stored = readProviderParams(app, provider);
      if (stored && typeof stored === 'object') {
        providerParams = { ...stored, ...providerParams };
      }
    }
    const res = await runRestore({ app, providerName: provider, providerParams, groups, force, includePaths });
    try { console.log('[restore:run] done', res); } catch (_) {}
    return res;
  });
}

module.exports = { register };
