// src/main/backup/providers/s3.js
// Minimal S3 provider wrapper using AWS SDK v3

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

function joinPosix(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return `${a.replace(/\/+$/,'')}/${b.replace(/^\/+/, '')}`;
}

function normalizePrefix(p) {
  if (!p) return '';
  return p.replace(/^\/+/, '').replace(/\/+$/, '');
}

function textFromStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function createS3Provider(params = {}) {
  const {
    region,
    bucket,
    endpoint, // optional for S3-compatible
    accessKeyId,
    secretAccessKey,
    forcePathStyle = true,
    prefix = ''
  } = params;

  if (!region) throw new Error('s3: missing region');
  if (!bucket) throw new Error('s3: missing bucket');

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle,
    credentials: (accessKeyId && secretAccessKey) ? { accessKeyId, secretAccessKey } : undefined,
  });

  const base = normalizePrefix(prefix);
  try {
    console.log('[backup:s3] init client', {
      region,
      endpoint: endpoint ? String(endpoint) : undefined,
      bucket,
      forcePathStyle,
      prefix: base,
      accessKeyId: accessKeyId ? '***' : undefined
    });
  } catch (_) {}
  const toKey = (relPath) => {
    const key = base ? joinPosix(base, relPath) : relPath;
    return key.replace(/^\/+/, '');
  };

  return {
    async readText(relPath) {
      const Key = toKey(relPath);
      try {
        try { console.log('[backup:s3] readText', { Key }); } catch (_) {}
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key }));
        if (!out || !out.Body) return null;
        const text = await textFromStream(out.Body);
        return text;
      } catch (e) { try { console.log('[backup:s3] readText error', { Key, error: e && e.message }); } catch (_) {} return null; }
    },
    async writeText(relPath, text) {
      const Key = toKey(relPath);
      const Body = Buffer.from(String(text), 'utf8');
      try { console.log('[backup:s3] writeText', { Key, bytes: Body.length }); } catch (_) {}
      await client.send(new PutObjectCommand({ Bucket: bucket, Key, Body }));
    },
    async uploadFile(relPath, localPath, size, onProgress) {
      const Key = toKey(relPath);
      const fs = require('fs');
      const stream = fs.createReadStream(localPath);
      try { console.log('[backup:s3] uploadFile start', { Key, localPath, size }); } catch (_) {}
      const upload = new Upload({
        client,
        params: { Bucket: bucket, Key, Body: stream },
        queueSize: 3,
        partSize: 5 * 1024 * 1024
      });
      if (onProgress) {
        let uploaded = 0;
        upload.on('httpUploadProgress', (evt) => {
          if (evt.loaded != null) uploaded = evt.loaded;
          if (size) {
            const pct = Math.min(100, Math.round((uploaded / size) * 100));
            onProgress(pct);
          }
        });
      }
      await upload.done();
      try { console.log('[backup:s3] uploadFile done', { Key }); } catch (_) {}
    },
    async deleteFile(relPath) {
      const Key = toKey(relPath);
      try { console.log('[backup:s3] deleteFile', { Key }); } catch (_) {}
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key })); } catch (e) { try { console.log('[backup:s3] deleteFile error', { Key, error: e && e.message }); } catch (_) {} }
    },
    async downloadFile(relPath, localPath) {
      const Key = toKey(relPath);
      const fs = require('fs');
      const fse = require('fs-extra');
      try { console.log('[backup:s3] downloadFile start', { Key, localPath }); } catch (_) {}
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key }));
      if (!out || !out.Body) throw new Error('empty body');
      await new Promise((resolve, reject) => {
        try { fse.ensureDirSync(require('path').dirname(localPath)); } catch (_) {}
        const ws = fs.createWriteStream(localPath);
        out.Body.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
      });
      try { console.log('[backup:s3] downloadFile done', { Key }); } catch (_) {}
    },
    async list(prefixRel = '') {
      const Prefix = toKey(prefixRel).replace(/\/+$/, '');
      try {
        try { console.log('[backup:s3] list', { Prefix }); } catch (_) {}
        const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix }));
        return (out.Contents || []).map(obj => ({
          filename: obj.Key,
          basename: obj.Key.split('/').pop(),
          isDirectory: false,
          size: Number(obj.Size || 0)
        }));
      } catch (e) { try { console.log('[backup:s3] list error', { Prefix, error: e && e.message }); } catch (_) {} return []; }
    }
  };
}

module.exports = { createS3Provider };
