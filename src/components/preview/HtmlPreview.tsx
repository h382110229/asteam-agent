import React, { useState, useRef, useEffect } from 'react';
import {
  Monitor,
  Tablet,
  Smartphone,
  RotateCw,
  Sun,
  Moon,
  ExternalLink,
  Copy,
  Check,
  Code,
  Download,
  Globe,
  FolderOpen
} from 'lucide-react';

interface HtmlPreviewProps {
  content: string;
  title?: string;
  filePath?: string;
}

export const HtmlPreview: React.FC<HtmlPreviewProps> = ({ content, title, filePath }) => {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [browserOpening, setBrowserOpening] = useState(false);
  const [savedFilePath, setSavedFilePath] = useState<string | undefined>(filePath);

  useEffect(() => {
    if (filePath) {
      setSavedFilePath(filePath);
    }
  }, [filePath]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownloadHtml = async () => {
    try {
      const defaultName = title?.endsWith('.html') ? title : `${title || 'page'}.html`;
      if (window.electronAPI?.saveFile) {
        await window.electronAPI.saveFile({
          defaultName,
          content,
          isBase64: false
        });
      } else {
        const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(url);
        }, 3000);
      }
    } catch (e) {
      console.error('Failed to download HTML:', e);
    }
  };

  const getViewportWidth = () => {
    switch (viewport) {
      case 'mobile':
        return 'w-[390px]';
      case 'tablet':
        return 'w-[768px]';
      default:
        return 'w-full';
    }
  };

  // Ensure standard HTML structure
  const wrappedContent = content.includes('<html')
    ? content
    : `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'ASTeam HTML Preview'}</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: ${themeMode === 'dark' ? '#0f172a' : '#ffffff'};
      color: ${themeMode === 'dark' ? '#f8fafc' : '#0f172a'};
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;

  const handleOpenInDefaultBrowser = async () => {
    try {
      setBrowserOpening(true);
      if (window.electronAPI?.openInBrowser) {
        const res = await window.electronAPI.openInBrowser({
          content: wrappedContent,
          title: title || 'preview',
          defaultPath: savedFilePath
        });
        if (res.success && res.filePath) {
          setSavedFilePath(res.filePath);
        }
      } else {
        const blob = new Blob([wrappedContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (e) {
      console.error('Failed to open in default browser:', e);
    } finally {
      setTimeout(() => setBrowserOpening(false), 1000);
    }
  };

  const handleRevealInFolder = async () => {
    if (savedFilePath && window.electronAPI?.showItemInFolder) {
      await window.electronAPI.showItemInFolder(savedFilePath);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--background)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 bg-[var(--card)] select-none text-xs">
        {/* Viewport switcher */}
        <div className="flex items-center space-x-1 bg-[var(--muted)] rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`flex items-center space-x-1 rounded px-2 py-1 transition-colors ${
              viewport === 'desktop' ? 'bg-[var(--background)] text-[var(--primary)] font-semibold shadow-xs' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            title="桌面全宽视图"
          >
            <Monitor className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">桌面</span>
          </button>

          <button
            type="button"
            onClick={() => setViewport('tablet')}
            className={`flex items-center space-x-1 rounded px-2 py-1 transition-colors ${
              viewport === 'tablet' ? 'bg-[var(--background)] text-[var(--primary)] font-semibold shadow-xs' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            title="平板视图 (768px)"
          >
            <Tablet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">平板</span>
          </button>

          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`flex items-center space-x-1 rounded px-2 py-1 transition-colors ${
              viewport === 'mobile' ? 'bg-[var(--background)] text-[var(--primary)] font-semibold shadow-xs' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            title="移动端视图 (390px)"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">移动端</span>
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setThemeMode(m => m === 'dark' ? 'light' : 'dark')}
            title={themeMode === 'dark' ? '切换为亮色底板' : '切换为暗色底板'}
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            {themeMode === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-indigo-400" />}
          </button>

          <button
            type="button"
            onClick={() => setIframeKey(k => k + 1)}
            title="重新渲染刷新"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            title={showCode ? '切换到视觉预览' : '查看源代码'}
            className={`rounded p-1.5 transition-colors ${showCode ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
          >
            <Code className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="复制 HTML 源码"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleDownloadHtml}
            title="另存为本地 HTML 文件"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          {savedFilePath && (
            <button
              type="button"
              onClick={handleRevealInFolder}
              title={`在 Windows 资源管理器中定位 (${savedFilePath})`}
              className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--muted)] transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenInDefaultBrowser}
            title="在系统默认浏览器中打开 (Chrome/Edge)"
            className={`rounded p-1.5 transition-colors flex items-center space-x-1 ${
              browserOpening
                ? 'text-[var(--primary)] bg-[var(--primary)]/15 animate-pulse'
                : 'text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--muted)]'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium hidden md:inline">浏览器外置打开</span>
          </button>
        </div>
      </div>

      {/* Main Content Viewer */}
      <div className="flex-1 overflow-auto bg-[#0a0e14] p-4 flex justify-center items-start">
        {showCode ? (
          <div className="w-full h-full rounded-lg bg-[#0c1017] border border-[var(--border)] p-4 overflow-auto font-mono text-xs text-slate-200">
            <pre className="whitespace-pre-wrap">{content}</pre>
          </div>
        ) : (
          <div className={`h-full rounded-xl overflow-hidden border border-[var(--border)] shadow-2xl transition-all duration-200 ${getViewportWidth()} ${
            themeMode === 'dark' ? 'bg-slate-900' : 'bg-white'
          }`}>
            <iframe
              key={iframeKey}
              ref={iframeRef}
              srcDoc={wrappedContent}
              title={title || 'HTML Preview'}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              className="h-full w-full border-0"
            />
          </div>
        )}
      </div>
    </div>
  );
};
