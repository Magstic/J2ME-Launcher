// Configuration-related IPC handlers
// Centralized configuration management through ConfigService
const yamlConfig = require('../config/yaml-config');

function register({ ipcMain, configService }) {
  // Get Java path configuration
  ipcMain.handle('get-java-path', () => {
    try {
      return {
        current: configService.getCurrentJavaPath(),
        custom: configService.get('javaPath'),
      };
    } catch (error) {
      console.error('Failed to get Java path:', error);
      return { current: 'java', custom: null };
    }
  });

  // Set custom Java path
  ipcMain.handle('set-java-path', async (event, javaPath) => {
    try {
      configService.setJavaPath(javaPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to set Java path:', error);
      return { success: false, error: error.message };
    }
  });

  // Validate Java path
  ipcMain.handle('validate-java-path', async (event, javaPath) => {
    try {
      const isValid = configService.isValidJavaPath(javaPath);
      return { valid: isValid };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  });

  // Browse for Java executable
  ipcMain.handle('browse-java-executable', async (event) => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({
        title: 'Select Java Executable',
        filters: [
          { name: 'Java Executable', extensions: process.platform === 'win32' ? ['exe'] : [''] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
      }

      const selectedPath = result.filePaths[0];

      // Validate the selected file is a valid Java executable
      if (!configService.isValidJavaPath(selectedPath)) {
        console.error('[browse-java-executable] Invalid selection:', selectedPath);
        return {
          success: false,
          error: `Selected file is not a valid Java executable: ${selectedPath}`,
        };
      }

      return { success: true, filePath: selectedPath };
    } catch (error) {
      console.error('Failed to browse Java executable:', error);
      return { success: false, error: error.message };
    }
  });

  // ==================== Cluster Tag Options ====================
  // Get cluster tag options (devices/resolutions/versions). Returns null if not set.
  ipcMain.handle('get-cluster-tag-options', () => {
    try {
      // Prefer YAML-backed config (single source of truth)
      const conf = yamlConfig.loadConfig();
      const fromYaml = conf?.ui?.clusterTagOptions || null;
      const sanitize = (arr) =>
        Array.isArray(arr) ? arr.filter((v) => typeof v === 'string' && v.trim().length > 0) : [];
      if (fromYaml && typeof fromYaml === 'object') {
        return {
          devices: sanitize(fromYaml.devices),
          resolutions: sanitize(fromYaml.resolutions),
          versions: sanitize(fromYaml.versions),
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  });

  // Set cluster tag options
  ipcMain.handle('set-cluster-tag-options', (event, options) => {
    try {
      const sanitize = (arr) =>
        Array.isArray(arr) ? arr.filter((v) => typeof v === 'string' && v.trim().length > 0) : [];
      const clean = {
        devices: sanitize(options?.devices),
        resolutions: sanitize(options?.resolutions),
        versions: sanitize(options?.versions),
      };
      // Persist to YAML config (authoritative)
      yamlConfig.saveConfig({ ui: { clusterTagOptions: clean } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  });
}

module.exports = { register };
