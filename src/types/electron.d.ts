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
  getProjectRules: (workspacePath: string | null) => Promise<{ hasRules: boolean; filePath: string | null; ruleType: 'asteamrules' | 'asteam_rules_file' | 'asteam_md' | 'none'; content: string }>;
  saveProjectRules: (workspacePath: string, content: string) => Promise<{ success: boolean; filePath: string; message: string }>;
  getRulePresets: () => Promise<Array<{ id: string; name: string; description: string; template: string }>>;

  // Shadow Checkpoint & Rollback (v1.4.0)
  listCheckpoints: (workspacePath: string | null, sessionId?: string) => Promise<any[]>;
  rollbackCheckpoint: (checkpointId: string, workspacePath: string | null) => Promise<{ success: boolean; message: string; restoredFiles: string[]; removedFiles: string[] }>;

  // MCP Management (v1.5.0)
  getMcpServersStatus: () => Promise<Array<{
    name: string;
    status: 'connected' | 'connecting' | 'error' | 'disconnected';
    transportType: 'stdio' | 'sse';
    tools: Array<{
      serverName: string;
      name: string;
      fullName: string;
      description: string;
      parameters: Record<string, any>;
    }>;
    error?: string;
    lastConnectedAt?: number;
  }>>;
  reloadMcpServers: (customMcpConfig: string, workspacePath: string | null) => Promise<any[]>;
  testMcpServer: (name: string, config: any, workspacePath: string | null) => Promise<{ success: boolean; tools?: any[]; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
