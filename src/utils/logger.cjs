/**
 * Node.js (CommonJS) 版本的日誌管理系統
 * 用於主進程和其他 Node.js 模塊
 */

// 全局日誌配置
const LOG_CONFIG = {
  // 根據環境變數決定是否啟用日誌
  enabled: process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true',
  
  // 按級別控制日誌輸出
  levels: {
    log: true,
    warn: true,
    error: true,    // 錯誤日誌始終保留
    info: true,
    debug: false    // debug 默認關閉
  }
};

// 保存原始 console 方法的引用
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console)
};

/**
 * 設置 console 方法攔截器
 */
function formatTimestamp(date = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function resolveProcessLabel() {
  try {
    if (typeof process !== 'undefined' && process.type) {
      if (process.type === 'browser') return 'Main';
      if (process.type === 'renderer') return 'Preload';
    }
  } catch (_) {}
  return 'Node';
}

function formatPrefix(method, scope) {
  const ts = formatTimestamp();
  const processLabel = resolveProcessLabel();
  const scopeLabel = scope ? `[${scope}]` : '';
  return `[${ts}] [${processLabel}]${scopeLabel} ${method.toUpperCase()}:`;
}

function output(method, scope, args) {
  const shouldLog = method === 'error' || (LOG_CONFIG.enabled && LOG_CONFIG.levels[method]);
  if (!shouldLog) return;
  try {
    originalConsole[method](formatPrefix(method, scope), ...args);
  } catch (_) {
    try { originalConsole[method](...args); } catch (_) {}
  }
}

function setupConsoleInterceptor() {
  Object.keys(originalConsole).forEach(method => {
    console[method] = (...args) => output(method, null, args);
  });
}

/**
 * 提供運行時控制接口（僅在開發環境）
 */
if (process.env.NODE_ENV === 'development') {
  // 全局開關
  global.toggleLogs = (enabled) => {
    LOG_CONFIG.enabled = enabled;
    console.info(`[Logger] 日誌輸出已${enabled ? '開啟' : '關閉'}`);
  };
  
  // 按級別控制
  global.toggleLogLevel = (level, enabled) => {
    if (LOG_CONFIG.levels.hasOwnProperty(level)) {
      LOG_CONFIG.levels[level] = enabled;
      console.info(`[Logger] ${level} 級別日誌已${enabled ? '開啟' : '關閉'}`);
    }
  };
  
  // 顯示當前配置
  global.showLogConfig = () => {
    console.info('[Logger] 當前配置:', LOG_CONFIG);
  };
}

// 立即初始化攔截器
setupConsoleInterceptor();

// 在開發環境顯示初始化信息
if (process.env.NODE_ENV === 'development') {
  console.info('[Logger] 日誌管理系統已初始化 (Node.js)');
}

// 具名 logger 供主進程/預載入腳本使用
function getLogger(scope) {
  return {
    log: (...args) => output('log', scope, args),
    info: (...args) => output('info', scope, args),
    warn: (...args) => output('warn', scope, args),
    error: (...args) => output('error', scope, args),
    debug: (...args) => output('debug', scope, args)
  };
}

// 導出配置
module.exports = { LOG_CONFIG, originalConsole, getLogger };
