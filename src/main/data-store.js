const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');

const userDataPath = app.getPath('userData');
const iconCachePath = path.join(userDataPath, 'icons');
// 資料夾相關路徑
const foldersPath = path.join(userDataPath, 'folders');

class DataStore {
  constructor() {
    this.db = this.loadData();
    fs.ensureDirSync(iconCachePath);
    // 初始化資料夾目錄
    this.foldersDir = foldersPath;
    fs.ensureDirSync(this.foldersDir);
    // 已棄用：資料夾 JSON 索引，改由 SQLite 管理
    this.foldersIndex = this.loadFoldersIndex();
  }

  /**
   * 从 JSON 文件加载数据库
   * @returns {object} 游戏数据对象
   */
  loadData() {
    // 已移除 JSON 檔案讀取。僅返回內存結構以維持兼容（不持久化）。
    return { games: {}, directories: [] };
  }

  /**
   * 将数据库保存到 JSON 文件
   */
  saveData() {
    // 已移除 JSON 檔案寫入。保留為 no-op 以避免破壞舊呼叫點。
    console.warn('[DataStore] saveData() no-op: JSON persistence removed');
  }

  /**
   * 获取所有游戏数据
   * @returns {Array<object>} 游戏对象数组
   */
  getAllGames() {
    // SQL-first：直接從 SQLite 讀取啟用目錄下的遊戲
    try {
      const { getAllGamesFromSql } = require('./sql/read');
      return getAllGamesFromSql();
    } catch (e) {
      console.warn('[DataStore] getAllGames SQL read failed, returning in-memory games:', e.message);
      return Object.values(this.db.games || {});
    }
  }

  /**
   * 获取指定的游戏数据
   * @param {string} filePath - JAR 文件的绝对路径
   * @returns {object | undefined} 游戏数据
   */
  getGame(filePath) {
    try {
      const { getDB } = require('./db');
      const { rowToGame } = require('./sql/read');
      const db = getDB();
      const row = db.prepare('SELECT * FROM games WHERE filePath=?').get(filePath);
      return rowToGame(row) || undefined;
    } catch (e) {
      // 回退到內存查找
      return this.db.games ? this.db.games[filePath] : undefined;
    }
  }

  clearAllGames() {
    // SQL-first：清空資料庫中的遊戲（將連帶清理關聯表）
    try {
      const { getDB } = require('./db');
      const db = getDB();
      db.exec('DELETE FROM games');
    } catch (e) {
      console.warn('[DataStore] clearAllGames SQL delete failed, clearing in-memory only:', e.message);
    }
    this.db.games = {};
  }

  /**
   * 添加或更新游戏数据
   * @param {string} filePath - JAR 文件的绝对路径
   * @param {object} gameData - 游戏元数据
   */
  setGame(filePath, gameData) {
    // SQL-first upsert，並維持內存快取（非持久化）
    try {
      const { upsertGames } = require('./sql/sync');
      const row = { ...(gameData || {}), filePath };
      upsertGames([row]);
    } catch (e) {
      console.warn('[DataStore] setGame SQL upsert failed, updating in-memory only:', e.message);
    }
    if (!this.db.games) this.db.games = {};
    this.db.games[filePath] = { ...(gameData || {}), filePath };
  }

  /**
   * 移除游戏数据
   * @param {string} filePath - JAR 文件的绝对路径
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
      console.warn('[DataStore] removeGame SQL delete failed:', e.message);
    }
    if (this.db.games) delete this.db.games[filePath];
  }

  /**
   * 获取图标缓存目录的路径
   * @returns {string} 图标缓存目录路径
   */
  getIconCachePath() {
    return iconCachePath;
  }

  // ==================== 目錄管理功能 ====================

  /**
   * 获取所有配置的目录
   * @returns {Array<object>} 目录配置数组
   */
  getDirectories() {
    // SQL-first 讀取目錄設定
    try {
      const { getDirectories: sqlGetDirectories } = require('./sql/directories');
      return sqlGetDirectories();
    } catch (e) {
      console.warn('[DataStore] getDirectories SQL read failed, returning in-memory directories:', e.message);
      return this.db.directories || [];
    }
  }

  /**
   * 添加新目录到配置
   * @param {string} directoryPath - 目录路径
   * @returns {boolean} 是否添加成功
   */
  addDirectory(directoryPath) {
    if (!this.db.directories) {
      this.db.directories = [];
    }
    
    // 检查是否已存在
    const exists = this.db.directories.some(dir => dir.path === directoryPath);
    if (exists) {
      console.log(`目录已存在: ${directoryPath}`);
      return false;
    }
    
    // 添加新目录
    this.db.directories.push({
      path: directoryPath,
      lastScanTime: null,
      enabled: true,
      addedTime: new Date().toISOString()
    });
    
    console.log(`已添加目录: ${directoryPath}`);
    return true;
  }

  /**
   * 移除目录配置
   * @param {string} directoryPath - 目录路径
   * @returns {boolean} 是否移除成功
   */
  removeDirectory(directoryPath) {
    // 先從記憶體移除（若存在）
    const before = Array.isArray(this.db.directories) ? this.db.directories.length : 0;
    if (!this.db.directories) this.db.directories = [];
    this.db.directories = this.db.directories.filter(dir => dir.path !== directoryPath);
    const removedInMemory = this.db.directories.length < before;

    if (removedInMemory) {
      console.log(`已從記憶體移除目錄: ${directoryPath}`);
      // 清理內存資料相關引用
      this.removeGamesByDirectory(directoryPath);
      this.removeFolderGamesByDirectory(directoryPath);
      this.cleanupOrphanIcons();
      return true;
    }

    // 若記憶體沒有該目錄，檢查 SQL 中是否存在。存在則返回 true 讓 IPC 後續執行 SQL 刪除。
    try {
      const { getDirectories: sqlGetDirectories } = require('./sql/directories');
      const existsInSql = (sqlGetDirectories() || []).some(d => d.path === directoryPath);
      if (existsInSql) {
        console.log(`[DataStore] removeDirectory: path exists in SQL, allowing IPC to delete -> ${directoryPath}`);
        return true;
      }
    } catch (e) {
      console.warn('[DataStore] removeDirectory SQL read failed:', e.message);
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

      // 蒐集所有被引用的圖標路徑
      const referenced = new Set();
      for (const game of Object.values(this.db.games || {})) {
        if (game && game.iconPath) referenced.add(path.normalize(game.iconPath));
        if (game && game.cachedIconPath) referenced.add(path.normalize(game.cachedIconPath));
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
   * 更新目录的扫描时间
   * @param {string} directoryPath - 目录路径
   */
  updateDirectoryScanTime(directoryPath) {
    if (!this.db.directories) {
      return;
    }
    
    const directory = this.db.directories.find(dir => dir.path === directoryPath);
    if (directory) {
      directory.lastScanTime = new Date().toISOString();
      console.log(`已更新目录扫描时间: ${directoryPath}`);
    }
  }

  /**
   * 启用或禁用目录
   * @param {string} directoryPath - 目录路径
   * @param {boolean} enabled - 是否启用
   */
  setDirectoryEnabled(directoryPath, enabled) {
    if (!this.db.directories) {
      return;
    }
    
    const directory = this.db.directories.find(dir => dir.path === directoryPath);
    if (directory) {
      directory.enabled = enabled;
      console.log(`目录 ${directoryPath} ${enabled ? '已启用' : '已禁用'}`);
    }
  }

  /**
   * 移除指定目录下的所有游戏
   * @param {string} directoryPath - 目录路径
   */
  removeGamesByDirectory(directoryPath) {
    if (!this.db.games) {
      return;
    }
    
    const normalizedDirPath = path.normalize(directoryPath).toLowerCase();
    const gamesToRemove = [];
    
    // 找出该目录下的所有游戏
    for (const [filePath, game] of Object.entries(this.db.games)) {
      const normalizedFilePath = path.normalize(filePath).toLowerCase();
      if (normalizedFilePath.startsWith(normalizedDirPath)) {
        gamesToRemove.push(filePath);
      }
    }
    
    // 移除游戏和图标缓存
    for (const filePath of gamesToRemove) {
      this.removeGame(filePath);
    }
    
    console.log(`已移除目录 ${directoryPath} 下的 ${gamesToRemove.length} 个游戏`);
  }

  /**
   * 從所有資料夾內容中移除指定目錄下的遊戲引用
   * @param {string} directoryPath - 目錄路徑
   */
  removeFolderGamesByDirectory(directoryPath) {
    console.warn('[DataStore] Deprecated: removeFolderGamesByDirectory() is SQL-managed now. No-op.');
  }

  /**
   * 获取启用的目录列表
   * @returns {Array<object>} 启用的目录配置数组
   */
  getEnabledDirectories() {
    const dirs = this.getDirectories();
    return (dirs || []).filter(dir => dir.enabled);
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

  // ==================== 資料夾管理功能 ====================

  /**
   * 讀取資料夾索引文件
   * @returns {object} 資料夾索引數據
   */
  loadFoldersIndex() {
    console.warn('[DataStore] Deprecated: loadFoldersIndex() is unused. Returning empty index.');
    return { folders: [] };
  }

  /**
   * 保存資料夾索引文件
   */
  saveFoldersIndex() {
    console.warn('[DataStore] Deprecated: saveFoldersIndex() is unused. No-op.');
  }

  /**
   * 獲取所有資料夾列表
   * @returns {Array<object>} 資料夾列表
   */
  getFolders() {
    console.warn('[DataStore] Deprecated: getFolders() is SQL-managed now. Returning empty array.');
    return [];
  }

  /**
   * 獲取單個資料夾信息
   * @param {string} folderId - 資料夾 ID
   * @returns {object|null} 資料夾信息
   */
  getFolderById(folderId) {
    console.warn('[DataStore] Deprecated: getFolderById() is SQL-managed now. Returning null.');
    return null;
  }

  /**
   * 創建新資料夾
   * @param {string} name - 資料夾名稱
   * @param {string} description - 資料夾描述
   * @param {string} icon - 資料夾圖標
   * @param {string} color - 資料夾顏色
   * @returns {object} 新創建的資料夾
   */
  createFolder(name, description = '', icon = 'folder', color = '#4a90e2') {
    throw new Error('[DataStore] Deprecated: createFolder() removed. Use SQL folders-write.createFolder');
  }

  /**
   * 更新資料夾信息
   * @param {string} folderId - 資料夾 ID
   * @param {object} updates - 更新的屬性
   * @returns {boolean} 是否更新成功
   */
  updateFolder(folderId, updates) {
    throw new Error('[DataStore] Deprecated: updateFolder() removed. Use SQL folders-write.updateFolder');
  }

  /**
   * 刪除資料夾
   * @param {string} folderId - 資料夾 ID
   * @param {boolean} moveGamesToUncategorized - 是否將遊戲移至未分類
   * @returns {boolean} 是否刪除成功
   */
  deleteFolder(folderId, moveGamesToUncategorized = true) {
    throw new Error('[DataStore] Deprecated: deleteFolder() removed. Use SQL folders-write.deleteFolder');
  }

  /**
   * 獲取資料夾內容文件路徑
   * @param {string} folderId - 資料夾 ID
   * @returns {string} 文件路徑
   */
  getFolderContentPath(folderId) {
    console.warn('[DataStore] Deprecated: getFolderContentPath() is unused.');
    return path.join(this.foldersDir, `${folderId}.json`);
  }

  /**
   * 讀取資料夾內容
   * @param {string} folderId - 資料夾 ID
   * @returns {object|null} 資料夾內容
   */
  loadFolderContent(folderId) {
    console.warn('[DataStore] Deprecated: loadFolderContent() is SQL-managed now. Returning null.');
    return null;
  }

  /**
   * 保存資料夾內容
   * @param {string} folderId - 資料夾 ID
   * @param {object} content - 資料夾內容
   */
  saveFolderContent(folderId, content) {
    console.warn('[DataStore] Deprecated: saveFolderContent() is SQL-managed now. No-op.');
  }

  /**
   * 獲取資料夾中的遊戲
   * @param {string} folderId - 資料夾 ID
   * @returns {Array<object>} 遊戲列表
   */
  getGamesByFolder(folderId) {
    console.warn('[DataStore] Deprecated: getGamesByFolder() is SQL-managed now. Returning empty array.');
    return [];
  }

  /**
   * 將遊戲加入資料夾
   * @param {string} gameId - 遊戲 ID（文件路徑）
   * @param {string} folderId - 資料夾 ID
   * @returns {boolean} 是否成功
   */
  addGameToFolder(gameId, folderId) {
    throw new Error('[DataStore] Deprecated: addGameToFolder() removed. Use SQL folders-write.addGameToFolder');
  }

  /**
   * 從資料夾中移除遊戲
   * @param {string} gameId - 遊戲 ID（文件路徑）
   * @param {string} folderId - 資料夾 ID
   * @returns {boolean} 是否成功
   */
  removeGameFromFolder(gameId, folderId) {
    throw new Error('[DataStore] Deprecated: removeGameFromFolder() removed. Use SQL folders-write.removeGameFromFolder');
  }

  /**
   * 在資料夾間移動遊戲
   * @param {string} gameId - 遊戲 ID
   * @param {string} fromFolderId - 來源資料夾 ID
   * @param {string} toFolderId - 目標資料夾 ID
   * @returns {boolean} 是否成功
   */
  moveGameBetweenFolders(gameId, fromFolderId, toFolderId) {
    throw new Error('[DataStore] Deprecated: moveGameBetweenFolders() removed. Use SQL folders-write ops');
  }

  /**
   * 獲取未分類的遊戲
   * @returns {Array<object>} 未分類遊戲列表
   */
  getUncategorizedGames() {
    console.warn('[DataStore] Deprecated: getUncategorizedGames() is SQL-managed now. Returning empty array.');
    return [];
  }

  /**
   * 獲取遊戲所屬的資料夾
   * @param {string} gameId - 遊戲 ID
   * @returns {Array<object>} 資料夾列表
   */
  getGameFolders(gameId) {
    console.warn('[DataStore] Deprecated: getGameFolders() is SQL-managed now. Returning empty array.');
    return [];
  }

  /**
   * 更新資料夾遊戲數量
   * @param {string} folderId - 資料夾 ID
   */
  updateFolderGameCount(folderId) {
    console.warn('[DataStore] Deprecated: updateFolderGameCount() is SQL-managed now. No-op.');
  }

  /**
   * 獲取資料夾統計信息
   * @returns {object} 統計信息
   */
  getFolderStats() {
    console.warn('[DataStore] Deprecated: getFolderStats() is SQL-managed now. Returning empty stats.');
    return { totalFolders: 0, totalGames: (this.getAllGames() || []).length, categorizedGames: 0, uncategorizedGames: 0, folders: [] };
  }

  /**
   * 清理孤立的資料夾文件
   */
  cleanupOrphanedFolders() {
    const folders = this.getFolders();
    const folderIds = new Set(folders.map(f => f.id));
    
    try {
      const files = fs.readdirSync(foldersPath);
      let cleanedCount = 0;
      
      for (const file of files) {
        if (file === 'index.json') continue;
        
        const folderId = path.basename(file, '.json');
        if (!folderIds.has(folderId)) {
          const filePath = path.join(foldersPath, file);
          fs.removeSync(filePath);
          cleanedCount++;
          console.log(`已清理孤立資料夾文件: ${file}`);
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`已清理 ${cleanedCount} 個孤立資料夾文件`);
      }
    } catch (error) {
      console.error('清理孤立資料夾文件失敗:', error);
    }
  }

  /**
   * 獲取桌面項目（未分類遊戲 + 資料夾）
   * @returns {Array<object>} 桌面項目列表
   */
  getDesktopItems() {
    console.warn('[DataStore] Deprecated: getDesktopItems() is SQL-managed now. Returning empty array.');
    return [];
  }

  // ==================== 遊戲級別模擬器配置 ====================
  /**
   * 取得指定遊戲的模擬器配置（若無則返回 null）
   * @param {string} filePath
   */
  getGameEmulatorConfig(filePath) {
    try {
      const { getGameEmulatorConfig } = require('./sql/emulator-configs');
      return getGameEmulatorConfig(filePath);
    } catch (e) {
      console.warn('[DataStore] getGameEmulatorConfig SQL read failed:', e.message);
      // 與舊結構兼容（僅內存）
      if (!this.db.games) return null;
      const game = this.db.games[filePath];
      return game && game.emulatorConfig ? game.emulatorConfig : null;
    }
  }

  /**
   * 設置指定遊戲的模擬器配置（會保存）
   * @param {string} filePath
   * @param {object|null} emulatorConfig
   */
  setGameEmulatorConfig(filePath, emulatorConfig) {
    try {
      const { setGameEmulatorConfig } = require('./sql/emulator-configs');
      return setGameEmulatorConfig(filePath, emulatorConfig);
    } catch (e) {
      console.warn('[DataStore] setGameEmulatorConfig SQL write failed, updating in-memory only:', e.message);
      if (!this.db.games) this.db.games = {};
      const existing = this.db.games[filePath] || { filePath };
      this.db.games[filePath] = { ...existing, emulatorConfig: emulatorConfig || null };
      return this.db.games[filePath].emulatorConfig || null;
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
