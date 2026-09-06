import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CornerDownLeft,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ansiToHtml } from '../utils/ansi';

export interface LiveTerminalCardProps {
  sessionId: string;
  stepId?: string;
  command?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  liveOutput?: string;
  defaultOutput?: string;
  onSendStdin?: (input: string) => void;
  onStop?: () => void;
  title?: string;
  isExpandable?: boolean;
}

export const LiveTerminalCard: React.FC<LiveTerminalCardProps> = ({
  sessionId,
  stepId,
  command,
  status,
  liveOutput = '',
  defaultOutput = '',
  onSendStdin,
  onStop,
  title,
  isExpandable = true
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [stdinText, setStdinText] = useState('');
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [clearedOutput, setClearedOutput] = useState(false);

  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayOutput = clearedOutput ? '' : (liveOutput || defaultOutput);

  // Auto scroll to bottom when output changes
  useEffect(() => {
    if (isAutoScroll && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [displayOutput, isAutoScroll]);

  // Auto focus input when running
  useEffect(() => {
    if (status === 'running' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [status]);

  const handleSendInput = (textToSend?: string) => {
    const input = (textToSend !== undefined ? textToSend : stdinText).trim();
    if (!input && textToSend === undefined) return;

    if (window.electronAPI) {
      window.electronAPI.sendTerminalInput(sessionId, input);
    } else if (onSendStdin) {
      onSendStdin(input);
    }
    setStdinText('');
    setClearedOutput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendInput();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const formattedHtml = ansiToHtml(displayOutput);

  return (
    <div className="my-2 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden font-mono text-xs select-text">
      {/* Terminal Header Bar (ASTeam Design: Muted surface with semantic status badges) */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)] bg-[var(--muted)]/40 select-none">
        <div className="flex items-center space-x-2">
          {status === 'running' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)] shrink-0" />
          ) : status === 'completed' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : status === 'failed' ? (
            <AlertCircle className="h-3.5 w-3.5 text-[var(--error)] shrink-0" />
          ) : (
            <Terminal className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
          )}

          <span className="font-semibold text-xs text-[var(--foreground)] truncate max-w-[320px]">
            {title || (command ? `$ ${command}` : '交互式控制台 (Live Terminal)')}
          </span>

          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${
            status === 'running'
              ? 'bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 animate-pulse'
              : status === 'completed'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              : status === 'failed'
              ? 'bg-[var(--error)]/15 text-[var(--error)] border border-[var(--error)]/30'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]'
          }`}>
            {status === 'running' ? 'LIVE RUNNING' : status.toUpperCase()}
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={handleCopy}
            title="复制控制台输出"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--primary)]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setClearedOutput(true)}
            title="清空输出"
            className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {isExpandable && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? '展开控制台' : '折叠控制台'}
              className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
            >
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Screen Body (ASTeam Deep Slate/Forest Terminal) */}
      {!isCollapsed && (
        <>
          <div
            ref={terminalBodyRef}
            className="max-h-64 min-h-[90px] overflow-y-auto p-3.5 text-[11.5px] leading-relaxed whitespace-pre-wrap break-all dark:bg-[#0c1411] dark:text-[#d6e2dd] bg-[#f2f7f5] text-[#14231f] border-y border-[var(--border)] selection:bg-[var(--primary)] selection:text-white"
          >
            {command && !displayOutput.includes(`$ ${command}`) && (
              <div className="text-[var(--primary)] dark:text-emerald-400 font-semibold mb-1.5 select-text font-mono">
                $ {command}
              </div>
            )}

            {displayOutput ? (
              <div
                dangerouslySetInnerHTML={{ __html: formattedHtml }}
                className="font-mono"
              />
            ) : status === 'running' ? (
              <div className="flex items-center space-x-2 text-[var(--muted-foreground)] italic">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                <span>等待命令输出流... (实时通信管道已就绪)</span>
              </div>
            ) : (
              <span className="text-zinc-500 italic">(无控制台输出)</span>
            )}
          </div>

          {/* Interactive stdin input bar (active when status === 'running') */}
          {status === 'running' && (
            <div className="border-t border-[var(--border)] bg-[var(--card)] p-2.5">
              <div className="flex items-center space-x-2">
                <span className="text-[var(--primary)] font-bold text-xs pl-1 font-mono">&gt;</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={stdinText}
                  onChange={(e) => setStdinText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入标准输入 (stdin)，例如输入 y 或所需参数后回车..."
                  className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleSendInput()}
                  disabled={!stdinText.trim()}
                  className="flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  <span>提交</span>
                </button>
              </div>

              {/* Quick Choice Chips */}
              <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-[var(--muted-foreground)] select-none pl-4">
                <span>快捷键:</span>
                {[
                  { label: 'Enter (回车)', val: '' },
                  { label: 'Yes (y)', val: 'y' },
                  { label: 'No (n)', val: 'n' },
                  { label: '终止进程 (Ctrl+C)', val: '__CTRL_C__', isDanger: true }
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (chip.val === '__CTRL_C__' && onStop) {
                        onStop();
                      } else {
                        handleSendInput(chip.val);
                      }
                    }}
                    className={`rounded-md px-2 py-0.5 border text-[11px] font-medium transition-colors cursor-pointer ${
                      chip.isDanger
                        ? 'bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30'
                        : 'bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] border-[var(--border)]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
