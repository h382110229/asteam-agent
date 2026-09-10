export type EnterpriseExtensionType = 'mcp_server' | 'skill';

export type EnterpriseExtensionSourceType = 'zip' | 'git' | 'npm' | 'local_dir';

export type SecurityPermission =
  | 'fs:read'
  | 'fs:write'
  | 'net:outbound'
  | 'shell:exec'
  | 'env:secrets';

export type SecurityAuditLevel = 'trusted' | 'caution' | 'danger';

export interface EnterpriseExtensionSecurityManifest {
  requestedPermissions: SecurityPermission[];
  detectedRisks: string[];
  securityLevel: SecurityAuditLevel;
  sha256Hash: string;
  signatureVerified: boolean;
  signer?: string;
  verifiedAt: number;
}

export interface EnterpriseExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  type: EnterpriseExtensionType;
  author?: string;
  homepage?: string;
  entry?: string; // command or script path
  args?: string[];
  env?: Record<string, string>;
  permissions?: SecurityPermission[];
  expectedSha256?: string;
  signature?: string;
}

export interface EnterpriseExtensionItem {
  id: string;
  name: string;
  version: string;
  description: string;
  type: EnterpriseExtensionType;
  enabled: boolean;
  sourceType: EnterpriseExtensionSourceType;
  sourceUri: string;
  installDir: string;
  installedAt: number;
  updatedAt: number;
  security: EnterpriseExtensionSecurityManifest;
  manifest: EnterpriseExtensionManifest;
  cachedOffline: boolean;
}

export interface ImportExtensionOptions {
  sourceType: EnterpriseExtensionSourceType;
  sourcePathOrUrl: string;
  targetId?: string;
  branch?: string;
  npmRegistry?: string;
  expectedHash?: string;
}

export interface EnterpriseHubState {
  extensions: EnterpriseExtensionItem[];
  trustedRegistries: string[];
  offlineMode: boolean;
  lastSyncTime: number;
}
