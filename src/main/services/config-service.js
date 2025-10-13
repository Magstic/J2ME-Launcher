const fs = require('fs');
const path = require('path');
const yamlConfig = require('../config/yaml-config');

/**
 * ConfigService - Centralized configuration management
 *
 * "Do one thing and do it well" - Unix Philosophy
 * Single responsibility: manage all application configuration
 * Stateless design with intelligent fallback resolution
 */
class ConfigService {
  constructor() {}

  /**
   * Load configuration from disk
   * @returns {Object} Configuration object
   */
  loadConfig() {
    // Delegate to YAML-backed config
    try {
      return yamlConfig.loadConfig();
    } catch (_) {
      return {};
    }
  }

  /**
   * Save configuration to disk
   */
  saveConfig(partial) {
    try {
      return yamlConfig.saveConfig(partial || {});
    } catch (error) {
      console.error('Failed to save YAML config:', error.message);
    }
  }

  /**
   * Get configuration value
   * @param {string} key - Configuration key
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} Configuration value
   */
  get(key, defaultValue = null) {
    // Map legacy keys to YAML structure
    if (key === 'javaPath') {
      try {
        const conf = this.loadConfig();
        return conf?.runtime?.javaPath ?? defaultValue;
      } catch (_) {
        return defaultValue;
      }
    }
    return defaultValue;
  }

  /**
   * Set configuration value
   * @param {string} key - Configuration key
   * @param {*} value - Configuration value
   */
  set(key, value) {
    if (key === 'javaPath') {
      const v = value || null;
      this.saveConfig({ runtime: { javaPath: v } });
      return;
    }
  }

  /**
   * Intelligent Java path resolution
   * Priority: Custom config → Environment variables → System defaults
   *
   * "Perfect is the enemy of good" - but this covers all real-world cases
   *
   * @returns {string} Java executable path
   */
  resolveJavaPath() {
    // 1. Custom configuration (highest priority)
    const customJavaPath = this.get('javaPath');
    if (customJavaPath && this.isValidJavaPath(customJavaPath)) {
      return customJavaPath;
    }

    // 2. Environment variables (JAVA_HOME, JDK_HOME)
    const isWin = process.platform === 'win32';
    const javaHome = process.env.JAVA_HOME || process.env.JDK_HOME;
    if (javaHome) {
      const candidate = path.join(javaHome, 'bin', isWin ? 'java.exe' : 'java');
      if (this.isValidJavaPath(candidate)) {
        return candidate;
      }
    }

    // 3. System PATH (lowest priority, but most common)
    return 'java';
  }

  /**
   * Validate Java executable path
   * @param {string} javaPath - Path to Java executable
   * @returns {boolean} True if valid Java executable
   */
  isValidJavaPath(javaPath) {
    try {
      if (!fs.existsSync(javaPath)) return false;

      const stat = fs.statSync(javaPath);
      if (!stat.isFile()) return false;

      // On Unix-like systems, check executable permission
      if (process.platform !== 'win32') {
        try {
          fs.accessSync(javaPath, fs.constants.F_OK | fs.constants.X_OK);
        } catch {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set custom Java path
   * @param {string} javaPath - Path to Java executable
   * @throws {Error} If path is invalid
   */
  setJavaPath(javaPath) {
    if (!javaPath) {
      // Clear custom Java path, fall back to auto-detection
      this.set('javaPath', null);
      return;
    }

    if (!this.isValidJavaPath(javaPath)) {
      // Provide detailed error context for debugging
      const reasons = [];

      if (!fs.existsSync(javaPath)) {
        reasons.push('file does not exist');
      } else {
        const stat = fs.statSync(javaPath);
        if (!stat.isFile()) {
          reasons.push('not a regular file');
        }
        if (process.platform !== 'win32') {
          try {
            fs.accessSync(javaPath, fs.constants.X_OK);
          } catch {
            reasons.push('not executable');
          }
        }
      }

      const errorMsg = `Invalid Java path: ${javaPath} (${reasons.join(', ')})`;
      console.error('[ConfigService]', errorMsg);
      throw new Error(errorMsg);
    }

    this.set('javaPath', javaPath);
  }

  /**
   * Get current Java path (for UI display)
   * @returns {string} Current Java path
   */
  getCurrentJavaPath() {
    return this.resolveJavaPath();
  }
}

module.exports = ConfigService;
