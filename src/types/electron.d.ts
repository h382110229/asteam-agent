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
  installSkillFromFolder: () => Promise<any>;
  getExtraSkillDirs: () => Promise<string[]>;
  addExtraSkillDir: () => Promise<{ success: boolean; dir?: string; extraDirs: string[] }>;
  removeExtraSkillDir: (dirPath: string) => Promise<{ success: boolean; extraDirs: string[] }>;
  installSkillFromContent: (data: { id: string; name: string; description: string; prompt: string }) => Promise<any>;
  installSkillFromUrl: (url: string) => Promise<any>;
  deleteSkill: (skillId: string) => Promise<boolean>;
  extractOfficeDocument: (fileName: string, uint8Array: Uint8Array) => Promise<{
    text: string;
    summary: string;
    charCount: number;
    type: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'unknown';
    extractedImages?: Array<{
      id: string;
      name: string;
      localPath: string;
      mimeType: string;
      size: number;
      base64?: string;
      locationHint?: string;
    }>;
  }>;

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

  // MCP Management (v1.5.0 / v1.8.1)
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
  getSavedMcpConfig: () => Promise<string>;
  reloadMcpServers: (customMcpConfig?: string, workspacePath?: string | null) => Promise<any[]>;
  testMcpServer: (name: string, config: any, workspacePath: string | null) => Promise<{ success: boolean; tools?: any[]; error?: string }>;

  // Autonomous Scheduler & Runner (v1.6.0)
  getScheduledTasks: (workspacePath?: string | null) => Promise<any[]>;
  saveScheduledTask: (taskData: any) => Promise<any>;
  deleteScheduledTask: (taskId: string) => Promise<boolean>;
  toggleScheduledTask: (taskId: string, enabled: boolean) => Promise<any>;
  runScheduledTaskNow: (taskId: string, workspacePath?: string) => Promise<any>;
  getInspectionReports: (workspacePath: string | null) => Promise<any[]>;
  readInspectionReport: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  onSchedulerEvent: (callback: (data: any) => void) => () => void;

  // Enterprise Hub & Verification (v1.7.0)
  getEnterpriseHubState?: () => Promise<any>;
  importEnterpriseExtension?: (options: any) => Promise<any>;
  toggleEnterpriseExtension?: (id: string, enabled: boolean) => Promise<any>;
  uninstallEnterpriseExtension?: (id: string) => Promise<boolean>;

  // Cross-Workspace Knowledge Graph (v1.7.0)
  getKnowledgeGraphWorkspaces?: () => Promise<any[]>;
  registerKnowledgeWorkspace?: (workspacePath: string) => Promise<void>;
  unregisterKnowledgeWorkspace?: (workspacePath: string) => Promise<void>;
  searchKnowledgeSymbols?: (query: string, maxResults?: number) => Promise<any[]>;

  // Security Fence & Data Redaction (v1.7.0 / v1.8.3)
  getSecurityFenceConfig?: () => Promise<any>;
  saveSecurityFenceConfig?: (config: any) => Promise<void>;
  getSecurityFenceAuditLogs?: () => Promise<any[]>;
  testSanitizeText?: (text: string) => Promise<{
    sanitized: string;
    redactedItems: Array<{
      type: string;
      original: string;
      placeholder: string;
      count: number;
    }>;
    isBlocked: boolean;
    blockReason?: string;
  }>;
  recordSecurityFenceBypass?: (sensitiveItems: any[]) => Promise<void>;

  // Auto-Updater (v1.9.0)
  getUpdateStatus?: () => Promise<{
    status: 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'installing' | 'error';
    updateInfo: any | null;
    error: string | null;
    downloadedFilePath: string | null;
  }>;
  getUpdateConfig?: () => Promise<{
    serverUrl: string;
    autoCheck: boolean;
    channel: string;
    lastCheckedAt?: number;
  }>;
  saveUpdateConfig?: (newConfig: any) => Promise<any>;
  checkForUpdates?: (customServerUrl?: string) => Promise<any>;
  startDownloadUpdate?: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
  installAndRestartUpdate?: (silent?: boolean) => Promise<{ success: boolean; error?: string }>;
  onUpdateEvent?: (callback: (data: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
