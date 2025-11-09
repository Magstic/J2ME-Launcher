// 使用系統工具解壓備援（繁中註釋）
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { parseManifest, resolveIconPath } = require('../parsers/manifest.js');
const DataStore = require('../data-store.js');
const { cacheIconBuffer } = require('../parsers/icon-cache.js');
const { getLogger } = require('../../utils/logger.cjs');
const log = getLogger('reader:system-extract');

// 備用函數1：嘗試使用系統工具解壓
async function trySystemExtraction(jarPath) {
  const fileName = path.basename(jarPath);
  log.info(`🔧 嘗試使用系統工具解壓: ${fileName}`);

  const tempDir = path.join(path.dirname(jarPath), '.temp_' + Date.now());

  try {
    await fs.ensureDir(tempDir);

    // 嘗試多種解壓工具（按容錯度排序）
    const candidates = [
      { cmd: `7z x "${jarPath}" -o"${tempDir}" -y` },
      { cmd: `bsdtar -xf "${jarPath}" -C "${tempDir}"` },
      { cmd: `tar -xf "${jarPath}" -C "${tempDir}"` },
      { cmd: `unzip -q "${jarPath}" -d "${tempDir}"` },
      // jar 抽取需在目標目錄執行，-C 對抽取並不通用
      { cmd: `jar xf "${jarPath}"`, cwd: tempDir },
    ];

    let extracted = false;
    for (const c of candidates) {
      try {
        execSync(c.cmd, { stdio: 'ignore', timeout: 10000, cwd: c.cwd || undefined });
        extracted = true;
        try {
          log.info(`✅ 成功使用命令解壓: ${c.cmd.split(' ')[0]}`);
        } catch (_) {}
        break;
      } catch (cmdError) {
        // 下一個候選
        continue;
      }
    }

    if (!extracted) {
      log.warn(`❌ 所有系統解壓工具都失敗`);
      return null;
    }

    // 檢查並解析 MANIFEST.MF
    const manifestPath = path.join(tempDir, 'META-INF', 'MANIFEST.MF');
    if (await fs.pathExists(manifestPath)) {
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = parseManifest(manifestContent);

      // 嘗試找到圖標文件（集中解析 + 集中快取）
      let iconData = null;
      let rawIconPath = resolveIconPath(manifest);
      if (rawIconPath) {
        const normalized = rawIconPath.replace(/^[\\\/]/, '');
        const iconPath = path.join(tempDir, normalized);
        if (await fs.pathExists(iconPath)) {
          const iconBuffer = await fs.readFile(iconPath);
          const ext = path.extname(iconPath).toLowerCase() || '.png';
          const cachedIconPath = await cacheIconBuffer(iconBuffer, ext);
          manifest.cachedIconPath = cachedIconPath;
        }
      }

      return {
        filePath: jarPath,
        fileName: path.basename(jarPath),
        'MIDlet-Name': manifest['MIDlet-Name'] || path.basename(jarPath, '.jar'),
        ...manifest,
        iconData,
      };
    }

    return null;
  } catch (error) {
    log.error(`系統解壓失敗:`, error.message);
    return null;
  } finally {
    // 清理臨時目錄
    try {
      if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
      }
    } catch (cleanupError) {
      log.warn(`清理臨時目錄失敗: ${cleanupError.message}`);
    }
  }
}

module.exports = { trySystemExtraction };
