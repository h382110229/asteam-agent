import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Copy,
  Check,
  Grid,
  Code,
  Image as ImageIcon
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
  const [copiedImage, setCopiedImage] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const getSvgAsCanvas = async (scale = 2): Promise<HTMLCanvasElement | null> => {
    if (!content) return null;
    return new Promise((resolve) => {
      const img = new Image();
      const svgBlob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const width = img.naturalWidth || img.width || 800;
        const height = img.naturalHeight || img.height || 600;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const isDark = document.documentElement.classList.contains('dark');
          ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas);
        } else {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  };

  const handleDownloadPng = async () => {
    const canvas = await getSvgAsCanvas(2);
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'graphic'}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleCopyImage = async () => {
    try {
      const canvas = await getSvgAsCanvas(2);
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
      }, 'image/png');
    } catch (e) {
      console.error('Failed to copy image to clipboard:', e);
    }
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
          <span className="rounded bg-amber-500/20 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold">
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
            onClick={handleCopyImage}
            title="复制为 PNG 图片 (直接粘贴至 PPT/Word/微信)"
            className={`rounded p-1.5 transition-colors flex items-center space-x-1 ${
              copiedImage ? 'text-emerald-500 bg-emerald-500/10' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            {copiedImage ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <ImageIcon className="h-3.5 w-3.5" />}
            <span className="text-[11px]">{copiedImage ? '已复制图片' : '复制图片'}</span>
          </button>

          <div className="h-4 w-px bg-[var(--border)] mx-1" />

          <button
            type="button"
            onClick={handleDownload}
            title="下载 SVG 矢量文件"
            className="flex items-center space-x-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <Download className="h-3 w-3" />
            <span>SVG</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            title="导出 2x 高清 PNG 图片"
            className="flex items-center space-x-1 rounded bg-[var(--primary)] text-white px-2 py-1 text-[11px] font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="h-3 w-3" />
            <span>导出 PNG</span>
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className={`flex-1 overflow-auto p-6 flex items-center justify-center relative ${
        showGrid
          ? 'bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:16px_16px] bg-[var(--background)]'
          : 'bg-[var(--background)]'
      }`}>
        {showCode ? (
          <div className="w-full h-full rounded-lg bg-[var(--card)] border border-[var(--border)] p-4 overflow-auto font-mono text-xs text-[var(--foreground)]">
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
