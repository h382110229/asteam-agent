export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;

  selectWorkspaceDirectory: () => Promise<string | null>;
  listWorkspaceFiles: (dirPath: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;

  startAgent: (sessionId: string, config: any, history: any[]) => Promise<void>;
  stopAgent: (sessionId: string) => Promise<boolean>;
  onAgentEvent: (callback: (data: { type: string; payload: any }) => void) => () => void;

  getOpenAtLogin: () => Promise<boolean>;
  setOpenAtLogin: (openAtLogin: boolean) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
