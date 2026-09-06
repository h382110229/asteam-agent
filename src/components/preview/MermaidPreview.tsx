import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Code
} from 'lucide-react';

interface MermaidPreviewProps {
  content: string;
  title?: string;
}

export const MermaidPreview: React.FC<MermaidPreviewProps> = ({ content, title }) => {
  const [svgCode, setSvgCode] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    let isMounted = true;
    setLoading(true);
    setRenderError(null);

    const renderGraph = async () => {
      try {
        const id = 'mermaid-render-' + Math.random().toString(36).substring(2, 9);
        const { svg } = await mermaid.render(id, content.trim());
        if (isMounted) {
          setSvgCode(svg);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setRenderError(err.message || 'Mermaid 语法解析失败');
          setLoading(false);
        }
      }
    };

    renderGraph();

    return () => {
      isMounted = false;
    };
  }, [content]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownloadSvg = () => {
    if (!svgCode) return;
    const blob = new Blob([svgCode], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'architecture'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--background)] overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 bg-[var(--card)] select-none text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-xs text-[var(--foreground)]">
            {title || 'Mermaid 架构流程拓扑图'}
          </span>
          <span className="rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 text-[9px] font-bold">
            MERMAID
          </span>
        </div>

        {/* Zoom & Actions */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}
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
            onClick={() => setZoom(z => Math.min(2.5, z + 0.2))}
            title="放大"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoom(1)}
            title="恢复 100% 原始缩放"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-px bg-[var(--border)] mx-1" />

          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            title={showCode ? '切换至图表预览' : '查看 Mermaid 代码'}
            className={`rounded p-1.5 transition-colors ${showCode ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
          >
            <Code className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="复制图表代码"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleDownloadSvg}
            disabled={!svgCode}
            title="导出为 SVG 矢量图"
            className="flex items-center space-x-1 rounded bg-[var(--primary)] text-white px-2 py-1 text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <Download className="h-3 w-3" />
            <span>导出 SVG</span>
          </button>
        </div>
      </div>

      {/* Main Diagram Canvas */}
      <div className="flex-1 overflow-auto bg-[#0a0e17] p-6 flex items-center justify-center relative">
        {loading ? (
          <div className="flex items-center space-x-2 text-indigo-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-mono">正在实时渲染 Mermaid 拓扑图...</span>
          </div>
        ) : renderError ? (
          <div className="max-w-md rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300">
            <div className="flex items-center space-x-2 font-semibold text-xs mb-2">
              <AlertCircle className="h-4 w-4 text-rose-400" />
              <span>Mermaid 语法解析失败</span>
            </div>
            <pre className="font-mono text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto mb-3 bg-black/40 p-2 rounded">
              {renderError}
            </pre>
            <div className="text-[10px] text-rose-400/80">
              请检查图表语法格式，或点击上方代码按钮查看原始图表源码。
            </div>
          </div>
        ) : showCode ? (
          <div className="w-full h-full rounded-lg bg-[#0c1017] border border-[var(--border)] p-4 overflow-auto font-mono text-xs text-slate-200">
            <pre className="whitespace-pre-wrap">{content}</pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            className="transition-transform duration-150 ease-out select-none"
            dangerouslySetInnerHTML={{ __html: svgCode }}
          />
        )}
      </div>
    </div>
  );
};
