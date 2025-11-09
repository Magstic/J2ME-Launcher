const fs = require('fs-extra');
const path = require('path');
const yauzl = require('yauzl');
const { execSync } = require('child_process');
const DataStore = require('./data-store.js');
const crypto = require('crypto');
// 抽離的公用工具（Phase 1）
const { calculateMD5 } = require('./parsers/md5.js');
const { readEntryContent } = require('./parsers/zip-entry.js');
const { parseManifest, resolveIconPath } = require('./parsers/manifest.js');
const { cacheIconBuffer } = require('./parsers/icon-cache.js');
const { parseJarFileYauzl: parseJarFileYauzlReader } = require('./readers/yauzl-reader.js');
const { tryRawFileAnalysis: tryRawFileAnalysisReader } = require('./readers/raw-fallback.js');
const { trySystemExtraction: trySystemExtractionReader } = require('./readers/system-extract.js');
const { parseJarWithReaders } = require('./readers/factory.js');
const { getLogger } = require('../utils/logger.cjs');
const log = getLogger('jar-parser');

// 上述三個函式已抽離到 parsers/，此處僅導入使用

// The one and only parser function
async function parseJarFile(jarPath) {
  try {
    const stats = await fs.stat(jarPath);
    const md5 = await calculateMD5(jarPath);
    const basic = await parseJarWithReaders(jarPath);
    if (!basic || basic.hasManifest !== true) {
      return null;
    }

    return {
      filePath: jarPath,
      gameName: basic.gameName,
      vendor: basic.vendor,
      version: basic.version,
      md5: md5,
      iconPath: basic.iconPath,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    };
  } catch (error) {
    log.error(`[Parse Error] Critical failure parsing ${jarPath}: ${error.message}`);
    // 嚴格篩選：遇到異常時不再建立基本條目，直接略過（避免把非 J2ME 檔案寫入庫）
    return null;
  }
}

// 備用函數1：嘗試使用系統工具解壓（委派至 readers/system-extract.js）
async function trySystemExtraction(jarPath) {
  return await trySystemExtractionReader(jarPath);
}

// 備用函數2：嘗試原始文件讀取和手動ZIP解析（委派至 readers/raw-fallback.js）
async function tryRawFileAnalysis(jarPath) {
  return await tryRawFileAnalysisReader(jarPath);
}

// 備用函數3：嘗試使用yauzl解析jar文件（委派至 readers/yauzl-reader.js）
async function parseJarFileYauzl(jarPath) {
  return await parseJarFileYauzlReader(jarPath);
}

// 綜合備用解析函數
async function tryAlternativeParsing(jarPath) {
  log.debug(`🚀 開始備用解析流程: ${path.basename(jarPath)}`);

  // 方法1: 系統工具解壓
  let result = await trySystemExtraction(jarPath);
  if (result) {
    result._parseMethod = 'system_extraction';
    return result;
  }

  // 方法2: 原始檔案分析
  result = await tryRawFileAnalysis(jarPath);
  if (result) {
    return result;
  }

  // 如果所有方法都失敗，返回最基本的信息
  log.warn(`⚠️  所有解析方法都失敗，返回基本信息`);
  return {
    filePath: jarPath,
    fileName: path.basename(jarPath),
    'MIDlet-Name': path.basename(jarPath, '.jar'),
    'MIDlet-Vendor': '未知廠商',
    'MIDlet-Version': '1.0',
    iconData: null,
    _parseMethod: 'final_fallback',
  };
}

// 核心函數：解析單個 JAR 文件 (已重構為 async/await)
async function parseSingleJar(jarPath) {
  return new Promise((resolve) => {
    // 首先嘗試使用 yauzl 標準解析
    yauzl.open(jarPath, { lazyEntries: true, strictFileNames: false }, (err, zipfile) => {
      if (err) {
        log.error(`打開 ${path.basename(jarPath)} 失敗:`, err);
        log.info(`嘗試使用備用方法解析...`);
        // 如果標準方法失敗，嘗試備用方法
        tryAlternativeParsing(jarPath)
          .then((result) => {
            log.info(
              `✅ 備用方法解析完成: ${path.basename(jarPath)} (方法: ${result?._parseMethod || 'unknown'})`
            );
            resolve(result);
          })
          .catch((error) => {
            log.error(`備用解析失敗:`, error);
            resolve(null);
          });
        return;
      }

      let manifestContent = null;
      const imageContentMap = new Map();

      zipfile.on('error', (err) => {
        log.error(`解析 ${path.basename(jarPath)} 時發生 ZIP 錯誤:`, err);
        if (zipfile) zipfile.close(); // Ensure cleanup on error

        log.info(`嘗試使用備用方法解析...`);
        // ZIP 錯誤時也嘗試備用方法
        tryAlternativeParsing(jarPath)
          .then((result) => {
            log.info(
              `✅ 備用方法解析完成: ${path.basename(jarPath)} (方法: ${result?._parseMethod || 'unknown'})`
            );
            resolve(result);
          })
          .catch((error) => {
            log.error(`備用解析也失敗:`, error);
            resolve(null);
          });
      });

      zipfile.on('end', async () => {
        const stats = await fs.stat(jarPath);
        const md5 = await calculateMD5(jarPath);

        const gameData = {
          filePath: jarPath,
          gameName: manifestContent
            ? parseManifest(manifestContent.toString())['MIDlet-Name']
            : path.basename(jarPath, '.jar'),
          vendor: manifestContent
            ? parseManifest(manifestContent.toString())['MIDlet-Vendor']
            : '未知廠商',
          version: manifestContent
            ? parseManifest(manifestContent.toString())['MIDlet-Version']
            : '1.0',
          md5: md5,
          iconPath: null, // 將由圖標快取邏輯填充
          // 保留 mtimeMs 和 size 用於增量更新檢查
          mtimeMs: stats.mtimeMs,
          size: stats.size,
        };

        if (manifestContent) {
          const parsed = parseManifest(manifestContent.toString());
          Object.assign(gameData, parsed);

          let rawIconPath = resolveIconPath(parsed);

          if (rawIconPath) {
            const lowerRawIconPath = rawIconPath.replace(/\\/g, '/').toLowerCase();
            let foundIcon = false;

            for (const [key, value] of imageContentMap.entries()) {
              const lowerKey = key.replace(/\\/g, '/').toLowerCase();
              // Use endsWith for robust matching (handles leading '/' gracefully)
              if (lowerKey.endsWith(lowerRawIconPath) || lowerRawIconPath.endsWith(lowerKey)) {
                // 將圖標保存到快取（集中處理）
                const ext = path.extname(key).toLowerCase() || '.png';
                const cachedIconPath = await cacheIconBuffer(value, ext);
                gameData.iconPath = cachedIconPath;
                log.debug(`[Icon Cache] Cached icon for ${gameData.gameName} at ${cachedIconPath}`);
                foundIcon = true;
                break;
              }
            }

            if (!foundIcon) {
              log.debug(
                `圖標未找到: 在 ${manifestData.fileName} 中需要 '${rawIconPath}', 但只找到了: [${Array.from(imageContentMap.keys()).join(', ')}]`
              );
            }
          }
        }
        // 在Promise解決前，異步寫入圖標快取
        if (manifestData.iconBuffer) {
          const suggestedExt = manifestData.iconExt || '.png';
          try {
            const outPath = await cacheIconBuffer(manifestData.iconBuffer, suggestedExt);
            manifestData.cachedIconPath = outPath;
          } catch (writeErr) {
            log.error(`寫入圖標快取失敗:`, writeErr);
          } finally {
            delete manifestData.iconBuffer;
            delete manifestData.iconExt;
            resolve({ ...manifestData, parseMethod: 'yauzl' });
          }
        } else {
          resolve({ ...manifestData, parseMethod: 'yauzl' });
        }
      });

      const processNextEntry = () => zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        const upperFileName = entry.fileName.toUpperCase();

        if (entry.fileName.endsWith('/')) {
          // Directory entry, skip and process next
          return processNextEntry();
        }

        if (upperFileName === 'META-INF/MANIFEST.MF') {
          readEntryContent(zipfile, entry)
            .then((content) => {
              manifestContent = content;
              processNextEntry();
            })
            .catch((e) => {
              log.error(`讀取 MANIFEST.MF 失敗 (${path.basename(jarPath)}):`, e);
              processNextEntry();
            });
        } else if (upperFileName.match(/\.(PNG|GIF|JPG|JPEG)$/)) {
          readEntryContent(zipfile, entry, true)
            .then((buffer) => {
              const normalizedPath = entry.fileName.replace(/\\/g, '/').toLowerCase();
              imageContentMap.set(normalizedPath, buffer);
              processNextEntry();
            })
            .catch((e) => {
              log.error(`讀取圖片 ${entry.fileName} 失敗 (${path.basename(jarPath)}):`, e);
              processNextEntry();
            });
        } else {
          processNextEntry();
        }
      });

      zipfile.readEntry();
    });
  });
}

// 增量掃描單個目錄
async function processDirectory(directoryPath, isIncrementalScan = false, opts = {}) {
  log.info(`🚀 開始${isIncrementalScan ? '增量' : '全量'}處理目錄:`, directoryPath);
  // Optional progress emitter
  const emit = (payload) => {
    try {
      if (opts && typeof opts.emit === 'function') {
        opts.emit({ directory: directoryPath, ...payload });
      }
    } catch (_) {}
  };
  // 初始階段：開始掃描（枚舉檔案）
  emit({ phase: 'scanning', done: 0, total: 0 });

  const allFoundFiles = new Set();
  const filesToParse = [];
  const skippedFiles = [];

  // 1. 递归掃描目錄，進行增量判斷
  async function scan(dir) {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          await scan(fullPath);
        } else if (item.isFile() && path.extname(item.name).toLowerCase() === '.jar') {
          allFoundFiles.add(fullPath);
          const stat = await fs.stat(fullPath);

          // 增量掃描邏輯：檢查是否需要重新解析
          if (isIncrementalScan) {
            const { getDB } = require('./db');
            try {
              const db = getDB();
              const existingGame = db
                .prepare('SELECT * FROM games WHERE filePath = ?')
                .get(fullPath);
              if (existingGame && existingGame.mtimeMs >= stat.mtimeMs) {
                skippedFiles.push(fullPath);
                log.debug(`⏭️  跳過未變化檔案: ${path.basename(fullPath)}`);
              } else {
                filesToParse.push({ path: fullPath, stat });
              }
            } catch (e) {
              // 如果查詢失敗，重新解析
              filesToParse.push({ path: fullPath, stat });
            }
          } else {
            filesToParse.push({ path: fullPath, stat });
          }
        }
      }
    } catch (error) {
      log.error(`掃描目錄失敗 ${dir}:`, error.message);
    }
  }

  await scan(directoryPath);

  log.info(
    `📊 掃描結果: 總檔案 ${allFoundFiles.size}, 需解析 ${filesToParse.length}, 跳過 ${skippedFiles.length}`
  );

  // 2. 解析需要更新的文件
  const newlyParsedGames = [];
  let parsedCount = 0;
  const totalToParse = filesToParse.length;
  if (filesToParse.length > 0) {
    log.info(`🔍 開始解析 ${filesToParse.length} 個檔案……`);
    // 發出解析階段開始事件
    emit({ phase: 'parsing', done: 0, total: totalToParse });

    for (const file of filesToParse) {
      try {
        const gameData = await parseJarFile(file.path);
        if (gameData) {
          // 直接保存到 SQL 數據庫
          const { upsertGames } = require('./sql/sync');
          try {
            upsertGames([gameData]);
            newlyParsedGames.push(gameData);
            log.debug(`✅ 已解析並保存: ${gameData.gameName || path.basename(file.path)}`);
          } catch (sqlError) {
            log.error(`保存遊戲到數據庫失敗 ${file.path}:`, sqlError.message);
          }
        } else {
          log.info(`⏭️  跳過非 J2ME 或無 MANIFEST 檔案: ${path.basename(file.path)}`);
        }
      } catch (error) {
        log.error(`解析文件失败 ${file.path}:`, error.message);
      } finally {
        // 無論成功與否，解析進度 +1
        parsedCount += 1;
        emit({ phase: 'parsing', done: parsedCount, total: totalToParse, current: file.path });
      }
    }
  } else {
    // 無需解析，也同步一次進度
    emit({ phase: 'parsing', done: 0, total: 0 });
  }

  // 3. 只有當有新遊戲或非增量掃描時才更新掃描時間
  if (newlyParsedGames.length > 0 || !isIncrementalScan) {
    const { updateDirectoryScanTime } = require('./sql/directories');
    try {
      const iso = new Date().toISOString();
      updateDirectoryScanTime(directoryPath, iso);
      log.debug(`🔄 已更新目錄掃描時間: ${directoryPath}`);
    } catch (e) {
      log.warn('[SQL] 更新掃描時間失敗:', e.message);
    }
  } else {
    log.debug(`⏭️ 目錄無變化，不更新掃描時間: ${directoryPath}`);
  }

  // 3.5 裁剪不存在於磁碟的舊記錄（外部刪除了 JAR 的情況）
  emit({ phase: 'pruning', done: parsedCount, total: totalToParse });
  try {
    const normalizedDir = path.normalize(directoryPath).toLowerCase();
    const foundSet = new Set([...allFoundFiles].map((p) => path.normalize(p).toLowerCase()));
    const { getDB } = require('./db');
    const db = getDB();

    // ✅ 修復：只查詢當前目錄下的遊戲記錄
    const dirGames = db
      .prepare(
        `
      SELECT * FROM games 
      WHERE LOWER(filePath) LIKE LOWER(?) || '%'
      ORDER BY gameName
    `
      )
      .all(directoryPath);

    let prunedCount = 0;
    for (const game of dirGames) {
      const filePath = game && game.filePath ? game.filePath : null;
      if (!filePath) continue;

      const normalizedFile = path.normalize(filePath).toLowerCase();

      // ✅ 修復：實際檢查檔案是否存在於磁碟
      const fs = require('fs-extra');
      try {
        const exists = await fs.pathExists(filePath);
        if (!exists) {
          // 檔案確實不存在，安全刪除
          db.prepare('DELETE FROM games WHERE filePath = ?').run(filePath);
          prunedCount++;
          log.debug(`🗑️  已移除缺失的遊戲記錄: ${path.basename(filePath)}`);
        }
      } catch (fsError) {
        // 檔案系統錯誤，也視為檔案不存在
        db.prepare('DELETE FROM games WHERE filePath = ?').run(filePath);
        prunedCount++;
        log.debug(`🗑️  已移除無法訪問的遊戲記錄: ${path.basename(filePath)}`);
      }
    }

    if (prunedCount > 0) {
      log.info(`🧹 已裁剪 ${prunedCount} 個缺失檔案的遊戲記錄（來源目錄: ${directoryPath}）`);
    }
  } catch (e) {
    log.warn(`裁剪缺失檔案記錄時發生錯誤: ${e.message}`);
  }

  // 資料已自動保存至 SQLite，無需手動保存
  log.debug('💾 資料已保存至 SQLite');
  // 最終階段：完成
  emit({ phase: 'done', done: parsedCount, total: totalToParse });

  // 4. 返回本次掃描的結果統計
  const result = {
    directoryPath,
    totalFiles: allFoundFiles.size,
    parsedFiles: filesToParse.length,
    skippedFiles: skippedFiles.length,
    newGames: newlyParsedGames,
    isIncremental: isIncrementalScan,
  };

  log.info(`✅ 目錄處理完成: ${directoryPath}`);
  log.info(`   新解析項目: ${newlyParsedGames.length}`);
  log.info(`   跳過文件: ${skippedFiles.length}`);

  return result;
}

// 多目錄增量掃描主函數
async function processMultipleDirectories(directories = null, forceFullScan = false, opts = {}) {
  log.info('🌍 開始多路徑掃描...');

  // 如果沒有指定目錄，從數據庫獲取啟用的目錄
  const { getDirectories } = require('./sql/directories');
  const targetDirectories =
    directories ||
    getDirectories()
      .filter((d) => d.enabled)
      .map((d) => d.path);

  if (targetDirectories.length === 0) {
    log.warn('⚠️  沒有配置任何目錄');
    return {
      success: true,
      totalDirectories: 0,
      results: [],
      summary: {
        totalFiles: 0,
        totalNewGames: 0,
        totalSkipped: 0,
        totalErrors: 0,
      },
    };
  }

  log.info(`📁 将扫描 ${targetDirectories.length} 个目录`);

  const results = [];
  const summary = {
    totalFiles: 0,
    totalNewGames: 0,
    totalSkipped: 0,
    totalErrors: 0,
  };

  // 逐個處理目錄
  for (const directory of targetDirectories) {
    const directoryPath = typeof directory === 'string' ? directory : directory.path;

    try {
      // 檢查目錄是否存在
      if (!(await fs.pathExists(directoryPath))) {
        log.warn(`⚠️  目錄不存在，跳過: ${directoryPath}`);
        results.push({
          directoryPath,
          success: false,
          error: '目錄不存在',
          totalFiles: 0,
          parsedFiles: 0,
          skippedFiles: 0,
          newGames: [],
        });
        summary.totalErrors++;
        continue;
      }

      // 执行掃描（除非強制全量掃描，否則使用增量掃描）
      const isIncremental = !forceFullScan;
      const result = await processDirectory(directoryPath, isIncremental, opts);

      results.push({
        ...result,
        success: true,
      });

      // 累計統計
      summary.totalFiles += result.totalFiles;
      summary.totalNewGames += result.newGames.length;
      summary.totalSkipped += result.skippedFiles;
    } catch (error) {
      log.error(`處理路徑失敗 ${directoryPath}:`, error.message);
      results.push({
        directoryPath,
        success: false,
        error: error.message,
        totalFiles: 0,
        parsedFiles: 0,
        skippedFiles: 0,
        newGames: [],
      });
      summary.totalErrors++;
    }
  }

  log.info('🎆 多路徑掃描完成!');
  log.info(`   處理目錄: ${targetDirectories.length}`);
  log.info(`   總文件數: ${summary.totalFiles}`);
  log.info(`   新增項目: ${summary.totalNewGames}`);
  log.info(`   跳過文件: ${summary.totalSkipped}`);
  log.info(`   錯誤數量: ${summary.totalErrors}`);

  return {
    success: true,
    totalDirectories: targetDirectories.length,
    results,
    summary,
  };
}

// 自动增量扫描（应用启动时调用）
async function performAutoIncrementalScan() {
  log.info('🔄 開始自動增量掃描……');

  try {
    const result = await processMultipleDirectories(null, false); // 使用增量掃描

    if (result.success && result.summary.totalNewGames > 0) {
      log.info(`🎉 自動掃描發現 ${result.summary.totalNewGames} 個新項目`);
    } else if (result.success) {
      log.info('✅ 自動掃描完成，沒有發現新項目');
    }

    return result;
  } catch (error) {
    log.error('自動掃描失敗:', error.message);
    return {
      success: false,
      error: error.message,
      totalDirectories: 0,
      results: [],
      summary: { totalFiles: 0, totalNewGames: 0, totalSkipped: 0, totalErrors: 1 },
    };
  }
}

module.exports = {
  processDirectory,
  processMultipleDirectories,
  performAutoIncrementalScan,
};
