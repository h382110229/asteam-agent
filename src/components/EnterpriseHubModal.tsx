import React, { useState, useEffect } from 'react';
import {
  Building2,
  Package,
  ShieldCheck,
  ShieldAlert,
  DownloadCloud,
  FileArchive,
  GitBranch,
  ExternalLink,
  Trash2,
  Power,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Search,
  X
} from 'lucide-react';

interface EnterpriseHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EnterpriseHubModal: React.FC<EnterpriseHubModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'installed' | 'import'>('installed');
  const [hubState, setHubState] = useState<any>({ extensions: [] });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  // Import form state
  const [sourceType, setSourceType] = useState<'zip' | 'git' | 'npm'>('zip');
  const [sourcePathOrUrl, setSourcePathOrUrl] = useState('');
  const [targetId, setTargetId] = useState('');
  const [branch, setBranch] = useState('main');
  const [expectedHash, setExpectedHash] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadState = async () => {
    if (!(window as any).electronAPI?.getEnterpriseHubState) return;
    try {
      setLoading(true);
      const state = await (window as any).electronAPI.getEnterpriseHubState();
      setHubState(state || { extensions: [] });
    } catch (err: any) {
      console.error('Failed to load enterprise hub state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadState();
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourcePathOrUrl.trim()) return;

    try {
      setLoading(true);
      setFeedback(null);
      const item = await (window as any).electronAPI.importEnterpriseExtension({
        sourceType,
        sourcePathOrUrl: sourcePathOrUrl.trim(),
        targetId: targetId.trim() || undefined,
        branch: sourceType === 'git' ? branch : undefined,
        expectedHash: expectedHash.trim() || undefined
      });
      setFeedback({
        success: true,
        msg: `成功导入企业扩展「${item.name}」，已计算 SHA-256 签名并完成权限沙盒扫描！`
      });
      setSourcePathOrUrl('');
      setTargetId('');
      setExpectedHash('');
      await loadState();
      setActiveTab('installed');
    } catch (err: any) {
      setFeedback({ success: false, msg: `导入失败: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      await (window as any).electronAPI.toggleEnterpriseExtension(id, !currentEnabled);
      await loadState();
    } catch (err: any) {
      setFeedback({ success: false, msg: `状态切换失败: ${err.message}` });
    }
  };

  const handleUninstall = async (id: string, name: string) => {
    if (!confirm(`确定卸载企业私有扩展「${name}」？此操作将移除本地离线缓存。`)) return;
    try {
      await (window as any).electronAPI.uninstallEnterpriseExtension(id);
      setFeedback({ success: true, msg: `已成功卸载「${name}」` });
      await loadState();
    } catch (err: any) {
      setFeedback({ success: false, msg: `卸载失败: ${err.message}` });
    }
  };

  const filteredExtensions = (hubState.extensions || []).filter((ext: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ext.name?.toLowerCase().includes(q) ||
      ext.id?.toLowerCase().includes(q) ||
      ext.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="flex h-[620px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm dark:bg-teal-500">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  企业级私有扩展中心 (Enterprise Private Hub)
                </h2>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  v1.7.0 安全合规
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                支持私有 Git / npm / 离线 ZIP 一键安全导入 · SHA-256 签名防篡改 · 权限沙盒隔离
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
            <button
              onClick={() => setActiveTab('installed')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'installed'
                  ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500'
                  : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>已安装企业扩展 ({hubState.extensions?.length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'import'
                  ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500'
                  : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <DownloadCloud className="h-4 w-4" />
              <span>导入私有扩展 / 技能</span>
            </button>
          </div>

          {activeTab === 'installed' && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="检索已安装组件..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-7.5 w-48 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`flex items-center gap-2 px-6 py-2 text-xs font-medium ${
              feedback.success
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            {feedback.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'installed' ? (
            filteredExtensions.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                <Package className="h-12 w-12 stroke-1 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">暂未安装企业私有扩展</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  支持从内部私有 Git 仓库、内部 npm 镜像或离线 ZIP 归档包导入团队专属 MCP 插件与自定技能。
                </p>
                <button
                  onClick={() => setActiveTab('import')}
                  className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
                >
                  立即导入第一个扩展
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredExtensions.map((ext: any) => {
                  const isEnabled = ext.enabled;
                  const isCaution = ext.security?.securityLevel === 'caution';
                  const isDanger = ext.security?.securityLevel === 'danger';

                  return (
                    <div
                      key={ext.id}
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                        isEnabled
                          ? 'border-teal-200 bg-teal-50/20 dark:border-teal-900/50 dark:bg-teal-950/10'
                          : 'border-slate-200 bg-white opacity-70 dark:border-slate-800 dark:bg-slate-800/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-800 dark:text-slate-100">{ext.name}</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                v{ext.version}
                              </span>
                              <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 uppercase">
                                {ext.type === 'mcp_server' ? 'MCP 服务' : '企业技能'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                              {ext.description}
                            </p>
                          </div>

                          <button
                            onClick={() => handleToggle(ext.id, isEnabled)}
                            className={`rounded-lg p-1.5 transition-colors ${
                              isEnabled
                                ? 'bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800'
                            }`}
                            title={isEnabled ? '禁用扩展' : '启用扩展'}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Permissions & Security Badges */}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {isDanger ? (
                            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                              <ShieldAlert className="h-3 w-3" /> 高危指令警告
                            </span>
                          ) : isCaution ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              <ShieldAlert className="h-3 w-3" /> 涉及系统进程
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <ShieldCheck className="h-3 w-3" /> 签名安全合规
                            </span>
                          )}

                          {(ext.security?.requestedPermissions || []).map((perm: string) => (
                            <span
                              key={perm}
                              className="rounded border border-slate-200 px-1.5 py-0.2 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>

                        {/* SHA-256 Hash Digest */}
                        <div className="mt-2.5 rounded bg-slate-100/80 px-2 py-1 font-mono text-[10px] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400 truncate">
                          SHA256: {ext.security?.sha256Hash || '计算中...'}
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
                        <span className="truncate max-w-[200px]" title={ext.sourceUri}>
                          源: {ext.sourceType}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUninstall(ext.id, ext.name)}
                            className="rounded p-1 text-slate-400 hover:text-red-500"
                            title="卸载扩展"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <form onSubmit={handleImport} className="space-y-5 max-w-xl mx-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  选择导入来源渠道
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'zip', label: '离线 ZIP 归档包', icon: FileArchive },
                    { id: 'git', label: '企业私有 Git', icon: GitBranch },
                    { id: 'npm', label: '内部 npm 镜像', icon: Package }
                  ].map(tab => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSourceType(tab.id as any)}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-3.5 text-xs font-medium transition-all ${
                          sourceType === tab.id
                            ? 'border-teal-500 bg-teal-50/50 text-teal-700 shadow-xs dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  {sourceType === 'zip' ? '本地 ZIP 绝对路径' : sourceType === 'git' ? 'Git 仓库地址 (SSH / HTTPS)' : 'npm 模块名称 (如 @corp/mcp-server)'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    sourceType === 'zip'
                      ? 'D:\\releases\\internal-mcp-v1.zip'
                      : sourceType === 'git'
                      ? 'git@gitlab.internal.corp:devops/asteam-tools.git'
                      : '@corp/custom-analysis-tool'
                  }
                  value={sourcePathOrUrl}
                  onChange={e => setSourcePathOrUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-mono"
                />
              </div>

              {sourceType === 'git' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    分支 / Tag 名称
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    自定义组件 ID (可选)
                  </label>
                  <input
                    type="text"
                    placeholder="如 finance_db_mcp"
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    预期 SHA-256 签名 (可选校验)
                  </label>
                  <input
                    type="text"
                    placeholder="留空则以解包哈希为信任基线"
                    value={expectedHash}
                    onChange={e => setExpectedHash(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  <ShieldCheck className="h-4 w-4 text-teal-600" />
                  <span>自动化安全验签流程</span>
                </div>
                导入后系统将自动执行解包、静态权限分析（`fs:read/write`、`shell:exec`、`net:outbound`）并计算 SHA-256 完整性摘要。若检出破坏性高危指令将自动阻止启用。
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('installed')}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  返回列表
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>开始导入并验签</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
