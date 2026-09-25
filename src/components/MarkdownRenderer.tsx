import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Info, AlertTriangle, Lightbulb, ShieldAlert, Terminal } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onOpenPreview?: (data: any) => void;
}

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ inline, className, children }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeText = String(children || '').replace(/\n$/, '');

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[12px] bg-[var(--muted)] text-[var(--primary)] border border-[var(--border)]/50 select-text">
        {children}
      </code>
    );
  }

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--border)] bg-[#18181b] text-zinc-100 shadow-sm group">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#27272a]/70 border-b border-zinc-700/60 text-xs">
        <div className="flex items-center space-x-2 text-zinc-400">
          <Terminal className="h-3.5 w-3.5 text-zinc-400" />
          <span className="font-mono text-[11px] font-medium tracking-wide uppercase">
            {language || 'code'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-700/60 transition-colors cursor-pointer"
          title="复制代码"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <pre className="p-3.5 text-[12px] font-mono leading-relaxed overflow-x-auto select-text scrollbar-thin scrollbar-thumb-zinc-700">
        <code>{children}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  return (
    <div className={`prose-container text-[13px] leading-relaxed text-[var(--foreground)] ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock as any,
          table: ({ children }) => (
            <div className="my-3.5 w-full overflow-x-auto rounded-xl border border-[var(--border)] shadow-xs bg-[var(--card)]">
              <table className="w-full text-left border-collapse text-[12.5px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--muted)]/75 border-b border-[var(--border)] font-semibold text-[var(--foreground)]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-semibold text-xs text-[var(--foreground)] border-r border-[var(--border)]/40 last:border-r-0 whitespace-nowrap">
              {children}
            </th>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[var(--border)]/40">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[var(--muted)]/30 transition-colors">{children}</tr>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2 text-[var(--foreground)] border-r border-[var(--border)]/30 last:border-r-0 align-top">
              {children}
            </td>
          ),
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-4 mb-2 text-[var(--foreground)] flex items-center space-x-2 border-b border-[var(--border)]/50 pb-1">
              <span>{children}</span>
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-3.5 mb-2 text-[var(--foreground)] flex items-center space-x-1.5">
              <span>{children}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-3 mb-1.5 text-[var(--foreground)]">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold mt-2.5 mb-1 text-[var(--muted-foreground)] uppercase tracking-wider">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-2 leading-relaxed break-words">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-5 list-disc space-y-1 text-[13px]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-5 list-decimal space-y-1 text-[13px]">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,
          hr: () => <hr className="my-4 border-[var(--border)]" />,
          blockquote: ({ children }) => {
            // Check for GitHub alert patterns: [!NOTE], [!TIP], [!WARNING], [!CAUTION]
            return (
              <blockquote className="my-3 rounded-xl border-l-4 border-[var(--primary)] bg-[var(--muted)]/40 p-3 text-[12.5px] italic text-[var(--foreground)] shadow-2xs">
                {children}
              </blockquote>
            );
          },
          a: ({ href, children }) => {
            const isLocalPath = href && (/^[a-zA-Z]:[\\/]/.test(href) || href.startsWith('/'));
            if (isLocalPath) {
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (window.electronAPI?.showItemInFolder) {
                      window.electronAPI.showItemInFolder(href);
                    }
                  }}
                  className="inline-flex items-center space-x-1 text-[var(--primary)] hover:underline font-mono text-[12px] bg-[var(--primary)]/10 px-1.5 py-0.5 rounded cursor-pointer"
                  title="在系统文件管理器中定位"
                >
                  <span>{children}</span>
                </button>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline font-medium break-all"
              >
                {children}
              </a>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
