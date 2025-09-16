import { useState, useCallback, useRef } from 'react';

/**
 * 桌面對話框管理 Hook
 * 管理所有對話框的狀態和操作
 */
export const useDesktopDialogs = () => {
  // 創建/編輯資料夾對話框
  const [createFolderDialog, setCreateFolderDialog] = useState({
    isOpen: false,
    mode: 'create',
    initialData: null
  });

  // 資料夾選擇對話框
  const [folderSelectDialog, setFolderSelectDialog] = useState({
    isOpen: false,
    game: null,
    selectedFilePaths: null, // 若為多選，保存所有檔案路徑
    selectedClusterIds: null, // 若有簇多選，保存所有簇 id（字串）
  });

  // 遊戲信息對話框
  const [gameInfoDialog, setGameInfoDialog] = useState({
    isOpen: false,
    game: null
  });

  // 刪除資料夾確認對話框狀態
  const [confirmDelete, setConfirmDelete] = useState({
    isOpen: false,
    folder: null
  });

  // 單一確認/關閉的訊息對話框（取代內建 alert）
  const [infoDialog, setInfoDialog] = useState({ 
    isOpen: false, 
    title: '', 
    message: '' 
  });

  // 無資料夾引導對話框
  const [noFolderGuideOpen, setNoFolderGuideOpen] = useState(false);

  // 無資料夾引導關閉引用，提供給 ModalWithFooter 以觸發漸出
  const noFolderGuideCloseRef = useRef(null);

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

  // 處理資料夾刪除（打開確認對話框）
  const handleDeleteFolder = useCallback((folder) => {
    setConfirmDelete({ isOpen: true, folder });
  }, []);

  const closeConfirmDelete = useCallback(() => {
    setConfirmDelete({ isOpen: false, folder: null });
  }, []);

  // 處理遊戲加入資料夾
  const handleAddToFolder = useCallback((target, folders) => {
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
      selectedClusterIds: (target && Array.isArray(target.selectedClusterIds) && target.selectedClusterIds.length > 0)
        ? Array.from(new Set(target.selectedClusterIds.map(String)))
        : null,
    });
  }, []);

  // 關閉無資料夾引導對話框
  const closeNoFolderGuide = useCallback(() => {
    setNoFolderGuideOpen(false);
  }, []);

  // 關閉訊息對話框
  const closeInfoDialog = useCallback(() => {
    setInfoDialog({ isOpen: false, title: '', message: '' });
  }, []);

  // 關閉資料夾選擇對話框
  const handleCloseFolderSelectDialog = useCallback(() => {
    setFolderSelectDialog({
      isOpen: false,
      game: null,
      selectedFilePaths: null,
      selectedClusterIds: null,
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

  return {
    // 對話框狀態
    createFolderDialog,
    folderSelectDialog,
    gameInfoDialog,
    confirmDelete,
    infoDialog,
    noFolderGuideOpen,
    noFolderGuideCloseRef,

    // 狀態設置器
    setCreateFolderDialog,
    setFolderSelectDialog,
    setGameInfoDialog,
    setConfirmDelete,
    setInfoDialog,
    setNoFolderGuideOpen,

    // 對話框操作
    handleOpenCreateFolderDialog,
    handleOpenEditFolderDialog,
    handleCloseFolderDialog,
    handleDeleteFolder,
    closeConfirmDelete,
    handleAddToFolder,
    handleCloseFolderSelectDialog,
    handleGameInfo,
    handleCloseGameInfoDialog,
    closeInfoDialog,
    closeNoFolderGuide,
  };
};
