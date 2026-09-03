import React, { useState } from 'react';
import {
  X,
  Server,
  Key,
  Cpu,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Command,
  Wrench,
  Sparkles,
  Globe,
  GitBranch,
  Terminal,
  ShieldCheck,
  TestTube2,
  Brush,
  FileCheck2,
  Code2
} from 'lucide-react';
import {
  PROVIDER_PRESETS,
  AppSettings
} from '../config/providers';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<'provider' | 'mcp_skills' | 'desktop'>('provider');
  const [form, setForm] = useState<AppSettings>({
    ...settings,
    enabledMcpTools: settings.enabledMcpTools || ['web_fetch', 'git_operations', 'system_inspector'],
    enabledSkills: settings.enabledSkills || ['code_review', 'unit_test', 'git_commit_helper'],
    customMcpConfig: settings.customMcpConfig || '{\n  "mcpServers": {}\n}'
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');

  if (!isOpen) return null;

  const currentPreset = PROVIDER_PRESETS.find(p => p.id === form.providerId) || PROVIDER_PRESETS[0];

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const preset = PROVIDER_PRESETS.find(p => p.id === selectedId);
    if (preset) {
      setForm(prev => ({
        ...prev,
        providerId: preset.id,
        baseUrl: preset.baseUrl,
        model: preset.defaultModel || (preset.models[0]?.id ?? '')
      }));
    }
  };

  const handleTestConnection = async () => {
    if (!form.baseUrl) {
      setTestStatus('failed');
      setTestMessage('请先配置 Base URL 接口地址');
      return;
    }
    setTestStatus('testing');
    setTestMessage('正在连接接口并验证...');

    try {
      const url = `${form.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (form.apiKey) {
        headers['Authorization'] = `Bearer ${form.apiKey}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: form.model || 'Auto',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5
        })
      });

      if (res.ok) {
        setTestStatus('success');
        setTestMessage('接口连通测试成功！响应正常。');
      } else {
        const text = await res.text();
        setTestStatus('failed');
        setTestMessage(`接口返回状态 ${res.status}: ${text.slice(0, 150)}`);
      }
    } catch (err: any) {
      setTestStatus('failed');
      setTestMessage(`网络连接异常: ${err.message}`);
    }
  };

  const handleToggleMcpTool = (toolId: string) => {
    setForm(prev => {
      const current = prev.enabledMcpTools || [];
      const updated = current.includes(toolId)
        ? current.filter(id => id !== toolId)
        : [...current, toolId];
      return { ...prev, enabledMcpTools: updated };
    });
  };

  const handleToggleSkill = (skillId: string) => {
    setForm(prev => {
      const current = prev.enabledSkills || [];
      const updated = current.includes(skillId)
        ? current.filter(id => id !== skillId)
        : [...current, skillId];
      return { ...prev, enabledSkills: updated };
    });
  };

  const handleToggleAutoLaunch = async (checked: boolean) => {
    setForm(prev => ({ ...prev, openAtLogin: checked }));
    if (window.electronAPI) {
      await window.electronAPI.setOpenAtLogin(checked);
    }
  };

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center space-x-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary)] text-white text-xs font-bold">
              A
            </span>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              ASTeam Agent 设置
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border)] px-5 bg-[var(--background)]/60">
          <button
            type="button"
            onClick={() => setActiveTab('provider')}
            className={`flex items-center space-x-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'provider'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>AI 模型与供应商</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mcp_skills')}
            className={`flex items-center space-x-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'mcp_skills'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>MCP 工具与技能库</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`flex items-center space-x-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'desktop'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>桌面与系统原生能力</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'provider' && (
            <div className="space-y-4 text-xs">
              {/* Preset Selector */}
              <div>
                <label className="block font-medium text-[var(--foreground)] mb-1">
                  选择模型供应商预设
                </label>
                <select
                  value={form.providerId}
                  onChange={handleProviderChange}
                  className="w-full rounded-lg border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  {PROVIDER_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.id === 'asteam-llmapi' ? '(默认推荐)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Base URL */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-medium text-[var(--foreground)] flex items-center space-x-1">
                    <Server className="h-3 w-3 text-[var(--primary)]" />
                    <span>接口地址 (Base URL)</span>
                  </label>
                  {form.providerId === 'asteam-llmapi' && (
                    <span className="rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                      默认预设
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={e => setForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-lg border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] font-mono text-xs"
                />
              </div>

              {/* Model Selection */}
              <div>
                <label className="block font-medium text-[var(--foreground)] mb-1 flex items-center space-x-1">
                  <Cpu className="h-3 w-3 text-[var(--primary)]" />
                  <span>模型名称 (Model)</span>
                </label>
                {currentPreset.models.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={form.model}
                      onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    >
                      {currentPreset.models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    {currentPreset.models.find(m => m.id === form.model)?.description && (
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        ℹ️ {currentPreset.models.find(m => m.id === form.model)?.description}
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={form.model}
                    onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
                    placeholder="输入模型标识，如 deepseek-chat / gpt-4o"
                    className="w-full rounded-lg border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] font-mono text-xs"
                  />
                )}
              </div>

              {/* API Key */}
              <div>
                <label className="block font-medium text-[var(--foreground)] mb-1 flex items-center space-x-1">
                  <Key className="h-3 w-3 text-[var(--primary)]" />
                  <span>API Key (本地安全持久化)</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full rounded-lg border border-[var(--input)] bg-[var(--card)] px-3 py-2 pr-9 text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Test Connection Button & Status */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
                >
                  {testStatus === 'testing' ? '正在测试...' : '测试接口连通性'}
                </button>

                {testStatus === 'success' && (
                  <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-[var(--primary)]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{testMessage}</span>
                  </div>
                )}
                {testStatus === 'failed' && (
                  <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-[var(--error)]">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{testMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'mcp_skills' && (
            <div className="space-y-5 text-xs">
              {/* Built-in MCP Tools Section */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 font-semibold text-[var(--foreground)]">
                  <Wrench className="h-3.5 w-3.5 text-[var(--primary)]" />
                  <span>内置常用 MCP 工具（开箱即用，按需开启）</span>
                </div>

                <div className="space-y-2">
                  {[
                    {
                      id: 'web_fetch',
                      name: '网页正文抓取 (Web Fetch)',
                      desc: '实时抓取在线技术文档或网页内容，自动去除广告并解析为清洁 Markdown',
                      icon: <Globe className="h-4 w-4 text-blue-500" />
                    },
                    {
                      id: 'git_operations',
                      name: 'Git 版本控制工具集 (Git Helper)',
                      desc: '允许 Agent 检查 Git 仓库状态、获取最近代码提交历史及文件级 Diff 差异',
                      icon: <GitBranch className="h-4 w-4 text-purple-500" />
                    },
                    {
                      id: 'system_inspector',
                      name: '系统环境诊断 (System Inspector)',
                      desc: '查询宿主操作系统、CPU/内存状况、Node.js 与运行环境诊断信息',
                      icon: <Terminal className="h-4 w-4 text-emerald-500" />
                    }
                  ].map(tool => {
                    const isEnabled = form.enabledMcpTools.includes(tool.id);
                    return (
                      <div
                        key={tool.id}
                        onClick={() => handleToggleMcpTool(tool.id)}
                        className={`flex items-start justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                          isEnabled
                            ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                            : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)]'
                        }`}
                      >
                        <div className="flex items-start space-x-2.5">
                          <div className="mt-0.5">{tool.icon}</div>
                          <div className="space-y-0.5">
                            <span className="font-semibold text-[var(--foreground)]">{tool.name}</span>
                            <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">{tool.desc}</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-[var(--input)] text-[var(--primary)] focus:ring-[var(--primary)] mt-0.5"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Built-in Skills Section */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 font-semibold text-[var(--foreground)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
                  <span>内置专家 Skill 技能库</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: 'code_review',
                      name: 'Code Review 专家',
                      desc: '遵循 OWASP Top 10 安全与防御性编程进行深度审查',
                      icon: <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
                    },
                    {
                      id: 'unit_test',
                      name: '单元测试生成',
                      desc: '自动寻找匹配测试框架，生成高覆盖率单测用例',
                      icon: <TestTube2 className="h-4 w-4 text-amber-500" />
                    },
                    {
                      id: 'refactor_clean',
                      name: 'Clean Code 重构',
                      desc: '遵循 SOLID 原则消除代码坏味道与架构坏疽',
                      icon: <Brush className="h-4 w-4 text-emerald-500" />
                    },
                    {
                      id: 'git_commit_helper',
                      name: '规范 Commit 助手',
                      desc: '根据代码 Diff 自动生成 Conventional Commits 提交语',
                      icon: <FileCheck2 className="h-4 w-4 text-indigo-500" />
                    }
                  ].map(skill => {
                    const isEnabled = form.enabledSkills.includes(skill.id);
                    return (
                      <div
                        key={skill.id}
                        onClick={() => handleToggleSkill(skill.id)}
                        className={`flex items-start justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isEnabled
                            ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                            : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)]'
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          <div className="mt-0.5">{skill.icon}</div>
                          <div className="space-y-0.5">
                            <span className="font-semibold text-[var(--foreground)]">{skill.name}</span>
                            <p className="text-[10px] text-[var(--muted-foreground)] line-clamp-2">{skill.desc}</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-[var(--input)] text-[var(--primary)] focus:ring-[var(--primary)] mt-0.5 shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-[var(--muted-foreground)] mt-1 italic">
                  💡 提示：在当前项目工作区根目录下创建 <code>.asteam/skills/*.md</code> 亦可自动加载团队自定义专属技能！
                </p>
              </div>

              {/* Custom MCP Servers JSON Config */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[var(--foreground)] flex items-center space-x-1.5">
                    <Code2 className="h-3.5 w-3.5 text-[var(--primary)]" />
                    <span>自定义外部 MCP 服务器配置 (mcpServers)</span>
                  </label>
                  <span className="text-[10px] text-[var(--muted-foreground)]">兼容 Claude Desktop 规范</span>
                </div>
                <textarea
                  rows={4}
                  value={form.customMcpConfig}
                  onChange={e => setForm(prev => ({ ...prev, customMcpConfig: e.target.value }))}
                  placeholder={`{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"]\n    }\n  }\n}`}
                  className="w-full rounded-lg border border-[var(--input)] bg-[var(--card)] p-2.5 text-[11px] font-mono text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'desktop' && (
            <div className="space-y-4 text-xs">
              {/* Native System Tray Behavior */}
              <div className="rounded-lg border border-[var(--border)] p-3.5 bg-[var(--background)]/50">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-[var(--foreground)]">
                      关闭窗口最小化至系统托盘
                    </span>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      点击标题栏关闭按钮时保持后台常驻，不中断 Agent 长时间任务执行。在托盘右键可彻底退出。
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.minimizeToTray}
                    onChange={e => setForm(prev => ({ ...prev, minimizeToTray: e.target.checked }))}
                    className="h-4 w-4 rounded border-[var(--input)] text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Startup Launch Setting */}
              <div className="rounded-lg border border-[var(--border)] p-3.5 bg-[var(--background)]/50">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-[var(--foreground)]">
                      开机自动启动
                    </span>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      随 Windows 系统开机自动启动并在系统托盘就绪。
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.openAtLogin}
                    onChange={e => handleToggleAutoLaunch(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--input)] text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Global Hotkey Info */}
              <div className="rounded-lg border border-[var(--border)] p-3.5 bg-[var(--background)]/50 space-y-2">
                <div className="flex items-center space-x-2">
                  <Command className="h-4 w-4 text-[var(--primary)]" />
                  <span className="font-semibold text-[var(--foreground)]">全局呼出热键</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    在任意界面呼出/隐藏 ASTeam Agent 主窗口
                  </span>
                  <kbd className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--foreground)] shadow-xs">
                    Ctrl + Shift + Space
                  </kbd>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end space-x-2 border-t border-[var(--border)] bg-[var(--background)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-xs"
          >
            保存并应用
          </button>
        </div>
      </div>
    </div>
  );
};
