import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;

  // Workspace & Projects
  selectWorkspaceDirectory: () => Promise<string | null>;
  listWorkspaceFiles: (dirPath: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;

  // Git operations
  getGitStatus: (repoPath: string) => Promise<any>;
  getFileDiff: (repoPath: string, relPath: string) => Promise<string>;
  discardFileChange: (repoPath: string, relPath: string) => Promise<boolean>;

  // Skills
  getAllSkills: (workspacePath: string | null) => Promise<any[]>;
  installSkillFromFile: () => Promise<any>;
  installSkillFromContent: (data: { id: string; name: string; description: string; prompt: string }) => Promise<any>;
  installSkillFromUrl: (url: string) => Promise<any>;
  deleteSkill: (skillId: string) => Promise<boolean>;

  // Agent Harness
  startAgent: (sessionId: string, config: any, history: any[]) => Promise<void>;
  stopAgent: (sessionId: string) => Promise<boolean>;
  replyQuestion: (sessionId: string, response: string) => Promise<boolean>;
  sendTerminalInput: (sessionId: string, input: string) => Promise<boolean>;
  onAgentEvent: (callback: (data: { type: string; payload: any }) => void) => () => void;

  // App & System settings
  getOpenAtLogin: () => Promise<boolean>;
  setOpenAtLogin: (openAtLogin: boolean) => Promise<boolean>;

  // Multimodal Preview Pop-out
  popoutPreview: (data: { type: string; title?: string; content: string }) => Promise<boolean>;

  // Native Clipboard & File Dialog
  copyImage: (dataUrl: string) => Promise<boolean>;
  saveFile: (options: { defaultName: string; content: string; isBase64?: boolean }) => Promise<boolean>;

  // External System & Browser Actions
  openExternal: (url: string) => Promise<boolean>;
  showItemInFolder: (filePath: string) => Promise<boolean>;
  openPath: (targetPath: string) => Promise<boolean>;
  openInBrowser: (options: { content: string; title?: string; defaultPath?: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>;

  // Storage Hub (v1.3.0)
  getStorageStats: () => Promise<any>;
  selectDataDirectory: () => Promise<string | null>;
  setDataRootDir: (newPath: string) => Promise<{ success: boolean; rootDir: string; error?: string }>;
  migrateStorageData: () => Promise<{ success: boolean; migratedSkills: number; migratedWorkspaceFiles: number; message: string }>;

  // Memory Bank (v1.3.0)
  getMemoryContext: (workspacePath: string | null) => Promise<{ userProfile: string; globalMemory: string; projectMemory: string; projectMemoryPath: string | null }>;
  saveMemoryContent: (type: 'project' | 'profile' | 'global', content: string, workspacePath: string | null) => Promise<{ success: boolean; message: string }>;
  addMemoryFact: (scope: 'project' | 'global', fact: string, workspacePath: string | null) => Promise<{ success: boolean; targetPath: string; message: string }>;
  parseMemoryCommand: (text: string) => Promise<{ isCommand: boolean; fact?: string }>;

  // Context & File Indexing (v1.4.0)
  indexWorkspaceFiles: (dirPath: string) => Promise<Array<{ name: string; relPath: string; ext: string }>>;
  readWorkspaceFile: (workspacePath: string, relPath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  getGitDiffSummary: (repoPath: string) => Promise<{ branch: string; statusText: string; diffText: string }>;

  // Project Rules (v1.4.0)
  getProjectRules: (workspacePath: string | null) => Promise<{ hasRules: boolean; filePath: string | null; ruleType: string; content: string }>;
  saveProjectRules: (workspacePath: string, content: string) => Promise<{ success: boolean; filePath: string; message: string }>;
  getRulePresets: () => Promise<Array<{ id: string; name: string; description: string; template: string }>>;

  // Shadow Checkpoint & Rollback (v1.4.0)
  listCheckpoints: (workspacePath: string | null, sessionId?: string) => Promise<any[]>;
  rollbackCheckpoint: (checkpointId: string, workspacePath: string | null) => Promise<{ success: boolean; message: string; restoredFiles: string[]; removedFiles: string[] }>;
}

const api: ElectronAPI = {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  selectWorkspaceDirectory: () => ipcRenderer.invoke('workspace:selectDirectory'),
  listWorkspaceFiles: (dirPath: string) => ipcRenderer.invoke('workspace:listFiles', dirPath),
  indexWorkspaceFiles: (dirPath: string) => ipcRenderer.invoke('workspace:indexFiles', dirPath),
  readWorkspaceFile: (workspacePath: string, relPath: string) => ipcRenderer.invoke('workspace:readFileContent', { workspacePath, relPath }),

  getGitStatus: (repoPath: string) => ipcRenderer.invoke('git:getStatus', repoPath),
  getFileDiff: (repoPath: string, relPath: string) => ipcRenderer.invoke('git:getFileDiff', { repoPath, relPath }),
  discardFileChange: (repoPath: string, relPath: string) => ipcRenderer.invoke('git:discardChange', { repoPath, relPath }),
  getGitDiffSummary: (repoPath: string) => ipcRenderer.invoke('git:getDiffSummary', repoPath),

  getAllSkills: (workspacePath: string | null) => ipcRenderer.invoke('skills:getAll', workspacePath),
  installSkillFromFile: () => ipcRenderer.invoke('skills:installFromFile'),
  installSkillFromContent: (data) => ipcRenderer.invoke('skills:installFromContent', data),
  installSkillFromUrl: (url) => ipcRenderer.invoke('skills:installFromUrl', url),
  deleteSkill: (skillId) => ipcRenderer.invoke('skills:delete', skillId),

  startAgent: (sessionId, config, history) => ipcRenderer.invoke('agent:start', { sessionId, config, history }),
  stopAgent: (sessionId) => ipcRenderer.invoke('agent:stop', sessionId),
  replyQuestion: (sessionId, response) => ipcRenderer.invoke('agent:replyQuestion', { sessionId, response }),
  sendTerminalInput: (sessionId, input) => ipcRenderer.invoke('agent:sendTerminalInput', { sessionId, input }),
  onAgentEvent: (callback) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:event', subscription);
    return () => {
      ipcRenderer.removeListener('agent:event', subscription);
    };
  },

  getOpenAtLogin: () => ipcRenderer.invoke('app:getOpenAtLogin'),
  setOpenAtLogin: (openAtLogin) => ipcRenderer.invoke('app:setOpenAtLogin', openAtLogin),
  popoutPreview: (data) => ipcRenderer.invoke('preview:popout', data),
  copyImage: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  openInBrowser: (options) => ipcRenderer.invoke('shell:openInBrowser', options),

  // Storage Hub (v1.3.0)
  getStorageStats: () => ipcRenderer.invoke('storage:getStats'),
  selectDataDirectory: () => ipcRenderer.invoke('storage:selectDataDir'),
  setDataRootDir: (newPath) => ipcRenderer.invoke('storage:setDataRootDir', newPath),
  migrateStorageData: () => ipcRenderer.invoke('storage:migrateData'),

  // Memory Bank (v1.3.0)
  getMemoryContext: (workspacePath) => ipcRenderer.invoke('memory:getAll', workspacePath),
  saveMemoryContent: (type, content, workspacePath) => ipcRenderer.invoke('memory:saveContent', { type, content, workspacePath }),
  addMemoryFact: (scope, fact, workspacePath) => ipcRenderer.invoke('memory:addFact', { scope, fact, workspacePath }),
  parseMemoryCommand: (text) => ipcRenderer.invoke('memory:parseCommand', text),

  // Context & File Indexing (v1.4.0)
  // Project Rules (v1.4.0)
  getProjectRules: (workspacePath) => ipcRenderer.invoke('rules:get', workspacePath),
  saveProjectRules: (workspacePath, content) => ipcRenderer.invoke('rules:save', { workspacePath, content }),
  getRulePresets: () => ipcRenderer.invoke('rules:getPresets'),

  // Shadow Checkpoint & Rollback (v1.4.0)
  listCheckpoints: (workspacePath, sessionId) => ipcRenderer.invoke('checkpoint:list', { workspacePath, sessionId }),
  rollbackCheckpoint: (checkpointId, workspacePath) => ipcRenderer.invoke('checkpoint:rollback', { checkpointId, workspacePath })
};

contextBridge.exposeInMainWorld('electronAPI', api);
