import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { runHarnessAgent, abortExecution } from './harness-runner';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged;

function getIconPath(): string {
  const candidates = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../build/icon.png'),
    path.join(app.getAppPath(), 'build/icon.ico'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(process.resourcesPath, 'build/icon.ico'),
    path.join(process.resourcesPath, 'build/icon.png')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return '';
}

function createWindow(): BrowserWindow {
  const icon = getIconPath();
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1412',
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
      return false;
    }
  });

  return win;
}

function createTray(): Tray | null {
  const icon = getIconPath();
  if (!icon) {
    console.warn('Tray icon not found, skipping tray');
    return null;
  }
  try {
    const trayInstance = new Tray(icon);
    trayInstance.setToolTip('ASTeam Agent - 智能桌面助手');

  const updateMenu = () => {
    const isAutoLaunch = app.getLoginItemSettings().openAtLogin;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示 ASTeam Agent 主界面',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: '开机自启动',
        type: 'checkbox',
        checked: isAutoLaunch,
        click: (menuItem) => {
          app.setLoginItemSettings({
            openAtLogin: menuItem.checked,
            path: process.execPath
          });
          updateMenu();
        }
      },
      { type: 'separator' },
      {
        label: '退出 ASTeam Agent',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    trayInstance.setContextMenu(contextMenu);
  };

  updateMenu();

  trayInstance.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  return trayInstance;
  } catch (err) {
    console.error('Failed to initialize tray:', err);
    return null;
  }
}

function registerShortcuts() {
  // Global Shortcut: CommandOrControl+Shift+Space to toggle window
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function setupIPC() {
  // Window control IPC
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  // Workspace folder selector
  ipcMain.handle('workspace:selectDirectory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择本地工作区目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Workspace file listing
  ipcMain.handle('workspace:listFiles', async (_event, dirPath: string) => {
    try {
      if (!dirPath || !fs.existsSync(dirPath)) return [];
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      return entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
        .slice(0, 100)
        .map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          path: path.join(dirPath, e.name)
        }));
    } catch {
      return [];
    }
  });

  // App settings IPC
  ipcMain.handle('app:getOpenAtLogin', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('app:setOpenAtLogin', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({
      openAtLogin,
      path: process.execPath
    });
    return app.getLoginItemSettings().openAtLogin;
  });

  // Agent Harness IPC
  ipcMain.handle('agent:start', async (_event, { sessionId, config, history }) => {
    if (!mainWindow) return;

    runHarnessAgent(sessionId, config, history, {
      onToken: (token, type) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'token',
          payload: { sessionId, token, tokenType: type || 'content' }
        });
      },
      onPlan: (steps) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'plan',
          payload: { sessionId, steps }
        });
      },
      onStepUpdate: (step) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'stepUpdate',
          payload: { sessionId, step }
        });
      },
      onError: (error) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'error',
          payload: { sessionId, error }
        });
      },
      onDone: (summary) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'done',
          payload: { sessionId, summary }
        });
      }
    });
  });

  ipcMain.handle('agent:stop', (_event, sessionId: string) => {
    return abortExecution(sessionId);
  });
}

// App lifecycle
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    mainWindow = createWindow();
    tray = createTray();
    registerShortcuts();
    setupIPC();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      } else {
        mainWindow?.show();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
