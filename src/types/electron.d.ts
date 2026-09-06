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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
