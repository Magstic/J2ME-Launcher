const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * ConfigService - Centralized configuration management
 *
 * "Do one thing and do it well" - Unix Philosophy
 * Single responsibility: manage all application configuration
 * Stateless design with intelligent fallback resolution
 */
class ConfigService {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from disk
   * @returns {Object} Configuration object
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load config:', error.message);
    }
    return {};
  }

  /**
   * Save configuration to disk
   */
  saveConfig() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error.message);
    }
  }

  /**
   * Get configuration value
   * @param {string} key - Configuration key
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} Configuration value
   */
  get(key, defaultValue = null) {
    return this.config[key] ?? defaultValue;
  }

  /**
   * Set configuration value
   * @param {string} key - Configuration key
   * @param {*} value - Configuration value
   */
  set(key, value) {
    this.config[key] = value;
    this.saveConfig();
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
