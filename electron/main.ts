import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, dialog, clipboard, nativeImage, shell, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { runHarnessAgent, abortExecution, submitUserResponse, submitTerminalInput, steerExecution } from './harness-runner';
import { getGitStatus, getFileDiff, discardFileChange, getGitDiffSummary } from './git-manager';
import { skillManager } from './skill-manager';
import { storageHub } from './storage-hub';
import { memoryManager } from './memory-manager';
import { rulesManager } from './rules-manager';
import { checkpointManager } from './checkpoint-manager';
import { mcpManager } from './mcp-manager';
import { schedulerManager } from './scheduler-manager';
import { enterpriseHubManager } from './enterprise-hub-manager';
import { knowledgeGraphManager } from './knowledge-graph-manager';
import { securityFenceManager } from './security-fence-manager';
import { autoUpdaterManager } from './auto-updater';
import { extractOfficeDocumentContent } from './office-extractor';

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

function indexWorkspaceFiles(rootPath: string, maxFiles = 2000): Array<{ name: string; relPath: string; ext: string }> {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const results: Array<{ name: string; relPath: string; ext: string }> = [];
  const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'dist-electron', 'build', 'release', '.asteam', '.vscode', '.idea', 'coverage', '.cache', 'tmp', 'temp']);

  function walk(currentDir: string) {
    if (results.length >= maxFiles) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxFiles) return;
        if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.asteamrules') continue;

        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const relPath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
          const ext = path.extname(entry.name).toLowerCase().replace('.', '');
          results.push({
            name: entry.name,
            relPath,
            ext
          });
        }
      }
    } catch {}
  }

  walk(rootPath);
  return results;
}

function readWorkspaceFileSafe(rootPath: string, relPath: string): { success: boolean; content?: string; error?: string } {
  try {
    if (!rootPath || !fs.existsSync(rootPath)) return { success: false, error: '工作区不存在' };
    const fullPath = path.resolve(rootPath, relPath);
    if (!fullPath.startsWith(path.resolve(rootPath))) {
      return { success: false, error: '非法越界文件路径' };
    }
    if (!fs.existsSync(fullPath)) return { success: false, error: '文件不存在' };
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) return { success: false, error: '目标是目录而非文件' };
    if (stats.size > 1024 * 1024 * 2) {
      return { success: false, error: '文件超过 2MB，已被保护性拦截' };
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { success: true, content };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
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

  // Workspace file indexing & reading for @file context
  ipcMain.handle('workspace:indexFiles', async (_event, dirPath: string) => {
    return indexWorkspaceFiles(dirPath);
  });

  ipcMain.handle('workspace:readFileContent', async (_event, { workspacePath, relPath }: { workspacePath: string; relPath: string }) => {
    return readWorkspaceFileSafe(workspacePath, relPath);
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

  ipcMain.handle('git:getDiffSummary', async (_event, repoPath: string) => {
    return await getGitDiffSummary(repoPath);
  });

  // Skills IPC
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('skills:getAll', async (_event, workspacePath: string | null = null) => {
    return skillManager.getAllAvailableSkills(workspacePath);
  });

  ipcMain.handle('skills:installFromFile', async (_event, customFilePath?: string) => {
    if (customFilePath && typeof customFilePath === 'string' && fs.existsSync(customFilePath)) {
      return skillManager.installSkillFromFile(customFilePath);
    }
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Skill 技能包 (.skill, .zip, .md 或文件夹)',
      properties: ['openFile'],
      filters: [
        { name: 'Skill 技能包 (*.skill, *.zip, *.md)', extensions: ['skill', 'zip', 'md'] },
        { name: 'Skill 专用归档 (*.skill)', extensions: ['skill'] },
        { name: 'ZIP 压缩归档 (*.zip)', extensions: ['zip'] },
        { name: 'Markdown Skill (*.md)', extensions: ['md'] },
        { name: '所有文件 (*.*)', extensions: ['*'] }
      ]
    });
    if (canceled || filePaths.length === 0) return null;
    const res = skillManager.installSkillFromFile(filePaths[0]);
    mainWindow?.webContents.send('skills:changed');
    return res;
  });

  ipcMain.handle('skills:installFromFolder', async (_event, customFolderPath?: string) => {
    if (customFolderPath && typeof customFolderPath === 'string' && fs.existsSync(customFolderPath)) {
      const res = skillManager.installSkillFromFile(customFolderPath);
      mainWindow?.webContents.send('skills:changed');
      return res;
    }
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择包含 SKILL.md 的技能文件夹',
      properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) return null;
    const res = skillManager.installSkillFromFile(filePaths[0]);
    mainWindow?.webContents.send('skills:changed');
    return res;
  });

  ipcMain.handle('skills:getExtraDirs', async () => {
    return storageHub.getExtraSkillDirs();
  });

  ipcMain.handle('skills:addExtraDir', async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择外部技能仓库根目录 (如 D:\\ASTeamAIProject\\Skills)',
      properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) return null;
    const added = storageHub.addExtraSkillDir(filePaths[0]);
    mainWindow?.webContents.send('skills:changed');
    return { success: added, dir: filePaths[0], extraDirs: storageHub.getExtraSkillDirs() };
  });

  ipcMain.handle('skills:removeExtraDir', async (_event, dirPath: string) => {
    const removed = storageHub.removeExtraSkillDir(dirPath);
    mainWindow?.webContents.send('skills:changed');
    return { success: removed, extraDirs: storageHub.getExtraSkillDirs() };
  });

  ipcMain.handle('skills:installFromContent', async (_event, { id, name, description, prompt }) => {
    const res = skillManager.installSkillFromContent(id, name, description, prompt);
    mainWindow?.webContents.send('skills:changed');
    return res;
  });

  ipcMain.handle('skills:installFromUrl', async (_event, url: string) => {
    try {
      const res = await net.fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const text = await res.text();
      const urlFileName = url.split('/').pop()?.replace(/\.md$/, '') || 'remote_skill';
      const titleMatch = text.match(/^#\s+(.+)$/m);
      const name = titleMatch ? titleMatch[1].trim() : urlFileName;
      const installed = skillManager.installSkillFromContent(urlFileName, name, `从 URL 安装: ${url}`, text);
      mainWindow?.webContents.send('skills:changed');
      return installed;
    } catch (err: any) {
      throw new Error(`下载 Skill 失败: ${err.message}`);
    }
  });

  ipcMain.handle('skills:delete', async (_event, skillId: string) => {
    const res = skillManager.deleteCustomSkill(skillId);
    mainWindow?.webContents.send('skills:changed');
    return res;
  });

  // Office & Document Text Extractor IPC (v1.11.2 / v2.0.1 物理落盘强化)
  ipcMain.handle('office:extractDocument', async (_event, fileName: string, uint8Array: Uint8Array, workspacePath?: string) => {
    try {
      const buffer = Buffer.from(uint8Array);
      return await extractOfficeDocumentContent(fileName, buffer, workspacePath);
    } catch (err: any) {
      console.error('[OfficeExtractor] Error in office:extractDocument:', err);
      return {
        text: `（文档结构化解析异常: ${err.message}）`,
        summary: '解析异常',
        charCount: 0,
        type: 'unknown'
      };
    }
  });

  // 通用物理附件落盘 IPC (v2.0.1)
  ipcMain.handle('attachment:save', async (_event, fileName: string, uint8Array: Uint8Array, workspacePath?: string) => {
    try {
      const buffer = Buffer.from(uint8Array);
      const attachmentsDir = path.join(storageHub.getDataRootDir(), 'attachments');
      if (!fs.existsSync(attachmentsDir)) {
        fs.mkdirSync(attachmentsDir, { recursive: true });
      }
      const safeName = `${Date.now()}_${path.basename(fileName)}`;
      const savedPath = path.join(attachmentsDir, safeName);
      fs.writeFileSync(savedPath, buffer);
      let localPath = savedPath;

      if (workspacePath && fs.existsSync(workspacePath)) {
        try {
          const wsPath = path.join(workspacePath, path.basename(fileName));
          fs.writeFileSync(wsPath, buffer);
          localPath = wsPath;
        } catch {}
      }
      return { success: true, localPath };
    } catch (err: any) {
      console.error('[Attachment] Error saving attachment:', err);
      return { success: false, error: err.message };
    }
  });

  // Storage Hub IPC (v1.3.0)
  ipcMain.handle('storage:getStats', async () => {
    return storageHub.getStorageStats();
  });

  ipcMain.handle('storage:selectDataDir', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 ASTeam Agent 自定义数据与存储根目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('storage:setDataRootDir', async (_event, newPath: string) => {
    return storageHub.setDataRootDir(newPath);
  });

  ipcMain.handle('storage:migrateData', async () => {
    return await storageHub.migrateLegacyData();
  });

  // Memory Bank IPC (v1.3.0)
  ipcMain.handle('memory:getAll', async (_event, workspacePath: string | null) => {
    return {
      userProfile: memoryManager.readUserProfile(),
      globalMemory: memoryManager.readGlobalMemory(),
      projectMemory: memoryManager.readProjectMemory(workspacePath),
      projectMemoryPath: memoryManager.getProjectMemoryPath(workspacePath)
    };
  });

  ipcMain.handle('memory:saveContent', async (_event, { type, content, workspacePath }: { type: 'project' | 'profile' | 'global'; content: string; workspacePath: string | null }) => {
    return memoryManager.saveMemoryContent(type, content, workspacePath);
  });

  ipcMain.handle('memory:addFact', async (_event, { scope, fact, workspacePath }: { scope: 'project' | 'global'; fact: string; workspacePath: string | null }) => {
    return memoryManager.addMemoryFact(scope, fact, workspacePath);
  });

  ipcMain.handle('memory:parseCommand', async (_event, text: string) => {
    return memoryManager.parseExplicitCommand(text);
  });

  // Project Rules IPC (.asteamrules / ASTEAM.md) - v1.4.0
  ipcMain.handle('rules:get', async (_event, workspacePath: string | null) => {
    return rulesManager.getProjectRules(workspacePath);
  });

  ipcMain.handle('rules:save', async (_event, { workspacePath, content }: { workspacePath: string; content: string }) => {
    return rulesManager.saveProjectRules(workspacePath, content);
  });

  ipcMain.handle('rules:getPresets', async () => {
    return rulesManager.getPresets();
  });

  // Shadow Checkpoint & Rollback IPC - v1.4.0
  ipcMain.handle('checkpoint:list', async (_event, { workspacePath, sessionId }: { workspacePath: string | null; sessionId?: string }) => {
    return checkpointManager.listCheckpoints(workspacePath, sessionId);
  });

  ipcMain.handle('checkpoint:rollback', async (_event, { checkpointId, workspacePath }: { checkpointId: string; workspacePath: string | null }) => {
    return await checkpointManager.rollbackCheckpoint(checkpointId, workspacePath);
  });

  // Model Context Protocol (MCP) IPC - v1.5.0 / v1.8.1
  ipcMain.handle('mcp:getServersStatus', async () => {
    return mcpManager.getServersStatus();
  });

  ipcMain.handle('mcp:getSavedConfig', async () => {
    return mcpManager.getSavedConfigJson();
  });

  ipcMain.handle('mcp:reloadServers', async (_event, { customMcpConfig, workspacePath }: { customMcpConfig?: string; workspacePath: string | null }) => {
    return await mcpManager.reloadServers(customMcpConfig, workspacePath);
  });

  ipcMain.handle('mcp:testServer', async (_event, { name, config, workspacePath }: { name: string; config: any; workspacePath: string | null }) => {
    return await mcpManager.testServer(name, config, workspacePath);
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
      if (!filePath) return false;
      if (fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return true;
      }
      // 若具体文件尚未落盘但其父目录存在，则优雅回退打开所在目录
      const parentDir = path.dirname(filePath);
      if (fs.existsSync(parentDir)) {
        await shell.openPath(parentDir);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to show item in folder:', err);
      return false;
    }
  });

  ipcMain.handle('artifact:getPreviewData', async (_event, filePath: string) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在或路径无效' };
      }
      const ext = path.extname(filePath).toLowerCase();
      const stat = fs.statSync(filePath);

      // 1. Excel 表格文件 (.xlsx, .xls, .csv)
      if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        if (ext === '.csv') {
          await workbook.csv.readFile(filePath);
        } else {
          await workbook.xlsx.readFile(filePath);
        }
        const sheets = workbook.worksheets.map(ws => {
          const rows: any[][] = [];
          ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber <= 300) {
              const values = Array.isArray(row.values) ? row.values.slice(1) : [];
              rows.push(values.map(v => (v !== null && v !== undefined ? (typeof v === 'object' && 'result' in v ? String(v.result) : String(v)) : '')));
            }
          });
          return {
            name: ws.name,
            rowCount: ws.rowCount,
            columnCount: ws.columnCount,
            rows
          };
        });
        return {
          success: true,
          type: 'excel',
          fileName: path.basename(filePath),
          filePath,
          sizeBytes: stat.size,
          sheets
        };
      }

      // 2. 文本/配置/脚本文件 (.txt, .json, .py, .sh, .sql, .md, .cfg, .log 等)
      if (/\.(txt|json|yaml|yml|py|sh|sql|md|cfg|log|conf|ini|env)$/i.test(ext) || stat.size < 1024 * 1024) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return {
          success: true,
          type: 'text',
          fileName: path.basename(filePath),
          filePath,
          sizeBytes: stat.size,
          content: content.length > 500000 ? content.slice(0, 500000) + '\n\n... [ASTeam: 内容已截断]' : content
        };
      }

      return {
        success: true,
        type: 'binary',
        fileName: path.basename(filePath),
        filePath,
        sizeBytes: stat.size
      };
    } catch (err: any) {
      console.error('Failed to get artifact preview:', err);
      return { success: false, error: err.message };
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
      onDone: (summary, tokenStats, artifacts) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'done',
          payload: { sessionId, summary, tokenStats, artifacts }
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
      },
      onCheckpoint: (checkpoint) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'checkpoint',
          payload: { sessionId, checkpoint }
        });
      },
      onSwarmState: (state) => {
        mainWindow?.webContents.send('agent:event', {
          type: 'swarmState',
          payload: { sessionId, state }
        });
      }
    });
  });

  ipcMain.handle('agent:stop', (_event, sessionId: string) => {
    return abortExecution(sessionId);
  });

  ipcMain.handle('agent:steer', (_event, { sessionId, message }: { sessionId: string; message: string }) => {
    return steerExecution(sessionId, message);
  });

  ipcMain.handle('agent:replyQuestion', (_event, { sessionId, response }: { sessionId: string; response: string }) => {
    return submitUserResponse(sessionId, response);
  });

  ipcMain.handle('agent:sendTerminalInput', (_event, { sessionId, input }: { sessionId: string; input: string }) => {
    return submitTerminalInput(sessionId, input);
  });

  // Autonomous Scheduler IPC (v1.6.0)
  ipcMain.handle('scheduler:getTasks', async (_event, workspacePath?: string | null) => {
    return schedulerManager.getTasks(workspacePath);
  });

  ipcMain.handle('scheduler:saveTask', async (_event, taskData) => {
    return schedulerManager.saveTask(taskData);
  });

  ipcMain.handle('scheduler:deleteTask', async (_event, taskId: string) => {
    return schedulerManager.deleteTask(taskId);
  });

  ipcMain.handle('scheduler:toggleTask', async (_event, { taskId, enabled }: { taskId: string; enabled: boolean }) => {
    return schedulerManager.toggleTask(taskId, enabled);
  });

  ipcMain.handle('scheduler:runNow', async (_event, { taskId, workspacePath }: { taskId: string; workspacePath?: string }) => {
    return await schedulerManager.runNow(taskId, workspacePath);
  });

  ipcMain.handle('scheduler:getReports', async (_event, workspacePath: string | null) => {
    return schedulerManager.getReports(workspacePath);
  });

  ipcMain.handle('scheduler:readReport', async (_event, filePath: string) => {
    return schedulerManager.readReport(filePath);
  });

  // Enterprise Hub & Verification (v1.7.0)
  ipcMain.handle('enterprise-hub:getState', async () => {
    return enterpriseHubManager.getState();
  });

  ipcMain.handle('enterprise-hub:import', async (_event, options: any) => {
    return await enterpriseHubManager.importExtension(options);
  });

  ipcMain.handle('enterprise-hub:toggle', async (_event, { id, enabled }: { id: string; enabled: boolean }) => {
    return enterpriseHubManager.toggleExtension(id, enabled);
  });

  ipcMain.handle('enterprise-hub:uninstall', async (_event, id: string) => {
    return enterpriseHubManager.uninstallExtension(id);
  });

  // Cross-Workspace Knowledge Graph (v1.7.0)
  ipcMain.handle('knowledge-graph:getWorkspaces', async () => {
    return knowledgeGraphManager.getWorkspacesInfo();
  });

  ipcMain.handle('knowledge-graph:registerWorkspace', async (_event, workspacePath: string) => {
    knowledgeGraphManager.registerWorkspace(workspacePath);
  });

  ipcMain.handle('knowledge-graph:unregisterWorkspace', async (_event, workspacePath: string) => {
    knowledgeGraphManager.unregisterWorkspace(workspacePath);
  });

  ipcMain.handle('knowledge-graph:searchSymbols', async (_event, { query, maxResults }: { query: string; maxResults?: number }) => {
    return knowledgeGraphManager.searchSymbols(query, maxResults);
  });

  // Security Fence & Data Redaction (v1.7.0)
  ipcMain.handle('security-fence:getConfig', async () => {
    return securityFenceManager.getConfig();
  });

  ipcMain.handle('security-fence:saveConfig', async (_event, config: any) => {
    securityFenceManager.saveConfig(config);
  });

  ipcMain.handle('security-fence:getAuditLogs', async () => {
    return securityFenceManager.getAuditLogs();
  });

  ipcMain.handle('security-fence:testSanitize', async (_event, text: string) => {
    return securityFenceManager.sanitizeText(text);
  });

  ipcMain.handle('security-fence:recordBypass', async (_event, sensitiveItems: any[]) => {
    return securityFenceManager.recordBypass(sensitiveItems);
  });

  // Auto-Updater (v1.9.0)
  ipcMain.handle('auto-updater:getStatus', async () => {
    return autoUpdaterManager.getStatus();
  });

  ipcMain.handle('auto-updater:getConfig', async () => {
    return autoUpdaterManager.getConfig();
  });

  ipcMain.handle('auto-updater:saveConfig', async (_event, newConfig: any) => {
    return autoUpdaterManager.saveConfig(newConfig);
  });

  ipcMain.handle('auto-updater:checkForUpdates', async (_event, customServerUrl?: string) => {
    return autoUpdaterManager.checkForUpdates(customServerUrl);
  });

  ipcMain.handle('auto-updater:startDownload', async () => {
    return autoUpdaterManager.startDownload();
  });

  ipcMain.handle('auto-updater:installAndRestart', async (_event, silent = true) => {
    return autoUpdaterManager.installAndRestart(silent);
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

    schedulerManager.start();
    schedulerManager.onEvent((payload) => {
      mainWindow?.webContents.send('scheduler:event', payload);
    });

    autoUpdaterManager.onEvent((payload) => {
      mainWindow?.webContents.send('auto-updater:event', payload);
    });

    if (autoUpdaterManager.getConfig().autoCheck) {
      setTimeout(() => {
        autoUpdaterManager.checkForUpdates().catch(err => {
          console.warn('[AutoUpdater] Silent check failed:', err);
        });
      }, 3000);
    }

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
    schedulerManager.stop();
    globalShortcut.unregisterAll();
  });
}
