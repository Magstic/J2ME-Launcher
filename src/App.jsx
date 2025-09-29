import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';

import './App.css';
import '@styles/theme.css';
import '@styles/utility.css';
import '@styles/dialog.css';
import '@styles/buttons.css';
import '@styles/focus-ring.css';
import { TitleBar, DirectoryManager, SearchBar, EmulatorConfigDialog } from '@components';
import { I18nProvider } from './contexts/I18nContext';
import VirtualizedUnifiedGrid from '@shared/VirtualizedUnifiedGrid';
import FolderDrawer from '@components/FolderDrawer/FolderDrawer';
import CreateFolderDialog from '@components/Folder/CreateFolderDialog';
import { FolderSelectDialog } from '@components';
import GameInfoDialog from '@components/Desktop/GameInfoDialog';
import ConfirmDialog from '@components/Common/ConfirmDialog';
import { ModalWithFooter, ModalHeaderOnly } from '@ui';
import {
  useTranslation,
  useDesktopManager,
  useAppDialogs,
  useGameLauncher,
  useAppEventListeners,
  useFabMenu,
  useDesktopView,
  useThemeManager,
  useWelcomeGuide,
} from '@hooks';
import '@components/Desktop/Desktop.css';
import NotificationBubble from './components/ui/NotificationBubble';
import AboutDialog from './components/ui/dialogs/AboutDialog';
import BackupDialog from './components/ui/dialogs/BackupDialog';
import SettingsDialog from './components/ui/dialogs/SettingsDialog';
import GameLaunchDialog from './components/ui/dialogs/GameLaunchDialog';
import EmulatorNotConfiguredDialog from './components/ui/dialogs/EmulatorNotConfiguredDialog';
import WelcomeGuideDialog from './components/ui/dialogs/WelcomeGuideDialog';
import { ClusterDialog } from '@ui';

// Direct DesktopView component (DesktopView logic integrated)
function DesktopViewDirect({
  games = [],
  items = null,
  onGameSelect,
  onAddToFolder,
  onGameInfo,
  onRefresh,
  isLoading = false,
  disableFlipExtra = false,
}) {
  // 使用桌面視圖 hook
  const {
    externalDragActive,
    rootRef,
    dragState,
    gameCardExtraProps,
    handleDragStart,
    handleDragEnd,
    handleRootDragOver,
    handleRootDrop,
    ContextMenuElement,
    openMenu,
    ClusterSelectElement,
    ClusterMergeElement,
    ClusterRenameElement,
    optimisticHideSet,
  } = useDesktopView({
    games,
    onGameSelect,
    onAddToFolder,
    onRefresh,
    onGameInfo,
  });

  // 不再在父層做 O(n) 過濾，改由 GridCell 依據 optimisticHideSet 決定是否渲染

  return (
    <div
      className="desktop-view"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      ref={rootRef}
    >
      <VirtualizedUnifiedGrid
        games={games}
        items={items}
        optimisticHideSet={optimisticHideSet}
        onGameClick={onGameSelect}
        onGameContextMenu={(e, game, selectedList, selectedClusterIds) =>
          openMenu(e, game, {
            view: 'desktop',
            kind: 'game',
            selectedFilePaths: selectedList,
            selectedClusterIds,
          })
        }
        onClusterClick={(cluster) => {
          try {
            window.dispatchEvent(new CustomEvent('open-cluster-dialog', { detail: cluster?.id }));
          } catch (_) {}
        }}
        onClusterContextMenu={(e, cluster) =>
          openMenu(e, cluster, { view: 'desktop', kind: 'cluster' })
        }
        onBlankContextMenu={(e) => openMenu(e, null, { view: 'desktop', kind: 'blank' })}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragState={dragState}
        externalDragActive={externalDragActive}
        isLoading={isLoading}
        disableFlip={disableFlipExtra}
        gameCardExtraProps={gameCardExtraProps}
      />
      {ContextMenuElement}
      {ClusterSelectElement}
      {ClusterMergeElement}
      {ClusterRenameElement}
    </div>
  );
}

// DesktopManager component using hooks
function DesktopManagerHooks({ games, searchQuery, isLoading, onGameLaunch }) {
  const { t } = useTranslation();
  const {
    // State
    folders,
    bulkStatus,

    // Actions
    handleFolderOpen,
    getUncategorizedGames,
    getDesktopGridItems,
    getDrawerFolders,
    handleRefresh,

    // Dialogs
    createFolderDialog,
    folderSelectDialog,
    gameInfoDialog,
    confirmDelete,
    infoDialog,
    noFolderGuideOpen,
    noFolderGuideCloseRef,
    handleOpenCreateFolderDialog,
    handleCloseFolderDialog,
    handleConfirmFolderDialog,
    handleCloseFolderSelectDialog,
    handleGameInfo,
    handleCloseGameInfoDialog,
    handleDeleteFolder,
    closeConfirmDelete,
    closeInfoDialog,
    closeNoFolderGuide,

    // Drawer positioning
    contentWrapRef,
    drawerTopOffset,
    drawerTopViewport,
    drawerWidth,

    // Callback handlers
    handleGameSelect,
    handleEditFolder,
    handleAddToFolder,
    handleFolderSelect,
  } = useDesktopManager({ games, searchQuery, onGameLaunch });

  return (
    <div
      className={`desktop-manager`}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* 相對定位的包裹層：抽屜與內容區同級（抽屜固定顯示） */}
      <div
        ref={contentWrapRef}
        className="content-wrap"
        style={{ position: 'relative', flex: 1, overflow: 'hidden' }}
      >
        <div className="content-area" style={{ height: '100%' }}>
          <div
            className="content-area-inner"
            style={{ padding: '10px 6px 6px 6px', height: '100%' }}
          >
            <DesktopViewDirect
              games={getUncategorizedGames(games, searchQuery)}
              items={getDesktopGridItems(games, searchQuery)}
              onGameSelect={handleGameSelect}
              onAddToFolder={handleAddToFolder}
              onGameInfo={handleGameInfo}
              isLoading={isLoading}
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
        game={folderSelectDialog.game}
        selectedFilePaths={folderSelectDialog.selectedFilePaths}
        folders={folders}
        onClose={handleCloseFolderSelectDialog}
        onSelect={handleFolderSelect}
      />

      {/* 遊戲信息對話框 */}
      <GameInfoDialog
        isOpen={gameInfoDialog.isOpen}
        game={gameInfoDialog.game}
        onClose={handleCloseGameInfoDialog}
      />

      {/* 刪除資料夾確認對話框（主題樣式） */}
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title={t('desktopManager.confirmDelete.title')}
        message={t('desktopManager.confirmDelete.message', {
          name: confirmDelete.folder?.name || '',
        })}
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
                  // 需要通過 hooks 訪問 setInfoDialog
                  console.error('刪除資料夾失敗');
                }
                // 刷新資料
                handleRefresh();
              } else {
                console.error('刪除 API 不可用');
              }
            } catch (error) {
              console.error('刪除資料夾失敗:', error);
            }
          }, 30);
        }}
      />

      {/* 單按鈕資訊對話框（取代內建 alert） */}
      <ModalHeaderOnly
        isOpen={infoDialog.isOpen}
        onClose={closeInfoDialog}
        title={infoDialog.title}
        size="sm"
      >
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>{infoDialog.message}</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={closeInfoDialog}>
            確定
          </button>
        </div>
      </ModalHeaderOnly>

      {/* 無資料夾引導對話框 */}
      <ModalWithFooter
        isOpen={noFolderGuideOpen}
        onClose={closeNoFolderGuide}
        title={t('desktopManager.noFolder.title')}
        size="sm"
        requestCloseRef={noFolderGuideCloseRef}
        footer={
          <div className="flex gap-8 push-right">
            <button
              className="btn btn-primary"
              onClick={() => {
                // 開啟新建資料夾彈窗，並關閉引導
                handleOpenCreateFolderDialog();
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

      {/* 批次加入載入卡片（全屏遮罩）*/}
      {bulkStatus.active ? (
        <div
          className="bulk-loading-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--scrim-35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            className="bulk-loading-card"
            style={{
              minWidth: 320,
              maxWidth: 420,
              padding: '20px 24px',
              borderRadius: 12,
              background: 'var(--glass-panel-gradient)',
              boxShadow: '0 10px 30px var(--scrim-35)',
              border: '1px solid var(--overlay-on-light-08)',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  border: '3px solid var(--overlay-on-light-20)',
                  borderTopColor: '#6aa8ff',
                  borderRadius: '50%',
                  animation: 'spin 0.9s linear infinite',
                }}
              />
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {bulkStatus.label || t('desktopManager.bulk.processing')}
              </div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
              {bulkStatus.done} / {bulkStatus.total}
            </div>
            <div
              style={{
                width: '100%',
                height: 8,
                background: 'var(--overlay-on-light-12)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.round((bulkStatus.done / Math.max(1, bulkStatus.total)) * 100))}%`,
                  background: 'linear-gradient(90deg, #6aa8ff, #62e1ff)',
                  transition: 'width 140ms ease',
                }}
              />
            </div>
          </div>
          {/* 簡單 keyframes */}
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : null}
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [directory, setDirectory] = useState(null);

  // 使用模組化 hooks
  const { theme, setTheme } = useThemeManager();
  const dialogs = useAppDialogs();
  const { fabOpen, openFab, scheduleCloseFab, toggleFab } = useFabMenu();
  const { isWelcomeGuideOpen, closeWelcomeGuide, handleWelcomeGuideComplete } = useWelcomeGuide();

  // 遊戲啟動邏輯
  const { handleGameLaunch } = useGameLauncher({
    games,
    openGameLaunchDialog: dialogs.openGameLaunchDialog,
    openEmulatorNotConfiguredDialog: dialogs.openEmulatorNotConfiguredDialog,
  });
  // 搜索防抖動效果
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms 延遲，適合拼音輸入

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 應用級事件監聽
  useAppEventListeners({
    setGames,
    openGameInfoDialog: dialogs.openGameInfoDialog,
    openClusterDialog: dialogs.openClusterDialog,
    openGameLaunchDialog: dialogs.openGameLaunchDialog,
    openDirectoryManager: dialogs.openDirectoryManager,
    openEmulatorConfig: dialogs.openEmulatorConfig,
    openBackup: dialogs.openBackup,
    openSettings: dialogs.openSettings,
    setTheme,
    gameLaunchDialog: dialogs.gameLaunchDialog,
    gameInfoDialog: dialogs.gameInfoDialog,
    isDirectoryManagerOpen: dialogs.isDirectoryManagerOpen,
    isEmulatorConfigOpen: dialogs.isEmulatorConfigOpen,
  });

  // 在应用启动时加载初始游戏
  useEffect(() => {
    const loadInitialGames = async () => {
      setIsLoading(true);
      const initialGames = await window.electronAPI.getInitialGames();
      if (initialGames && initialGames.length > 0) {
        setGames(initialGames);
        // 尝试从返回的数据中找到一个目录路径来显示
        if (initialGames[0] && initialGames[0].filePath) {
          const firstGamePath = initialGames[0].filePath;
          // 注意：这是一个简化的假设，我们只取第一个文件的目录
          // 在渲染器中，我们不能可靠地使用 'path' 模块，所以我们进行简单的字符串操作
          const lastSlash = Math.max(
            firstGamePath.lastIndexOf('/'),
            firstGamePath.lastIndexOf('\\')
          );
          if (lastSlash !== -1) {
            setDirectory(firstGamePath.substring(0, lastSlash));
          }
        }
      }
      setIsLoading(false);
    };
    loadInitialGames();
  }, []);

  // 模態開啟時鎖定背景滾動，避免背後遊戲列表跟著滾
  useEffect(() => {
    const anyModalOpen =
      dialogs.gameLaunchDialog.isOpen ||
      dialogs.gameInfoDialog.isOpen ||
      dialogs.isDirectoryManagerOpen ||
      dialogs.isEmulatorConfigOpen;
    const prev = document.body.style.overflow;
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prev || '';
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [
    dialogs.gameLaunchDialog.isOpen,
    dialogs.gameInfoDialog.isOpen,
    dialogs.isDirectoryManagerOpen,
    dialogs.isEmulatorConfigOpen,
  ]);

  // 目錄管理相關事件處理
  const handleDirectoriesChanged = async () => {
    const updatedGames = await window.electronAPI.getInitialGames();
    if (updatedGames) {
      setGames(updatedGames);
    }
  };

  const filteredGames = useMemo(() => {
    const lowerCaseSearchTerm = debouncedSearchTerm.toLowerCase();
    if (!lowerCaseSearchTerm) return games;
    return games.filter((game) => {
      // 使用顯示名稱進行搜索（優先使用自訂名稱）
      const displayName = game.gameName || '';
      const displayVendor = game.vendor || '';

      return (
        displayName.toLowerCase().includes(lowerCaseSearchTerm) ||
        displayVendor.toLowerCase().includes(lowerCaseSearchTerm)
      );
    });
  }, [games, debouncedSearchTerm]);

  return (
    <div className="app-container desktop-mode" data-theme={theme}>
      <TitleBar />
      <div className="app">
        <div className="main-content">
          <SearchBar
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            gameCount={filteredGames.length}
            totalCount={games.length}
            directory={directory}
          />
          <div className="content-area">
            <DesktopManagerHooks
              games={filteredGames}
              searchQuery={debouncedSearchTerm}
              isLoading={isLoading}
              onGameLaunch={handleGameLaunch}
            />
          </div>
          {/* 將 FAB 獨立於 content-area 之外，避免受其滾動與佈局影響 */}
          <div className="fab-container">
            <button
              className="fab"
              title="選項"
              onMouseEnter={openFab}
              onMouseLeave={scheduleCloseFab}
              onClick={toggleFab}
            >
              {/* FAB 圖標：桌面模式顯示電腦顯示器 */}
              <div className="fab-icon is-desktop" aria-hidden="true">
                <span className="face front">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="24"
                    height="24"
                  >
                    <path d="M21 3H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h7v2H8c-.55 0-1 .45-1 1s.45 1 1 1h8c.55 0 1-.45 1-1s-.45-1-1-1h-2v-2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H3V5h18v11z" />
                  </svg>
                </span>
              </div>
            </button>
            <div
              className={`fab-menu ${fabOpen ? 'open' : ''}`}
              onMouseEnter={openFab}
              onMouseLeave={scheduleCloseFab}
            >
              <button className="fab-menu-item" onClick={dialogs.openDirectoryManager}>
                {t('fabMenu.roms')}
              </button>
              <button className="fab-menu-item" onClick={dialogs.openEmulatorConfig}>
                {t('fabMenu.emulator')}
              </button>
              <button className="fab-menu-item" onClick={dialogs.openSettings}>
                {t('fabMenu.settings')}
              </button>
              <button className="fab-menu-item" onClick={dialogs.openBackup}>
                {t('fabMenu.backup')}
              </button>
              <button className="fab-menu-item" onClick={dialogs.openAbout}>
                {t('fabMenu.about')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 目錄管理彈窗 */}
      <DirectoryManager
        isOpen={dialogs.isDirectoryManagerOpen}
        onClose={dialogs.closeDirectoryManager}
        onDirectoriesChanged={handleDirectoriesChanged}
      />

      {/* 遊戲資訊彈窗（供網格視圖） */}
      <GameInfoDialog
        isOpen={dialogs.gameInfoDialog.isOpen}
        game={dialogs.gameInfoDialog.game}
        onClose={dialogs.closeGameInfoDialog}
      />

      {/* 簇詳情對話框 */}
      {dialogs.clusterDialog.isOpen && (
        <ClusterDialog
          isOpen={dialogs.clusterDialog.isOpen}
          clusterId={dialogs.clusterDialog.clusterId}
          onClose={dialogs.closeClusterDialog}
        />
      )}

      {/* 模擬器配置彈窗 */}
      {dialogs.isEmulatorConfigOpen && (
        <EmulatorConfigDialog
          isOpen={dialogs.isEmulatorConfigOpen}
          onClose={dialogs.closeEmulatorConfig}
        />
      )}

      {/* 軟體配置（設定）彈窗 */}
      {dialogs.isSettingsOpen && (
        <SettingsDialog
          isOpen={dialogs.isSettingsOpen}
          onClose={dialogs.closeSettings}
          theme={theme}
          setTheme={setTheme}
        />
      )}

      {/* 雲端備份 對話框 */}
      {dialogs.isBackupOpen && (
        <BackupDialog isOpen={dialogs.isBackupOpen} onClose={dialogs.closeBackup} />
      )}

      {/* 關於 對話框 */}
      {dialogs.isAboutOpen && (
        <AboutDialog isOpen={dialogs.isAboutOpen} onClose={dialogs.closeAbout} />
      )}

      {/* 歡迎指南對話框 */}
      {isWelcomeGuideOpen && (
        <WelcomeGuideDialog
          isOpen={isWelcomeGuideOpen}
          onClose={closeWelcomeGuide}
          onComplete={handleWelcomeGuideComplete}
        />
      )}

      {/* 遊戲啟動彈窗 */}
      {dialogs.gameLaunchDialog.isOpen && (
        <GameLaunchDialog
          isOpen={dialogs.gameLaunchDialog.isOpen}
          game={dialogs.gameLaunchDialog.game}
          configureOnly={!!dialogs.gameLaunchDialog.configureOnly}
          onClose={dialogs.closeGameLaunchDialog}
          onSavedAndLaunch={async (g) => {
            // 保存已由對話框完成，這裡直接啟動
            try {
              await window.electronAPI?.launchGame?.(g.filePath);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}

      {/* 模擬器未配置提示彈窗 */}
      {dialogs.emulatorNotConfiguredDialog.isOpen && (
        <EmulatorNotConfiguredDialog
          isOpen={dialogs.emulatorNotConfiguredDialog.isOpen}
          onClose={dialogs.closeEmulatorNotConfiguredDialog}
          onGoToConfig={() => {
            dialogs.closeEmulatorNotConfiguredDialog();
            dialogs.openEmulatorConfig();
          }}
        />
      )}

      {/* 左下角通知氣泡 */}
      <NotificationBubble />
    </div>
  );
}

export default App;
