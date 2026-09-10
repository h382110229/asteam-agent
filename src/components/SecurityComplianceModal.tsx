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
  FolderGit2,
  FileCheck2,
  Printer,
  ExternalLink,
  Loader2,
  Sparkles,
  CalendarClock,
  ArrowRight
} from 'lucide-react';

interface SecurityComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath?: string | null;
  onPreviewReport?: (title: string, content: string, filePath?: string) => void;
}

export const SecurityComplianceModal: React.FC<SecurityComplianceModalProps> = ({
  isOpen,
  onClose,
  workspacePath,
  onPreviewReport
}) => {
  const [activeTab, setActiveTab] = useState<'fence' | 'sandbox' | 'graph' | 'logs' | 'compliance'>('fence');
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

  // Compliance Inspection & Report states
  const [complianceReports, setComplianceReports] = useState<any[]>([]);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [runningComplianceAudit, setRunningComplianceAudit] = useState(false);
  const [complianceToast, setComplianceToast] = useState<string | null>(null);
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);

  const handlePreviewReportItem = async (rep: any) => {
    if (!onPreviewReport) return;
    const api = (window as any).electronAPI;
    const reportKey = rep.id || rep.fileName || rep.filePath || 'report';
    setOpeningReportId(reportKey);

    try {
      // 优先读取 HTML 版本的自包含全景审计报表
      const pathToHtml = rep.htmlReportPath || (rep.filePath ? rep.filePath.replace(/\.md$/, '.html') : '');
      let content = rep.content;
      let usedPath = pathToHtml;

      if (!content && api?.readInspectionReport && pathToHtml) {
        try {
          const res = await api.readInspectionReport(pathToHtml);
          if (res?.success && res?.content) {
            content = res.content;
          }
        } catch (e) {
          console.warn('Failed to read html report:', e);
        }
      }

      // 如果 HTML 读取未成功，回退读取 Markdown 报告
      if (!content && api?.readInspectionReport && rep.filePath) {
        try {
          const res = await api.readInspectionReport(rep.filePath);
          if (res?.success && res?.content) {
            content = res.content;
            usedPath = rep.filePath;
          }
        } catch (e) {
          console.warn('Failed to read markdown report:', e);
        }
      }

      if (!content) {
        content = `<div style="padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc; background-color: #0f172a; min-height: 100vh;">
          <h2 style="color: #ef4444; margin-bottom: 12px;">⚠️ 审计报告内容未能加载</h2>
          <p style="color: #94a3b8; font-size: 13px;">尝试读取路径: <code>${pathToHtml || rep.filePath || '未知'}</code></p>
          <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">请确认该报告文件是否存在于本地 <code>.asteam/reports/</code> 目录中。</p>
        </div>`;
      }

      const isHtml = content.includes('<html') || usedPath?.endsWith('.html');
      const baseName = rep.fileName || rep.taskName || rep.title || '企业合规巡检审计报表';
      const reportTitle = baseName.replace(/\.(md|html)$/, '') + (isHtml ? '.html' : '.md');

      onPreviewReport(reportTitle, content, usedPath || rep.filePath);
    } catch (err) {
      console.error('Error previewing report:', err);
    } finally {
      setOpeningReportId(null);
    }
  };

  const handleOpenInBrowser = async (rep: any) => {
    const api = (window as any).electronAPI;
    const pathToHtml = rep.htmlReportPath || (rep.filePath ? rep.filePath.replace(/\.md$/, '.html') : '');
    const targetPath = pathToHtml || rep.filePath;
    let content = rep.content;

    if (!content && api?.readInspectionReport && targetPath) {
      try {
        const res = await api.readInspectionReport(targetPath);
        if (res?.success && res?.content) {
          content = res.content;
        }
      } catch {}
    }

    if (!content && api?.readInspectionReport && rep.filePath && rep.filePath !== targetPath) {
      try {
        const res = await api.readInspectionReport(rep.filePath);
        if (res?.success && res?.content) {
          content = res.content;
        }
      } catch {}
    }

    const baseName = rep.fileName || rep.taskName || rep.title || '企业合规审计报告';
    const title = baseName.replace(/\.(md|html)$/, '') + '.html';

    if (api?.openInBrowser) {
      await api.openInBrowser({
        content: content || '',
        title,
        defaultPath: pathToHtml || rep.filePath
      });
    } else if (content) {
      const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  };

  const loadComplianceReports = async () => {
    const api = (window as any).electronAPI;
    if (!api?.getInspectionReports) return;
    setLoadingCompliance(true);
    try {
      const reports = await api.getInspectionReports(workspacePath || null);
      if (Array.isArray(reports)) {
        const compReports = reports.filter((r: any) => r.taskType === 'enterprise_compliance' || r.title?.includes('企业') || r.title?.includes('合规'));
        setComplianceReports(compReports.length > 0 ? compReports : reports);
      }
    } catch (e) {
      console.warn('Failed to load compliance reports:', e);
    } finally {
      setLoadingCompliance(false);
    }
  };

  const handleRunComplianceAudit = async () => {
    const api = (window as any).electronAPI;
    if (!api?.runScheduledTaskNow) return;
    setRunningComplianceAudit(true);
    setComplianceToast('正在启动企业资产安全与合规审计引擎...');
    try {
      let targetTaskId = 'task-preset-compliance';
      if (api.getScheduledTasks) {
        try {
          const allTasks = await api.getScheduledTasks(workspacePath || null);
          const compTask = allTasks?.find((t: any) => t.type === 'enterprise_compliance' || t.id === 'task-preset-compliance');
          if (compTask) {
            targetTaskId = compTask.id;
          }
        } catch {}
      }
      const rep = await api.runScheduledTaskNow(targetTaskId, workspacePath || undefined);
      if (rep) {
        setComplianceToast(`合规审计完成！得分: ${rep.score} 分 (${rep.status.toUpperCase()})`);
        await loadComplianceReports();
      } else {
        setComplianceToast('审计任务已执行完毕');
      }
    } catch (e: any) {
      setComplianceToast(`审计执行失败: ${e.message || '未知错误'}`);
    } finally {
      setRunningComplianceAudit(false);
      setTimeout(() => setComplianceToast(null), 4000);
    }
  };

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
      loadComplianceReports();
      setSaveSuccess(false);
    }
  }, [isOpen, workspacePath]);

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
                  v1.7.1 出境防护与合规审计
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                出境请求实时脱敏过滤 · 跨工程微服务契约倒排索引 · 企业合规体检与审计报告
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
              { id: 'compliance', label: `合规审计与报告 (${complianceReports.length})`, icon: FileCheck2 },
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

          {/* 4. Enterprise Compliance Audit & Reports (v1.7.1) */}
          {activeTab === 'compliance' && (
            <div className="space-y-4">
              {/* Top Action Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-purple-200/80 bg-gradient-to-r from-purple-50 via-slate-50 to-teal-50/50 p-4 dark:border-purple-900/40 dark:from-purple-950/20 dark:via-slate-900/40 dark:to-teal-950/20 shadow-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                      企业代码资产与出境合规自动化审计
                    </span>
                    <span className="rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 px-2 py-0.5 text-[10px] font-semibold">
                      离线就地体检
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    涵盖：工作区行为准则（.asteamrules）、全库敏感密钥/IP扫描、图谱倒排索引完整度与出境围栏状态
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunComplianceAudit}
                  disabled={runningComplianceAudit}
                  className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-purple-700 active:scale-98 transition-all disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {runningComplianceAudit ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>正在全量体检...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>一键执行全量合规审计</span>
                    </>
                  )}
                </button>
              </div>

              {/* Toast Feedback */}
              {complianceToast && (
                <div className="flex items-center gap-2 rounded-xl border border-purple-300/80 bg-purple-50 px-3.5 py-2 text-xs font-medium text-purple-800 dark:border-purple-800/80 dark:bg-purple-950/40 dark:text-purple-300 animate-in fade-in duration-200 shadow-2xs">
                  <CheckCircle2 className="h-4 w-4 text-purple-600 shrink-0" />
                  <span>{complianceToast}</span>
                </div>
              )}

              {/* Reports List / Cards */}
              {complianceReports.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400 mb-3 shadow-xs">
                    <FileCheck2 className="h-7 w-7" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    尚未生成工作区合规审计报告
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
                    点击上方按钮启动自动化审计引擎，系统将自动审查工作区安全基线并产出自包含企业级 HTML 报表。
                  </p>
                  <button
                    type="button"
                    onClick={handleRunComplianceAudit}
                    disabled={runningComplianceAudit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:bg-slate-800 dark:text-purple-300 dark:hover:bg-slate-700 transition-colors shadow-2xs cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>立即开始首次体检</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 px-1">
                    <span>历史合规体检记录 ({complianceReports.length})</span>
                    <button
                      type="button"
                      onClick={loadComplianceReports}
                      className="text-[11px] text-purple-600 hover:underline dark:text-purple-400 cursor-pointer"
                    >
                      刷新列表
                    </button>
                  </div>

                  {complianceReports.map((rep: any, idx: number) => {
                    const isLatest = idx === 0;
                    const score = rep.score ?? 90;
                    const scoreColor =
                      score >= 95
                        ? 'text-emerald-600 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : score >= 80
                        ? 'text-amber-600 border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400'
                        : 'text-rose-600 border-rose-500/30 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400';

                    return (
                      <div
                        key={rep.id || idx}
                        className={`rounded-2xl border p-4 transition-all shadow-xs ${
                          isLatest
                            ? 'border-purple-300/80 bg-white dark:border-purple-900/60 dark:bg-slate-800/80'
                            : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/30'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            {/* Score badge */}
                            <div className={`flex flex-col items-center justify-center h-12 w-12 rounded-xl border font-bold text-base shrink-0 shadow-2xs ${scoreColor}`}>
                              <span>{score}</span>
                              <span className="text-[8px] font-normal uppercase tracking-wider opacity-70">分</span>
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                                  {rep.title || '企业合规巡检审计报表'}
                                </span>
                                {isLatest && (
                                  <span className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 px-2 py-0.2 text-[10px] font-semibold">
                                    最新结果
                                  </span>
                                )}
                                <span className="rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] px-1.5 py-0.5 font-mono">
                                  {rep.status?.toUpperCase() || 'COMPLETED'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                {rep.summary || '已对工作区准则文件、安全围栏配置与敏感资产进行深度扫描并汇总审计'}
                              </p>
                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-mono">
                                <span>审计时间: {rep.timestamp ? new Date(rep.timestamp < 10000000000 ? rep.timestamp * 1000 : rep.timestamp).toLocaleString('zh-CN', { hour12: false }) : '刚刚'}</span>
                                {rep.durationMs && (
                                  <span>耗时: {(rep.durationMs / 1000).toFixed(2)}s</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            {onPreviewReport && (
                              <button
                                type="button"
                                onClick={() => handlePreviewReportItem(rep)}
                                disabled={openingReportId === (rep.id || rep.fileName || rep.filePath)}
                                className="flex items-center gap-1.5 rounded-lg border border-purple-300/80 bg-purple-50/50 px-2.5 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                                title="关闭弹窗并在右侧工作台开启大屏多模态全景预览"
                              >
                                {openingReportId === (rep.id || rep.fileName || rep.filePath) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ExternalLink className="h-3.5 w-3.5" />
                                )}
                                <span>在工作台预览全景</span>
                              </button>
                            )}

                            {(rep.content || rep.filePath || rep.htmlReportPath) && (
                              <button
                                type="button"
                                onClick={() => handleOpenInBrowser(rep)}
                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-2xs"
                                title="在外部浏览器打开并可直接打印或另存为 PDF"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                <span>浏览器 / 打印 PDF</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. Audit Logs */}
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
