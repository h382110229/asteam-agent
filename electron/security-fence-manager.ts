import fs from 'node:fs';
import path from 'node:path';
import { storageHub } from './storage-hub';

export type SecurityFenceMode = 'redact' | 'block' | 'disabled';

export interface RedactedItemDetail {
  type: string;
  original: string;
  placeholder: string;
  count: number;
}

export interface SecurityFenceAuditRecord {
  id: string;
  timestamp: number;
  mode: SecurityFenceMode;
  redactedItems: RedactedItemDetail[];
  totalSensitiveCount: number;
  blocked: boolean;
  blockReason?: string;
}

export interface SecurityFenceConfig {
  mode: SecurityFenceMode;
  enabledRules: {
    apiKeys: boolean;
    privateIps: boolean;
    dbConnections: boolean;
    privateKeys: boolean;
    phoneNumbers: boolean;
  };
  whitelistPatterns: string[];
}

export class SecurityFenceManager {
  private static instance: SecurityFenceManager;
  private configFilePath: string;
  private auditLogFilePath: string;
  private config: SecurityFenceConfig;
  private auditLogs: SecurityFenceAuditRecord[] = [];

  private constructor() {
    this.configFilePath = path.join(storageHub.getDataRootDir(), 'security_fence_config.json');
    this.auditLogFilePath = path.join(storageHub.getDataRootDir(), 'security_fence_audit.json');
    this.config = this.loadConfig();
    this.loadAuditLogs();
  }

  public static getInstance(): SecurityFenceManager {
    if (!SecurityFenceManager.instance) {
      SecurityFenceManager.instance = new SecurityFenceManager();
    }
    return SecurityFenceManager.instance;
  }

  private loadConfig(): SecurityFenceConfig {
    const defaultConfig: SecurityFenceConfig = {
      mode: 'redact', // 默认出境智能脱敏占位
      enabledRules: {
        apiKeys: true,
        privateIps: true,
        dbConnections: true,
        privateKeys: true,
        phoneNumbers: true
      },
      whitelistPatterns: ['127.0.0.1', 'localhost', '0.0.0.0']
    };

    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        return { ...defaultConfig, ...JSON.parse(raw) };
      }
    } catch {}

    return defaultConfig;
  }

  public saveConfig(newConfig: Partial<SecurityFenceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SecurityFenceManager] Failed to save config:', e);
    }
  }

  public getConfig(): SecurityFenceConfig {
    return { ...this.config };
  }

  private loadAuditLogs(): void {
    try {
      if (fs.existsSync(this.auditLogFilePath)) {
        const raw = fs.readFileSync(this.auditLogFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.auditLogs = parsed.slice(-200); // 保留最近 200 条
        }
      }
    } catch {}
  }

  private saveAuditLogs(): void {
    try {
      fs.writeFileSync(this.auditLogFilePath, JSON.stringify(this.auditLogs.slice(-200), null, 2), 'utf-8');
    } catch {}
  }

  public getAuditLogs(): SecurityFenceAuditRecord[] {
    return [...this.auditLogs];
  }

  /**
   * 核心脱敏过滤：对出境文本执行敏感资产扫描与占位脱敏
   */
  public sanitizeText(text: string): { sanitized: string; redactedItems: RedactedItemDetail[]; isBlocked: boolean; blockReason?: string } {
    if (this.config.mode === 'disabled' || !text) {
      return { sanitized: text, redactedItems: [], isBlocked: false };
    }

    let sanitized = text;
    const redactedMap: Map<string, RedactedItemDetail> = new Map();
    let placeholderCounter = 1;

    const recordRedaction = (original: string, type: string, placeholderPrefix: string): string => {
      // 检查白名单
      for (const white of this.config.whitelistPatterns) {
        if (original.includes(white)) return original;
      }

      let item = redactedMap.get(original);
      if (!item) {
        const placeholder = `<${placeholderPrefix}_REDACTED_${placeholderCounter++}>`;
        item = { type, original, placeholder, count: 1 };
        redactedMap.set(original, item);
      } else {
        item.count++;
      }
      return item.placeholder;
    };

    // 1. API Keys
    if (this.config.enabledRules.apiKeys) {
      sanitized = sanitized.replace(/sk-[a-zA-Z0-9]{20,}/g, m => recordRedaction(m, 'LLM API Key', 'API_KEY'));
      sanitized = sanitized.replace(/AIzaSy[a-zA-Z0-9_-]{33}/g, m => recordRedaction(m, 'Google Gemini Key', 'GEMINI_KEY'));
      sanitized = sanitized.replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, m => recordRedaction(m, 'Anthropic Key', 'ANTHROPIC_KEY'));
      sanitized = sanitized.replace(/ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{40,}/g, m => recordRedaction(m, 'GitHub Token', 'GITHUB_TOKEN'));
      sanitized = sanitized.replace(/AKIA[0-9A-Z]{16}/g, m => recordRedaction(m, 'AWS Access Key', 'AWS_KEY'));
    }

    // 2. Private IP Addresses
    if (this.config.enabledRules.privateIps) {
      // 10.x.x.x
      sanitized = sanitized.replace(/\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g, m => recordRedaction(m, '内网私有 IP (10.x)', 'PRIVATE_IP'));
      // 172.16-31.x.x
      sanitized = sanitized.replace(/\b(172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/g, m => recordRedaction(m, '内网私有 IP (172.x)', 'PRIVATE_IP'));
      // 192.168.x.x
      sanitized = sanitized.replace(/\b(192\.168\.\d{1,3}\.\d{1,3})\b/g, m => recordRedaction(m, '内网私有 IP (192.168.x)', 'PRIVATE_IP'));
    }

    // 3. Database Connection Credentials
    if (this.config.enabledRules.dbConnections) {
      sanitized = sanitized.replace(/(?:postgres|mysql|mongodb|redis):\/\/([^:]+):([^@\s]+)@/gi, (match, user, pass) => {
        const redactedPass = recordRedaction(pass, '数据库连接口令', 'DB_PASSWORD');
        return match.replace(pass, redactedPass);
      });
    }

    // 4. Private Keys
    if (this.config.enabledRules.privateKeys) {
      sanitized = sanitized.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, m =>
        recordRedaction(m, 'RSA/ECC 私钥证书', 'PRIVATE_KEY')
      );
    }

    // 5. Phone numbers
    if (this.config.enabledRules.phoneNumbers) {
      sanitized = sanitized.replace(/\b(1[3-9]\d{9})\b/g, m => recordRedaction(m, '手机号 (PII)', 'PHONE'));
    }

    const items = Array.from(redactedMap.values());
    const totalCount = items.reduce((sum, item) => sum + item.count, 0);

    let isBlocked = false;
    let blockReason: string | undefined;

    if (totalCount > 0 && this.config.mode === 'block') {
      isBlocked = true;
      blockReason = `[企业安全阻断] 检测到出境流量包含 ${totalCount} 处敏感资产信息（含 ${items.map(i => i.type).join('、')}），安全围栏已拦截发送。`;
    }

    // 记录审计日志
    if (totalCount > 0) {
      const record: SecurityFenceAuditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        mode: this.config.mode,
        redactedItems: items.map(i => ({
          type: i.type,
          original: `${i.original.slice(0, 3)}***${i.original.slice(-3)}`, // 审计日志中也不明文留存
          placeholder: i.placeholder,
          count: i.count
        })),
        totalSensitiveCount: totalCount,
        blocked: isBlocked,
        blockReason
      };
      this.auditLogs.push(record);
      this.saveAuditLogs();
    }

    return {
      sanitized,
      redactedItems: items,
      isBlocked,
      blockReason
    };
  }

  /**
   * 对一组 ChatMessage 出境消息执行整体脱敏
   */
  public sanitizeMessages(messages: Array<{ role: string; content: string }>): {
    sanitizedMessages: Array<{ role: string; content: string }>;
    totalRedactions: number;
    redactedSummary: string;
    isBlocked: boolean;
    blockReason?: string;
  } {
    let totalRedactions = 0;
    let isBlocked = false;
    let blockReason: string | undefined;
    const allDetails: RedactedItemDetail[] = [];

    const sanitizedMessages = messages.map(msg => {
      if (typeof msg.content !== 'string') return msg;
      const res = this.sanitizeText(msg.content);
      if (res.isBlocked) {
        isBlocked = true;
        blockReason = res.blockReason;
      }
      if (res.redactedItems.length > 0) {
        totalRedactions += res.redactedItems.reduce((acc, i) => acc + i.count, 0);
        allDetails.push(...res.redactedItems);
      }
      return { ...msg, content: res.sanitized };
    });

    let redactedSummary = '';
    if (totalRedactions > 0) {
      const types = Array.from(new Set(allDetails.map(d => d.type)));
      redactedSummary = `🛡️ [安全围栏已生效] 出境前已自动脱敏 ${totalRedactions} 处敏感资产 (${types.join('、')})`;
    }

    return {
      sanitizedMessages,
      totalRedactions,
      redactedSummary,
      isBlocked,
      blockReason
    };
  }
}

export const securityFenceManager = SecurityFenceManager.getInstance();
