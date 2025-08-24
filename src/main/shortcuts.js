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
  const lnkPath = path.join(desktop, `${safeTitle}.lnk`);
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

  // Use PowerShell and WScript.Shell to create the shortcut
  const { execFile } = require('child_process');
  const psCommand = [
    'powershell',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    `$Wsh = New-Object -ComObject WScript.Shell; ` +
    `$s = $Wsh.CreateShortcut("${psEscape(lnkPath.replace(/\\/g, '/'))}"); ` +
    `$s.TargetPath = "${psEscape(target.replace(/\\/g, '/'))}"; ` +
    `$s.Arguments = "${psEscape(args)}"; ` +
    `$s.IconLocation = "${psEscape(iconIcoPath.replace(/\\/g, '/'))}"; ` +
    `$s.WorkingDirectory = "${psEscape(path.dirname(target).replace(/\\/g, '/'))}"; ` +
    `$s.Save();`
  ];

  await new Promise((resolve, reject) => {
    execFile(psCommand[0], psCommand.slice(1), { windowsHide: true }, (err) => {
      if (err) reject(err); else resolve();
    });
  });

  return { lnkPath, iconPath: iconIcoPath };
}

module.exports = {
  getLnkIcoDir,
  ensureIcoForGame,
  createDesktopShortcut
};
