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
  bypassed?: boolean;
  blockReason?: string;
}

export interface CustomerAssetConfig {
  enabled: boolean;
  customerNames: string[];        // 客户名称与全称列表 (如: ["招商银行", "中国移动"])
  projectCodes: string[];         // 内部项目代号列表 (如: ["Project-Apollo", "核心骨干改造"])
  sensitiveLogoPatterns: string[];// 敏感 Logo 文件关键词 (如: ["*logo*", "*badge*"])
  bidirectionalMapping: boolean; // 是否开启交付物自动逆向翻译还原 (网关/模型接收保真脱敏别名，交付物恢复真实名称与IP)
}

export interface SecurityFenceConfig {
  mode: SecurityFenceMode;
  enabledRules: {
    apiKeys: boolean;
    privateIps: boolean;
    dbConnections: boolean;
    privateKeys: boolean;
    phoneNumbers: boolean;
    customerAssets: boolean;
  };
  customerAssets: CustomerAssetConfig;
  whitelistPatterns: string[];
}

export class SecurityFenceManager {
  private static instance: SecurityFenceManager;
  private configFilePath: string;
  private auditLogFilePath: string;
  private config: SecurityFenceConfig;
  private auditLogs: SecurityFenceAuditRecord[] = [];
  // 运行时双向保真映射字典 (Obfuscated Alias -> Original Secret)
  private sessionMapping: Map<string, string> = new Map();

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
        phoneNumbers: true,
        customerAssets: true
      },
      customerAssets: {
        enabled: true,
        customerNames: [],
        projectCodes: [],
        sensitiveLogoPatterns: ['*logo*', '*client_badge*'],
        bidirectionalMapping: true
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

    const recordRedaction = (original: string, type: string, placeholderPrefix: string, customPlaceholder?: string): string => {
      // 检查白名单
      for (const white of this.config.whitelistPatterns) {
        if (original.includes(white)) return original;
      }

      let item = redactedMap.get(original);
      if (!item) {
        const placeholder = customPlaceholder || `<${placeholderPrefix}_REDACTED_${placeholderCounter++}>`;
        item = { type, original, placeholder, count: 1 };
        redactedMap.set(original, item);
        this.sessionMapping.set(placeholder, original);
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

    // 2. Private IP Addresses (支持保真网络拓扑映射，避免破坏路由规划)
    if (this.config.enabledRules.privateIps) {
      const isBiMap = this.config.customerAssets?.bidirectionalMapping;
      // 10.x.x.x -> 101.2.x.x (保持子网掩码与主机拓扑)
      sanitized = sanitized.replace(/\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g, m => {
        const mapped = isBiMap ? `101.2.${m.split('.')[2]}.${m.split('.')[3]}` : undefined;
        return recordRedaction(m, '内网私有 IP (10.x)', 'PRIVATE_IP', mapped);
      });
      // 172.16-31.x.x -> 172.100.x.x
      sanitized = sanitized.replace(/\b(172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/g, m => {
        const mapped = isBiMap ? `172.100.${m.split('.')[2]}.${m.split('.')[3]}` : undefined;
        return recordRedaction(m, '内网私有 IP (172.x)', 'PRIVATE_IP', mapped);
      });
      // 192.168.x.x -> 192.200.x.x
      sanitized = sanitized.replace(/\b(192\.168\.\d{1,3}\.\d{1,3})\b/g, m => {
        const mapped = isBiMap ? `192.200.${m.split('.')[2]}.${m.split('.')[3]}` : undefined;
        return recordRedaction(m, '内网私有 IP (192.168.x)', 'PRIVATE_IP', mapped);
      });
    }

    // 3. Database Connection Credentials
    if (this.config.enabledRules.dbConnections) {
      sanitized = sanitized.replace(/(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/([^:]+):([^@\s]+)@/gi, (match, user, pass) => {
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

    // 6. 企业客户名称与内部项目代号 (Customer Names & Project Codes)
    if (this.config.enabledRules.customerAssets && this.config.customerAssets?.enabled) {
      const isBiMap = this.config.customerAssets?.bidirectionalMapping;
      const names = this.config.customerAssets.customerNames || [];
      for (let i = 0; i < names.length; i++) {
        const rawName = names[i]?.trim();
        if (!rawName) continue;
        const alias = isBiMap ? `客户${i + 1}` : `<CUSTOMER_NAME_${i + 1}>`;
        if (sanitized.includes(rawName)) {
          const count = sanitized.split(rawName).length - 1;
          sanitized = sanitized.split(rawName).join(alias);
          this.sessionMapping.set(alias, rawName);
          redactedMap.set(rawName, {
            type: '企业客户名称 (Customer Name)',
            original: rawName,
            placeholder: alias,
            count
          });
        }
      }

      const codes = this.config.customerAssets.projectCodes || [];
      for (let i = 0; i < codes.length; i++) {
        const rawCode = codes[i]?.trim();
        if (!rawCode) continue;
        const alias = isBiMap ? `项目${String.fromCharCode(65 + i)}` : `<PROJECT_CODE_${i + 1}>`;
        if (sanitized.includes(rawCode)) {
          const count = sanitized.split(rawCode).length - 1;
          sanitized = sanitized.split(rawCode).join(alias);
          this.sessionMapping.set(alias, rawCode);
          redactedMap.set(rawCode, {
            type: '企业项目代号 (Project Code)',
            original: rawCode,
            placeholder: alias,
            count
          });
        }
      }
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
  /**
   * 记录用户主动确认的出境放行审计日志（Bypass Audit）
   */
  public recordBypass(sensitiveItems: RedactedItemDetail[]): void {
    if (!sensitiveItems || sensitiveItems.length === 0) return;
    const totalCount = sensitiveItems.reduce((acc, i) => acc + i.count, 0);
    const record: SecurityFenceAuditRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      mode: this.config.mode,
      redactedItems: sensitiveItems,
      totalSensitiveCount: totalCount,
      blocked: false,
      bypassed: true,
      blockReason: '用户发送前主动确认豁免放行 (Bypassed by User)'
    };
    this.auditLogs.push(record);
    this.saveAuditLogs();
  }

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

  /**
   * 交付物写入前合规检测与占位执行
   */
  public inspectAndEnforce(text: string, bypass: boolean = false): { blocked: boolean; blockReason?: string; sanitizedText: string } {
    if (bypass || this.config.mode === 'disabled') {
      return { blocked: false, sanitizedText: text };
    }
    const res = this.sanitizeText(text);
    return {
      blocked: res.isBlocked,
      blockReason: res.blockReason,
      sanitizedText: res.sanitized
    };
  }

  /**
   * 交付物双向保真翻译还原：将出境脱敏时生成的 IP 拓扑别名、客户别名等还原为真实企业资产
   */
  public restoreDeliverableText(text: string): string {
    if (!text || this.sessionMapping.size === 0) return text;
    let restored = text;
    for (const [alias, original] of this.sessionMapping.entries()) {
      restored = restored.split(alias).join(original);
    }
    return restored;
  }
}

export const securityFenceManager = SecurityFenceManager.getInstance();
