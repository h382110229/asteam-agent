export interface Project {
  id: string;
  name: string;
  path: string;
  isExpanded: boolean;
  createdAt: number;
  gitBranch?: string;
  gitChangesCount?: {
    files: number;
    additions: number;
    deletions: number;
  };
}

export interface ProjectSession {
  id: string;
  projectId: string; // 'general' or specific project id
  title: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
  isUnread?: boolean;
  model?: string;
}

export interface McpToolConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isBuiltin: boolean;
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isBuiltin: boolean;
  promptSnippet?: string;
}

export type ExecutionMode = 'auto_edit' | 'plan_only' | 'safe_approval';

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface GitStatusSummary {
  branch: string;
  isGitRepo: boolean;
  files: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}
