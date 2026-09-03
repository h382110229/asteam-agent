import React, { useState, useEffect } from 'react';
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
  Code2,
  FileText,
  Presentation,
  Table2,
  Layers,
  Plus,
  Trash2,
  Download,
  Upload,
  Link2,
  FolderOpen
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
  workspacePath?: string | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  workspacePath = null
}) => {
  const [activeTab, setActiveTab] = useState<'provider' | 'mcp_skills' | 'desktop'>('provider');
  const [form, setForm] = useState<AppSettings>({
    ...settings,
    enabledMcpTools: settings.enabledMcpTools || ['web_fetch', 'git_operations', 'system_inspector'],
    enabledSkills: settings.enabledSkills || [
      'doc_generator',
      'ppt_outline_maker',
      'data_analysis_excel',
      'code_review',
      'unit_test',
      'git_commit_helper'
    ],
    customMcpConfig: settings.customMcpConfig || '{\n  "mcpServers": {}\n}'
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Skills state
  const [allSkills, setAllSkills] = useState<any[]>([]);
  const [showInstallSkillModal, setShowInstallSkillModal] = useState(false);
  const [installMode, setInstallMode] = useState<'file' | 'url' | 'custom'>('file');
  const [skillUrl, setSkillUrl] = useState('');
  const [newSkillForm, setNewSkillForm] = useState({
    id: '',
    name: '',
    description: '',
    prompt: ''
  });
  const [skillInstallMsg, setSkillInstallMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshSkills = async () => {
    if (window.electronAPI) {
      try {
        const skills = await window.electronAPI.getAllSkills(workspacePath);
        setAllSkills(skills);
      } catch {}
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshSkills();
    }
  }, [isOpen, workspacePath]);

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

  // Skill Installation Handlers
  const handleInstallFromFile = async () => {
    if (!window.electronAPI) return;
    try {
      const installed = await window.electronAPI.installSkillFromFile();
      if (installed) {
        await refreshSkills();
        setForm(prev => ({
          ...prev,
          enabledSkills: [...(prev.enabledSkills || []), installed.id]
        }));
        setSkillInstallMsg({ type: 'success', text: `成功安装技能: ${installed.name}` });
        setTimeout(() => {
          setShowInstallSkillModal(false);
          setSkillInstallMsg(null);
        }, 1200);
      }
    } catch (err: any) {
      setSkillInstallMsg({ type: 'error', text: `安装失败: ${err.message}` });
    }
  };

  const handleInstallFromUrl = async () => {
    if (!skillUrl.trim() || !window.electronAPI) return;
    try {
      const installed = await window.electronAPI.installSkillFromUrl(skillUrl.trim());
      if (installed) {
        await refreshSkills();
        setForm(prev => ({
          ...prev,
          enabledSkills: [...(prev.enabledSkills || []), installed.id]
        }));
        setSkillInstallMsg({ type: 'success', text: `成功从 URL 安装: ${installed.name}` });
        setSkillUrl('');
        setTimeout(() => {
          setShowInstallSkillModal(false);
          setSkillInstallMsg(null);
        }, 1200);
      }
    } catch (err: any) {
      setSkillInstallMsg({ type: 'error', text: `下载安装失败: ${err.message}` });
    }
  };

  const handleCreateCustomSkill = async () => {
    if (!newSkillForm.id.trim() || !newSkillForm.name.trim() || !newSkillForm.prompt.trim() || !window.electronAPI) {
      setSkillInstallMsg({ type: 'error', text: '请完整填写技能标识、名称与提示词内容' });
      return;
    }
    try {
      const installed = await window.electronAPI.installSkillFromContent(newSkillForm);
      if (installed) {
        await refreshSkills();
        setForm(prev => ({
          ...prev,
          enabledSkills: [...(prev.enabledSkills || []), installed.id]
        }));
        setSkillInstallMsg({ type: 'success', text: `成功创建自定义技能: ${installed.name}` });
        setNewSkillForm({ id: '', name: '', description: '', prompt: '' });
        setTimeout(() => {
          setShowInstallSkillModal(false);
          setSkillInstallMsg(null);
        }, 1200);
      }
    } catch (err: any) {
      setSkillInstallMsg({ type: 'error', text: `保存失败: ${err.message}` });
    }
  };

  const handleDeleteSkill = async (e: React.MouseEvent, skillId: string) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除此自定义技能吗？') || !window.electronAPI) return;
    try {
      await window.electronAPI.deleteSkill(skillId);
      await refreshSkills();
      setForm(prev => ({
        ...prev,
        enabledSkills: (prev.enabledSkills || []).filter(id => id !== skillId)
      }));
    } catch {}
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

  // Group skills
  const officeSkills = allSkills.filter(s => s.category === 'office');
  const devSkills = allSkills.filter(s => s.category === 'dev');
  const customSkills = allSkills.filter(s => !s.isBuiltin);

  const getSkillIcon = (id: string) => {
    if (id.includes('word_report') || id.includes('doc_generator')) return <FileText className="h-4 w-4 text-blue-500" />;
    if (id.includes('ppt_keynote') || id.includes('ppt_outline')) return <Presentation className="h-4 w-4 text-orange-500" />;
    if (id.includes('excel_master') || id.includes('data_analysis')) return <Table2 className="h-4 w-4 text-emerald-500" />;
    if (id.includes('meeting_action')) return <FileCheck2 className="h-4 w-4 text-pink-500" />;
    if (id.includes('api_architect')) return <Layers className="h-4 w-4 text-purple-500" />;
    if (id.includes('code_review')) return <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />;
    if (id.includes('unit_test')) return <TestTube2 className="h-4 w-4 text-amber-500" />;
    if (id.includes('refactor_clean')) return <Brush className="h-4 w-4 text-teal-500" />;
    if (id.includes('git_commit')) return <FileCheck2 className="h-4 w-4 text-indigo-500" />;
    return <Sparkles className="h-4 w-4 text-[var(--primary)]" />;
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
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
            <div className="space-y-6 text-xs">
              {/* 1. Skills Section with Visual Install Button */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-semibold text-[var(--foreground)]">
                    <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                    <span>Skill 技能扩展体系（Office 方案、数据分析与代码专家）</span>
                  </div>

                  {/* Visual Install Skill Button */}
                  <button
                    type="button"
                    onClick={() => setShowInstallSkillModal(true)}
                    className="inline-flex items-center space-x-1 rounded-lg bg-[var(--primary)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>安装 / 导入新技能</span>
                  </button>
                </div>

                {/* Subgroup: Office & 文档类技能 */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-[var(--muted-foreground)] block">
                    📑 Anthropic & MiniMax 官方融合 Office 办公四件套
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {officeSkills.map(skill => {
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
                            <div className="mt-0.5">{getSkillIcon(skill.id)}</div>
                            <div className="space-y-0.5">
                              <span className="font-semibold text-[var(--foreground)]">{skill.name}</span>
                              <p className="text-[10px] text-[var(--muted-foreground)] line-clamp-2">{skill.description}</p>
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
                </div>

                {/* Subgroup: 研发与代码质量技能 */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-[var(--muted-foreground)] block">
                    💻 软件研发与代码质量技能
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {devSkills.map(skill => {
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
                            <div className="mt-0.5">{getSkillIcon(skill.id)}</div>
                            <div className="space-y-0.5">
                              <span className="font-semibold text-[var(--foreground)]">{skill.name}</span>
                              <p className="text-[10px] text-[var(--muted-foreground)] line-clamp-2">{skill.description}</p>
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
                </div>

                {/* Subgroup: 用户已安装的自定义技能 (Custom Skills) */}
                {customSkills.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-[var(--muted-foreground)] block">
                      🧩 已安装的自定义技能库
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {customSkills.map(skill => {
                        const isEnabled = form.enabledSkills.includes(skill.id);
                        return (
                          <div
                            key={skill.id}
                            onClick={() => handleToggleSkill(skill.id)}
                            className={`group flex items-start justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              isEnabled
                                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                                : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)]'
                            }`}
                          >
                            <div className="flex items-start space-x-2 truncate pr-1">
                              <div className="mt-0.5"><Sparkles className="h-4 w-4 text-[var(--primary)]" /></div>
                              <div className="space-y-0.5 truncate">
                                <span className="font-semibold text-[var(--foreground)] block truncate">{skill.name}</span>
                                <p className="text-[10px] text-[var(--muted-foreground)] truncate">{skill.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 shrink-0 mt-0.5">
                              <button
                                type="button"
                                onClick={(e) => handleDeleteSkill(e, skill.id)}
                                title="删除自定义技能"
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--muted-foreground)] hover:text-[var(--error)]"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => {}}
                                className="h-3.5 w-3.5 rounded border-[var(--input)] text-[var(--primary)] focus:ring-[var(--primary)]"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Built-in MCP Tools Section */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
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

              {/* 3. Custom MCP Servers JSON Config */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[var(--foreground)] flex items-center space-x-1.5">
                    <Code2 className="h-3.5 w-3.5 text-[var(--primary)]" />
                    <span>自定义外部 MCP 服务器配置 (mcpServers)</span>
                  </label>
                  <span className="text-[10px] text-[var(--muted-foreground)]">兼容 Claude Desktop 规范</span>
                </div>
                <textarea
                  rows={3}
                  value={form.customMcpConfig}
                  onChange={e => setForm(prev => ({ ...prev, customMcpConfig: e.target.value }))}
                  placeholder={`{\n  "mcpServers": {}\n}`}
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

      {/* Visual Install / Create Custom Skill Modal */}
      {showInstallSkillModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="font-semibold text-sm text-[var(--foreground)]">安装 / 创建自定义技能</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowInstallSkillModal(false);
                  setSkillInstallMsg(null);
                }}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Install Method Tabs */}
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1 text-xs">
              <button
                type="button"
                onClick={() => setInstallMode('file')}
                className={`flex-1 rounded py-1.5 font-medium transition-colors ${
                  installMode === 'file' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs' : 'text-[var(--muted-foreground)]'
                }`}
              >
                从本地文件导入
              </button>
              <button
                type="button"
                onClick={() => setInstallMode('url')}
                className={`flex-1 rounded py-1.5 font-medium transition-colors ${
                  installMode === 'url' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs' : 'text-[var(--muted-foreground)]'
                }`}
              >
                在线 URL / GitHub 安装
              </button>
              <button
                type="button"
                onClick={() => setInstallMode('custom')}
                className={`flex-1 rounded py-1.5 font-medium transition-colors ${
                  installMode === 'custom' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs' : 'text-[var(--muted-foreground)]'
                }`}
              >
                可视化在线编写
              </button>
            </div>

            {/* Install Mode Contents */}
            <div className="space-y-3 text-xs">
              {installMode === 'file' && (
                <div className="space-y-3 py-2 text-center">
                  <div className="rounded-xl border border-dashed border-[var(--border)] p-6 bg-[var(--background)]/50 space-y-2">
                    <FolderOpen className="h-8 w-8 text-[var(--primary)] mx-auto" />
                    <p className="font-medium text-[var(--foreground)]">
                      选择本地现有的 Skill Markdown 文件 (.md)
                    </p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      系统将自动解析标题并将其安全安装至全局 <code>~/.asteam/skills/</code>
                    </p>
                    <button
                      type="button"
                      onClick={handleInstallFromFile}
                      className="inline-flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors shadow-xs"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>选择并导入 .md 文件</span>
                    </button>
                  </div>
                </div>
              )}

              {installMode === 'url' && (
                <div className="space-y-3 py-1">
                  <label className="block font-medium text-[var(--foreground)]">
                    Skill Markdown 文件的在线公开 URL (支持 GitHub Raw 链接)
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="url"
                      value={skillUrl}
                      onChange={e => setSkillUrl(e.target.value)}
                      placeholder="https://raw.githubusercontent.com/.../skill.md"
                      className="flex-1 rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 font-mono text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleInstallFromUrl}
                      disabled={!skillUrl.trim()}
                      className="inline-flex items-center space-x-1 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>下载安装</span>
                    </button>
                  </div>
                </div>
              )}

              {installMode === 'custom' && (
                <div className="space-y-2 py-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-[var(--foreground)] mb-1">技能标识 (ID)</label>
                      <input
                        type="text"
                        value={newSkillForm.id}
                        onChange={e => setNewSkillForm(prev => ({ ...prev, id: e.target.value }))}
                        placeholder="例如: api_tester"
                        className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--foreground)] mb-1">技能名称</label>
                      <input
                        type="text"
                        value={newSkillForm.name}
                        onChange={e => setNewSkillForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="例如: API 测试专家"
                        className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-[var(--foreground)] mb-1">技能简介</label>
                    <input
                      type="text"
                      value={newSkillForm.description}
                      onChange={e => setNewSkillForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="简短描述该技能的生效时机与核心职责"
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[var(--foreground)] mb-1">核心规则与系统指令 (Prompt)</label>
                    <textarea
                      rows={4}
                      value={newSkillForm.prompt}
                      onChange={e => setNewSkillForm(prev => ({ ...prev, prompt: e.target.value }))}
                      placeholder="请详细描述 Agent 激活此技能后应遵循的具体行动准则、输出格式规范与约束..."
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] p-2.5 font-mono text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleCreateCustomSkill}
                      className="inline-flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>保存并激活技能</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Status Message */}
              {skillInstallMsg && (
                <div
                  className={`flex items-center space-x-1.5 p-2 rounded-lg text-xs font-medium ${
                    skillInstallMsg.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-[var(--error)]/10 text-[var(--error)]'
                  }`}
                >
                  {skillInstallMsg.type === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  <span>{skillInstallMsg.text}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
