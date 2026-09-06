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
    <div className="my-2 rounded-xl border border-[#30363d] bg-[#0c1017] text-slate-200 shadow-md overflow-hidden font-mono text-xs select-text">
      {/* Terminal Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#30363d] select-none">
        <div className="flex items-center space-x-2">
          {status === 'running' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400 shrink-0" />
          ) : status === 'completed' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          ) : status === 'failed' ? (
            <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          ) : (
            <Terminal className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          )}

          <span className="font-semibold text-[11px] text-slate-200 truncate max-w-[280px]">
            {title || (command ? `$ ${command}` : '交互式控制台 (Live Terminal)')}
          </span>

          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            status === 'running'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : status === 'completed'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : status === 'failed'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'bg-slate-700/40 text-slate-400 border border-slate-700'
          }`}>
            {status === 'running' ? 'LIVE' : status}
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={handleCopy}
            title="复制控制台输出"
            className="rounded p-1 text-slate-400 hover:text-slate-100 hover:bg-[#30363d] transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={() => setClearedOutput(true)}
            title="清空输出"
            className="rounded p-1 text-slate-400 hover:text-slate-100 hover:bg-[#30363d] transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>

          {isExpandable && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? '展开控制台' : '折叠控制台'}
              className="rounded p-1 text-slate-400 hover:text-slate-100 hover:bg-[#30363d] transition-colors"
            >
              {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Screen Body */}
      {!isCollapsed && (
        <>
          <div
            ref={terminalBodyRef}
            className="max-h-64 min-h-[80px] overflow-y-auto p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all selection:bg-cyan-900 selection:text-white"
          >
            {command && !displayOutput.includes(`$ ${command}`) && (
              <div className="text-amber-400/90 font-bold mb-1.5 select-text">
                $ {command}
              </div>
            )}

            {displayOutput ? (
              <div
                dangerouslySetInnerHTML={{ __html: formattedHtml }}
                className="font-mono"
              />
            ) : status === 'running' ? (
              <div className="flex items-center space-x-2 text-slate-400 italic">
                <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                <span>等待命令执行流... (已连接实时输出)</span>
              </div>
            ) : (
              <span className="text-slate-500 italic">(无控制台输出)</span>
            )}
          </div>

          {/* Interactive stdin input bar (active when status === 'running') */}
          {status === 'running' && (
            <div className="border-t border-[#30363d] bg-[#161b22]/95 p-2">
              <div className="flex items-center space-x-2">
                <span className="text-emerald-400 font-bold text-xs pl-1">&gt;</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={stdinText}
                  onChange={(e) => setStdinText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入标准输入 (stdin)，如 y / n / 命令参数..."
                  className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => handleSendInput()}
                  disabled={!stdinText.trim()}
                  className="flex items-center space-x-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 px-2.5 py-1 text-[11px] font-medium text-white transition-colors cursor-pointer"
                >
                  <CornerDownLeft className="h-3 w-3" />
                  <span>发送</span>
                </button>
              </div>

              {/* Quick Choice Chips */}
              <div className="mt-1.5 flex items-center space-x-1.5 text-[10px] text-slate-400 select-none pl-4">
                <span>快捷响应:</span>
                {[
                  { label: 'Enter (回车)', val: '' },
                  { label: 'Yes (y)', val: 'y' },
                  { label: 'No (n)', val: 'n' },
                  { label: '终止进程 (Ctrl+C)', val: '__CTRL_C__' }
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
                    className="rounded bg-[#21262d] hover:bg-[#30363d] hover:text-slate-200 px-1.5 py-0.5 border border-[#30363d] text-slate-300 transition-colors cursor-pointer"
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
