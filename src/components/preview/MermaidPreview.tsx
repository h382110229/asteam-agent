import React, { useState, useEffect, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Code,
  Wand2,
  Play,
  Image as ImageIcon
} from 'lucide-react';

interface MermaidPreviewProps {
  content: string;
  title?: string;
}

/**
 * 智能清洗并修复 LLM 生成的 Mermaid 代码中的常见语法缺陷：
 * 1. 箭头标注包含括号或特殊字符未加引号: 如 `-->|变更监听 (Chokidar)|` => `-->|"变更监听 (Chokidar)"|`
 * 2. 节点形状包含嵌套括号未转义: 如 `id(文本 (说明))` => `id["文本 (说明)"]`
 * 3. 剥离可能残留的 Markdown 标记
 */
export function sanitizeMermaidCode(raw: string): string {
  if (!raw) return '';

  // 1. 剥离 Markdown 围栏代码块
  let clean = raw.replace(/^```(?:mermaid)?/gm, '').replace(/```$/gm, '').trim();

  // 2. 修复箭头标注 |...| 未加引号时包含括号、特殊符号导致的解析崩溃
  // 匹配形如 -->|label|, -.->|label|, ==>|label|, ---|label|
  clean = clean.replace(/(-->|-.->|==>|---|~~~)\|([^|\r\n]+?)\|/g, (match, arrow, label) => {
    const trimmed = label.trim();
    // 如果已经带有双引号包裹，则不处理
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return match;
    }
    // 对内部的双引号进行单引号转义，并使用双引号安全包裹
    const escaped = trimmed.replace(/"/g, "'");
    return `${arrow}|"${escaped}"|`;
  });

  // 3. 修复圆括号节点中嵌套括号导致的崩溃 (如 `A(服务 (Daemon))` => `A["服务 (Daemon)"]`)
  clean = clean.replace(/([a-zA-Z0-9_-]+)\(\s*([^()]+?\([^()]+?\)[^()]*?)\s*\)/g, (match, id, text) => {
    const escaped = text.trim().replace(/"/g, "'");
    return `${id}["${escaped}"]`;
  });

  return clean;
}

export const MermaidPreview: React.FC<MermaidPreviewProps> = ({ content, title }) => {
  const [editableCode, setEditableCode] = useState<string>(() => sanitizeMermaidCode(content));
  const [svgCode, setSvgCode] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // 当外部传入的 content 变化时同步
  useEffect(() => {
    setEditableCode(sanitizeMermaidCode(content));
  }, [content]);

  // 渲染 Mermaid 图表
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setRenderError(null);

    const renderGraph = async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        });

        const id = 'mermaid-render-' + Math.random().toString(36).substring(2, 9);
        const codeToRender = editableCode.trim();

        if (!codeToRender) {
          if (isMounted) {
            setSvgCode('');
            setLoading(false);
          }
          return;
        }

        const { svg } = await mermaid.render(id, codeToRender);
        if (isMounted) {
          setSvgCode(svg);
          setRenderError(null);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Mermaid initial parse error:', err);
          // 尝试更激进的自动修复 (将所有未包裹引号的节点文字加上引号)
          try {
            const { default: mermaid } = await import('mermaid');
            const aggressiveFixed = editableCode
              .replace(/\[\s*([^\[\]]+?)\s*\]/g, '["$1"]')
              .replace(/\|([^|\r\n]+?)\|/g, '|"$1"|');
            const fallbackId = 'mermaid-fallback-' + Math.random().toString(36).substring(2, 9);
            const { svg } = await mermaid.render(fallbackId, aggressiveFixed);
            setSvgCode(svg);
            setRenderError(null);
            setLoading(false);
            return;
          } catch {}

          setRenderError(err.message || 'Mermaid 语法解析失败');
          setLoading(false);
        }
      }
    };

    renderGraph();

    return () => {
      isMounted = false;
    };
  }, [editableCode]);

  const handleApplyAutoFix = () => {
    const aggressivelyFixed = editableCode
      .replace(/(-->|-.->|==>|---|~~~)\|([^|\r\n]+?)\|/g, (m, arrow, label) => {
        const cleanLabel = label.replace(/"/g, "'").trim();
        return `${arrow}|"${cleanLabel}"|`;
      })
      .replace(/([a-zA-Z0-9_-]+)\(([^()]+?\([^()]+?\)[^()]*?)\)/g, '$1["$2"]')
      .replace(/\[\s*([^"\[\]]+?)\s*\]/g, '["$1"]');
    setEditableCode(aggressivelyFixed);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const [copiedImage, setCopiedImage] = useState(false);

  const getSvgAsCanvas = async (scale = 2): Promise<HTMLCanvasElement | null> => {
    if (!svgCode) return null;
    return new Promise((resolve) => {
      const img = new Image();
      const svgBlob = new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = (img.width || 900) * scale;
        canvas.height = (img.height || 600) * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0f172a';
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
      a.download = `${title || 'architecture'}.png`;
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
    <div className="flex h-full flex-col bg-[var(--background)] text-[var(--foreground)] overflow-hidden select-none">
      {/* Header Toolbar (Strictly adhering to ASteam UI design tokens) */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 bg-[var(--card)] text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-xs text-[var(--foreground)]">
            {title || 'Mermaid 架构流程拓扑图'}
          </span>
          <span className="rounded bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 px-1.5 py-0.5 text-[9px] font-bold">
            MERMAID
          </span>
        </div>

        {/* Zoom & Actions */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}
            title="缩小"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
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
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoom(1)}
            title="恢复 100% 原始缩放"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-px bg-[var(--border)] mx-1" />

          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            title={showCode ? '切换至图表视图' : '查看/在线编辑图表源码'}
            className={`flex items-center space-x-1 rounded px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
              showCode
                ? 'text-[var(--primary)] bg-[var(--primary)]/15 border border-[var(--primary)]/30'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>{showCode ? '预览图表' : '源码编辑'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="复制图表代码"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--primary)]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleCopyImage}
            disabled={!svgCode}
            title="一键复制高清 PNG 图片到剪贴板 (可直接粘贴至 PPT/Word/微信)"
            className="flex items-center space-x-1 rounded bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] px-2 py-1 text-[11px] font-medium disabled:opacity-40 transition-colors cursor-pointer"
          >
            {copiedImage ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <ImageIcon className="h-3.5 w-3.5" />}
            <span>{copiedImage ? '已复制图片' : '复制图片'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={!svgCode}
            title="导出为 2x 高清 PNG 图片"
            className="flex items-center space-x-1 rounded bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] px-2 py-1 text-[11px] font-medium disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Download className="h-3 w-3" />
            <span>导出 PNG</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadSvg}
            disabled={!svgCode}
            title="导出为 SVG 矢量图"
            className="flex items-center space-x-1 rounded bg-[var(--primary)] text-white px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--primary-hover)] disabled:opacity-40 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="h-3 w-3" />
            <span>导出 SVG</span>
          </button>
        </div>
      </div>

      {/* Main Diagram Canvas with Subtle Grid Pattern */}
      <div
        className="flex-1 overflow-auto p-6 flex items-center justify-center relative dark:bg-[#0c1411] bg-[#f5f9f7]"
        style={{
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      >
        {loading ? (
          <div className="flex items-center space-x-2 text-[var(--primary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-mono">正在渲染 Mermaid 架构拓扑图...</span>
          </div>
        ) : renderError ? (
          <div className="max-w-xl w-full rounded-xl border border-[var(--error)]/40 bg-[var(--card)] p-5 text-[var(--foreground)] shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center space-x-2 text-[var(--error)] font-semibold text-xs">
                <AlertCircle className="h-4 w-4" />
                <span>Mermaid 语法解析提示</span>
              </div>
              <button
                type="button"
                onClick={handleApplyAutoFix}
                className="flex items-center space-x-1 rounded bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>一键智能语法修复</span>
              </button>
            </div>

            <p className="text-xs text-[var(--muted-foreground)] mb-2">
              检测到图表源码中存在未转义的特殊字符（如箭头标注包含括号或未加引号），请点击上方“一键智能语法修复”，或在下方直接编辑代码：
            </p>

            <div className="rounded-lg bg-[var(--muted)]/50 p-2.5 border border-[var(--border)] font-mono text-[11px] text-[var(--error)] max-h-24 overflow-y-auto mb-3">
              {renderError}
            </div>

            {/* In-place Editable Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>图表源码 (可直接修改):</span>
                <button
                  type="button"
                  onClick={() => setShowCode(true)}
                  className="text-[var(--primary)] hover:underline flex items-center space-x-1"
                >
                  <Code className="h-3 w-3" />
                  <span>全屏编辑模式</span>
                </button>
              </div>
              <textarea
                value={editableCode}
                onChange={(e) => setEditableCode(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 font-mono text-[11px] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] select-text"
              />
            </div>
          </div>
        ) : showCode ? (
          <div className="w-full h-full max-w-4xl flex flex-col rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden animate-in fade-in">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs">
              <span className="font-semibold text-[var(--foreground)]">Mermaid 源码编辑器</span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleApplyAutoFix}
                  className="flex items-center space-x-1 rounded bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] px-2.5 py-1 text-xs transition-colors cursor-pointer"
                >
                  <Wand2 className="h-3 w-3 text-[var(--primary)]" />
                  <span>智能排版与转义</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCode(false)}
                  className="flex items-center space-x-1 rounded bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Play className="h-3 w-3" />
                  <span>立即渲染查看</span>
                </button>
              </div>
            </div>
            <textarea
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
              className="flex-1 w-full bg-[var(--background)] p-4 font-mono text-xs text-[var(--foreground)] leading-relaxed focus:outline-none resize-none select-text"
              spellCheck={false}
            />
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
