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
  FolderOpen,
  Database,
  HardDrive,
  Brain,
  RefreshCw,
  ArrowRightLeft,
  ShieldAlert,
  Save,
  Check,
  ChevronDown,
  ChevronRight,
  Play,
  Zap,
  Activity
} from 'lucide-react';
import {
  PROVIDER_PRESETS,
  AppSettings,
  FallbackProviderConfig,
  DEFAULT_FALLBACK_PRESETS,
  inferModelCapabilities,
  ModelCapability
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
  const [activeTab, setActiveTab] = useState<'provider' | 'storage' | 'memory' | 'mcp_skills' | 'desktop'>('provider');
  const [form, setForm] = useState<AppSettings>({
    ...settings,
    enabledMcpTools: settings.enabledMcpTools || ['web_search', 'web_fetch', 'git_operations', 'system_inspector'],
    enabledSkills: settings.enabledSkills || [
      'doc_generator',
      'ppt_outline_maker',
      'data_analysis_excel',
      'code_review',
      'unit_test',
      'git_commit_helper'
    ],
    customMcpConfig: settings.customMcpConfig || '{\n  "mcpServers": {}\n}',
    fallbackProviders: settings.fallbackProviders || DEFAULT_FALLBACK_PRESETS
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Fallback providers test status map
  const [fallbackTestState, setFallbackTestState] = useState<Record<string, { status: 'idle' | 'testing' | 'success' | 'failed'; message: string }>>({});

  // Storage Hub state (v1.3.0)
  const [storageStats, setStorageStats] = useState<any | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrateResultMsg, setMigrateResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Memory Bank state (v1.3.0)
  const [memoryContext, setMemoryContext] = useState<{
    userProfile: string;
    globalMemory: string;
    projectMemory: string;
    projectMemoryPath: string | null;
  }>({
    userProfile: '',
    globalMemory: '',
    projectMemory: '',
    projectMemoryPath: null
  });
  const [activeMemSubTab, setActiveMemSubTab] = useState<'project' | 'profile' | 'global'>('project');
  const [editingMemContent, setEditingMemContent] = useState('');
  const [memorySaveStatus, setMemorySaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [memorySaveMsg, setMemorySaveMsg] = useState('');

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

  // MCP Servers State (v1.5.0)
  const [mcpServersStatus, setMcpServersStatus] = useState<any[]>([]);
  const [isReloadingMcp, setIsReloadingMcp] = useState(false);
  const [mcpFeedbackMsg, setMcpFeedbackMsg] = useState<{ success: boolean; text: string } | null>(null);
  const [expandedMcpServer, setExpandedMcpServer] = useState<string | null>(null);
  const [testingMcpServer, setTestingMcpServer] = useState<string | null>(null);

  const refreshSkills = async () => {
    if (window.electronAPI) {
      try {
        const skills = await window.electronAPI.getAllSkills(workspacePath);
        setAllSkills(skills);
      } catch {}
    }
  };

  const refreshStorageStats = async () => {
    if (window.electronAPI?.getStorageStats) {
      try {
        const stats = await window.electronAPI.getStorageStats();
        setStorageStats(stats);
      } catch {}
    }
  };

  const refreshMemory = async () => {
    if (window.electronAPI?.getMemoryContext) {
      try {
        const data = await window.electronAPI.getMemoryContext(workspacePath);
        setMemoryContext(data);
        if (activeMemSubTab === 'project') {
          setEditingMemContent(data.projectMemory || '');
        } else if (activeMemSubTab === 'profile') {
          setEditingMemContent(data.userProfile || '');
        } else {
          setEditingMemContent(data.globalMemory || '');
        }
      } catch {}
    }
  };

  const refreshMcpStatus = async () => {
    if (window.electronAPI?.getMcpServersStatus) {
      try {
        const statuses = await window.electronAPI.getMcpServersStatus();
        setMcpServersStatus(statuses || []);
      } catch (err: any) {
        console.error('Failed to get MCP status:', err);
      }
    }
  };

  const handleReloadMcpServers = async () => {
    setIsReloadingMcp(true);
    setMcpFeedbackMsg(null);
    try {
      if (window.electronAPI?.reloadMcpServers) {
        const result = await window.electronAPI.reloadMcpServers(form.customMcpConfig, workspacePath || null);
        setMcpServersStatus(result || []);
        const connectedCount = (result || []).filter((s: any) => s.status === 'connected').length;
        setMcpFeedbackMsg({
          success: true,
          text: `MCP 服务已同步：配置了 ${result?.length || 0} 个服务，成功激活 ${connectedCount} 个。`
        });
      }
    } catch (err: any) {
      setMcpFeedbackMsg({
        success: false,
        text: `重载失败: ${err.message}`
      });
    } finally {
      setIsReloadingMcp(false);
    }
  };

  const handleTestSingleServer = async (serverName: string, config: any) => {
    setTestingMcpServer(serverName);
    try {
      if (window.electronAPI?.testMcpServer) {
        const res = await window.electronAPI.testMcpServer(serverName, config, workspacePath || null);
        if (res.success) {
          alert(`✅ [${serverName}] 连接测试成功！\n探测到 ${res.tools?.length || 0} 个可用工具:\n${(res.tools || []).map((t: any) => `• ${t.name}: ${t.description}`).join('\n')}`);
          refreshMcpStatus();
        } else {
          alert(`❌ [${serverName}] 连接测试失败:\n${res.error || '未知异常'}`);
        }
      }
    } catch (e: any) {
      alert(`❌ 测试异常: ${e.message}`);
    } finally {
      setTestingMcpServer(null);
    }
  };

  const insertMcpTemplate = (templateType: 'sqlite' | 'github' | 'sse') => {
    let base: any = {};
    try {
      base = JSON.parse(form.customMcpConfig || '{"mcpServers":{}}');
    } catch {
      base = { mcpServers: {} };
    }
    if (!base.mcpServers) base.mcpServers = {};

    if (templateType === 'sqlite') {
      base.mcpServers['sqlite'] = {
        command: 'uvx',
        args: ['mcp-server-sqlite', '--db-path', './data.db']
      };
    } else if (templateType === 'github') {
      base.mcpServers['github'] = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: 'your_github_token_here'
        }
      };
    } else if (templateType === 'sse') {
      base.mcpServers['remote_service'] = {
        url: 'http://localhost:8000/sse'
      };
    }

    setForm(prev => ({
      ...prev,
      customMcpConfig: JSON.stringify(base, null, 2)
    }));
  };

  useEffect(() => {
    if (isOpen) {
      refreshSkills();
      refreshStorageStats();
      refreshMemory();
      refreshMcpStatus();
    }
  }, [isOpen, workspacePath]);

  useEffect(() => {
    if (activeMemSubTab === 'project') {
      setEditingMemContent(memoryContext.projectMemory || '');
    } else if (activeMemSubTab === 'profile') {
      setEditingMemContent(memoryContext.userProfile || '');
    } else {
      setEditingMemContent(memoryContext.globalMemory || '');
    }
    setMemorySaveStatus('idle');
    setMemorySaveMsg('');
  }, [activeMemSubTab, memoryContext]);

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
          max_tokens: 5,
          stream: form.streamResponse !== false
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

  // Fallback providers handlers (v1.3.0)
  const handleToggleFallback = (fbId: string) => {
    setForm(prev => ({
      ...prev,
      fallbackProviders: (prev.fallbackProviders || []).map(item =>
        item.id === fbId ? { ...item, enabled: !item.enabled } : item
      )
    }));
  };

  const handleUpdateFallback = (fbId: string, field: keyof FallbackProviderConfig, val: any) => {
    setForm(prev => ({
      ...prev,
      fallbackProviders: (prev.fallbackProviders || []).map(item => {
        if (item.id !== fbId) return item;
        const updated = { ...item, [field]: val };
        // 若修改了模型名且未手动锁定能力，自动启发式推导
        if (field === 'model' && typeof val === 'string' && val.trim()) {
          updated.capabilities = inferModelCapabilities(val);
        }
        return updated;
      })
    }));
  };

  const handleToggleFallbackCapability = (fbId: string, cap: any) => {
    setForm(prev => ({
      ...prev,
      fallbackProviders: (prev.fallbackProviders || []).map(item => {
        if (item.id !== fbId) return item;
        const currentCaps = item.capabilities || inferModelCapabilities(item.model);
        const nextCaps = currentCaps.includes(cap)
          ? currentCaps.filter((c: any) => c !== cap)
          : [...currentCaps, cap];
        return { ...item, capabilities: nextCaps };
      })
    }));
  };

  const handleAddCustomFallback = () => {
    const newId = `fb-custom-${Date.now()}`;
    const defaultModel = 'deepseek-chat';
    const newProvider: FallbackProviderConfig = {
      id: newId,
      name: '自定义备用服务商',
      baseUrl: '',
      apiKey: '',
      model: defaultModel,
      enabled: true,
      capabilities: inferModelCapabilities(defaultModel)
    };
    setForm(prev => ({
      ...prev,
      fallbackProviders: [...(prev.fallbackProviders || []), newProvider]
    }));
  };

  const handleDeleteFallback = (fbId: string) => {
    setForm(prev => ({
      ...prev,
      fallbackProviders: (prev.fallbackProviders || []).filter(item => item.id !== fbId)
    }));
  };

  const handleTestFallbackProvider = async (fb: FallbackProviderConfig) => {
    if (!fb.baseUrl) {
      setFallbackTestState(prev => ({
        ...prev,
        [fb.id]: { status: 'failed', message: '请填写 Base URL' }
      }));
      return;
    }
    setFallbackTestState(prev => ({
      ...prev,
      [fb.id]: { status: 'testing', message: '测试中...' }
    }));

    try {
      const url = `${fb.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (fb.apiKey) headers['Authorization'] = `Bearer ${fb.apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: fb.model || 'deepseek-chat',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
          stream: false
        })
      });

      if (res.ok) {
        setFallbackTestState(prev => ({
          ...prev,
          [fb.id]: { status: 'success', message: '连通正常' }
        }));
      } else {
        const txt = await res.text();
        setFallbackTestState(prev => ({
          ...prev,
          [fb.id]: { status: 'failed', message: `状态 ${res.status}: ${txt.slice(0, 80)}` }
        }));
      }
    } catch (err: any) {
      setFallbackTestState(prev => ({
        ...prev,
        [fb.id]: { status: 'failed', message: `异常: ${err.message}` }
      }));
    }
  };

  // Storage Hub handlers (v1.3.0)
  const handleSelectStorageDir = async () => {
    if (!window.electronAPI?.selectDataDirectory) return;
    const selected = await window.electronAPI.selectDataDirectory();
    if (selected) {
      const res = await window.electronAPI.setDataRootDir(selected);
      if (res.success) {
        setForm(prev => ({ ...prev, dataRootDir: res.rootDir }));
        refreshStorageStats();
      } else {
        alert(res.error || '设置存储目录失败');
      }
    }
  };

  const handleMigrateStorage = async () => {
    if (!window.electronAPI?.migrateStorageData) return;
    setIsMigrating(true);
    setMigrateResultMsg(null);
    try {
      const res = await window.electronAPI.migrateStorageData();
      setMigrateResultMsg({ success: res.success, text: res.message });
      refreshStorageStats();
      refreshSkills();
    } catch (err: any) {
      setMigrateResultMsg({ success: false, text: err.message || '迁移失败' });
    } finally {
      setIsMigrating(false);
    }
  };

  // Memory Bank handlers (v1.3.0)
  const handleSaveMemory = async () => {
    if (!window.electronAPI?.saveMemoryContent) return;
    setMemorySaveStatus('saving');
    setMemorySaveMsg('正在保存...');
    try {
      const res = await window.electronAPI.saveMemoryContent(activeMemSubTab, editingMemContent, workspacePath);
      if (res.success) {
        setMemorySaveStatus('saved');
        setMemorySaveMsg('已成功持久化至记忆库');
        refreshMemory();
        setTimeout(() => setMemorySaveStatus('idle'), 3000);
      } else {
        setMemorySaveStatus('error');
        setMemorySaveMsg(res.message);
      }
    } catch (err: any) {
      setMemorySaveStatus('error');
      setMemorySaveMsg(err.message || '保存失败');
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
    if (window.electronAPI?.reloadMcpServers) {
      window.electronAPI.reloadMcpServers(form.customMcpConfig, workspacePath || null).catch(() => {});
    }
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
            className={`flex items-center space-x-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'provider'
                ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>AI 模型与供应商</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`flex items-center space-x-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'storage'
                ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>数据与存储中枢</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`flex items-center space-x-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'memory'
                ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            <span>长期记忆库</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mcp_skills')}
            className={`flex items-center space-x-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'mcp_skills'
                ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>MCP 与技能</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`flex items-center space-x-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'desktop'
                ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>系统与偏好</span>
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

                {/* 主模型能力识别与标签提示 */}
                {form.model && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    <span className="text-[10px] text-[var(--muted-foreground)]">主模型能力范围:</span>
                    {inferModelCapabilities(form.model).map(cap => {
                      const capLabels: Record<ModelCapability, { label: string; icon: string }> = {
                        text: { label: '纯文本/代码', icon: '📝' },
                        vision: { label: '视觉/多模态', icon: '👁️' },
                        reasoning: { label: '深度思考/R1', icon: '🧠' },
                        tools: { label: '函数工具', icon: '🛠️' },
                        image_gen: { label: '图像生成', icon: '🎨' },
                        video_gen: { label: '视频生成', icon: '🎬' },
                        audio_asr: { label: '语音识别', icon: '🎙️' },
                        audio_tts: { label: '语音合成', icon: '🔊' },
                        embedding: { label: '高精向量', icon: '📐' },
                      };
                      const meta = capLabels[cap] || { label: cap, icon: '🏷️' };
                      return (
                        <span
                          key={cap}
                          className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 font-medium"
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>
                      );
                    })}
                  </div>
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

              {/* Stream Mode Toggle Switch */}
              <div className="flex items-start justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xs">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-[var(--foreground)]">流式响应模式 (Stream Mode)</span>
                    <span className="rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold">默认推荐</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                    以 Server-Sent Events (SSE) 逐字流式接收大模型生成结果与思考推理链。保持长连接持续传输，有效防止 Cloudflare 等前置 CDN 网关在模型长耗时推理时触发 100 秒超时断连 (HTTP 524)。若特殊自建代理不支持 SSE，可临时关闭。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, streamResponse: prev.streamResponse === false ? true : false }))}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mt-0.5 ${
                    form.streamResponse !== false ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      form.streamResponse !== false ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
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

              {/* 🛡️ 多 LLM 供应商容灾备用池 (Multi-Provider Fallback Pool) */}
              <div className="mt-6 pt-4 border-t border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-1.5 font-semibold text-xs text-[var(--foreground)]">
                      <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
                      <span>多 LLM 供应商接入池与 524 自动容灾 (Fallback Pool)</span>
                    </div>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      当主线路遭遇 <strong>Cloudflare 524 超时</strong>、<strong>429 频控</strong> 或 <strong>500/502/503 节点宕机</strong> 时，底层自动无感平滑切换至备用线路重试。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomFallback}
                    className="inline-flex items-center space-x-1 rounded-lg bg-[var(--primary)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>添加备用线路</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {(form.fallbackProviders || []).map((fb, idx) => {
                    const tState = fallbackTestState[fb.id];
                    return (
                      <div
                        key={fb.id}
                        className={`rounded-xl border p-3 text-xs transition-colors ${
                          fb.enabled
                            ? 'border-[var(--primary)]/40 bg-[var(--primary)]/5 dark:bg-[var(--primary)]/10'
                            : 'border-[var(--border)] bg-[var(--card)] opacity-80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={fb.enabled}
                              onChange={() => handleToggleFallback(fb.id)}
                              className="h-3.5 w-3.5 rounded border-[var(--input)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                            />
                            <span className="font-semibold text-[var(--foreground)]">
                              备用线路 #{idx + 1}：{fb.name}
                            </span>
                            {fb.enabled && (
                              <span className="rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold">
                                已激活容灾
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleTestFallbackProvider(fb)}
                              disabled={tState?.status === 'testing'}
                              className="rounded px-2 py-0.5 text-[10px] font-medium border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--foreground)]"
                            >
                              {tState?.status === 'testing' ? '测试中...' : '测试连通'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFallback(fb.id)}
                              className="p-1 text-[var(--muted-foreground)] hover:text-[var(--error)]"
                              title="删除此备用线路"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {tState && (
                          <div
                            className={`mb-2 text-[10px] font-medium flex items-center space-x-1 ${
                              tState.status === 'success'
                                ? 'text-emerald-500'
                                : tState.status === 'failed'
                                ? 'text-[var(--error)]'
                                : 'text-[var(--muted-foreground)]'
                            }`}
                          >
                            {tState.status === 'success' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <AlertCircle className="h-3 w-3" />
                            )}
                            <span>{tState.message}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-[var(--muted-foreground)] mb-0.5">线路名称</label>
                            <input
                              type="text"
                              value={fb.name}
                              onChange={e => handleUpdateFallback(fb.id, 'name', e.target.value)}
                              className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[var(--muted-foreground)] mb-0.5">接口地址 (Base URL)</label>
                            <input
                              type="text"
                              value={fb.baseUrl}
                              onChange={e => handleUpdateFallback(fb.id, 'baseUrl', e.target.value)}
                              placeholder="https://..."
                              className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 py-1 text-xs font-mono text-[var(--foreground)]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[var(--muted-foreground)] mb-0.5">调用模型 (Model)</label>
                            <input
                              type="text"
                              value={fb.model}
                              onChange={e => handleUpdateFallback(fb.id, 'model', e.target.value)}
                              placeholder="deepseek-chat"
                              className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 py-1 text-xs font-mono text-[var(--foreground)]"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="block text-[10px] text-[var(--muted-foreground)] mb-0.5">API Key (留空则沿用主 Key 或无需鉴权)</label>
                            <input
                              type="password"
                              value={fb.apiKey}
                              onChange={e => handleUpdateFallback(fb.id, 'apiKey', e.target.value)}
                              placeholder="sk-..."
                              className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 py-1 text-xs font-mono text-[var(--foreground)]"
                            />
                          </div>
                          <div className="md:col-span-3 pt-1 border-t border-[var(--border)]/40 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-[var(--muted-foreground)]">自适应能力标签:</span>
                            {(['text', 'vision', 'reasoning', 'tools', 'image_gen', 'video_gen', 'audio_asr', 'audio_tts', 'embedding'] as const).map(cap => {
                              const activeCaps = fb.capabilities || inferModelCapabilities(fb.model);
                              const isChecked = activeCaps.includes(cap);
                              const capLabels: Record<ModelCapability, { label: string; icon: string }> = {
                                text: { label: '文本/代码', icon: '📝' },
                                vision: { label: '视觉/多模态', icon: '👁️' },
                                reasoning: { label: '深度思考/R1', icon: '🧠' },
                                tools: { label: '函数工具', icon: '🛠️' },
                                image_gen: { label: '图像生成', icon: '🎨' },
                                video_gen: { label: '视频生成', icon: '🎬' },
                                audio_asr: { label: '语音识别', icon: '🎙️' },
                                audio_tts: { label: '语音合成', icon: '🔊' },
                                embedding: { label: '高精向量', icon: '📐' },
                              };
                              const meta = capLabels[cap] || { label: cap, icon: '🏷️' };
                              return (
                                <button
                                  key={cap}
                                  type="button"
                                  onClick={() => handleToggleFallbackCapability(fb.id, cap)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] flex items-center space-x-1 border transition-colors ${
                                    isChecked
                                      ? 'bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--primary)] font-medium'
                                      : 'bg-[var(--muted)]/40 border-transparent text-[var(--muted-foreground)] opacity-60 hover:opacity-100'
                                  }`}
                                  title={isChecked ? `点击移除 ${meta.label} 标签` : `点击为该备用线路启用 ${meta.label} 支持`}
                                >
                                  <span>{meta.icon}</span>
                                  <span>{meta.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 📁 数据与存储中枢 (Storage & Data Hub) 面板 */}
          {activeTab === 'storage' && (
            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 font-semibold text-xs text-[var(--foreground)]">
                  <HardDrive className="h-4 w-4 text-[var(--primary)]" />
                  <span>数据与存储中枢 (Storage & Data Hub)</span>
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  ASTeam Agent 支持将所有工作区、技能、长期记忆与生成交付产物存放于自定义磁盘（彻底脱离 C 盘系统盘，杜绝与其他智能体路径冲突）。
                </p>
              </div>

              {/* 根目录选择器 */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 space-y-2">
                <label className="block font-semibold text-xs text-[var(--foreground)]">当前数据根目录 (Data Root Directory)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={storageStats?.dataRootDir || form.dataRootDir || '正在获取...'}
                    className="flex-1 rounded-lg border border-[var(--input)] bg-[var(--muted)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] cursor-default select-text"
                  />
                  <button
                    type="button"
                    onClick={handleSelectStorageDir}
                    className="inline-flex items-center space-x-1 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors shadow-xs shrink-0"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>选择文件夹...</span>
                  </button>
                </div>
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  💡 推荐指定大容量非系统盘（如 <code>D:\ASTeamData\</code> 或 <code>E:\ASTeamData\</code>）。
                </p>
              </div>

              {/* 平滑迁移向导 */}
              {storageStats?.hasLegacyData && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-3.5 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                      <ArrowRightLeft className="h-4 w-4" />
                      <span>发现旧版数据待迁移</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleMigrateStorage}
                      disabled={isMigrating}
                      className="inline-flex items-center space-x-1 rounded-lg bg-amber-600 dark:bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${isMigrating ? 'animate-spin' : ''}`} />
                      <span>{isMigrating ? '迁移中...' : '一键平滑迁移现有数据'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    在 <code>~/.asteam</code> 发现 {storageStats.legacyDataStats?.skillsCount || 0} 个历史自定义技能与 {storageStats.legacyDataStats?.workspaceFilesCount || 0} 个旧工作区文件。点击上方按钮可将全部数据安全搬家至新中枢目录，释放 C 盘空间。
                  </p>
                  {migrateResultMsg && (
                    <div
                      className={`text-[11px] font-medium ${
                        migrateResultMsg.success ? 'text-emerald-500' : 'text-[var(--error)]'
                      }`}
                    >
                      {migrateResultMsg.text}
                    </div>
                  )}
                </div>
              )}

              {/* 5 大模块子目录状态卡片 */}
              <div className="space-y-2">
                <span className="block font-semibold text-xs text-[var(--foreground)]">模块化目录结构与空间占用</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {storageStats?.subdirs && Object.entries(storageStats.subdirs).map(([key, item]: [string, any]) => {
                    const sizeKB = Math.round((item.totalSize || 0) / 1024);
                    const sizeMB = (sizeKB / 1024).toFixed(2);
                    return (
                      <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-[var(--foreground)]">{item.name}</span>
                          <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                            {sizeKB > 1024 ? `${sizeMB} MB` : `${sizeKB} KB`}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted-foreground)] font-mono truncate" title={item.absolutePath}>
                          {item.absolutePath}
                        </p>
                        <div className="text-[10px] text-[var(--primary)] font-medium">
                          包含 {item.fileCount || 0} 个文件
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 🧠 长期记忆体系 (Memory Bank) 面板 */}
          {activeTab === 'memory' && (
            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 font-semibold text-xs text-[var(--foreground)]">
                  <Brain className="h-4 w-4 text-[var(--primary)]" />
                  <span>长期记忆与知识沉淀体系 (Memory Bank)</span>
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  跨会话沉淀工程架构约定与技术栈偏好。每次任务启动时，Agent 底层将自动感知并注入该记忆。您也可以在聊天框中使用 <code>/remember &lt;内容&gt;</code> 快捷沉淀。
                </p>
              </div>

              {/* 记忆维度子标签切换 */}
              <div className="flex rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveMemSubTab('project')}
                  className={`flex-1 rounded py-1.5 font-medium transition-colors ${
                    activeMemSubTab === 'project'
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  项目专属记忆 (.asteam/memory/MEMORY.md)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMemSubTab('profile')}
                  className={`flex-1 rounded py-1.5 font-medium transition-colors ${
                    activeMemSubTab === 'profile'
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  用户全局画像 (user_profile.md)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMemSubTab('global')}
                  className={`flex-1 rounded py-1.5 font-medium transition-colors ${
                    activeMemSubTab === 'global'
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  全局通用沉淀 (GLOBAL_MEMORY.md)
                </button>
              </div>

              {/* 记忆文本编辑区 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-[var(--foreground)]">
                    {activeMemSubTab === 'project'
                      ? `当前项目记忆 (${memoryContext.projectMemoryPath || '未打开工作区'})`
                      : activeMemSubTab === 'profile'
                      ? '用户偏好与协作风格画像'
                      : '跨项目通用避坑经验'}
                  </span>
                  <div className="flex items-center space-x-2">
                    {memorySaveMsg && (
                      <span
                        className={`text-[10px] font-medium flex items-center space-x-1 ${
                          memorySaveStatus === 'saved'
                            ? 'text-emerald-500'
                            : memorySaveStatus === 'error'
                            ? 'text-[var(--error)]'
                            : 'text-[var(--muted-foreground)]'
                        }`}
                      >
                        {memorySaveStatus === 'saved' && <Check className="h-3 w-3" />}
                        <span>{memorySaveMsg}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveMemory}
                      disabled={memorySaveStatus === 'saving'}
                      className="inline-flex items-center space-x-1 rounded-lg bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors shadow-xs disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{memorySaveStatus === 'saving' ? '保存中...' : '保存记忆'}</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={12}
                  value={editingMemContent}
                  onChange={e => setEditingMemContent(e.target.value)}
                  placeholder="在此直接编写或审阅 Markdown 记忆条目..."
                  className="w-full rounded-xl border border-[var(--input)] bg-[var(--card)] p-3 font-mono text-xs text-[var(--foreground)] leading-relaxed focus:border-[var(--primary)] focus:outline-none shadow-2xs"
                />
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
                      id: 'web_search',
                      name: '实时联网技术检索 (Web Search)',
                      desc: '自主检索全球官方技术文档、最新库变更、开源仓库与代码报错解决方案（内置高可用双通道检索）',
                      icon: <Globe className="h-4 w-4 text-emerald-500" />
                    },
                    {
                      id: 'web_fetch',
                      name: '网页文档结构化抓取 (Web Fetch & Doc Markdown)',
                      desc: '实时抓取在线技术文档或网页内容，自动提炼正文并转为结构化 Markdown（保留代码块与标题）',
                      icon: <FileText className="h-4 w-4 text-blue-500" />
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

              {/* 3. Custom MCP Servers Management (v1.5.0) */}
              <div className="space-y-3 pt-3 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-[var(--foreground)] flex items-center space-x-1.5">
                      <Code2 className="h-3.5 w-3.5 text-[var(--primary)]" />
                      <span>外部标准 MCP 服务器配置 (mcpServers)</span>
                    </label>
                    <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                      基于 Anthropic 官方标准 <code>@modelcontextprotocol/sdk</code> · 原生支持 Stdio (子进程) 与 SSE (远程网络)
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleReloadMcpServers}
                      disabled={isReloadingMcp}
                      className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-medium bg-[var(--primary)] text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
                    >
                      <RefreshCw className={`h-3 w-3 ${isReloadingMcp ? 'animate-spin' : ''}`} />
                      <span>{isReloadingMcp ? '正在探活...' : '重载并同步连接'}</span>
                    </button>
                  </div>
                </div>

                {/* Templates Quick Insert */}
                <div className="flex items-center justify-between bg-[var(--background)]/60 rounded-md px-2.5 py-1.5 border border-[var(--border)] text-[10px]">
                  <span className="text-[var(--muted-foreground)] flex items-center space-x-1">
                    <Zap className="h-3 w-3 text-amber-500" />
                    <span>快速插入常用模版:</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => insertMcpTemplate('sqlite')}
                      className="px-2 py-0.5 bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] rounded text-[var(--foreground)] transition-colors"
                    >
                      + SQLite (uvx)
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMcpTemplate('github')}
                      className="px-2 py-0.5 bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] rounded text-[var(--foreground)] transition-colors"
                    >
                      + GitHub (npx)
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMcpTemplate('sse')}
                      className="px-2 py-0.5 bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] rounded text-[var(--foreground)] transition-colors"
                    >
                      + Remote SSE
                    </button>
                  </div>
                </div>

                {/* JSON Editor with Syntax Validation */}
                <div className="space-y-1">
                  <div className="relative">
                    <textarea
                      rows={6}
                      value={form.customMcpConfig}
                      onChange={e => setForm(prev => ({ ...prev, customMcpConfig: e.target.value }))}
                      placeholder={`{\n  "mcpServers": {\n    "sqlite": {\n      "command": "uvx",\n      "args": ["mcp-server-sqlite", "--db-path", "./data.db"]\n    }\n  }\n}`}
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--card)] p-2.5 text-[11px] font-mono text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                    />
                  </div>
                  {/* Validation hint */}
                  {(() => {
                    try {
                      JSON.parse(form.customMcpConfig || '{}');
                      return (
                        <div className="flex items-center space-x-1 text-[10px] text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>JSON 语法合法 · 随时可点击【重载并同步连接】测试探活</span>
                        </div>
                      );
                    } catch (e: any) {
                      return (
                        <div className="flex items-center space-x-1 text-[10px] text-rose-500">
                          <AlertCircle className="h-3 w-3" />
                          <span>JSON 语法有误: {e.message}</span>
                        </div>
                      );
                    }
                  })()}
                </div>

                {/* Feedback Banner */}
                {mcpFeedbackMsg && (
                  <div
                    className={`rounded-lg p-2.5 text-[11px] flex items-center space-x-2 ${
                      mcpFeedbackMsg.success
                        ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-700 border border-rose-500/20'
                    }`}
                  >
                    {mcpFeedbackMsg.success ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{mcpFeedbackMsg.text}</span>
                  </div>
                )}

                {/* MCP Live Status & Discovered Tools Board */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[var(--foreground)] flex items-center space-x-1.5">
                      <Activity className="h-3.5 w-3.5 text-[var(--primary)]" />
                      <span>MCP 服务探活看板与发现工具</span>
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      已注册 {mcpServersStatus.length} 个服务 · 激活{' '}
                      {mcpServersStatus.filter(s => s.status === 'connected').length} 个
                    </span>
                  </div>

                  {mcpServersStatus.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-[11px] text-[var(--muted-foreground)] bg-[var(--background)]/40">
                      当前尚未检测到活动的外部 MCP 服务。请在上方输入合法配置并点击【重载并同步连接】。
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mcpServersStatus.map(server => {
                        const isExpanded = expandedMcpServer === server.name;
                        const isTesting = testingMcpServer === server.name;
                        return (
                          <div
                            key={server.name}
                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden transition-all shadow-xs"
                          >
                            <div className="flex items-center justify-between p-2.5 bg-[var(--background)]/50">
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    server.status === 'connected'
                                      ? 'bg-emerald-500'
                                      : server.status === 'connecting'
                                      ? 'bg-amber-500 animate-pulse'
                                      : server.status === 'error'
                                      ? 'bg-rose-500'
                                      : 'bg-gray-400'
                                  }`}
                                />
                                <span className="font-medium text-[12px] text-[var(--foreground)]">
                                  {server.name}
                                </span>
                                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--muted-foreground)]">
                                  {server.transportType}
                                </span>
                                <span className="text-[11px] text-[var(--muted-foreground)]">
                                  {server.status === 'connected' && `• 已激活 ${server.tools.length} 个工具`}
                                  {server.status === 'connecting' && '• 正在建立连接...'}
                                  {server.status === 'error' && '• 连接异常'}
                                  {server.status === 'disconnected' && '• 已停用'}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    let cfg: any = {};
                                    try {
                                      const parsed = JSON.parse(form.customMcpConfig);
                                      cfg = parsed.mcpServers?.[server.name] || {};
                                    } catch {}
                                    handleTestSingleServer(server.name, cfg);
                                  }}
                                  disabled={isTesting}
                                  className="px-2 py-0.5 text-[10px] font-medium rounded border border-[var(--border)] hover:bg-[var(--border)] text-[var(--foreground)] transition-colors"
                                >
                                  {isTesting ? '测试中...' : '测试连接'}
                                </button>
                                {server.tools.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedMcpServer(isExpanded ? null : server.name)}
                                    className="flex items-center space-x-0.5 px-2 py-0.5 text-[10px] font-medium rounded bg-[var(--border)] text-[var(--foreground)] hover:opacity-80 transition-opacity"
                                  >
                                    <span>{server.tools.length} 个工具</span>
                                    {isExpanded ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Error details if any */}
                            {server.status === 'error' && server.error && (
                              <div className="p-2.5 bg-rose-500/10 border-t border-rose-500/20 text-[10px] text-rose-700 font-mono">
                                <strong>错误详情:</strong> {server.error}
                              </div>
                            )}

                            {/* Discovered Tools List Drawer */}
                            {isExpanded && server.tools.length > 0 && (
                              <div className="p-2.5 border-t border-[var(--border)] space-y-2 bg-[var(--card)]">
                                <div className="text-[10px] font-medium text-[var(--muted-foreground)]">
                                  该服务向 Agent 注册的所有可用工具清单：
                                </div>
                                <div className="grid grid-cols-1 gap-1.5">
                                  {server.tools.map((tool: any) => (
                                    <div
                                      key={tool.fullName}
                                      className="rounded border border-[var(--border)] p-2 bg-[var(--background)]/30 text-[11px] space-y-1"
                                    >
                                      <div className="flex items-center justify-between">
                                        <code className="text-[var(--primary)] font-semibold font-mono">
                                          {tool.fullName}
                                        </code>
                                        <span className="text-[9px] text-[var(--muted-foreground)]">
                                          原生名称: {tool.name}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-[var(--muted-foreground)]">
                                        {tool.description}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
