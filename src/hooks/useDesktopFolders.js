import { useState, useCallback, useEffect } from 'react';

/**
 * 桌面資料夾管理 Hook
 * 抽取自 DesktopManager 的資料夾相關邏輯
 * 
 * Linus 風格：Do one thing and do it well
 * 只負責資料夾的 CRUD 操作和狀態管理
 */
export const useDesktopFolders = () => {
  const [folders, setFolders] = useState([]);
  const [desktopItems, setDesktopItems] = useState([]);

  // 載入資料夾資料
  const loadFolders = useCallback(async () => {
    try {
      if (window.electronAPI?.getFolders) {
        const folderList = await window.electronAPI.getFolders();
        setFolders(folderList || []);
      }
    } catch (error) {
      console.error('載入資料夾失敗:', error);
      setFolders([]);
    }
  }, []);

  // 載入桌面資料（遊戲 + 資料夾）
  const loadDesktopItems = useCallback(async () => {
    try {
      if (window.electronAPI?.getDesktopItems) {
        const items = await window.electronAPI.getDesktopItems();
        setDesktopItems(items || []);
      }
    } catch (error) {
      console.error('載入桌面項目失敗:', error);
      setDesktopItems([]);
    }
  }, []);

  // 刷新所有資料夾相關資料
  const refreshFolders = useCallback(async () => {
    await Promise.all([loadFolders(), loadDesktopItems()]);
  }, [loadFolders, loadDesktopItems]);

  // 創建資料夾
  const createFolder = useCallback(async (folderData) => {
    try {
      if (window.electronAPI?.createFolder) {
        await window.electronAPI.createFolder(folderData);
        await refreshFolders();
      }
    } catch (error) {
      console.error('創建資料夾失敗:', error);
      throw error;
    }
  }, [refreshFolders]);

  // 更新資料夾
  const updateFolder = useCallback(async (folderId, folderData) => {
    try {
      if (window.electronAPI?.updateFolder) {
        await window.electronAPI.updateFolder(folderId, folderData);
        await refreshFolders();
      }
    } catch (error) {
      console.error('更新資料夾失敗:', error);
      throw error;
    }
  }, [refreshFolders]);

  // 將遊戲添加到資料夾
  const addGameToFolder = useCallback(async (gameFilePath, folderId) => {
    try {
      if (window.electronAPI?.addGameToFolder) {
        await window.electronAPI.addGameToFolder(gameFilePath, folderId);
        await refreshFolders();
      }
    } catch (error) {
      console.error('添加遊戲到資料夾失敗:', error);
      throw error;
    }
  }, [refreshFolders]);

  // 初始化載入
  useEffect(() => {
    loadFolders();
    loadDesktopItems();
  }, [loadFolders, loadDesktopItems]);

  // 監聽資料夾變更事件
  useEffect(() => {
    if (window.electronAPI?.onFolderChanged) {
      const unsubscribe = window.electronAPI.onFolderChanged(() => {
        console.log('資料夾變更事件觸發');
        refreshFolders();
      });
      return unsubscribe;
    }
  }, [refreshFolders]);

  return {
    folders,
    desktopItems,
    loadFolders,
    loadDesktopItems,
    refreshFolders,
    createFolder,
    updateFolder,
    addGameToFolder
  };
};

export default useDesktopFolders;
