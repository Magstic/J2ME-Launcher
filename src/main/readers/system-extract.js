// 使用系統工具解壓備援（繁中註釋）
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { parseManifest, resolveIconPath } = require('../parsers/manifest.js');
const DataStore = require('../data-store.js');
const { cacheIconBuffer } = require('../parsers/icon-cache.js');

// 備用函數1：嘗試使用系統工具解壓
async function trySystemExtraction(jarPath) {
  const fileName = path.basename(jarPath);
  console.log(`🔧 嘗試使用系統工具解壓: ${fileName}`);

  const tempDir = path.join(path.dirname(jarPath), '.temp_' + Date.now());

  try {
    await fs.ensureDir(tempDir);

    // 嘗試多種解壓工具
    const extractCommands = [
      `7z x "${jarPath}" -o"${tempDir}" -y`,
      `unzip -q "${jarPath}" -d "${tempDir}"`,
      `jar xf "${jarPath}" -C "${tempDir}"`,
    ];

    let extracted = false;
    for (const cmd of extractCommands) {
      try {
        execSync(cmd, { stdio: 'ignore', timeout: 10000 });
        extracted = true;
        console.log(`✅ 成功使用命令解壓: ${cmd.split(' ')[0]}`);
        break;
      } catch (cmdError) {
        continue; // 嘗試下一個命令
      }
    }

    if (!extracted) {
      console.log(`❌ 所有系統解壓工具都失敗`);
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
    console.error(`系統解壓失敗:`, error.message);
    return null;
  } finally {
    // 清理臨時目錄
    try {
      if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
      }
    } catch (cleanupError) {
      console.warn(`清理臨時目錄失敗: ${cleanupError.message}`);
    }
  }
}

module.exports = { trySystemExtraction };
