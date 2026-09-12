import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Edit3,
  X,
  Key,
  Network,
  Database,
  Lock,
  Phone,
  AlertTriangle,
  FileText
} from 'lucide-react';

export interface SensitiveItemSummary {
  type: string;
  original: string;
  placeholder: string;
  count: number;
}

interface SecurityPreflightModalProps {
  isOpen: boolean;
  sensitiveItems: SensitiveItemSummary[];
  originalText: string;
  sanitizedText: string;
  onConfirmSanitize: (rememberSession: boolean) => void;
  onConfirmBypass: (rememberSession: boolean) => void;
  onCancel: () => void;
}

export const SecurityPreflightModal: React.FC<SecurityPreflightModalProps> = ({
  isOpen,
  sensitiveItems,
  originalText,
  sanitizedText,
  onConfirmSanitize,
  onConfirmBypass,
  onCancel
}) => {
  const [rememberChoice, setRememberChoice] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  if (!isOpen) return null;

  const totalCount = sensitiveItems.reduce((acc, i) => acc + i.count, 0);

  const getItemIcon = (type: string) => {
    if (type.includes('API Key') || type.includes('Token')) {
      return <Key className="h-4 w-4 text-amber-500" />;
    }
    if (type.includes('IP')) {
      return <Network className="h-4 w-4 text-blue-500" />;
    }
    if (type.includes('数据库') || type.includes('口令') || type.includes('密码')) {
      return <Database className="h-4 w-4 text-red-500" />;
    }
    if (type.includes('私钥')) {
      return <Lock className="h-4 w-4 text-purple-500" />;
    }
    if (type.includes('手机')) {
      return <Phone className="h-4 w-4 text-emerald-500" />;
    }
    return <ShieldAlert className="h-4 w-4 text-amber-500" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--muted)]/30">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
                出境数据安全合规预检
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-normal border border-amber-500/20">
                  检测到 {totalCount} 处敏感项
                </span>
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                系统在发送前检测到潜在敏感资产，请确认本次出境处理方式
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
            title="关闭 / 取消发送"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Sensitive Items List */}
          <div>
            <label className="text-xs font-medium text-[var(--foreground)] block mb-2">
              检出的敏感资产清单：
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {sensitiveItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--muted)]/40 border border-[var(--border)] text-xs"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <div className="p-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] shrink-0">
                      {getItemIcon(item.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-[var(--foreground)] truncate">
                          {item.type}
                        </span>
                        <span className="text-[10px] text-[var(--muted-foreground)] px-1.5 py-0.2 rounded bg-[var(--muted)]">
                          {item.count} 处
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--muted-foreground)] truncate mt-0.5">
                        原词预览: <span className="text-amber-600 dark:text-amber-400">{item.original}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 pl-3">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      脱敏为 {item.placeholder}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Toggle Text Comparison Preview */}
          <div>
            <button
              type="button"
              onClick={() => setShowDiff(prev => !prev)}
              className="text-xs text-[var(--primary)] hover:underline flex items-center space-x-1 cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{showDiff ? '收起文本脱敏对比' : '预览脱敏前后完整文本对比'}</span>
            </button>
            {showDiff && (
              <div className="mt-2.5 grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--muted)]/30 border border-[var(--border)]">
                  <div className="font-semibold text-xs text-[var(--muted-foreground)] mb-1.5">
                    原始文本 (待出境)
                  </div>
                  <pre className="font-mono text-[11px] whitespace-pre-wrap max-h-36 overflow-y-auto text-[var(--foreground)]">
                    {originalText}
                  </pre>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <div className="font-semibold text-xs text-emerald-600 dark:text-emerald-400 mb-1.5">
                    脱敏后文本 (安全占位)
                  </div>
                  <pre className="font-mono text-[11px] whitespace-pre-wrap max-h-36 overflow-y-auto text-[var(--foreground)]">
                    {sanitizedText}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Remember Choice for Session */}
          <div className="pt-2 border-t border-[var(--border)]">
            <label className="flex items-center space-x-2 text-xs text-[var(--muted-foreground)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={e => setRememberChoice(e.target.checked)}
                className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] h-4 w-4 cursor-pointer"
              />
              <span>在当前会话中记住我的选择（后续出境不再重复弹窗确认）</span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--muted)]/20 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--muted)] text-xs font-medium text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>返回修改 (取消)</span>
          </button>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={() => onConfirmBypass(rememberChoice)}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-medium transition-colors cursor-pointer"
              title="已知晓外发风险，保留原样发给模型，本次请求豁免脱敏"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>原样发出 (本次豁免)</span>
            </button>

            <button
              type="button"
              onClick={() => onConfirmSanitize(rememberChoice)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-medium transition-colors cursor-pointer shadow-xs"
              title="使用语义安全占位符替换敏感数据后发出"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>🛡️ 脱敏后发送 (推荐)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
