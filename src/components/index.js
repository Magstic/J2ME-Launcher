// Re-export common top-level components for convenient alias imports
// Usage examples:
//   import { DirectoryManager } from '@components';
//   import { GameLaunchDialog } from '@components';

export { default as TitleBar } from './TitleBar';
export { default as DirectoryManager } from './DirectoryManager';
export { default as SearchBar } from './SearchBar';
export { default as GameInfoDialog } from './Desktop/GameInfoDialog';
export { default as EmulatorConfigDialog } from './EmulatorConfigDialog';
export { default as FolderWindowApp } from './FolderWindowApp';

// UI Dialogs (sub-namespace style)
export * as ui from './ui/index.js';

// Emulator-specific config blocks
export { default as FreeJ2MEPlusConfig } from './emulators/FreeJ2MEPlusConfig.jsx';
export { default as KEmulator } from './emulators/KEmulator.jsx';
export { default as LibretroFJPlus } from './emulators/LibretroFJPlus.jsx';
export { default as FreeJ2MEZb3Config } from './emulators/FreeJ2MEZb3Config.jsx';

// Common dialogs for app
export { default as GameLaunchDialog } from './ui/dialogs/GameLaunchDialog';
export { default as FolderSelectDialog } from './ui/dialogs/FolderSelectDialog';
export { default as BackupDialog } from './ui/dialogs/BackupDialog';
