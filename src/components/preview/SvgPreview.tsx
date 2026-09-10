import React, { useState, useRef } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const prepareSvgString = (rawSvg: string): { svg: string; width: number; height: number } => {
    let svg = rawSvg.trim();

    // 自动转义裸露的 '&' (避免 XML 解析错误破坏 SVG 图像加载)
    svg = svg.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[a-f0-9]+);)/gi, '&amp;');

    if (!svg.includes('xmlns=')) {
      svg = svg.replace(/<svg\b([^>]*)>/i, '<svg xmlns="http://www.w3.org/2000/svg" $1>');
    }

    let width = 800;
    let height = 600;

    const viewBoxMatch = svg.match(/viewBox=["']\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s*["']/i);
    if (viewBoxMatch) {
      const vbW = parseFloat(viewBoxMatch[3]);
      const vbH = parseFloat(viewBoxMatch[4]);
      if (vbW > 0 && vbH > 0) {
        width = Math.round(vbW);
        height = Math.round(vbH);
      }
    }

    const widthMatch = svg.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i);
    const heightMatch = svg.match(/\bheight=["']([0-9.]+)(?:px)?["']/i);
    if (widthMatch) width = Math.round(parseFloat(widthMatch[1])) || width;
    if (heightMatch) height = Math.round(parseFloat(heightMatch[1])) || height;

    if (!svg.match(/<svg[^>]*\bwidth=["'][0-9.]+/i)) {
      svg = svg.replace(/<svg\b/i, `<svg width="${width}" height="${height}" `);
    }

    return { svg, width, height };
  };

  const getSvgAsCanvas = async (scale = 2): Promise<HTMLCanvasElement | null> => {
    if (!content) return null;

    let svgToUse = '';
    let width = 800;
    let height = 600;

    // 优先从已渲染的 DOM 提取并序列化 SVG（经过浏览器 DOM 容错，可确保实体和节点结构的合法性）
    const svgEl = containerRef.current?.querySelector('svg');
    if (svgEl) {
      try {
        const clone = svgEl.cloneNode(true) as SVGSVGElement;
        if (!clone.getAttribute('xmlns')) {
          clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
        const vb = clone.viewBox?.baseVal;
        const vbW = vb ? vb.width : 0;
        const vbH = vb ? vb.height : 0;
        const bbox = svgEl.getBoundingClientRect();
        width = Math.round(vbW || parseFloat(clone.getAttribute('width') || '') || bbox.width || 800);
        height = Math.round(vbH || parseFloat(clone.getAttribute('height') || '') || bbox.height || 600);
        clone.setAttribute('width', String(width));
        clone.setAttribute('height', String(height));
        svgToUse = new XMLSerializer().serializeToString(clone);
      } catch (e) {
        console.warn('DOM serialize failed, fallback to string:', e);
      }
    }

    if (!svgToUse) {
      const prepared = prepareSvgString(content);
      svgToUse = prepared.svg;
      width = prepared.width;
      height = prepared.height;
    }

    // 二次确保无残留未转义 &
    svgToUse = svgToUse.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[a-f0-9]+);)/gi, '&amp;');

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const svgBlob = new Blob([svgToUse], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        try {
          const targetWidth = (img.naturalWidth || width) * scale;
          const targetHeight = (img.naturalHeight || height) * scale;
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const isDark = document.documentElement.classList.contains('dark');
            ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas);
          } else {
            resolve(null);
          }
        } catch (e) {
          console.error('Canvas draw error:', e);
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };

      img.onerror = (e) => {
        console.error('Failed to load SVG into Image:', e);
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    });
  };

  const handleDownloadPng = async () => {
    const canvas = await getSvgAsCanvas(2);
    if (!canvas) {
      alert('生成高清 PNG 失败，请检查 SVG 语法是否完整。');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    if (window.electronAPI?.saveFile) {
      await window.electronAPI.saveFile({
        defaultName: `${title || 'graphic'}.png`,
        content: dataUrl,
        isBase64: true
      });
    } else {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title || 'graphic'}.png`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(url);
        }, 3000);
      }, 'image/png');
    }
  };

  const handleCopyImage = async () => {
    try {
      const canvas = await getSvgAsCanvas(2);
      if (!canvas) {
        alert('复制图片失败：无法转码为位图。');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      if (window.electronAPI?.copyImage) {
        const success = await window.electronAPI.copyImage(dataUrl);
        if (success) {
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 2000);
          return;
        }
      }

      // Fallback to web clipboard API
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
      alert('复制图片到剪贴板失败，请尝试直接点击【导出 PNG】。');
    }
  };

  const handleDownload = async () => {
    const { svg } = prepareSvgString(content);
    if (window.electronAPI?.saveFile) {
      await window.electronAPI.saveFile({
        defaultName: `${title || 'graphic'}.svg`,
        content: svg,
        isBase64: false
      });
    } else {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'graphic'}.svg`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 3000);
    }
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
            ref={containerRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            className="transition-transform duration-150 ease-out select-none flex items-center justify-center max-w-full max-h-full"
            dangerouslySetInnerHTML={{ __html: prepareSvgString(content).svg }}
          />
        )}
      </div>
    </div>
  );
};
