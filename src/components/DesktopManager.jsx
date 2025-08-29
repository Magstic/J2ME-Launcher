import React, { useState, useEffect, useCallback, useRef } from 'react';
import FolderDrawer from './FolderDrawer/FolderDrawer';
import { DragProvider } from './DragDrop/DragProvider';
import DesktopView from './Desktop/DesktopView';
import CreateFolderDialog from './Folder/CreateFolderDialog';
// 移除 FolderWindow import，現在使用獨立 BrowserWindow
import { FolderSelectDialog } from '@components';
import GameInfoDialog from './Desktop/GameInfoDialog';
import ConfirmDialog from './Common/ConfirmDialog';
import { ModalWithFooter, ModalHeaderOnly } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

/**
 * 桌面管理器組件
 * 統一管理桌面狀態、資料夾操作和遊戲分類
 */
const DesktopManager = ({ 
  games = [], 
  searchQuery = '', 
  isLoading = false,
  onGameLaunch,
  isSwitchingToDesktop = false
}) => {
  const { t } = useTranslation();
  // 狀態管理
  const [folders, setFolders] = useState([]);
  const [desktopItems, setDesktopItems] = useState([]);
  const [createFolderDialog, setCreateFolderDialog] = useState({
    isOpen: false,
    mode: 'create',
    initialData: null
  });
  // 無資料夾引導關閉引用，提供給 ModalWithFooter 以觸發漸出
  const noFolderGuideCloseRef = useRef(null);
  // 移除 openFolderWindows state，現在使用獨立 BrowserWindow
  const [folderSelectDialog, setFolderSelectDialog] = useState({
    isOpen: false,
    game: null,
    selectedFilePaths: null, // 若為多選，保存所有檔案路徑
  });
  const [gameInfoDialog, setGameInfoDialog] = useState({
    isOpen: false,
    game: null
  });
  // 批量操作期間關閉動畫/抖動
  const [bulkMutating, setBulkMutating] = useState(false);
  // 無資料夾引導對話框
  const [noFolderGuideOpen, setNoFolderGuideOpen] = useState(false);
  // 刪除資料夾確認對話框狀態
  const [confirmDelete, setConfirmDelete] = useState({
    isOpen: false,
    folder: null
  });

  // 單一確認/關閉的訊息對話框（取代內建 alert）
  const [infoDialog, setInfoDialog] = useState({ isOpen: false, title: '', message: '' });

  // 批次狀態（用於顯示載入卡片）
  const [bulkStatus, setBulkStatus] = useState({ active: false, total: 0, done: 0, label: '' });

  // 左側資料夾抽屜（固定顯示）
  const drawerWidth = 120; // 與需求一致的固定寬度

  // 量測搜尋列相對於內容包裹層的偏移，讓抽屜頂部貼在搜尋列下方
  const contentWrapRef = useRef(null);
  const [drawerTopOffset, setDrawerTopOffset] = useState(0);
  const [drawerTopViewport, setDrawerTopViewport] = useState(0);
  const measureTopOffset = useCallback(() => {
    try {
      const wrap = contentWrapRef.current;
      if (!wrap) return;
      const search = document.querySelector('.search-bar') || document.querySelector('.search-bar-container');
      if (!search) {
        setDrawerTopOffset(0);
        return;
      }
      const wrapRect = wrap.getBoundingClientRect();
      const searchRect = search.getBoundingClientRect();
      // 以視窗座標對齊抽屜頂部到搜尋列頂部（= 標題欄下緣）
      setDrawerTopViewport(Math.round(searchRect.top));
      // 另外計算抽屜在 wrap 內的偏移（供內部捲動/高度計算使用）
      const inWrapTop = Math.max(0, Math.round(searchRect.top - wrapRect.top));
      setDrawerTopOffset(inWrapTop);
    } catch (_) {}
  }, []);
  useEffect(() => {
    // 初次量測 + 視窗大小改變時重新量測；不再使用 setInterval 以避免滾動抖動
    const onResize = () => measureTopOffset();
    // 延遲一次確保初始布局完成
    const t = setTimeout(measureTopOffset, 50);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t); };
  }, [measureTopOffset]);

  
  

  // 載入資料夾資料
  const loadFolders = useCallback(async () => {
    try {
      if (window.electronAPI?.getFolders) {
        const folderList = await window.electronAPI.getFolders();
        setFolders(folderList);
      }
    } catch (error) {
      console.error('載入資料夾失敗:', error);
    }
  }, []);

  // 載入桌面資料（遊戲 + 資料夾）
  const loadDesktopItems = useCallback(async () => {
    try {
      if (window.electronAPI?.getDesktopItems) {
        const items = await window.electronAPI.getDesktopItems();
        setDesktopItems(items);
      }
    } catch (error) {
      console.error('載入桌面資料失敗:', error);
    }
  }, []);

  // 事件刷新抑制與受控刷新（避免加入後先消失再動）
  const suppressUntilRef = useRef(0);
  const refreshTimerRef = useRef(null);
  const guardedRefresh = useCallback(() => {
    const now = Date.now();
    const remain = suppressUntilRef.current - now;
    if (remain > 0) {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        guardedRefresh();
      }, Math.min(remain + 20, 200));
      return;
    }
    (async () => {
      try { await loadFolders(); } catch (_) {}
      try { await loadDesktopItems(); } catch (_) {}
    })();
  }, [loadFolders, loadDesktopItems]);

  // 初始化資料
  useEffect(() => {
    loadFolders();
    loadDesktopItems();
  }, [loadFolders, loadDesktopItems]);

  // 監聽資料夾變更事件
  useEffect(() => {
    if (window.electronAPI?.onFolderChanged) {
      const unsubscribe = window.electronAPI.onFolderChanged(() => {
        console.log('資料夾變更事件觸發');
        guardedRefresh();
      });
      return unsubscribe;
    }
  }, [guardedRefresh]);

  // 監聽批次操作事件
  useEffect(() => {
    const handleBulkStart = (data) => {
      console.log('批次操作開始:', data);
      if (data.total > 30) {
        setBulkMutating(true);
        setBulkStatus({ 
          active: true, 
          total: data.total, 
          done: 0, 
          label: t('desktopManager.label') 
        });
      }
    };

    const handleBulkEnd = (data) => {
      console.log('批次操作結束:', data);
      setBulkMutating(false);
      setBulkStatus({ active: false, total: 0, done: 0, label: '' });
    };

    if (window.electronAPI?.onBulkOperationStart) {
      window.electronAPI.onBulkOperationStart(handleBulkStart);
    }
    if (window.electronAPI?.onBulkOperationEnd) {
      window.electronAPI.onBulkOperationEnd(handleBulkEnd);
    }

    return () => {
      // 清理監聽器
      if (window.electronAPI?.offBulkOperationStart) {
        window.electronAPI.offBulkOperationStart(handleBulkStart);
      }
      if (window.electronAPI?.offBulkOperationEnd) {
        window.electronAPI.offBulkOperationEnd(handleBulkEnd);
      }
    };
  }, [t]);

  // 監聽遊戲變更事件
  useEffect(() => {
    if (window.electronAPI?.onGamesUpdated) {
      const unsubscribe = window.electronAPI.onGamesUpdated(() => {
        console.log('遊戲變更事件觸發');
        guardedRefresh();
      });
      return unsubscribe;
    }
  }, [guardedRefresh]);

  // 創建資料夾
  const handleCreateFolder = useCallback(async (folderData) => {
    try {
      if (window.electronAPI?.createFolder) {
        await window.electronAPI.createFolder(folderData);
        // 事件監聽器會自動刷新資料
      }
    } catch (error) {
      console.error('創建資料夾失敗:', error);
      throw error;
    }
  }, []);

  // 更新資料夾
  const handleUpdateFolder = useCallback(async (folderId, folderData) => {
    try {
      if (window.electronAPI?.updateFolder) {
        await window.electronAPI.updateFolder(folderId, folderData);
        // 事件監聽器會自動刷新資料
      }
    } catch (error) {
      console.error('更新資料夾失敗:', error);
      throw error;
    }
  }, []);



  // 將遊戲添加到資料夾
  const handleGameDrop = useCallback(async (gameFilePath, folderId) => {
    try {
      if (window.electronAPI?.addGameToFolder) {
        console.log('正在將遊戲添加到資料夾:', gameFilePath, folderId);
        await window.electronAPI.addGameToFolder(gameFilePath, folderId);
        
        // 立即刷新資料，不依賴事件監聽
        await loadFolders();
        await loadDesktopItems();
        console.log('遊戲添加完成，資料已刷新');
      }
    } catch (error) {
      console.error('添加遊戲到資料夾失敗:', error);
    }
  }, [loadFolders, loadDesktopItems]);



  // 打開創建資料夾對話框
  const handleOpenCreateFolderDialog = useCallback(() => {
    setCreateFolderDialog({
      isOpen: true,
      mode: 'create',
      initialData: null
    });
  }, []);

  // 打開編輯資料夾對話框
  const handleOpenEditFolderDialog = useCallback((folder) => {
    setCreateFolderDialog({
      isOpen: true,
      mode: 'edit',
      initialData: folder
    });
  }, []);

  // 關閉資料夾對話框
  const handleCloseFolderDialog = useCallback(() => {
    setCreateFolderDialog({
      isOpen: false,
      mode: 'create',
      initialData: null
    });
  }, []);

  // 確認資料夾操作
  const handleConfirmFolderDialog = useCallback(async (folderData) => {
    try {
      if (createFolderDialog.mode === 'create') {
        await handleCreateFolder(folderData);
      } else if (createFolderDialog.mode === 'edit' && createFolderDialog.initialData) {
        await handleUpdateFolder(createFolderDialog.initialData.id, folderData);
      }
      
      // 立即刷新資料
      await loadFolders();
      await loadDesktopItems();
      console.log('資料夾操作完成，資料已刷新');
    } catch (error) {
      console.error('資料夾操作失敗:', error);
      throw error;
    }
  }, [createFolderDialog, handleCreateFolder, handleUpdateFolder, loadFolders, loadDesktopItems]);

  // 處理遊戲選擇（雙擊啟動）
  const handleGameSelect = useCallback((game) => {
    onGameLaunch && onGameLaunch(game);
  }, [onGameLaunch]);

  // 處理資料夾打開 - 使用獨立 BrowserWindow
  const handleFolderOpen = useCallback(async (folder) => {
    try {
      if (window.electronAPI?.openFolderWindow) {
        const result = await window.electronAPI.openFolderWindow(folder.id);
        if (!result.success) {
          console.error('打開資料夾窗口失敗:', result.error);
        }
      }
    } catch (error) {
      console.error('打開資料夾窗口時發生錯誤:', error);
    }
  }, []);

  // 處理資料夾編輯
  const handleEditFolder = useCallback((folder) => {
    setCreateFolderDialog({
      isOpen: true,
      mode: 'edit',
      initialData: folder
    });
  }, []);

  // 處理資料夾刪除（打開主題對話框）
  const handleDeleteFolder = useCallback((folder) => {
    setConfirmDelete({ isOpen: true, folder });
  }, []);

  const closeConfirmDelete = useCallback(() => {
    setConfirmDelete({ isOpen: false, folder: null });
  }, []);

  // 處理遊戲加入資料夾
  const handleAddToFolder = useCallback((target) => {
    const availableFolders = folders.filter(folder => folder.id);
    if (availableFolders.length === 0) {
      // 顯示引導：提示使用者新建資料夾
      setNoFolderGuideOpen(true);
      return;
    }
    
    // 打開資料夾選擇對話框
    setFolderSelectDialog({
      isOpen: true,
      game: target,
      selectedFilePaths: (target && Array.isArray(target.selectedFilePaths) && target.selectedFilePaths.length > 0)
        ? Array.from(new Set(target.selectedFilePaths))
        : null,
    });
  }, [folders]);

  // 處理資料夾選擇
  const handleFolderSelect = useCallback(async (selectedFolder) => {
    const game = folderSelectDialog.game;
    const list = folderSelectDialog.selectedFilePaths;
    if ((!game && !list) || !selectedFolder) return;

    try {
      if (window.electronAPI?.addGameToFolder) {
        // 抑制自動事件刷新，留出 FLIP 前後狀態捕捉窗口
        suppressUntilRef.current = Date.now() + 160;
        if (Array.isArray(list) && list.length > 0) {
          // 多選：使用統一的批次處理邏輯
          setBulkMutating(true);
          const unique = Array.from(new Set(list));

          // 開始前關閉資料夾選擇對話框，避免遮擋並減少重排
          try { setFolderSelectDialog({ isOpen: false, game: null, selectedFilePaths: null }); } catch (_) {}

          // 啟動進度顯示（降低門檻確保用戶看到反饋）
          if (unique.length > 10) {
            setBulkStatus({ active: true, total: unique.length, done: 0, label: t('desktopManager.label') });
          }

          // 確保批次參數可序列化
          const cleanFilePaths = unique.filter(fp => typeof fp === 'string');
          const folderIdStr = typeof selectedFolder.id === 'string' ? selectedFolder.id : String(selectedFolder.id || '');
          
          // 使用統一的批次處理 API
          if (window.electronAPI?.batchAddGamesToFolder) {
            // 創建可序列化的選項物件（不包含函數）
            const batchOptions = {
              threshold: 30,
              chunkSize: 50,
              quiet: true
            };
            
            // 單獨處理進度回調，避免序列化函數
            const progressHandler = (progress) => {
              const processed = typeof progress?.processed === 'number' ? progress.processed : 0;
              const total = typeof progress?.total === 'number' ? progress.total : 0;
              setBulkStatus(prev => ({ 
                ...prev, 
                done: processed,
                total: total 
              }));
            };
            
            await window.electronAPI.batchAddGamesToFolder(cleanFilePaths, folderIdStr, batchOptions);
          } else {
            // 回退到舊的批次邏輯
            if (window.electronAPI?.addGamesToFolderBatch) {
              await window.electronAPI.addGamesToFolderBatch(cleanFilePaths, folderIdStr, { quiet: true });
            } else {
              await Promise.allSettled(cleanFilePaths.map(fp => window.electronAPI.addGameToFolder(fp, folderIdStr)));
            }
          }
          console.log('多個遊戲已加入資料夾（批次）');
        } else if (game) {
          // 確保只傳遞可序列化的參數
          const gameFilePath = typeof game.filePath === 'string' ? game.filePath : String(game.filePath || '');
          const folderIdStr = typeof selectedFolder.id === 'string' ? selectedFolder.id : String(selectedFolder.id || '');
          
          const result = await window.electronAPI.addGameToFolder(gameFilePath, folderIdStr);
          if (result && result.success === false) {
            setInfoDialog({ isOpen: true, title: t('desktopManager.addToFolder.title'), message: t('desktopManager.info.addToFolder.fail') });
          } else {
            console.log('遊戲已加入資料夾');
          }
        }
        // 刷新資料（微延遲 + 受控刷新）：避免『先消失再重排』
        await new Promise((r) => setTimeout(r, 80));
        // 解除抑制並執行一次受控刷新
        suppressUntilRef.current = 0;
        guardedRefresh();
      }
    } catch (error) {
      console.error('加入資料夾失敗:', error);
      // 確保錯誤訊息可序列化
      const errorMessage = typeof error?.message === 'string' ? error.message : String(error || t('desktopManager.common.unknownError'));
      const dialogTitle = String(t('desktopManager.addToFolder.title') || '加入資料夾');
      const dialogMessage = String(t('desktopManager.info.addToFolder.failWithReason', { reason: errorMessage }) || `加入資料夾失敗: ${errorMessage}`);
      
      setInfoDialog({ 
        isOpen: true, 
        title: dialogTitle, 
        message: dialogMessage 
      });
    }
    finally {
      if (Array.isArray(list) && list.length > 0) {
        setBulkMutating(false);
        // 延遲關閉進度卡片，確保用戶看到完成狀態
        setTimeout(() => {
          setBulkStatus(prev => ({ ...prev, active: false }));
        }, 1000);
      }
      // 若是單項流程，確保對話框關閉
      try { setFolderSelectDialog({ isOpen: false, game: null, selectedFilePaths: null }); } catch (_) {}
    }
  }, [folderSelectDialog.game, folderSelectDialog.selectedFilePaths, guardedRefresh]);

  // 關閉資料夾選擇對話框
  const handleCloseFolderSelectDialog = useCallback(() => {
    setFolderSelectDialog({
      isOpen: false,
      game: null,
      selectedFilePaths: null,
    });
  }, []);

  // 處理遊戲信息
  const handleGameInfo = useCallback((game) => {
    setGameInfoDialog({
      isOpen: true,
      game: game
    });
  }, []);

  // 關閉遊戲信息對話框
  const handleCloseGameInfoDialog = useCallback(() => {
    setGameInfoDialog({
      isOpen: false,
      game: null
    });
  }, []);

  // 處理從資料夾移除遊戲（通用處理，會同步所有窗口）
  const handleRemoveGameFromFolder = useCallback(async (game, folderId) => {
    try {
      if (window.electronAPI?.removeGameFromFolder) {
        const result = await window.electronAPI.removeGameFromFolder(game.filePath, folderId);
        if (result.success) {
          console.log('遊戲已從資料夾移除');
          // 刷新桌面資料，這會同步所有窗口
          await loadDesktopItems();
          await loadFolders();
        } else {
          setInfoDialog({ isOpen: true, title: t('desktopManager.removeFromFolder.title'), message: t('desktopManager.info.removeFromFolder.fail') });
        }
      }
    } catch (error) {
      console.error('移除遊戲失敗:', error);
      setInfoDialog({ isOpen: true, title: t('desktopManager.removeFromFolder.title'), message: t('desktopManager.info.removeFromFolder.failWithReason', { reason: (error?.message || t('desktopManager.common.unknownError')) }) });
    }
  }, [loadDesktopItems, loadFolders]);

  // 處理跨窗口遊戲移動
  const handleMoveGameBetweenFolders = useCallback(async (game, fromFolderId, toFolderId) => {
    try {
      if (window.electronAPI?.moveGameBetweenFolders) {
        const result = await window.electronAPI.moveGameBetweenFolders(game.filePath, fromFolderId, toFolderId);
        if (result.success) {
          console.log('遊戲已在資料夾間移動');
          // 刷新所有資料
          await loadDesktopItems();
          await loadFolders();
        } else {
          setInfoDialog({ isOpen: true, title: t('desktopManager.moveGame.title'), message: t('desktopManager.info.moveGame.fail') });
        }
      }
    } catch (error) {
      console.error('移動遊戲失敗:', error);
      setInfoDialog({ isOpen: true, title: t('desktopManager.moveGame.title'), message: t('desktopManager.info.moveGame.failWithReason', { reason: (error?.message || t('desktopManager.common.unknownError')) }) });
    }
  }, [loadDesktopItems, loadFolders]);

  // 獲取未分類的遊戲（桌面上顯示的遊戲）
  const getUncategorizedGames = useCallback(() => {
    // 在搜索狀態下，返回所有（已在上層過濾過的）遊戲，確保包含資料夾內的遊戲
    if (searchQuery && searchQuery.trim()) {
      return games;
    }
    // 非搜索狀態：如果有桌面資料，使用桌面資料中的遊戲
    if (desktopItems.length > 0) {
      return desktopItems.filter(item => item.type === 'game');
    }
    // 否則返回所有遊戲（向後兼容）
    return games;
  }, [games, desktopItems, searchQuery]);

  // 獲取桌面上的資料夾
  const getDesktopFolders = useCallback(() => {
    // 在搜索狀態下，為了聚焦結果，暫時不展示資料夾
    if (searchQuery && searchQuery.trim()) {
      return [];
    }
    // 非搜索狀態：如果有桌面資料，使用桌面資料中的資料夾
    if (desktopItems.length > 0) {
      return desktopItems.filter(item => item.type === 'folder');
    }
    // 否則返回所有資料夾（向後兼容）
    return folders;
  }, [folders, desktopItems, searchQuery]);

  // 抽屜使用的資料夾列表（不受搜尋影響）
  const getDrawerFolders = useCallback(() => {
    // 若有桌面資料，仍以桌面資料中的資料夾為準，確保順序/來源一致
    if (desktopItems.length > 0) {
      return desktopItems.filter(item => item.type === 'folder');
    }
    return folders;
  }, [folders, desktopItems]);

// 手動刷新功能
const handleRefresh = useCallback(async () => {
  console.log('手動刷新資料');
  await loadFolders();
  await loadDesktopItems();
}, [loadFolders, loadDesktopItems]);

return (
  <DragProvider>
    <div className={`desktop-manager`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 相對定位的包裹層：抽屜與內容區同級（抽屜固定顯示） */}
      <div ref={contentWrapRef} className="content-wrap" style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'visible' }}>
        {/* 內容區域（抽屜改為懸浮覆蓋，不再推擠內容寬度） */}
        <div className="content-area" style={{ height: '100%' }}>
          <div className="content-area-inner" style={{ paddingLeft: 0, height: '100%' }}>
            <DesktopView
              games={getUncategorizedGames()}
              folders={getDesktopFolders()}
              onGameSelect={handleGameSelect}
              onFolderOpen={handleFolderOpen}
              onCreateFolder={handleOpenCreateFolderDialog}
              onEditFolder={handleEditFolder}
              onDeleteFolder={handleDeleteFolder}
              onAddToFolder={handleAddToFolder}
              onGameInfo={handleGameInfo}
              onGameDrop={handleGameDrop}
              onRefresh={handleRefresh}
              searchQuery={searchQuery}
              isLoading={isLoading}
              isSwitchingToDesktop={isSwitchingToDesktop}
              disableFlipExtra={bulkMutating}
            />
          </div>
        </div>
        {/* 左側資料夾抽屜 - 與 content-area 同級 */}
        <FolderDrawer
          width={drawerWidth}
          topOffset={drawerTopOffset}
          topViewport={drawerTopViewport}
          folders={getDrawerFolders()}
          onOpenFolder={handleFolderOpen}
          onCreateFolder={handleOpenCreateFolderDialog}
          onEditFolder={handleEditFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      </div>
      </div>
      {/* 創建/編輯資料夾對話框 */}
      <CreateFolderDialog
        isOpen={createFolderDialog.isOpen}
        mode={createFolderDialog.mode}
        initialData={createFolderDialog.initialData}
        onClose={handleCloseFolderDialog}
        onConfirm={handleConfirmFolderDialog}
      />
      
      {/* 資料夾選擇對話框 */}
      <FolderSelectDialog
        isOpen={folderSelectDialog.isOpen}
        folders={folders}
        onClose={handleCloseFolderSelectDialog}
        onSelect={handleFolderSelect}
        title={t('desktopManager.folderSelect.title')}
        message={(() => {
          const count = Array.isArray(folderSelectDialog.selectedFilePaths) ? folderSelectDialog.selectedFilePaths.length : 0;
          if (count > 1) return t('desktopManager.folderSelect.multi', { count });
          const name = folderSelectDialog.game?.gameName || folderSelectDialog.game?.name || t('desktopManager.common.game');
          return t('desktopManager.folderSelect.single', { name });
        })()}
      />
      
      {/* 遊戲信息對話框 */}
      <GameInfoDialog
        isOpen={gameInfoDialog.isOpen}
        game={gameInfoDialog.game}
        onClose={handleCloseGameInfoDialog}
        onGameLaunch={onGameLaunch}
      />

      {/* 無資料夾引導對話框 */}
      {/** 無資料夾引導：使用 requestCloseRef 啟動漸出動畫，再在 onClose 中關閉狀態 */}
      <ModalWithFooter
        isOpen={noFolderGuideOpen}
        onClose={() => setNoFolderGuideOpen(false)}
        title={t('desktopManager.noFolder.title')}
        size="sm"
        requestCloseRef={noFolderGuideCloseRef}
        footer={
          <div className="flex gap-8 push-right">
            <button
              className="btn btn-primary"
              onClick={() => {
                // 開啟新建資料夾彈窗，並關閉引導
                setCreateFolderDialog({ isOpen: true, mode: 'create', initialData: null });
                if (noFolderGuideCloseRef.current) noFolderGuideCloseRef.current();
              }}
            >
              {t('desktopManager.noFolder.createButton')}
            </button>
          </div>
        }
      >
        <div>
          <p>{t('desktopManager.noFolder.message')}</p>
        </div>
      </ModalWithFooter>

      {/* 刪除資料夾確認對話框（主題樣式） */}
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title={t('desktopManager.confirmDelete.title')}
        message={t('desktopManager.confirmDelete.message', { name: confirmDelete.folder?.name || '' })}
        confirmText={t('desktopManager.confirmDelete.confirm')}
        cancelText={t('desktopManager.confirmDelete.cancel')}
        variant="danger"
        onClose={closeConfirmDelete}
        onCancel={closeConfirmDelete}
        onConfirm={async () => {
          // 立即關閉對話框，避免短暫回彈
          const folder = confirmDelete.folder;
          closeConfirmDelete();
          // 略延後執行刪除與刷新，讓 UI 穩定
          setTimeout(async () => {
            try {
              if (window.electronAPI?.deleteFolder && folder) {
                const result = await window.electronAPI.deleteFolder(folder.id, true);
                if (!result.success) {
                  setInfoDialog({ isOpen: true, title: t('desktopManager.confirmDelete.title'), message: t('desktopManager.info.deleteFolder.fail') });
                }
                await loadFolders();
                await loadDesktopItems();
              } else {
                setInfoDialog({ isOpen: true, title: t('desktopManager.confirmDelete.title'), message: t('desktopManager.info.deleteFolder.apiUnavailable') });
              }
            } catch (error) {
              console.error('刪除資料夾失敗:', error);
              setInfoDialog({ isOpen: true, title: t('desktopManager.confirmDelete.title'), message: t('desktopManager.info.deleteFolder.failWithReason', { reason: (error?.message || t('desktopManager.common.unknownError')) }) });
            }
          }, 30);
        }}
      />

      {/* 單按鈕資訊對話框（取代內建 alert） */}
      <ModalHeaderOnly
        isOpen={infoDialog.isOpen}
        onClose={() => setInfoDialog({ ...infoDialog, isOpen: false })}
        title={infoDialog.title}
        size="sm"
      >
        <div>{infoDialog.message}</div>
      </ModalHeaderOnly>
      
      {/* 批次加入載入卡片（全屏遮罩）*/}
      {bulkStatus.active ? (
        <div
          className="bulk-loading-overlay"
          style={{
            position: 'fixed', inset: 0, background: 'var(--scrim-35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, backdropFilter: 'blur(2px)'
          }}
        >
          <div
            className="bulk-loading-card"
            style={{
              minWidth: 320, maxWidth: 420, padding: '20px 24px', borderRadius: 12,
              background: 'var(--glass-panel-gradient)',
              boxShadow: '0 10px 30px var(--scrim-35)',
              border: '1px solid var(--overlay-on-light-08)',
              color: 'var(--text-primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 22, height: 22, border: '3px solid var(--overlay-on-light-20)',
                borderTopColor: '#6aa8ff', borderRadius: '50%', animation: 'spin 0.9s linear infinite'
              }} />
              <div style={{ fontSize: 16, fontWeight: 600 }}>{bulkStatus.label || t('desktopManager.bulk.processing')}</div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
              {bulkStatus.done} / {bulkStatus.total}
            </div>
            <div style={{ width: '100%', height: 8, background: 'var(--overlay-on-light-12)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, Math.round((bulkStatus.done / Math.max(1, bulkStatus.total)) * 100))}%`, background: 'linear-gradient(90deg, #6aa8ff, #62e1ff)', transition: 'width 140ms ease' }} />
            </div>
          </div>
          {/* 簡單 keyframes */}
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : null}
    </DragProvider>
  );
};

export default DesktopManager;
