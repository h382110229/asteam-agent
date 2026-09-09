import React, { useState } from 'react';
import {
  FolderOpen,
  Database,
  HardDrive,
  GitBranch,
  Sparkles,
  Terminal,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Play,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { McpPresetDefinition } from '../config/mcpPresets';

interface McpPresetCardProps {
  preset: McpPresetDefinition;
  isInstalled: boolean;
  fieldValues: Record<string, any>;
  onToggle: (enabled: boolean) => void;
  onChangeField: (key: string, value: any) => void;
  onTestConnection: (config: any) => void;
  isTesting: boolean;
  liveStatus?: 'connected' | 'connecting' | 'error' | 'disconnected';
  liveToolsCount?: number;
  liveError?: string;
}

export const McpPresetCard: React.FC<McpPresetCardProps> = ({
  preset,
  isInstalled,
  fieldValues,
  onToggle,
  onChangeField,
  onTestConnection,
  isTesting,
  liveStatus,
  liveToolsCount,
  liveError
}) => {
  const [isConfigExpanded, setIsConfigExpanded] = useState(isInstalled);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  const toggleShowPassword = (key: string) => {
    setShowPasswordMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'FolderOpen':
        return <FolderOpen className="h-5 w-5 text-blue-500" />;
      case 'Database':
        return <Database className="h-5 w-5 text-emerald-500" />;
      case 'HardDrive':
        return <HardDrive className="h-5 w-5 text-indigo-500" />;
      case 'GitBranch':
        return <GitBranch className="h-5 w-5 text-purple-500" />;
      case 'Sparkles':
        return <Sparkles className="h-5 w-5 text-amber-500" />;
      case 'Terminal':
      default:
        return <Terminal className="h-5 w-5 text-teal-500" />;
    }
  };

  const handleTest = () => {
    const config = preset.toServerConfig(fieldValues);
    onTestConnection(config);
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        isInstalled
          ? 'border-[var(--primary)]/60 bg-[var(--card)] shadow-sm shadow-[var(--primary)]/5 ring-1 ring-[var(--primary)]/20'
          : 'border-[var(--border)] bg-[var(--card)]/60 hover:border-[var(--border)]/80 hover:bg-[var(--card)]'
      }`}
    >
      {/* Card Header & Summary */}
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start space-x-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--background)] border border-[var(--border)] shrink-0 mt-0.5">
              {getIcon(preset.icon)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h4 className="font-semibold text-[13px] text-[var(--foreground)] truncate">
                  {preset.name}
                </h4>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-medium ${
                    preset.runner === 'uvx'
                      ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                      : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                  }`}
                >
                  {preset.runner}
                </span>
              </div>
              <p className="text-[11px] font-mono text-[var(--muted-foreground)] truncate mt-0.5">
                {preset.packageName}
              </p>
            </div>
          </div>

          {/* Install / Toggle Switch */}
          <div className="flex items-center space-x-2 shrink-0 pt-0.5">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isInstalled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onToggle(checked);
                  if (checked) setIsConfigExpanded(true);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[var(--border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--primary)]" />
            </label>
          </div>
        </div>

        {/* Description */}
        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed line-clamp-2">
          {preset.description}
        </p>

        {/* Tags row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
            {preset.tags.map(tag => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)]"
              >
                {tag}
              </span>
            ))}
          </div>

          {isInstalled && (
            <button
              type="button"
              onClick={() => setIsConfigExpanded(!isConfigExpanded)}
              className="flex items-center space-x-1 text-[11px] font-medium text-[var(--primary)] hover:underline transition-all"
            >
              <Settings2 className="h-3 w-3" />
              <span>{isConfigExpanded ? '收起配置' : '展开参数配置'}</span>
              {isConfigExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Parameters & Actions Area */}
      {isInstalled && isConfigExpanded && (
        <div className="border-t border-[var(--border)] bg-[var(--background)]/50 p-3.5 space-y-3">
          {/* Field Form Inputs */}
          <div className="space-y-2.5">
            {preset.fields.map(field => {
              const val = fieldValues[field.key] ?? field.defaultValue;
              const isPassword = field.type === 'password';
              const showPwd = showPasswordMap[field.key] || false;

              return (
                <div key={field.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="font-medium text-[var(--foreground)] flex items-center space-x-1">
                      <span>{field.label}</span>
                      {field.required && <span className="text-rose-500">*</span>}
                    </label>
                  </div>

                  {field.type === 'select' ? (
                    <select
                      value={val}
                      onChange={(e) => onChangeField(field.key, e.target.value)}
                      className="w-full rounded-md border border-[var(--input)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                    >
                      {field.options?.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative flex items-center">
                      <input
                        type={isPassword && !showPwd ? 'password' : 'text'}
                        value={val}
                        placeholder={field.placeholder}
                        onChange={(e) => onChangeField(field.key, e.target.value)}
                        className={`w-full rounded-md border border-[var(--input)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] text-[var(--foreground)] font-mono focus:border-[var(--primary)] focus:outline-none ${
                          isPassword ? 'pr-8' : ''
                        }`}
                      />
                      {isPassword && (
                        <button
                          type="button"
                          onClick={() => toggleShowPassword(field.key)}
                          className="absolute right-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  )}

                  {field.description && (
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      {field.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Live Status & Connection Test Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-[11px]">
            <div className="flex items-center space-x-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  liveStatus === 'connected'
                    ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                    : liveStatus === 'connecting'
                    ? 'bg-amber-500 animate-pulse'
                    : liveStatus === 'error'
                    ? 'bg-rose-500'
                    : 'bg-gray-400'
                }`}
              />
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {liveStatus === 'connected' && `在线 (已发现 ${liveToolsCount ?? 0} 个工具)`}
                {liveStatus === 'connecting' && '正在探活...'}
                {liveStatus === 'error' && '连接异常'}
                {(!liveStatus || liveStatus === 'disconnected') && '已保存配置 (未激活)'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--border)] text-[var(--foreground)] text-[10px] font-medium transition-colors disabled:opacity-50"
            >
              <Play className={`h-2.5 w-2.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? '探活中...' : '测试该服务'}</span>
            </button>
          </div>

          {liveStatus === 'error' && liveError && (
            <div className="rounded p-2 bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-700 font-mono">
              <strong>探活失败:</strong> {liveError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
