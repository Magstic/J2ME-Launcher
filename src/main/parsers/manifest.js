// 解析 MANIFEST 內容與圖標路徑解析（繁中註釋）

function parseManifest(content) {
  const manifest = {};
  const lines = content.split(/\r?\n/);
  for (let line of lines) {
    if (line && line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      manifest[key.trim()] = value;
    }
  }
  return manifest;
}

function resolveIconPath(manifest) {
  const midlet1 = manifest['MIDlet-1'] || '';
  // 優先使用 MIDlet-Icon，否則從 MIDlet-1 取第二段
  const raw = manifest['MIDlet-Icon'] || (midlet1.split(',')[1] || '');
  const iconPath = (raw || '').trim();
  return iconPath || null;
}

module.exports = { parseManifest, resolveIconPath };
