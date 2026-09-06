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
  popoutPreview: (data) => ipcRenderer.invoke('preview:popout', data)
};

contextBridge.exposeInMainWorld('electronAPI', api);
