import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';

import './styles/theme.css';
import './App.css';
import './styles/utility.css';
import './styles/dialog.css';
import './styles/buttons.css';
import './styles/focus-ring.css';
import { TitleBar, DirectoryManager, SearchBar, DesktopManager, GameInfoDialog, EmulatorConfigDialog } from '@components';
import { GameGridController as GameGrid } from '@components';
import { AboutDialog, SettingsDialog, WelcomeGuideDialog } from '@ui';
import { GameLaunchDialog, BackupDialog } from '@components';
import useGamepad from '@hooks/useGamepad';
import { getAvatar } from './assets/avatars';

// 主應用組件
function App() {
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [directory, setDirectory] = useState(null);
  const [isDirectoryManagerOpen, setIsDirectoryManagerOpen] = useState(false);
  const [isEmulatorConfigOpen, setIsEmulatorConfigOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gameLaunchDialog, setGameLaunchDialog] = useState({ isOpen: false, game: null, configureOnly: false });
  const [viewMode, setViewMode] = useState('desktop'); // 'desktop' | 'grid'
  const [isSwitchingToDesktop, setIsSwitchingToDesktop] = useState(false);
  const [gameInfoDialog, setGameInfoDialog] = useState({ isOpen: false, game: null });
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isWelcomeGuideOpen, setIsWelcomeGuideOpen] = useState(false);
  // 設定：主題（與 body data-theme 同步，並持久化到 localStorage）
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return typeof document !== 'undefined' ? (document.body?.dataset?.theme || 'dark') : 'dark';
  });
  // FAB 抽屜延時關閉控制
  const [fabOpen, setFabOpen] = useState(false);
  const fabHideTimer = useRef(null);
  const fabOpenTimer = useRef(null);
  const openFab = useCallback(() => {
    // 取消關閉定時，避免即將關閉時又打開
    if (fabHideTimer.current) { clearTimeout(fabHideTimer.current); fabHideTimer.current = null; }
    // 若已經開啟，立即保持開啟
    if (fabOpen) { setFabOpen(true); return; }
    // 引入微小延時，避免穿越卡片邊界時造成生硬的進出
    if (!fabOpenTimer.current) {
      fabOpenTimer.current = setTimeout(() => {
        setFabOpen(true);
        fabOpenTimer.current = null;
      }, 90); // 開啟延時（hover-intent）
    }
  }, [fabOpen]);
  const scheduleCloseFab = useCallback(() => {
    if (fabHideTimer.current) clearTimeout(fabHideTimer.current);
    if (fabOpenTimer.current) { clearTimeout(fabOpenTimer.current); fabOpenTimer.current = null; }
    fabHideTimer.current = setTimeout(() => {
      setFabOpen(false);
      fabHideTimer.current = null;
    }, 100); // 更靈敏：縮短關閉延時
  }, []);
  useEffect(() => () => {
    if (fabHideTimer.current) clearTimeout(fabHideTimer.current);
    if (fabOpenTimer.current) clearTimeout(fabOpenTimer.current);
  }, []);

  // 同步主題到全局 body 並持久化，確保 Portal/覆蓋層與其他視窗一致
  useEffect(() => {
    try { document.body && document.body.setAttribute('data-theme', theme); } catch {}
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);

  // 監聽跨視窗的 storage 事件以同步主題（例如資料夾視窗或主視窗切換時）
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'theme') {
        const v = e.newValue;
        if (v === 'light' || v === 'dark') setTheme(v);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 首次啟動檢測和歡迎指南
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const hasSeenWelcome = localStorage.getItem('hasSeenWelcomeGuide');
        if (!hasSeenWelcome) {
          // 延遲顯示歡迎指南，確保應用完全載入
          setTimeout(() => {
            setIsWelcomeGuideOpen(true);
          }, 1000);
        }
      } catch (error) {
        console.warn('Failed to check first launch status:', error);
      }
    };

    checkFirstLaunch();
  }, []);

  // 監聽歡迎指南觸發的事件
  useEffect(() => {
    const handleOpenEmulatorConfig = () => setIsEmulatorConfigOpen(true);
    const handleOpenDirectoryManager = () => setIsDirectoryManagerOpen(true);
    const handleOpenBackupConfig = () => setIsBackupOpen(true);

    // 從歡迎指南觸發的事件 - 不關閉引導
    const handleOpenEmulatorConfigFromGuide = () => setIsEmulatorConfigOpen(true);
    const handleOpenDirectoryManagerFromGuide = () => setIsDirectoryManagerOpen(true);
    const handleOpenBackupConfigFromGuide = () => setIsBackupOpen(true);

    window.addEventListener('open-emulator-config', handleOpenEmulatorConfig);
    window.addEventListener('open-directory-manager', handleOpenDirectoryManager);
    window.addEventListener('open-backup-config', handleOpenBackupConfig);
    
    // 從引導觸發的事件
    window.addEventListener('open-emulator-config-from-guide', handleOpenEmulatorConfigFromGuide);
    window.addEventListener('open-directory-manager-from-guide', handleOpenDirectoryManagerFromGuide);
    window.addEventListener('open-backup-config-from-guide', handleOpenBackupConfigFromGuide);

    return () => {
      window.removeEventListener('open-emulator-config', handleOpenEmulatorConfig);
      window.removeEventListener('open-directory-manager', handleOpenDirectoryManager);
      window.removeEventListener('open-backup-config', handleOpenBackupConfig);
      window.removeEventListener('open-emulator-config-from-guide', handleOpenEmulatorConfigFromGuide);
      window.removeEventListener('open-directory-manager-from-guide', handleOpenDirectoryManagerFromGuide);
      window.removeEventListener('open-backup-config-from-guide', handleOpenBackupConfigFromGuide);
    };
  }, []);

  const handleWelcomeGuideComplete = useCallback(() => {
    try {
      localStorage.setItem('hasSeenWelcomeGuide', 'true');
    } catch (error) {
      console.warn('Failed to save welcome guide completion:', error);
    }
  }, []);

  // 全局手把處理：在非控制器模式下也允許 Start/Select
  useGamepad({
    enabled: viewMode !== 'grid',
    onMove: null,
    onPress: (action) => {
      // 僅在非 grid 模式下接收 Start/Select，避免與 GameGrid 的 useGamepad 重疊
      if (action === 'toggleMode') {
        setViewMode('grid');
      } else if (action === 'focusSearch') {
        document.querySelector('.search-input')?.focus();
      }
    },
  });

  // 彈窗期間的手把處理：允許 B 關閉當前彈窗，禁止其他動作
  const anyModalOpen = gameLaunchDialog.isOpen || gameInfoDialog.isOpen || isDirectoryManagerOpen || isEmulatorConfigOpen;
  useGamepad({
    enabled: !!anyModalOpen,
    onMove: null,
    onPress: (action) => {
      if (!anyModalOpen) return;
      if (action === 'back') {
        if (gameLaunchDialog.isOpen) setGameLaunchDialog({ isOpen: false, game: null, configureOnly: false });
        else if (gameInfoDialog.isOpen) setGameInfoDialog({ isOpen: false, game: null });
        else if (isEmulatorConfigOpen) setIsEmulatorConfigOpen(false);
        else if (isDirectoryManagerOpen) setIsDirectoryManagerOpen(false);
      }
      // 其他按鍵在彈窗時不進行全局處理
    },
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
            const lastSlash = Math.max(firstGamePath.lastIndexOf('/'), firstGamePath.lastIndexOf('\\'));
            if (lastSlash !== -1) {
                 setDirectory(firstGamePath.substring(0, lastSlash));
            }
        }
      }
      setIsLoading(false);
    };
    loadInitialGames();
  }, []);

  // 監聽全局的遊戲資訊事件（供網格視圖使用）
  useEffect(() => {
    const handleOpenGameInfo = (event) => {
      if (gameLaunchDialog.isOpen || gameInfoDialog.isOpen || isDirectoryManagerOpen || isEmulatorConfigOpen) return;
      const game = event.detail;
      if (game) setGameInfoDialog({ isOpen: true, game });
    };
    window.addEventListener('open-game-info', handleOpenGameInfo);
    return () => window.removeEventListener('open-game-info', handleOpenGameInfo);
  }, [gameLaunchDialog.isOpen, gameInfoDialog.isOpen, isDirectoryManagerOpen, isEmulatorConfigOpen]);

  // 模態開啟時鎖定背景滾動，避免背後遊戲列表跟著滾
  useEffect(() => {
    const anyModalOpen = gameLaunchDialog.isOpen || gameInfoDialog.isOpen || isDirectoryManagerOpen || isEmulatorConfigOpen;
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
  }, [gameLaunchDialog.isOpen, gameInfoDialog.isOpen, isDirectoryManagerOpen, isEmulatorConfigOpen]);

  // 監聽全局的遊戲配置事件（右鍵『配置』）
  useEffect(() => {
    const handleOpenGameConfig = (e) => {
      const game = e?.detail;
      // 若已有任一彈窗開啟，忽略
      if (gameLaunchDialog.isOpen || gameInfoDialog.isOpen || isDirectoryManagerOpen || isEmulatorConfigOpen) return;
      if (game) setGameLaunchDialog({ isOpen: true, game, configureOnly: true });
    };
    window.addEventListener('open-game-config', handleOpenGameConfig);
    return () => window.removeEventListener('open-game-config', handleOpenGameConfig);
  }, [gameLaunchDialog.isOpen, gameInfoDialog.isOpen, isDirectoryManagerOpen, isEmulatorConfigOpen]);

  const handleCloseGameInfoDialog = useCallback(() => {
    setGameInfoDialog({ isOpen: false, game: null });
  }, []);

  // 監聽自動掃描完成和遊戲更新事件
  useEffect(() => {
    const handleGamesUpdated = (updatedGames) => {
      setGames(updatedGames);
    };

    const handleAutoScanCompleted = (result) => {
      if (result.success && result.scanResult.summary.totalNewGames > 0) {
        console.log(`自動掃描完成，發現 ${result.scanResult.summary.totalNewGames} 個新遊戲`);
      }
    };

    // 添加事件監聽
    window.electronAPI.onGamesUpdated(handleGamesUpdated);
    window.electronAPI.onAutoScanCompleted(handleAutoScanCompleted);

    // 清理函數
    return () => {
      window.electronAPI.removeAllListeners('games-updated');
      window.electronAPI.removeAllListeners('auto-scan-completed');
    };
  }, []);

  const handleSearchChange = (term) => {
    setSearchTerm(term)
  }

  // 目錄管理相關事件處理
  const handleOpenDirectoryManager = () => {
    setIsDirectoryManagerOpen(true)
  };

  const handleCloseDirectoryManager = () => {
    setIsDirectoryManagerOpen(false);
  };

  const handleDirectoriesChanged = async () => {
    const updatedGames = await window.electronAPI.getInitialGames();
    if (updatedGames) {
      setGames(updatedGames);
    }
  };

  // 監聽 Windows 捷徑啟動事件：根據 hash 尋找並啟動對應遊戲
  useEffect(() => {
    // 在渲染器使用 Web Crypto 計算 SHA-1（與主進程 utils/hash.js 對齊）
    const sha1Hex = async (text) => {
      const enc = new TextEncoder();
      const data = enc.encode((text || '').trim().toLowerCase());
      const buf = await crypto.subtle.digest('SHA-1', data);
      const bytes = new Uint8Array(buf);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const unsubscribe = window.electronAPI?.onShortcutLaunch?.(async (launchHash) => {
      try {
        // 優先在現有列表查找
        let target = null;
        for (const g of games || []) {
          const h = await sha1Hex(g.filePath);
          if (h === launchHash) { target = g; break; }
        }
        // 若未找到，嘗試重新獲取遊戲列表（例如冷啟動時）
        if (!target) {
          try {
            const latest = await window.electronAPI?.getInitialGames?.();
            if (Array.isArray(latest)) {
              for (const g of latest) {
                const h = await sha1Hex(g.filePath);
                if (h === launchHash) { target = g; break; }
              }
            }
          } catch (_) {}
        }
        if (target) {
          await handleGameLaunch(target);
        } else {
          console.warn('[shortcut-launch] 無法匹配到遊戲，hash=', launchHash);
        }
      } catch (e) {
        console.error('[shortcut-launch] 處理失敗:', e);
      }
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [games]);

  const handleOpenEmulatorConfig = () => setIsEmulatorConfigOpen(true);
  const handleCloseEmulatorConfig = () => setIsEmulatorConfigOpen(false);

  // 處理遊戲啟動（帶首次啟動提示與持久化）
  const handleGameLaunch = async (game) => {
    try {
      const cfg = await window.electronAPI?.getGameEmulatorConfig?.(game.filePath);
      if (!cfg) {
        // 首次啟動：顯示彈窗
        setGameLaunchDialog({ isOpen: true, game });
        return;
      }
      await window.electronAPI?.launchGame?.(game.filePath);
    } catch (error) {
      console.error('啟動遊戲失敗:', error);
    }
  };

  // 切換視圖模式
  const handleToggleViewMode = () => {
    // 切換前立即清除目前焦點
    try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch {}
    // 下一個 tick 再次清除一次，避免切換按鈕殘留 focus 樣式
    setTimeout(() => {
      try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch {}
    }, 0);

    setViewMode(prev => {
      if (prev === 'grid') {
        // 即將切回桌面視圖：開啟短暫的進場狀態
        setIsSwitchingToDesktop(true);
        // 在一個 tick 後切換到 desktop，確保 CSS class 生效
        setTimeout(() => setIsSwitchingToDesktop(false), 260);
        return 'desktop';
      }
      return 'grid';
    });
  };

  const filteredGames = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    if (!lowerCaseSearchTerm) return games;
    return games.filter(game =>
      (game.gameName && game.gameName.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (game.vendor && game.vendor.toLowerCase().includes(lowerCaseSearchTerm))
    );
  }, [games, searchTerm]);

  return (
    <div
      className={`app-container ${viewMode === 'desktop' ? 'desktop-mode' : 'grid-mode'} ${isSwitchingToDesktop ? 'switching-desktop' : ''}`}
      data-theme={theme}
    >
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
            {/* 同時渲染兩個視圖，透過 CSS 切換可見性，避免桌面視圖卸載導致資料夾消失/重排 */}
            <div className={`view-layer ${viewMode === 'desktop' ? 'view-active' : 'view-hidden'}`}>
              <DesktopManager 
                games={filteredGames}
                searchQuery={searchTerm}
                isLoading={isLoading}
                onGameLaunch={handleGameLaunch}
                isSwitchingToDesktop={isSwitchingToDesktop}
              />
            </div>
            <div className={`view-layer ${viewMode === 'grid' ? 'view-active' : 'view-hidden'}`}>
              <GameGrid 
                games={filteredGames} 
                isLoading={isLoading} 
                onGameLaunch={handleGameLaunch}
                onGameInfo={(game) => setGameInfoDialog({ isOpen: true, game })}
                controllerModeEnabled={viewMode === 'grid'}
                onToggleViewMode={handleToggleViewMode}
              />
            </div>
          </div>
          {/* 將 FAB 獨立於 content-area 之外，避免受其滾動與佈局影響 */}
          <div className="fab-container">
            <button
              className="fab"
              title="選項"
              onMouseEnter={openFab}
              onMouseLeave={scheduleCloseFab}
              onClick={() => setFabOpen(v => !v)}
            >
              {/* FAB 圖標：桌面模式顯示電腦顯示器；控制器模式顯示控制器。使用 180° 紙片翻轉過渡 */}
              <div className={`fab-icon ${viewMode === 'grid' ? 'is-grid' : 'is-desktop'}`} aria-hidden="true">
                {/* front: 桌面（顯示器）*/}
                <span className="face front">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M21 3H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h7v2H8c-.55 0-1 .45-1 1s.45 1 1 1h8c.55 0 1-.45 1-1s-.45-1-1-1h-2v-2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H3V5h18v11z"/>
                  </svg>
                </span>
                {/* back: 控制器 */}
                <span className="face back">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M6.5 8C3.46 8 1 10.46 1 13.5S3.46 19 6.5 19c1.33 0 2.55-.52 3.47-1.37h4.06C15.95 18.48 17.17 19 18.5 19 21.54 19 24 16.54 24 13.5S21.54 8 18.5 8c-1.61 0-3.06.74-4.02 1.9h-4.96C9.56 8.74 8.11 8 6.5 8zm0 2c.55 0 1 .45 1 1v1h1c.55 0 1 .45 1 1s-.45 1-1 1h-1v1c0 .55-.45 1-1 1s-1-.45-1-1v-1H4.5c-.55 0-1-.45-1-1s.45-1 1-1H5.5v-1c0-.55.45-1 1-1zm10.5 1.25c.69 0 1.25.56 1.25 1.25S17.69 13.75 17 13.75 15.75 13.19 15.75 12.5 16.31 11.25 17 11.25zm2.5 0c.69 0 1.25.56 1.25 1.25S20.19 13.75 19.5 13.75s-1.25-.56-1.25-1.25.56-1.25 1.25-1.25z"/>
                  </svg>
                </span>
              </div>
            </button>
            <div
              className={`fab-menu ${fabOpen ? 'open' : ''}`}
              onMouseEnter={openFab}
              onMouseLeave={scheduleCloseFab}
            >
              <button className="fab-menu-item" onClick={handleToggleViewMode}>
                {viewMode === 'desktop' ? '控制器模式 - Beta' : '桌面模式'}
              </button>
              <button className="fab-menu-item" onClick={handleOpenDirectoryManager}>
                ROM 資料夾
              </button>
              <button className="fab-menu-item" onClick={handleOpenEmulatorConfig}>
                模擬器配置
              </button>
              <button className="fab-menu-item" onClick={() => setIsSettingsOpen(true)}>
                軟體配置
              </button>
              <button className="fab-menu-item" onClick={() => setIsBackupOpen(true)}>
                雲端同步
              </button>
              <button className="fab-menu-item" onClick={() => setIsAboutOpen(true)}>
                關於我們
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* 目錄管理彈窗 */}
      <DirectoryManager 
        isOpen={isDirectoryManagerOpen}
        onClose={handleCloseDirectoryManager}
        onDirectoriesChanged={handleDirectoriesChanged}
      />

      {/* 遊戲資訊彈窗（供網格視圖） */}
      <GameInfoDialog
        isOpen={gameInfoDialog.isOpen}
        game={gameInfoDialog.game}
        onClose={handleCloseGameInfoDialog}
      />

      {/* 模擬器配置彈窗 */}
      {isEmulatorConfigOpen && (
        <EmulatorConfigDialog isOpen={isEmulatorConfigOpen} onClose={handleCloseEmulatorConfig} />
      )}

      {/* 軟體配置（設定）彈窗 */}
      {isSettingsOpen && (
        <SettingsDialog 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)}
          theme={theme}
          setTheme={setTheme}
        />
      )}

      {/* 雲端備份 對話框 */}
      {isBackupOpen && (
        <BackupDialog isOpen={isBackupOpen} onClose={() => setIsBackupOpen(false)} />
      )}

      {/* 關於 對話框 */}
      {isAboutOpen && (
        <AboutDialog isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      )}

      {/* 歡迎指南對話框 */}
      {isWelcomeGuideOpen && (
        <WelcomeGuideDialog 
          isOpen={isWelcomeGuideOpen} 
          onClose={() => setIsWelcomeGuideOpen(false)}
          onComplete={handleWelcomeGuideComplete}
        />
      )}

      {/* 遊戲啟動彈窗 */}
      {gameLaunchDialog.isOpen && (
        <GameLaunchDialog
          isOpen={gameLaunchDialog.isOpen}
          game={gameLaunchDialog.game}
          configureOnly={!!gameLaunchDialog.configureOnly}
          onClose={() => setGameLaunchDialog({ isOpen: false, game: null, configureOnly: false })}
          onSavedAndLaunch={async (g) => {
            // 保存已由對話框完成，這裡直接啟動
            try { await window.electronAPI?.launchGame?.(g.filePath); } catch (e) { console.error(e); }
          }}
        />
      )}
    </div>
  );
}

export default App
