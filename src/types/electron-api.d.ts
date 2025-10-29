// Global type declarations for window.electronAPI
// Centralized, single source of truth for renderer-side typings.

// Keep the shapes aligned with handlers defined under src/main/ipc/* and
// the API surface exposed in src/main/preload.js

declare namespace J2ME {
  type Unsubscribe = () => void;

  interface Game {
    filePath: string;
    gameName?: string;
    vendor?: string;
    version?: string;
    md5?: string;
    iconPath?: string | null;
    iconUrl?: string | null;
    mtimeMs?: number;
    size?: number;
    originalName?: string;
    originalVendor?: string;
    customName?: string | null;
    customVendor?: string | null;
    // Manifest fields are merged in (width/height, etc.) and can be arbitrary
    [k: string]: any;
  }

  interface Folder {
    id: string;
    name: string;
    description?: string;
    icon?: string | null;
    color?: string | null;
    gameCount: number;
    createdAt?: string;
    updatedAt?: string;
    sortOrder?: number | null;
    isVisible?: boolean;
  }

  interface DirectoryInfo {
    path: string;
    lastScanTime: string | null;
    enabled: boolean;
    addedTime?: string | null;
  }

  interface Cluster {
    id: string;
    name: string;
    description?: string;
    icon?: string | null;
    primaryFilePath?: string | null;
    memberCount?: number;
    effectiveIconPath?: string | null;
    iconUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }

  interface ClusterMember extends Game {
    tags?: any;
    role?: string | null;
  }

  interface Result {
    success: boolean;
    error?: string;
    [k: string]: any;
  }

  interface OkResult {
    ok: boolean;
    error?: string;
    [k: string]: any;
  }

  interface JavaPathResult {
    current: string;
    custom: string | null;
  }

  interface ValidateResult {
    valid: boolean;
    error?: string;
  }
}

interface ElectronAPI {
  // ===== Window controls =====
  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;

  // ===== Games (initial) =====
  getInitialGames(): Promise<J2ME.Game[]>;

  // ===== Directories =====
  getDirectories(): Promise<J2ME.DirectoryInfo[]>;
  addDirectories(): Promise<{
    success: boolean;
    addedDirectories: string[];
    existingDirectories: string[];
    totalSelected: number;
  }>;
  removeDirectory(directoryPath: string): Promise<J2ME.Result>;
  toggleDirectory(directoryPath: string, enabled: boolean): Promise<J2ME.Result>;
  scanDirectories(forceFullScan?: boolean): Promise<{ success: boolean; [k: string]: any }>;
  onScanProgress(callback: (payload: any) => void): J2ME.Unsubscribe;

  // ===== Global events =====
  on?: (channel: string, handler: (...args: any[]) => void) => void;
  removeListener?: (channel: string, handler: (...args: any[]) => void) => void;
  onGamesUpdated(callback: (games: J2ME.Game[]) => void): J2ME.Unsubscribe;
  onGamesIncrementalUpdate(callback: (update: any) => void): J2ME.Unsubscribe;
  onDesktopRemoveItems?(
    callback: (payload: { filePaths: string[]; reason?: string }) => void
  ): J2ME.Unsubscribe;
  onAutoScanCompleted(callback: (result: any) => void): void;
  removeAllListeners(channel: string): void;

  // ===== Custom names =====
  updateCustomName(filePath: string, customName: string | null): Promise<J2ME.Result>;
  updateCustomVendor(filePath: string, customVendor: string | null): Promise<J2ME.Result>;
  updateCustomData(filePath: string, customData: Record<string, any>): Promise<J2ME.Result>;
  resetCustomNames(filePath: string): Promise<J2ME.Result>;

  // ===== Folders =====
  getFolders(): Promise<J2ME.Folder[]>;
  getFolderById(folderId: string): Promise<J2ME.Folder | null>;
  createFolder(
    folderData: Partial<J2ME.Folder>
  ): Promise<{ success: boolean; folder?: J2ME.Folder; error?: string }>;
  updateFolder(folderId: string, updates: Partial<J2ME.Folder>): Promise<J2ME.Result>;
  deleteFolder(folderId: string, moveGamesToUncategorized?: boolean): Promise<J2ME.Result>;

  // ===== Folder relations =====
  addGameToFolder(gameIdOrPath: string, folderId: string): Promise<J2ME.Result>;
  addGamesToFolderBatch(
    gameIdsOrPaths: string[],
    folderId: string,
    options?: { quiet?: boolean }
  ): Promise<J2ME.Result>;
  batchAddGamesToFolder(
    filePaths: string[],
    folderId: string,
    options?: { threshold?: number; chunkSize?: number; quiet?: boolean }
  ): Promise<{ success: boolean; processed: number }>;
  removeGameFromFolder(gameIdOrPath: string, folderId: string): Promise<J2ME.Result>;
  batchRemoveGamesFromFolder(filePaths: string[], folderId: string): Promise<J2ME.Result>;
  moveGameBetweenFolders(
    gameIdOrPath: string,
    fromFolderId: string,
    toFolderId: string
  ): Promise<J2ME.Result>;
  getGamesByFolder(folderId: string): Promise<J2ME.Game[]>;
  getUncategorizedGames(): Promise<J2ME.Game[]>;
  getGamesInAnyFolder(): Promise<string[]>;

  // ===== Bulk operation events =====
  onBulkOperationStart(callback: (data: any) => void): J2ME.Unsubscribe;
  onBulkOperationEnd(callback: (data: any) => void): J2ME.Unsubscribe;
  offBulkOperationStart(callback: (...args: any[]) => void): void;
  offBulkOperationEnd(callback: (...args: any[]) => void): void;

  // ===== Desktop data =====
  getDesktopItems(): Promise<any[]>; // Combined items (games + folders + clusters)
  getFolderContents(folderId: string): Promise<{
    folder: J2ME.Folder | null;
    games: J2ME.Game[];
    clusters: Array<J2ME.Cluster & { iconUrl?: string | null }>;
  }>;

  // ===== Stats =====
  // (已移除對外暴露，保留在主進程內部使用或 DEV 模式)

  // ===== Launch =====
  launchGame(gameFilePath: string): Promise<J2ME.Result | any>;

  // ===== Emulator config =====
  getEmulatorConfig(): Promise<any>;
  listEmulators(): Promise<Array<{ id: string; name: string; capabilities: Record<string, any> }>>;
  getEmulatorCapabilities(
    emulatorId: string
  ): Promise<{ id: string; name: string; capabilities: Record<string, any> } | null>;
  getEmulatorSchema(emulatorId: string): Promise<any>;
  setEmulatorConfig(partial: Record<string, any>): Promise<any>;
  pickEmulatorBinary(emulatorId: string): Promise<string | null>;
  getGameEmulatorConfig(filePath: string): Promise<any>;
  setGameEmulatorConfig(filePath: string, emulatorConfig: any): Promise<any>;
  prepareGameConf(filePath: string): Promise<{ success: boolean; error?: string }>;

  // FreeJ2ME-Plus assets
  pickFreej2meAsset(type: 'soundfont' | 'textfont' | string): Promise<string | null>;
  importFreej2meAsset(
    type: 'soundfont' | 'textfont' | string,
    sourcePath: string
  ): Promise<J2ME.Result & { destPath?: string }>;

  // ===== Cross-refs =====
  // (已移除對外暴露)

  // ===== Folder events =====
  onFolderUpdated(callback: (folder: J2ME.Folder) => void): J2ME.Unsubscribe;
  onFolderChanged(callback: (...args: any[]) => void): J2ME.Unsubscribe;

  // ===== Drag session =====
  startDragSession(items: any[], source: any): Promise<any>;
  dropDragSession(target: any): Promise<any>;
  endDragSession(): Promise<any>;
  onDragSessionStarted(callback: (payload: any) => void): J2ME.Unsubscribe;
  onDragSessionEnded(callback: (...args: any[]) => void): J2ME.Unsubscribe;

  // ===== Independent folder windows =====
  openFolderWindow(folderId: string): Promise<any>;
  closeFolderWindow(folderId: string): Promise<any>;
  minimizeFolderWindow(): void;
  maximizeFolderWindow(): void;
  closeFolderWindowSelf(): void;
  getCurrentFolderId(): string | null;
  folderWindowReady(): void;

  // ===== External =====
  openExternal(url: string): Promise<boolean>;

  // ===== Optional SQL helpers (debug) =====
  sqlGetAllGames(): Promise<J2ME.Game[]>;
  sqlGetGame(filePath: string): Promise<J2ME.Game | null>;
  sqlSearchGames(q: string, limit?: number): Promise<J2ME.Game[]>;
  sqlUpsertGames(items: any[]): Promise<any>;

  // ===== Backup API (S3/WebDAV) =====
  backupGetSpec(): Promise<any>;
  backupGetLast(): Promise<any>;
  backupGetProviderParams(provider: string): Promise<any>;
  backupSetProviderParams(provider: string, params: any): Promise<J2ME.OkResult>;
  backupRun(payload: any): Promise<any>;
  backupRestorePlan(payload: any): Promise<any>;
  backupRestoreRun(payload: any): Promise<any>;
  onBackupProgress(callback: (payload: any) => void): J2ME.Unsubscribe;

  // ===== Dropbox Auth =====
  dropboxGetAuth(): Promise<any>;
  dropboxGetAccount(): Promise<any>;
  dropboxGetAccountPhoto(url: string): Promise<any>;
  dropboxOAuthStart(payload: any): Promise<any>;
  dropboxUnlink(): Promise<any>;

  // ===== Windows/Linux Shortcuts =====
  createShortcut(payload: {
    filePath: string;
    title?: string;
    iconCacheName?: string;
  }): Promise<J2ME.OkResult & Record<string, any>>;
  onShortcutLaunch(callback: (hash: string) => void): J2ME.Unsubscribe;

  // ===== Java config =====
  getJavaPath(): Promise<J2ME.JavaPathResult>;
  setJavaPath(javaPath: string | null): Promise<J2ME.Result>;
  validateJavaPath(javaPath: string): Promise<J2ME.ValidateResult>;
  browseJavaExecutable(): Promise<{
    success: boolean;
    filePath?: string;
    canceled?: boolean;
    error?: string;
  }>;

  // ===== Clusters =====
  // CRUD
  createCluster(payload: any): Promise<any>;
  addGamesToCluster(clusterId: string, filePaths: string[]): Promise<any>;
  removeGameFromCluster(clusterId: string, filePath: string): Promise<any>;
  updateCluster(payload: any): Promise<any>;
  deleteCluster(id: string): Promise<any>;
  // Reads
  getCluster(id: string): Promise<{ cluster: (J2ME.Cluster & { iconUrl?: string | null }) | null }>;
  getClusterMembers(id: string): Promise<{ members: J2ME.ClusterMember[] }>;
  getDesktopClusters(): Promise<{
    clusters: Array<J2ME.Cluster & { iconUrl?: string | null; memberCount?: number }>;
  }>;
  getClustersByFolder(
    folderId: string
  ): Promise<{ clusters: Array<J2ME.Cluster & { iconUrl?: string | null; memberCount?: number }> }>;
  // Folder relations
  addClusterToFolder(clusterId: string, folderId: string): Promise<J2ME.Result>;
  removeClusterFromFolder(clusterId: string, folderId: string): Promise<J2ME.Result>;
  // Member operations
  updateClusterMemberTags(clusterId: string, filePath: string, tags: any): Promise<J2ME.Result>;
  setClusterPrimary(clusterId: string, filePath: string): Promise<J2ME.Result>;
  mergeClusters(fromId: string, toId: string): Promise<J2ME.Result>;
  // Maintenance
  cleanupOrphanClusters(): Promise<J2ME.Result>;
  // Events
  onClusterChanged(callback: (payload: any) => void): J2ME.Unsubscribe;
  onClusterDeleted(callback: (payload: any) => void): J2ME.Unsubscribe;

  // ===== Cluster Tag Options =====
  getClusterTagOptions(): Promise<{
    devices: string[];
    resolutions: string[];
    versions: string[];
  } | null>;
  setClusterTagOptions(options: {
    devices?: string[];
    resolutions?: string[];
    versions?: string[];
  }): Promise<J2ME.Result>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
