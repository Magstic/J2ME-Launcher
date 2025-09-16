import { useState, useCallback } from 'react';

/**
 * 應用級對話框狀態管理
 * 管理全局對話框的開啟/關閉狀態
 */
export const useAppDialogs = () => {
  const [isDirectoryManagerOpen, setIsDirectoryManagerOpen] = useState(false);
  const [isEmulatorConfigOpen, setIsEmulatorConfigOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isWelcomeGuideOpen, setIsWelcomeGuideOpen] = useState(false);
  const [gameLaunchDialog, setGameLaunchDialog] = useState({ 
    isOpen: false, 
    game: null, 
    configureOnly: false 
  });
  const [gameInfoDialog, setGameInfoDialog] = useState({ 
    isOpen: false, 
    game: null 
  });
  const [clusterDialog, setClusterDialog] = useState({
    isOpen: false,
    clusterId: null,
  });
  const [emulatorNotConfiguredDialog, setEmulatorNotConfiguredDialog] = useState({ 
    isOpen: false, 
    game: null 
  });

  // Directory Manager
  const openDirectoryManager = useCallback(() => setIsDirectoryManagerOpen(true), []);
  const closeDirectoryManager = useCallback(() => setIsDirectoryManagerOpen(false), []);

  // Emulator Config
  const openEmulatorConfig = useCallback(() => setIsEmulatorConfigOpen(true), []);
  const closeEmulatorConfig = useCallback(() => setIsEmulatorConfigOpen(false), []);

  // Settings
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  // About
  const openAbout = useCallback(() => setIsAboutOpen(true), []);
  const closeAbout = useCallback(() => setIsAboutOpen(false), []);

  // Backup
  const openBackup = useCallback(() => setIsBackupOpen(true), []);
  const closeBackup = useCallback(() => setIsBackupOpen(false), []);

  // Welcome Guide
  const openWelcomeGuide = useCallback(() => setIsWelcomeGuideOpen(true), []);
  const closeWelcomeGuide = useCallback(() => setIsWelcomeGuideOpen(false), []);

  // Game Launch Dialog
  const openGameLaunchDialog = useCallback((game, configureOnly = false) => {
    setGameLaunchDialog({ isOpen: true, game, configureOnly });
  }, []);
  const closeGameLaunchDialog = useCallback(() => {
    setGameLaunchDialog({ isOpen: false, game: null, configureOnly: false });
  }, []);

  // Game Info Dialog
  const openGameInfoDialog = useCallback((game) => {
    setGameInfoDialog({ isOpen: true, game });
  }, []);
  const closeGameInfoDialog = useCallback(() => {
    setGameInfoDialog({ isOpen: false, game: null });
  }, []);

  // Cluster Dialog
  const openClusterDialog = useCallback((clusterId) => {
    setClusterDialog({ isOpen: true, clusterId });
  }, []);
  const closeClusterDialog = useCallback(() => {
    setClusterDialog({ isOpen: false, clusterId: null });
  }, []);

  // Emulator Not Configured Dialog
  const openEmulatorNotConfiguredDialog = useCallback((game) => {
    setEmulatorNotConfiguredDialog({ isOpen: true, game });
  }, []);
  const closeEmulatorNotConfiguredDialog = useCallback(() => {
    setEmulatorNotConfiguredDialog({ isOpen: false, game: null });
  }, []);

  return {
    // States
    isDirectoryManagerOpen,
    isEmulatorConfigOpen,
    isSettingsOpen,
    isAboutOpen,
    isBackupOpen,
    isWelcomeGuideOpen,
    gameLaunchDialog,
    gameInfoDialog,
    clusterDialog,
    emulatorNotConfiguredDialog,

    // Actions
    openDirectoryManager,
    closeDirectoryManager,
    openEmulatorConfig,
    closeEmulatorConfig,
    openSettings,
    closeSettings,
    openAbout,
    closeAbout,
    openBackup,
    closeBackup,
    openWelcomeGuide,
    closeWelcomeGuide,
    openGameLaunchDialog,
    closeGameLaunchDialog,
    openGameInfoDialog,
    closeGameInfoDialog,
    openClusterDialog,
    closeClusterDialog,
    openEmulatorNotConfiguredDialog,
    closeEmulatorNotConfiguredDialog,
  };
};
