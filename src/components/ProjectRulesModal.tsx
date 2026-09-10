import React, { useState, useEffect } from 'react';
import { X, ScrollText, Check, Copy, Sparkles, FileCode, ShieldCheck } from 'lucide-react';
import { ProjectRulesInfo } from '../types/project';

interface RulePreset {
  id: string;
  name: string;
  description: string;
  template: string;
}

interface ProjectRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath: string | null;
  projectRules: ProjectRulesInfo | null;
  onRulesUpdated: () => void;
}

export const ProjectRulesModal: React.FC<ProjectRulesModalProps> = ({
  isOpen,
  onClose,
  workspacePath,
  projectRules,
  onRulesUpdated
}) => {
  const [presets, setPresets] = useState<RulePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ts_react_strict');
  const [activeTab, setActiveTab] = useState<'current' | 'create'>('current');
  const [customContent, setCustomContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && window.electronAPI?.getRulePresets) {
      window.electronAPI.getRulePresets().then((res: any) => {
        if (Array.isArray(res) && res.length > 0) {
          setPresets(res);
          const found = res.find((p: RulePreset) => p.id === selectedPresetId) || res[0];
          setCustomContent(found.template);
        }
      }).catch(console.error);
    }
  }, [isOpen]);

  useEffect(() => {
    if (projectRules && projectRules.hasRules) {
      setActiveTab('current');
    } else {
      setActiveTab('create');
    }
  }, [projectRules, isOpen]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: RulePreset) => {
    setSelectedPresetId(preset.id);
    setCustomContent(preset.template);
  };

  const handleSaveRules = async () => {
    if (!workspacePath || !window.electronAPI?.saveProjectRules) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await window.electronAPI.saveProjectRules(workspacePath, customContent);
      if (res.success) {
        setSaveMessage('✅ 规约已成功落盘并即时激活！');
        onRulesUpdated();
        setTimeout(() => {
          setActiveTab('current');
          setSaveMessage(null);
        }, 1000);
      } else {
        setSaveMessage('❌ 保存失败: ' + res.message);
      }
    } catch (e: any) {
      setSaveMessage('❌ 保存出错: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    const textToCopy = activeTab === 'current' ? (projectRules?.content || '') : customContent;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5 bg-[var(--background)]">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ScrollText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center space-x-2">
                <span>项目行为准则与架构规约 (Project Rules)</span>
                {projectRules?.hasRules && (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    生效中
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                智能体在每次规划与执行代码变更前，均会以最高优先级遵循此规约
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Switcher if rules exist */}
        {projectRules?.hasRules && (
          <div className="flex border-b border-[var(--border)] bg-[var(--muted)]/40 px-5 text-xs font-medium">
            <button
              onClick={() => setActiveTab('current')}
              className={'py-2.5 px-3 border-b-2 transition-colors cursor-pointer ' + (
                activeTab === 'current'
                  ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                  : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              )}
            >
              当前生效规约 ({projectRules.ruleType === 'asteamrules' ? '.asteamrules' : projectRules.ruleType === 'asteam_md' ? 'ASTEAM.md' : '.asteam/rules'})
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={'py-2.5 px-3 border-b-2 transition-colors cursor-pointer ' + (
                activeTab === 'create'
                  ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                  : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              )}
            >
              模版重置 / 生成新规约
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'current' && projectRules?.hasRules ? (
            <div className="space-y-3">
              {/* File Info Card */}
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5 text-xs">
                <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span className="font-mono truncate max-w-[420px]" title={projectRules.filePath || ''}>
                    {projectRules.filePath}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-600/80 font-mono">
                  {projectRules.content.length} 字符
                </span>
              </div>

              {/* Rules Content Preview */}
              <div className="relative rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs max-h-[380px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                {projectRules.content}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!projectRules?.hasRules && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300 flex items-center space-x-2">
                  <ScrollText className="h-4 w-4 shrink-0" />
                  <span>当前项目未检测到行为准则。从下方选择模版一键初始化 <code>.asteamrules</code>：</span>
                </div>
              )}

              {/* Preset Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {presets.map((p) => {
                  const isSelected = selectedPresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className={'text-left p-3 rounded-lg border text-xs transition-all cursor-pointer flex flex-col justify-between ' + (
                        isSelected
                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]'
                          : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)]/40'
                      )}
                    >
                      <div>
                        <div className="font-medium text-[var(--foreground)] flex items-center justify-between mb-1">
                          <span>{p.name}</span>
                          {isSelected && <Check className="h-3 w-3 text-[var(--primary)]" />}
                        </div>
                        <p className="text-[11px] text-[var(--muted-foreground)] leading-snug">
                          {p.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Editor / Template Preview */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--muted-foreground)] mb-1.5">
                  规约内容预览与自定义调整 (将生成至项目根目录 <code>.asteamrules</code>)：
                </label>
                <textarea
                  value={customContent}
                  onChange={(e) => setCustomContent(e.target.value)}
                  rows={9}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>

              {saveMessage && (
                <p className="text-xs font-medium text-[var(--foreground)] animate-in fade-in duration-150">
                  {saveMessage}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--background)] px-5 py-3 text-xs">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center space-x-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? '已复制规约' : '复制规约'}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3.5 py-1.5 text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
            >
              关闭
            </button>
            {activeTab === 'create' && (
              <button
                type="button"
                onClick={handleSaveRules}
                disabled={isSaving || !customContent.trim()}
                className="flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-white hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs font-medium"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isSaving ? '正在生成...' : '一键生成并激活 .asteamrules'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
