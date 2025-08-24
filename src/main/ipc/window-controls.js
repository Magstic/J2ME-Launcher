// src/main/ipc/window-controls.js
// IPC for main window controls

function register({ ipcMain, getMainWindow }) {
  // Minimize main window
  ipcMain.on('window-minimize', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
  });

  // Toggle maximize/unmaximize
  ipcMain.on('window-maximize', () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  // Close main window
  ipcMain.on('window-close', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });
}

module.exports = { register };
