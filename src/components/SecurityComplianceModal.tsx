import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Network,
  Lock,
  EyeOff,
  Search,
  Key,
  Database,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  History,
  X,
  Play,
  Layers,
  FolderGit2
} from 'lucide-react';

interface SecurityComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath?: string | null;
}

export const SecurityComplianceModal: React.FC<SecurityComplianceModalProps> = ({ isOpen, onClose, workspacePath }) => {
  const [activeTab, setActiveTab] = useState<'fence' | 'sandbox' | 'graph' | 'logs'>('fence');
  const [fenceConfig, setFenceConfig] = useState<any>({
    mode: 'redact',
    enabledRules: {
      apiKeys: true,
      privateIps: true,
      dbConnections: true,
      privateKeys: true,
      phoneNumbers: true
    },
    whitelistPatterns: ['127.0.0.1', 'localhost']
  });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sandbox state
  const [testInput, setTestInput] = useState(
    '请帮我排查内部数据库连接问题，连接串为 postgres://postgres:SecretPassword123@192.168.1.120:5432/user_db，API Key 为 sk-98127391823791827391823718923719823，管理员手机 13800138000'
  );
  const [testResult, setTestResult] = useState<any>(null);

  // Symbol Search state
  const [symbolQuery, setSymbolQuery] = useState('');
  const [symbolResults, setSymbolResults] = useState<any[]>([]);

  const loadData = async () => {
    const api = (window as any).electronAPI;
    if (!api) return;

    try {
      if (api.getSecurityFenceConfig) {
        const cfg = await api.getSecurityFenceConfig();
        if (cfg) setFenceConfig(cfg);
      }
      if (api.getSecurityFenceAuditLogs) {
        const logs = await api.getSecurityFenceAuditLogs();
        setAuditLogs(logs || []);
      }
      if (api.getKnowledgeGraphWorkspaces) {
        const ws = await api.getKnowledgeGraphWorkspaces();
        setWorkspaces(ws || []);
      }
    } catch (e) {
      console.error('Failed to load compliance data:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveConfig = async () => {
    const api = (window as any).electronAPI;
    if (!api?.saveSecurityFenceConfig) return;

    try {
      await api.saveSecurityFenceConfig(fenceConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error('Failed to save fence config:', e);
    }
  };

  const handleRunSandbox = async () => {
    const api = (window as any).electronAPI;
    if (!api?.testSanitizeText) return;

    try {
      const res = await api.testSanitizeText(testInput);
      setTestResult(res);
    } catch (e) {
      console.error('Sandbox error:', e);
    }
  };

  const handleSearchSymbols = async (query: string) => {
    setSymbolQuery(query);
    const api = (window as any).electronAPI;
    if (!api?.searchKnowledgeSymbols || !query.trim()) {
      setSymbolResults([]);
      return;
    }

    try {
      const results = await api.searchKnowledgeSymbols(query, 12);
      setSymbolResults(results || []);
    } catch (e) {
      console.error('Failed to search symbols:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="flex h-[620px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm dark:bg-purple-500">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  跨工作区知识图谱与数据安全围栏 (Knowledge & Security Fence)
                </h2>
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  v1.7.0 出境防护
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                出境请求实时脱敏过滤 · 跨工程微服务契约倒排索引 · 拦截审计与防外泄围栏
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-6 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex gap-2">
            {[
              { id: 'fence', label: '安全出境围栏', icon: Lock },
              { id: 'sandbox', label: '实时脱敏沙盒模拟', icon: EyeOff },
              { id: 'graph', label: `跨工作区联合图谱 (${workspaces.length})`, icon: Network },
              { id: 'logs', label: `拦截审计日志 (${auditLogs.length})`, icon: History }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-purple-600 text-white shadow-xs dark:bg-purple-500'
                      : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {saveSuccess && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>配置已保存生效</span>
            </span>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 1. Security Fence Settings */}
          {activeTab === 'fence' && (
            <div className="max-w-2xl space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  LLM 请求出境安全防御模式
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      id: 'redact',
                      title: '智能脱敏占位 (推荐)',
                      desc: '自动替换敏感值为语义占位符，保持语法结构完整且资产不出境'
                    },
                    {
                      id: 'block',
                      title: '严格拦截阻断',
                      desc: '一旦检出任何 API Key 或私网地址，直接中断请求并抛出告警'
                    },
                    {
                      id: 'disabled',
                      title: '已禁用围栏',
                      desc: '不作拦截过滤（仅供内网私有模型调测时使用）'
                    }
                  ].map(m => (
                    <div
                      key={m.id}
                      onClick={() => setFenceConfig({ ...fenceConfig, mode: m.id })}
                      className={`cursor-pointer rounded-xl border p-3.5 text-xs transition-all ${
                        fenceConfig.mode === m.id
                          ? 'border-purple-500 bg-purple-50/50 text-purple-900 shadow-xs dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-200'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-semibold">{m.title}</div>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  敏感资产扫描规则开关
                </label>
                <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  {[
                    { key: 'apiKeys', label: '主流 API 密钥 (OpenAI / Gemini / Claude / GitHub / AWS)', icon: Key },
                    { key: 'privateIps', label: '企业内网私有 IPv4 地址 (10.x / 172.16-31.x / 192.168.x)', icon: Network },
                    { key: 'dbConnections', label: '数据库直连口令 (Postgres / MySQL / MongoDB / Redis)', icon: Database },
                    { key: 'privateKeys', label: 'RSA / ECC 证书私钥块 (BEGIN PRIVATE KEY)', icon: Lock },
                    { key: 'phoneNumbers', label: '中国大陆手机号码 (PII 隐私防泄露)', icon: Smartphone }
                  ].map(rule => {
                    const Icon = rule.icon;
                    const checked = fenceConfig.enabledRules?.[rule.key] ?? true;
                    return (
                      <label key={rule.key} className="flex items-center justify-between py-1 text-xs cursor-pointer">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <Icon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span>{rule.label}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e =>
                            setFenceConfig({
                              ...fenceConfig,
                              enabledRules: {
                                ...fenceConfig.enabledRules,
                                [rule.key]: e.target.checked
                              }
                            })
                          }
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  IP 白名单 (以逗号分隔，匹配项不予拦截)
                </label>
                <input
                  type="text"
                  value={(fenceConfig.whitelistPatterns || []).join(', ')}
                  onChange={e =>
                    setFenceConfig({
                      ...fenceConfig,
                      whitelistPatterns: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-mono"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveConfig}
                  className="rounded-lg bg-purple-600 px-5 py-2 text-xs font-semibold text-white hover:bg-purple-700"
                >
                  保存安全围栏策略
                </button>
              </div>
            </div>
          )}

          {/* 2. Sandbox Redaction Simulator */}
          {activeTab === 'sandbox' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  输入包含敏感数据的测试 Prompt / 源码切片
                </label>
                <textarea
                  rows={4}
                  value={testInput}
                  onChange={e => setTestInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 font-mono focus:border-purple-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleRunSandbox}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>执行出境脱敏模拟</span>
                </button>
              </div>

              {testResult && (
                <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/20 p-4 dark:border-purple-900/50 dark:bg-purple-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      实时脱敏输出 ({testResult.redactedItems?.length || 0} 处捕获)
                    </span>
                    {testResult.isBlocked && (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                        触发严格阻断模式
                      </span>
                    )}
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-200 whitespace-pre-wrap break-all">
                    {testResult.sanitized}
                  </div>

                  {testResult.redactedItems?.length > 0 && (
                    <div className="pt-2">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        敏感资产捕获明细映射表：
                      </span>
                      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {testResult.redactedItems.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-md border border-purple-100 bg-white px-2.5 py-1.5 text-[11px] dark:border-purple-950 dark:bg-slate-800"
                          >
                            <span className="font-semibold text-purple-700 dark:text-purple-300">{item.type}</span>
                            <span className="font-mono text-slate-500">{item.placeholder}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Cross-Workspace Knowledge Graph */}
          {activeTab === 'graph' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    已联合索引的协同工作区 ({workspaces.length})
                  </span>
                  {workspacePath && (
                    <button
                      onClick={async () => {
                        const api = (window as any).electronAPI;
                        if (api?.registerKnowledgeWorkspace) {
                          await api.registerKnowledgeWorkspace(workspacePath);
                          await loadData();
                        }
                      }}
                      className="rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300"
                    >
                      + 将当前工作区加入联合图谱
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {workspaces.map((ws: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FolderGit2 className="h-5 w-5 shrink-0 text-purple-600 dark:text-purple-400" />
                        <div className="truncate">
                          <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">{ws.name}</div>
                          <div className="text-[11px] text-slate-400 truncate">{ws.workspacePath}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-semibold text-purple-600 dark:text-purple-400">{ws.symbolsCount}</span>
                        <span className="text-[10px] text-slate-400 block">个代码符号</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  跨仓库符号依赖实时查询 (Class / Interface / Type / Function)
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="输入类名、接口名或服务名称，例如 UserService, AuthToken, Config..."
                    value={symbolQuery}
                    onChange={e => handleSearchSymbols(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>

                {symbolResults.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                    {symbolResults.map((s: any, idx: number) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/70"
                      >
                        <div className="flex items-center justify-between pb-1">
                          <span className="font-semibold text-purple-700 dark:text-purple-300 font-mono">
                            {s.kind} {s.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">行: {s.line}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {s.snippet}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Audit Logs */}
          {activeTab === 'logs' && (
            <div className="space-y-2">
              {auditLogs.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center text-center text-slate-400">
                  <ShieldCheck className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-xs font-medium">暂无敏感数据出境拦截记录</p>
                </div>
              ) : (
                auditLogs.slice().reverse().map((log: any) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          拦截脱敏: {log.totalSensitiveCount} 处敏感资产
                        </span>
                        <span className="rounded bg-purple-100 px-1.5 py-0.2 text-[10px] font-semibold text-purple-700 dark:bg-purple-950 dark:text-purple-300 uppercase">
                          {log.mode}
                        </span>
                        {log.blocked && (
                          <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                            已中断调用
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {log.redactedItems?.map((item: any, idx: number) => (
                          <span key={idx} className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                            {item.type} ({item.count}次)
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
