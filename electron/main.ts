import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, dialog, clipboard, nativeImage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { runHarnessAgent, abortExecution, submitUserResponse, submitTerminalInput } from './harness-runner';
import { getGitStatus, getFileDiff, discardFileChange } from './git-manager';
import { skillManager } from './skill-manager';

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
    backgroundColor: '#f8faf9',
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

  // Git IPC
  ipcMain.handle('git:getStatus', async (_event, repoPath: string) => {
    return await getGitStatus(repoPath);
  });

  ipcMain.handle('git:getFileDiff', async (_event, { repoPath, relPath }: { repoPath: string; relPath: string }) => {
    return await getFileDiff(repoPath, relPath);
  });

  ipcMain.handle('git:discardChange', async (_event, { repoPath, relPath }: { repoPath: string; relPath: string }) => {
    return await discardFileChange(repoPath, relPath);
  });

  // Skills IPC
  ipcMain.handle('skills:getAll', async (_event, workspacePath: string | null) => {
    return skillManager.getAllAvailableSkills(workspacePath);
  });

  ipcMain.handle('skills:installFromFile', async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Skill Markdown 文件 (.md)',
      properties: ['openFile'],
      filters: [{ name: 'Markdown Skill', extensions: ['md'] }]
    });
    if (canceled || filePaths.length === 0) return null;
    return skillManager.installSkillFromFile(filePaths[0]);
  });

  ipcMain.handle('skills:installFromContent', async (_event, { id, name, description, prompt }) => {
    return skillManager.installSkillFromContent(id, name, description, prompt);
  });

  ipcMain.handle('skills:installFromUrl', async (_event, url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const text = await res.text();
      const urlFileName = url.split('/').pop()?.replace(/\.md$/, '') || 'remote_skill';
      const titleMatch = text.match(/^#\s+(.+)$/m);
      const name = titleMatch ? titleMatch[1].trim() : urlFileName;
      return skillManager.installSkillFromContent(urlFileName, name, `从 URL 安装: ${url}`, text);
    } catch (err: any) {
      throw new Error(`下载 Skill 失败: ${err.message}`);
    }
  });

  ipcMain.handle('skills:delete', async (_event, skillId: string) => {
    return skillManager.deleteCustomSkill(skillId);
  });

  // Multimodal Preview Pop-out Window IPC
  ipcMain.handle('preview:popout', async (_event, { type, title, content }: { type: string; title?: string; content: string }) => {
    const popoutWin = new BrowserWindow({
      width: 1060,
      height: 740,
      minWidth: 480,
      minHeight: 360,
      title: `${title || 'ASTeam 产物实时预览'} - ASTeam Agent`,
      autoHideMenuBar: true,
      backgroundColor: '#0f172a',
      webPreferences: {
        sandbox: false
      }
    });

    if (type === 'html') {
      const wrapped = content.includes('<html')
        ? content
        : `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title || 'HTML 预览'}</title><script src="https://cdn.tailwindcss.com"></script></head><body>${content}</body></html>`;
      popoutWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(wrapped)}`);
    } else if (type === 'svg') {
      const htmlWrapper = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title || 'SVG 预览'}</title><style>body{margin:0;padding:32px;background:#0f172a;display:flex;justify-content:center;align-items:center;min-height:100vh;}svg{max-width:100%;height:auto;filter:drop-shadow(0 10px 25px rgba(0,0,0,0.5));}</style></head><body>${content}</body></html>`;
      popoutWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlWrapper)}`);
    } else if (type === 'mermaid') {
      const htmlWrapper = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title || 'Mermaid 架构拓扑'}</title><script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script><style>body{margin:0;padding:32px;background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;}pre.mermaid{background:transparent;}</style></head><body><pre class="mermaid">${content}</pre><script>mermaid.initialize({theme:'dark',startOnLoad:true});</script></body></html>`;
      popoutWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlWrapper)}`);
    }

    return true;
  });

  // Native Clipboard Image Write
  ipcMain.handle('clipboard:writeImage', async (_event, dataUrl: string) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl);
      clipboard.writeImage(img);
      return true;
    } catch (err: any) {
      console.error('Failed to copy image to clipboard:', err);
      return false;
    }
  });

  // Native Save File Dialog
  ipcMain.handle('dialog:saveFile', async (_event, { defaultName, content, isBase64 }: { defaultName: string; content: string; isBase64?: boolean }) => {
    try {
      if (!mainWindow) return false;
      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        title: '保存文件'
      });
      if (canceled || !filePath) return false;
      if (isBase64) {
        const base64Data = content.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      } else {
        fs.writeFileSync(filePath, content, 'utf-8');
      }
      return true;
    } catch (err: any) {
      console.error('Failed to save file:', err);
      return false;
    }
  });

  // External System & Browser Actions
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://'))) {
        await shell.openExternal(url);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to open external url:', err);
      return false;
    }
  });

  ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
    try {
      if (filePath && fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to show item in folder:', err);
      return false;
    }
  });

  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    try {
      if (targetPath && fs.existsSync(targetPath)) {
        await shell.openPath(targetPath);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to open path:', err);
      return false;
    }
  });

  ipcMain.handle('shell:openInBrowser', async (_event, { content, title, defaultPath }: { content: string; title?: string; defaultPath?: string }) => {
    try {
      let targetPath = defaultPath;
      if (!targetPath || !fs.existsSync(targetPath)) {
        const tmpDir = path.join(app.getPath('temp'), 'asteam-previews');
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        const safeName = (title || 'preview').replace(/[\\/:*?"<>|]/g, '_').replace(/\.html?$/i, '') + `_${Date.now()}.html`;
        targetPath = path.join(tmpDir, safeName);
        fs.writeFileSync(targetPath, content, 'utf-8');
      }
      await shell.openPath(targetPath);
      return { success: true, filePath: targetPath };
    } catch (err: any) {
      console.error('Failed to open in browser:', err);
      return { success: false, error: err.message };
    }
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
      },
      onQuestion: (data) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'question',
          payload: { sessionId, ...data }
        });
      },
      onTerminalData: (data) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'terminalData',
          payload: data
        });
      }
    });
  });

  ipcMain.handle('agent:stop', (_event, sessionId: string) => {
    return abortExecution(sessionId);
  });

  ipcMain.handle('agent:replyQuestion', (_event, { sessionId, response }: { sessionId: string; response: string }) => {
    return submitUserResponse(sessionId, response);
  });

  ipcMain.handle('agent:sendTerminalInput', (_event, { sessionId, input }: { sessionId: string; input: string }) => {
    return submitTerminalInput(sessionId, input);
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
