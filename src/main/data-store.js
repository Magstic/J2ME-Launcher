const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');

const userDataPath = app.getPath('userData');
const iconCachePath = path.join(userDataPath, 'icons');

class DataStore {
  constructor() {
    fs.ensureDirSync(iconCachePath);
  }

  /**
   * SQLite 中的所有遊戲資料
   * @returns {Array<object>} 游戏对象数组
   */
  getAllGames() {
    try {
      const { getAllGamesFromSql } = require('./sql/read');
      return getAllGamesFromSql();
    } catch (e) {
      console.error('[DataStore] getAllGames SQL read failed:', e.message);
      return [];
    }
  }

  /**
   * SQLite 中的指定遊戲資料
   * @param {string} filePath - JAR 的絕對路徑
   * @returns {object | undefined} 游戲資料
   */
  getGame(filePath) {
    try {
      const { getDB } = require('./db');
      const { rowToGame } = require('./sql/read');
      const db = getDB();
      const row = db.prepare('SELECT * FROM games WHERE filePath=?').get(filePath);
      return rowToGame(row) || undefined;
    } catch (e) {
      console.error('[DataStore] getGame SQL read failed:', e.message);
      return undefined;
    }
  }

  clearAllGames() {
    try {
      const { getDB } = require('./db');
      const db = getDB();
      db.exec('DELETE FROM games');
    } catch (e) {
      console.error('[DataStore] clearAllGames SQL delete failed:', e.message);
    }
  }

  /**
   * SQLite 中添加或更新遊戲資料
   * @param {string} filePath - JAR 的絕對路徑
   * @param {object} gameData - 遊戲元資料
   */
  setGame(filePath, gameData) {
    try {
      const { upsertGames } = require('./sql/sync');
      const row = { ...(gameData || {}), filePath };
      upsertGames([row]);
    } catch (e) {
      console.error('[DataStore] setGame SQL upsert failed:', e.message);
      throw e;
    }
  }

  /**
   * 移除遊戲資料
   * @param {string} filePath - JAR 的絕對路徑
   */
  removeGame(filePath) {
    const game = this.getGame(filePath);
    // 兼容舊欄位：可能是 iconPath 或 cachedIconPath
    const iconCandidates = [];
    if (game) {
      if (game.iconPath) iconCandidates.push(game.iconPath);
      if (game.cachedIconPath) iconCandidates.push(game.cachedIconPath);
    }

    for (const p of iconCandidates) {
      try {
        if (p && fs.existsSync(p)) {
          fs.removeSync(p);
          console.log(`🧹 已刪除圖標檔: ${p}`);
        }
      } catch (e) {
        console.warn(`刪除圖標檔失敗: ${p} -> ${e.message}`);
      }
    }
    // SQL-first 刪除
    try {
      const { getDB } = require('./db');
      const db = getDB();
      db.prepare('DELETE FROM games WHERE filePath=?').run(filePath);
    } catch (e) {
      console.error('[DataStore] removeGame SQL delete failed:', e.message);
    }
  }

  /**
   * 获取圖標快取資料夾的路徑
   * @returns {string} 圖標快取資料夾的路徑
   */
  getIconCachePath() {
    return iconCachePath;
  }

  // ==================== 目錄管理功能 ====================

  /**
   * SQLite 中的所有目錄配置
   * @returns {Array<object>} 目錄配置數組
   */
  getDirectories() {
    try {
      const { getDirectories: sqlGetDirectories } = require('./sql/directories');
      return sqlGetDirectories();
    } catch (e) {
      console.error('[DataStore] getDirectories SQL read failed:', e.message);
      return [];
    }
  }

  /**
   * 添加新目录到配置（委託給 SQL 層）
   * @param {string} directoryPath - 目錄路徑
   * @returns {boolean} 是否添加成功
   */
  addDirectory(directoryPath) {
    try {
      const { addDirectory: sqlAddDirectory } = require('./sql/directories');
      sqlAddDirectory(directoryPath);
      console.log(`已添加目錄: ${directoryPath}`);
      return true;
    } catch (e) {
      console.error('[DataStore] addDirectory SQL write failed:', e.message);
      return false;
    }
  }

  /**
   * 移除目錄配置（委託給 SQL 層處理）
   * @param {string} directoryPath - 目錄路徑
   * @returns {boolean} 是否移除成功
   */
  removeDirectory(directoryPath) {
    // 檢查 SQL 中是否存在該目錄
    try {
      const { getDirectories: sqlGetDirectories } = require('./sql/directories');
      const existsInSql = (sqlGetDirectories() || []).some((d) => d.path === directoryPath);
      if (existsInSql) {
        console.log(`[DataStore] removeDirectory: delegating to SQL layer -> ${directoryPath}`);
        // 清理目錄下的圖標快取
        this.removeGamesByDirectory(directoryPath);
        return true;
      }
    } catch (e) {
      console.error('[DataStore] removeDirectory SQL read failed:', e.message);
    }

    return false;
  }

  /**
   * 清理圖標快取資料夾中未被任何遊戲引用的檔案
   */
  cleanupOrphanIcons() {
    try {
      const dir = this.getIconCachePath();
      if (!fs.existsSync(dir)) return;

      // 從 SQLite 蒐集所有被引用的圖標路徑
      const referenced = new Set();
      try {
        const allGames = this.getAllGames();
        for (const game of allGames) {
          if (game && game.iconPath) referenced.add(path.normalize(game.iconPath));
          if (game && game.cachedIconPath) referenced.add(path.normalize(game.cachedIconPath));
        }
      } catch (e) {
        console.warn('[DataStore] cleanupOrphanIcons: failed to get games from SQL:', e.message);
      }

      const files = fs.readdirSync(dir);
      let removedCount = 0;
      for (const name of files) {
        const p = path.join(dir, name);
        // 僅處理檔案
        const stat = fs.statSync(p);
        if (!stat.isFile()) continue;
        if (!referenced.has(path.normalize(p))) {
          try {
            fs.removeSync(p);
            removedCount++;
          } catch (e) {
            console.warn(`清理孤立圖標失敗: ${p} -> ${e.message}`);
          }
        }
      }
      if (removedCount > 0) {
        console.log(`🧹 已清理 ${removedCount} 個孤立圖標檔`);
      }
    } catch (error) {
      console.error('清理孤立圖標時發生錯誤:', error);
    }
  }

  /**
   * 移除指定目录下的所有游戏（通過 SQL 處理）
   * @param {string} directoryPath - 目录路径
   */
  removeGamesByDirectory(directoryPath) {
    console.log(`[DataStore] removeGamesByDirectory: ${directoryPath} - delegating to SQL layer`);
    // SQL 層會處理目錄下遊戲的刪除，這裡只需要清理圖標快取
    this.cleanupOrphanIcons();
  }

  /**
   * 获取启用的目录列表（委託給 SQL 層）
   * @returns {Array<object>} 启用的目录配置数组
   */
  getEnabledDirectories() {
    try {
      const { getEnabledDirectories } = require('./sql/directories');
      return getEnabledDirectories();
    } catch (e) {
      console.error('[DataStore] getEnabledDirectories SQL read failed:', e.message);
      return [];
    }
  }

  /**
   * 检查游戏是否需要重新扫描（基于文件修改时间和MD5）
   * @param {string} filePath - JAR文件路径
   * @param {number} currentMtimeMs - 当前文件修改时间
   * @param {string} currentMd5 - 当前文件MD5
   * @returns {boolean} 是否需要重新扫描
   */
  needsRescan(filePath, currentMtimeMs, currentMd5) {
    const existingGame = this.getGame(filePath);
    if (!existingGame) {
      return true; // 新文件，需要扫描
    }

    // 检查修改时间
    if (existingGame.mtimeMs !== currentMtimeMs) {
      console.log(`文件修改时间变化，需要重新扫描: ${path.basename(filePath)}`);
      return true;
    }

    // 检查MD5（如果有的话）
    if (currentMd5 && existingGame.md5 && existingGame.md5 !== currentMd5) {
      console.log(`文件MD5变化，需要重新扫描: ${path.basename(filePath)}`);
      return true;
    }

    return false; // 文件未变化，跳过扫描
  }

  // ==================== 遊戲級別模擬器配置 ====================
  /**
   * 取得指定遊戲的模擬器配置（僅從 SQLite 讀取）
   * @param {string} filePath
   */
  getGameEmulatorConfig(filePath) {
    try {
      const { getGameEmulatorConfig } = require('./sql/emulator-configs');
      return getGameEmulatorConfig(filePath);
    } catch (e) {
      console.error('[DataStore] getGameEmulatorConfig SQL read failed:', e.message);
      return null;
    }
  }

  /**
   * 設置指定遊戲的模擬器配置（僅寫入 SQLite）
   * @param {string} filePath
   * @param {object|null} emulatorConfig
   */
  setGameEmulatorConfig(filePath, emulatorConfig) {
    try {
      const { setGameEmulatorConfig } = require('./sql/emulator-configs');
      return setGameEmulatorConfig(filePath, emulatorConfig);
    } catch (e) {
      console.error('[DataStore] setGameEmulatorConfig SQL write failed:', e.message);
      throw e;
    }
  }

  // ==================== 設定（模擬器） ====================
  /**
   * 取得整體設定（YAML-Only 視圖，不會改動 JSON）
   */
  getSettings() {
    const { getEmulatorConfig } = require('./config/yaml-config');
    const emulators = getEmulatorConfig();
    return { emulators };
  }

  /**
   * 取得模擬器設定
   */
  getEmulatorConfig() {
    const { getEmulatorConfig } = require('./config/yaml-config');
    return getEmulatorConfig();
  }

  /**
   * 設置（合併）模擬器設定
   * @param {object} partial - 局部設定，如 { freej2mePlus: { jarPath, defaults: {...} } }
   */
  setEmulatorConfig(partial) {
    const { setEmulatorConfig } = require('./config/yaml-config');
    return setEmulatorConfig(partial || {});
  }
}

// 导出单例
module.exports = new DataStore();
