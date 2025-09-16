/**
 * 最小侵入性日誌管理系統
 * 通過攔截 console 方法實現統一控制，支持開發/生產環境切換
 */

// 全局日誌配置
const LOG_CONFIG = {
  // 根據環境變數決定是否啟用日誌（生產環境默認關閉）
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
 * 根據配置決定是否輸出日誌
 */
function formatTimestamp(date = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatPrefix(method, scope) {
  const ts = formatTimestamp();
  const processLabel = 'Renderer';
  const scopeLabel = scope ? `[${scope}]` : '';
  return `[${ts}] [${processLabel}]${scopeLabel} ${method.toUpperCase()}:`;
}

function output(method, scope, args) {
  // 錯誤日誌在生產環境也保留（用於問題排查）
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
 * 提供運行時控制接口（僅在開發環境暴露）
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // 全局開關
  window.toggleLogs = (enabled) => {
    LOG_CONFIG.enabled = enabled;
    console.info(`[Logger] 日誌輸出已${enabled ? '開啟' : '關閉'}`);
  };
  
  // 按級別控制
  window.toggleLogLevel = (level, enabled) => {
    if (LOG_CONFIG.levels.hasOwnProperty(level)) {
      LOG_CONFIG.levels[level] = enabled;
      console.info(`[Logger] ${level} 級別日誌已${enabled ? '開啟' : '關閉'}`);
    }
  };
  
  // 顯示當前配置
  window.showLogConfig = () => {
    console.info('[Logger] 當前配置:', LOG_CONFIG);
  };
}

// 立即初始化攔截器
setupConsoleInterceptor();

// 在開發環境顯示初始化信息
if (process.env.NODE_ENV === 'development') {
  console.info('[Logger] 日誌管理系統已初始化');
}

// 提供具名 logger，供新程式碼使用（避免直接使用 console）
export function getLogger(scope) {
  return {
    log: (...args) => output('log', scope, args),
    info: (...args) => output('info', scope, args),
    warn: (...args) => output('warn', scope, args),
    error: (...args) => output('error', scope, args),
    debug: (...args) => output('debug', scope, args)
  };
}

// 導出配置供其他模塊使用
export { LOG_CONFIG, originalConsole };
