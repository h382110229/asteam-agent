import React, { useEffect } from 'react';
import { AlertTriangle, Undo2, X, RotateCcw, Trash2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: string;
  description?: string;
  files?: {
    modified?: string[];
    added?: string[];
  };
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
  iconType?: 'rollback' | 'warning' | 'danger' | 'trash';
  tipText?: string | null;
  zIndexClass?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  description,
  files,
  confirmText = '确认执行',
  cancelText = '取消',
  isDanger = true,
  isLoading = false,
  iconType = 'rollback',
  tipText,
  zIndexClass = 'z-50'
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const hasFiles = files && ((files.modified && files.modified.length > 0) || (files.added && files.added.length > 0));

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs select-none animate-in fade-in duration-150`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4 bg-[var(--background)]">
          <div className="flex items-center space-x-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              isDanger
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                : 'bg-[var(--primary)]/15 text-[var(--primary)]'
            }`}>
              {iconType === 'rollback' ? (
                <Undo2 className="h-4.5 w-4.5" />
              ) : iconType === 'warning' ? (
                <AlertTriangle className="h-4.5 w-4.5" />
              ) : iconType === 'trash' ? (
                <Trash2 className="h-4.5 w-4.5" />
              ) : (
                <RotateCcw className="h-4.5 w-4.5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                {title}
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                {subtitle || (hasFiles ? '此操作将变更工作区物理文件状态' : '请谨慎确认此项操作')}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-3.5 overflow-y-auto max-h-[50vh]">
          {description && (
            <p className="text-xs text-[var(--foreground)]/90 leading-relaxed">
              {description}
            </p>
          )}

          {/* Files List */}
          {hasFiles && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 space-y-2.5">
              <div className="text-[11px] font-medium text-[var(--muted-foreground)] flex items-center justify-between">
                <span>涉及变动的文件清单：</span>
                <span className="font-mono text-[10px]">
                  {(files?.modified?.length || 0) + (files?.added?.length || 0)} 个文件
                </span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {files?.modified?.map((f) => (
                  <div
                    key={`mod-${f}`}
                    className="flex items-center space-x-2 text-[11px] font-mono text-[var(--foreground)] bg-[var(--card)] px-2.5 py-1.5 rounded-lg border border-[var(--border)]"
                  >
                    <span className="shrink-0 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1 py-0.2 text-[9px] font-sans font-medium">
                      修改
                    </span>
                    <span className="truncate" title={f}>{f}</span>
                  </div>
                ))}

                {files?.added?.map((f) => (
                  <div
                    key={`add-${f}`}
                    className="flex items-center space-x-2 text-[11px] font-mono text-[var(--foreground)] bg-[var(--card)] px-2.5 py-1.5 rounded-lg border border-[var(--border)]"
                  >
                    <span className="shrink-0 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1 py-0.2 text-[9px] font-sans font-medium">
                      新增
                    </span>
                    <span className="truncate" title={f}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tipText !== null && (tipText || hasFiles) && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 flex items-start space-x-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{tipText || '提示：还原操作将覆盖当前未暂存的修改，并自动从影子备份中恢复原状。'}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2.5 border-t border-[var(--border)] px-5 py-3.5 bg-[var(--background)]">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`flex items-center space-x-1.5 rounded-xl px-4 py-1.5 text-xs font-medium text-white transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] shadow-[var(--primary)]/20'
            }`}
          >
            {isLoading && <RotateCcw className="h-3.5 w-3.5 animate-spin" />}
            <span>{isLoading ? '正在执行...' : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
