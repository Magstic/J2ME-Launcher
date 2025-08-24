// Re-export common top-level components for convenient alias imports
// Usage examples:
//   import { DesktopManager, DirectoryManager } from '@components';
//   import { GameLaunchDialog } from '@components';

export { default as TitleBar } from './TitleBar';
export { default as DirectoryManager } from './DirectoryManager';
export { default as SearchBar } from './SearchBar';
export { default as DesktopManager } from './DesktopManager';
export { default as GameInfoDialog } from './Desktop/GameInfoDialog';
export { default as EmulatorConfigDialog } from './EmulatorConfigDialog';
export { default as FolderWindowApp } from './FolderWindowApp';

// Controller mode
export { default as GameGridController } from './controller/GameGridController';

// UI Dialogs (sub-namespace style)
export * as ui from './ui/index.js';

// Emulator-specific config blocks
export { default as FreeJ2MEPlusConfig } from './freej2meplus/FreeJ2MEPlusConfig.jsx';
export { default as KEmulator } from './kemulator/KEmulator.jsx';
export { default as LibretroFJPlus } from './libretro/LibretroFJPlus.jsx';

// Common dialogs for app
export { default as GameLaunchDialog } from './ui/dialogs/GameLaunchDialog';
export { default as FolderSelectDialog } from './ui/dialogs/FolderSelectDialog';
export { default as BackupDialog } from './ui/dialogs/BackupDialog';
