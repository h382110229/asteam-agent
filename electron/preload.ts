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

  // Agent Harness
  startAgent: (sessionId: string, config: any, history: any[]) => Promise<void>;
  stopAgent: (sessionId: string) => Promise<boolean>;
  onAgentEvent: (callback: (data: { type: string; payload: any }) => void) => () => void;

  // App & System settings
  getOpenAtLogin: () => Promise<boolean>;
  setOpenAtLogin: (openAtLogin: boolean) => Promise<boolean>;
}

const api: ElectronAPI = {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  selectWorkspaceDirectory: () => ipcRenderer.invoke('workspace:selectDirectory'),
  listWorkspaceFiles: (dirPath: string) => ipcRenderer.invoke('workspace:listFiles', dirPath),

  getGitStatus: (repoPath: string) => ipcRenderer.invoke('git:getStatus', repoPath),
  getFileDiff: (repoPath: string, relPath: string) => ipcRenderer.invoke('git:getFileDiff', { repoPath, relPath }),
  discardFileChange: (repoPath: string, relPath: string) => ipcRenderer.invoke('git:discardChange', { repoPath, relPath }),

  getAllSkills: (workspacePath: string | null) => ipcRenderer.invoke('skills:getAll', workspacePath),

  startAgent: (sessionId, config, history) => ipcRenderer.invoke('agent:start', { sessionId, config, history }),
  stopAgent: (sessionId) => ipcRenderer.invoke('agent:stop', sessionId),
  onAgentEvent: (callback) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:event', subscription);
    return () => {
      ipcRenderer.removeListener('agent:event', subscription);
    };
  },

  getOpenAtLogin: () => ipcRenderer.invoke('app:getOpenAtLogin'),
  setOpenAtLogin: (openAtLogin) => ipcRenderer.invoke('app:setOpenAtLogin', openAtLogin)
};

contextBridge.exposeInMainWorld('electronAPI', api);
