import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Copy,
  Check,
  Grid,
  Code
} from 'lucide-react';

interface SvgPreviewProps {
  content: string;
  title?: string;
}

export const SvgPreview: React.FC<SvgPreviewProps> = ({ content, title }) => {
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'graphic'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--background)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 bg-[var(--card)] select-none text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-xs text-[var(--foreground)]">
            {title || 'SVG 矢量图像预览'}
          </span>
          <span className="rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold">
            SVG
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            title={showGrid ? '关闭网格棋盘背景' : '开启网格棋盘背景'}
            className={`rounded p-1.5 transition-colors ${showGrid ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
          >
            <Grid className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoom(z => Math.max(0.2, z - 0.2))}
            title="缩小"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>

          <span className="font-mono text-[11px] text-[var(--muted-foreground)] w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={() => setZoom(z => Math.min(3, z + 0.2))}
            title="放大"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoom(1)}
            title="复位"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-px bg-[var(--border)] mx-1" />

          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            title={showCode ? '切换至视觉预览' : '查看 SVG 代码'}
            className={`rounded p-1.5 transition-colors ${showCode ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
          >
            <Code className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="复制 SVG 代码"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            title="下载 SVG 文件"
            className="flex items-center space-x-1 rounded bg-[var(--primary)] text-white px-2 py-1 text-[11px] font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="h-3 w-3" />
            <span>下载</span>
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className={`flex-1 overflow-auto p-6 flex items-center justify-center relative ${
        showGrid
          ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] bg-[size:16px_16px] bg-[#090d16]'
          : 'bg-[#0a0e17]'
      }`}>
        {showCode ? (
          <div className="w-full h-full rounded-lg bg-[#0c1017] border border-[var(--border)] p-4 overflow-auto font-mono text-xs text-slate-200">
            <pre className="whitespace-pre-wrap">{content}</pre>
          </div>
        ) : (
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            className="transition-transform duration-150 ease-out select-none flex items-center justify-center max-w-full max-h-full"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  );
};
