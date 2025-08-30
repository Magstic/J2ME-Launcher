const path = require('path');
const fs = require('fs');

/**
 * Resolve Java command through ConfigService
 * Dependency injection pattern - configService passed in
 * @param {ConfigService} configService - Injected configuration service
 * @returns {string} Java executable path
 */
function resolveJavaCommand(configService) {
  if (configService) {
    return configService.resolveJavaPath();
  }
  
  // Fallback to legacy behavior if no configService
  const isWin = process.platform === 'win32';
  const javaHome = process.env.JAVA_HOME || process.env.JDK_HOME;
  if (javaHome) {
    const candidate = path.join(javaHome, 'bin', isWin ? 'java.exe' : 'java');
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'java';
}

// Safe quoting for shell command line rendering
function quoteArg(s) {
  const str = String(s);
  if (process.platform === 'win32') {
    // Windows: use double quotes with escape
    return '"' + str.replace(/"/g, '\\"') + '"';
  } else {
    // Unix/Linux: use single quotes, escape single quotes by ending quote, adding escaped quote, starting new quote
    return "'" + str.replace(/'/g, "'\"'\"'") + "'";
  }
}

// Build a shell-safe command line string from binary and args
function buildCommandLine(binary, args = []) {
  const parts = [];
  parts.push(quoteArg(binary));
  for (const a of args) {
    if (a === undefined || a === null) continue;
    const str = String(a);
    if (/\s|[<>|&]/.test(str)) parts.push(quoteArg(str));
    else parts.push(str);
  }
  return parts.join(' ');
}

module.exports = { resolveJavaCommand, quoteArg, buildCommandLine };
