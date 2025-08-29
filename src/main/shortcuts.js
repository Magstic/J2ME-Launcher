const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { writeIcoFromPng } = require('./utils/png-to-ico');
const { gameHashFromPath } = require('./utils/hash');

// Sanitize a title to a safe Windows filename
function sanitizeFileName(name) {
  const base = (name || 'J2ME Game').trim();
  return base
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    || 'J2ME Game';
}

// Escape for embedding inside a PowerShell double-quoted string
function psEscape(str) {
  return String(str)
    .replace(/`/g, '``')
    .replace(/\$/g, '`$')
    .replace(/"/g, '`"');
}

// Resolve where to store ICOs for shortcuts
function getLnkIcoDir() {
  const dir = path.join(app.getPath('userData'), 'lnkico');
  return dir;
}

// Ensure an ICO exists for the given game, using its parsed PNG if available.
// Fallback to bundled app icon at src/assets/icons/icon.ico (packaged via build.files).
async function ensureIcoForGame(filePath, iconPngPath) {
  const hash = gameHashFromPath(filePath);
  const outDir = getLnkIcoDir();
  const outIco = path.join(outDir, `${hash}.ico`);
  try { await fs.promises.mkdir(outDir, { recursive: true }); } catch (_) {}

  // If already exists, return
  try { await fs.promises.access(outIco, fs.constants.F_OK); return outIco; } catch (_) {}

  if (iconPngPath) {
    try {
      await writeIcoFromPng(iconPngPath, outIco);
      return outIco;
    } catch (e) {
      // fall through to fallback
    }
  }
  // Fallback: packaged default ICO
  const fallbackIco = path.join(__dirname, '..', 'assets', 'icons', 'icon.ico');
  try {
    // Copy fallback to lnkico/<hash>.ico
    await fs.promises.copyFile(fallbackIco, outIco);
    return outIco;
  } catch (e) {
    // As ultimate fallback, just return fallback path (might live inside asar)
    return fallbackIco;
  }
}

// Create a Windows .lnk on the user's Desktop that launches the app with --launch-game-hash
async function createDesktopShortcut({ filePath, title, iconPngPath }) {
  const desktop = app.getPath('desktop');
  const hash = gameHashFromPath(filePath);
  const safeTitle = sanitizeFileName(title);
  const finalLnkPath = path.join(desktop, `${safeTitle}.lnk`);
  
  // 解決中文編碼問題：先創建 MD5 檔名，再重命名
  const tempLnkPath = path.join(desktop, `${hash}.lnk`);
  
  const isPackaged = !!app.isPackaged;
  const target = process.execPath; // Packaged: app exe; Dev: electron.exe
  // In dev, electron.exe requires the app path as the first argument.
  // In packaged, arguments only need our custom flag.
  const argParts = [];
  if (!isPackaged) {
    try {
      const appPath = app.getAppPath();
      // Quote the app path to be safe with spaces
      argParts.push(`\"${appPath.replace(/\\/g, '/') }\"`);
    } catch (_) {}
  }
  argParts.push(`--launch-game-hash=${hash}`);
  const args = argParts.join(' ');
  const iconIcoPath = await ensureIcoForGame(filePath, iconPngPath);

  // Step 1: 創建安全的 MD5 檔名捷徑
  const { execFile } = require('child_process');
  const createCommand = [
    'powershell',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    `$Wsh = New-Object -ComObject WScript.Shell; ` +
    `$s = $Wsh.CreateShortcut("${psEscape(tempLnkPath.replace(/\\/g, '/'))}"); ` +
    `$s.TargetPath = "${psEscape(target.replace(/\\/g, '/'))}"; ` +
    `$s.Arguments = "${psEscape(args)}"; ` +
    `$s.IconLocation = "${psEscape(iconIcoPath.replace(/\\/g, '/'))}"; ` +
    `$s.WorkingDirectory = "${psEscape(path.dirname(target).replace(/\\/g, '/'))}"; ` +
    `$s.Save();`
  ];

  await new Promise((resolve, reject) => {
    execFile(createCommand[0], createCommand.slice(1), { windowsHide: true }, (err) => {
      if (err) reject(err); else resolve();
    });
  });

  // Step 2: 如果目標檔名與臨時檔名不同，則重命名為中文名
  if (tempLnkPath !== finalLnkPath) {
    // 檢查目標檔案是否已存在，如果存在則先刪除
    try {
      await fs.promises.access(finalLnkPath, fs.constants.F_OK);
      await fs.promises.unlink(finalLnkPath);
    } catch (_) {
      // 檔案不存在，繼續
    }

    const renameCommand = [
      'powershell',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Rename-Item "${psEscape(tempLnkPath.replace(/\\/g, '/'))}" "${psEscape(path.basename(finalLnkPath))}"`
    ];

    await new Promise((resolve, reject) => {
      execFile(renameCommand[0], renameCommand.slice(1), { windowsHide: true }, (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  return { lnkPath: finalLnkPath, iconPath: iconIcoPath };
}

module.exports = {
  getLnkIcoDir,
  ensureIcoForGame,
  createDesktopShortcut
};
