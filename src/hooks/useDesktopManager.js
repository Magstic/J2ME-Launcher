import { useCallback } from 'react';
import { useDesktopState } from './useDesktopState';
import { useDesktopActions } from './useDesktopActions';
import { useDesktopDialogs } from './useDesktopDialogs';
import { useFolderOperations } from './useFolderOperations';
import { useDrawerPositioning } from './useDrawerPositioning';
import { useDesktopEventListeners } from './useDesktopEventListeners';

/**
 * 桌面管理器主 Hook
 * 整合所有桌面相關的邏輯，提供統一的接口
 */
export const useDesktopManager = ({ onGameLaunch }) => {
  // 狀態管理
  const desktopState = useDesktopState();

  // 對話框管理
  const dialogs = useDesktopDialogs();

  // 抽屜定位
  const drawer = useDrawerPositioning();

  // 桌面操作
  const actions = useDesktopActions({
    loadFolders: desktopState.loadFolders,
    loadDesktopItems: desktopState.loadDesktopItems,
    guardedRefresh: desktopState.guardedRefresh,
    suppressUntilRef: desktopState.suppressUntilRef,
    setBulkMutating: desktopState.setBulkMutating,
    setBulkStatus: desktopState.setBulkStatus,
    setInfoDialog: dialogs.setInfoDialog,
  });

  // 資料夾操作
  const folderOps = useFolderOperations({
    createFolderDialog: dialogs.createFolderDialog,
    handleCreateFolder: actions.handleCreateFolder,
    handleUpdateFolder: actions.handleUpdateFolder,
    loadFolders: desktopState.loadFolders,
    loadDesktopItems: desktopState.loadDesktopItems,
    setInfoDialog: dialogs.setInfoDialog,
  });

  // 事件監聽
  useDesktopEventListeners({
    guardedRefresh: desktopState.guardedRefresh,
    loadDesktopItems: desktopState.loadDesktopItems,
    setBulkMutating: desktopState.setBulkMutating,
    setBulkStatus: desktopState.setBulkStatus,
  });

  // 初始化資料
  const { loadFolders, loadDesktopItems } = desktopState;

  // 處理遊戲選擇（雙擊啟動）
  const handleGameSelect = useCallback(
    (game) => {
      onGameLaunch && onGameLaunch(game);
    },
    [onGameLaunch]
  );

  // 處理資料夾編輯
  const handleEditFolder = useCallback(
    (folder) => {
      dialogs.handleOpenEditFolderDialog(folder);
    },
    [dialogs.handleOpenEditFolderDialog]
  );

  // 處理加入資料夾（包含無資料夾引導邏輯）
  const handleAddToFolder = useCallback(
    (target) => {
      dialogs.handleAddToFolder(target, desktopState.folders);
    },
    [dialogs.handleAddToFolder, desktopState.folders]
  );

  // 處理資料夾選擇（完整的批次處理邏輯）
  const handleFolderSelect = useCallback(
    async (selectedFolder) => {
      await actions.handleFolderSelect(selectedFolder, dialogs.folderSelectDialog);
      // 關閉對話框
      dialogs.handleCloseFolderSelectDialog();
    },
    [actions.handleFolderSelect, dialogs.folderSelectDialog, dialogs.handleCloseFolderSelectDialog]
  );

  // 處理確認刪除資料夾
  const handleConfirmDeleteFolder = useCallback(async () => {
    const folder = dialogs.confirmDelete.folder;
    dialogs.closeConfirmDelete();
    // 略延後執行刪除與刷新，讓 UI 穩定
    setTimeout(async () => {
      await folderOps.handleConfirmDeleteFolder(folder);
    }, 30);
  }, [
    dialogs.confirmDelete.folder,
    dialogs.closeConfirmDelete,
    folderOps.handleConfirmDeleteFolder,
  ]);

  return {
    // 狀態
    ...desktopState,
    ...dialogs,
    ...drawer,

    // 操作
    handleGameSelect,
    handleFolderOpen: actions.handleFolderOpen,
    handleCreateFolder: dialogs.handleOpenCreateFolderDialog,
    handleEditFolder,
    handleDeleteFolder: dialogs.handleDeleteFolder,
    handleAddToFolder,
    handleGameInfo: dialogs.handleGameInfo,
    handleGameDrop: actions.handleGameDrop,
    handleRefresh: desktopState.handleRefresh,

    // 對話框操作
    handleCloseFolderDialog: dialogs.handleCloseFolderDialog,
    handleConfirmFolderDialog: folderOps.handleConfirmFolderDialog,
    handleCloseFolderSelectDialog: dialogs.handleCloseFolderSelectDialog,
    handleFolderSelect,
    handleCloseGameInfoDialog: dialogs.handleCloseGameInfoDialog,
    handleConfirmDeleteFolder,

    // 初始化
    loadFolders,
    loadDesktopItems,
  };
};
