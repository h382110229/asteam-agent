import React, { useState, useEffect } from 'react';
import { FileText, Copy, Check, FolderOpen, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

interface TextPreviewProps {
  filePath?: string;
  title?: string;
  initialContent?: string;
}

export const TextPreview: React.FC<TextPreviewProps> = ({ filePath, title, initialContent }) => {
  const [content, setContent] = useState<string>(initialContent || '');
  const [loading, setLoading] = useState(!initialContent && !!filePath);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
      setLoading(false);
      return;
    }
    if (!filePath) return;

    let isMounted = true;
    const loadText = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!window.electronAPI?.getArtifactPreview) {
          throw new Error('当前客户端不支持读取文本预览');
        }
        const res = await window.electronAPI.getArtifactPreview(filePath);
        if (!isMounted) return;
        if (res.success && res.content !== undefined) {
          setContent(res.content);
        } else {
          setError(res.error || '未能成功读取文件内容');
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || '加载文本失败');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadText();
    return () => {
      isMounted = false;
    };
  }, [filePath, initialContent]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const lines = content.split('\n');

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] select-text">
      {/* 顶部操作工具栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)] shrink-0 gap-2">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate max-w-[280px]" title={title || filePath}>
              {title || (filePath ? filePath.split(/[\\/]/).pop() : '文本/配置文件')}
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)]">
              {lines.length} 行 · {content.length} 字符
            </div>
          </div>
        </div>

        {/* 复制与定位按钮 */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] transition-colors cursor-pointer text-[var(--foreground)]"
            title="复制全部内容"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-500">已复制</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <span>复制</span>
              </>
            )}
          </button>

          {filePath && (
            <>
              <button
                type="button"
                onClick={() => window.electronAPI?.showItemInFolder(filePath)}
                title="在系统文件管理器中高亮定位"
                className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] transition-colors cursor-pointer text-[var(--foreground)]"
              >
                <FolderOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span className="hidden md:inline">定位</span>
              </button>
              <button
                type="button"
                onClick={() => window.electronAPI?.openPath(filePath)}
                title="使用系统默认应用打开"
                className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] transition-colors cursor-pointer text-[var(--foreground)]"
              >
                <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                <span className="hidden md:inline">外部打开</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 文本内容主体 */}
      <div className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed scrollbar-thin bg-[#1e1e24] text-zinc-200">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-2">
            <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
            <div className="text-xs">正在读取文件内容...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-3 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <div className="text-xs font-medium text-zinc-100">{error}</div>
            {filePath && (
              <button
                type="button"
                onClick={() => window.electronAPI?.openPath(filePath)}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors cursor-pointer"
              >
                直接用本地编辑器打开
              </button>
            )}
          </div>
        ) : (
          <div className="flex">
            {/* 行号列 */}
            <div className="select-none text-right pr-4 text-zinc-500 text-[11px] font-mono border-r border-zinc-700/60 shrink-0">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            {/* 真实代码内容 */}
            <pre className="pl-4 whitespace-pre overflow-x-auto flex-1 select-text">
              <code>{content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
