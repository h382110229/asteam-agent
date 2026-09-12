import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Zap,
  ArrowRight,
  HardDrive
} from 'lucide-react';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings
}) => {
  const [status, setStatus] = useState<string>('idle');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [progress, setProgress] = useState<{
    percent: number;
    transferredBytes: number;
    totalBytes: number;
    bytesPerSecond: number;
  }>({
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'downloaded') {
      setRestartCountdown(5);
    } else {
      setRestartCountdown(null);
    }
  }, [status]);

  useEffect(() => {
    if (restartCountdown === null) return;
    if (restartCountdown <= 0) {
      handleInstallAndRestart();
      return;
    }
    const timer = setTimeout(() => {
      setRestartCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [restartCountdown]);

  useEffect(() => {
    if (!isOpen) return;

    if (window.electronAPI?.getUpdateStatus) {
      window.electronAPI.getUpdateStatus().then((res) => {
        if (res) {
          setStatus(res.status);
          setUpdateInfo(res.updateInfo);
          setErrorMessage(res.error);
        }
      });
    }

    if (window.electronAPI?.onUpdateEvent) {
      const unsubscribe = window.electronAPI.onUpdateEvent((payload) => {
        if (payload.type === 'status') {
          setStatus(payload.status || 'idle');
          if (payload.updateInfo) setUpdateInfo(payload.updateInfo);
          setErrorMessage(payload.error || null);
        } else if (payload.type === 'progress' && payload.progress) {
          setProgress(payload.progress);
        }
      });
      return unsubscribe;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCheckUpdates = async () => {
    setStatus('checking');
    setErrorMessage(null);
    try {
      const res = await window.electronAPI?.checkForUpdates?.();
      if (res) {
        setUpdateInfo(res);
        setStatus(res.hasUpdate ? 'available' : 'up-to-date');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || '检查更新出错');
    }
  };

  const handleStartDownload = async () => {
    setStatus('downloading');
    setErrorMessage(null);
    try {
      const res = await window.electronAPI?.startDownloadUpdate?.();
      if (!res?.success) {
        setStatus('error');
        setErrorMessage(res?.error || '下载安装包失败');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || '下载出错');
    }
  };

  const handleInstallAndRestart = async () => {
    setStatus('installing');
    try {
      await window.electronAPI?.installAndRestartUpdate?.(true);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || '启动安装包失败');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number): string => {
    if (!bytesPerSec || bytesPerSec === 0) return '0 KB/s';
    if (bytesPerSec >= 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
    }
    return Math.round(bytesPerSec / 1024) + ' KB/s';
  };

  const formatEta = (transferred: number, total: number, bytesPerSec: number): string => {
    if (!total || !bytesPerSec || bytesPerSec <= 0 || transferred >= total) return '';
    const remainingBytes = total - transferred;
    const seconds = Math.ceil(remainingBytes / bytesPerSec);
    if (seconds < 60) return `剩余约 ${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remSec = seconds % 60;
    return `剩余约 ${minutes} 分 ${remSec} 秒`;
  };

  const renderChangelogItem = (log: string) => {
    const match = log.match(/^【(.*?)】(.*)$/);
    if (!match) return <span>{log}</span>;
    const tag = match[1];
    const text = match[2];
    let badgeClass = "bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/30";
    if (tag.includes('新增') || tag.includes('直达') || tag.includes('特性') || tag.includes('前台') || tag.includes('原生') || tag.includes('Shell')) {
      badgeClass = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    } else if (tag.includes('修复') || tag.includes('安全') || tag.includes('瘦身') || tag.includes('清理')) {
      badgeClass = "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    } else if (tag.includes('守护') || tag.includes('重启') || tag.includes('平滑') || tag.includes('脱钩')) {
      badgeClass = "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30";
    }
    return (
      <div className="flex items-start space-x-1.5 leading-relaxed">
        <span className={`inline-flex items-center px-1.5 py-0.2 rounded border text-[10px] font-semibold shrink-0 mt-0.5 ${badgeClass}`}>
          {tag}
        </span>
        <span>{text}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 bg-[var(--background)]">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                ASTeam Agent 自动更新中心
                {updateInfo?.latestVersion && (
                  <span className="rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[10px] font-mono font-medium text-[var(--primary)]">
                    v{updateInfo.latestVersion}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                企业私有环境平滑升级与防篡改分发体系
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Status: Checking */}
          {status === 'checking' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-[var(--primary)]" />
              <p className="text-sm font-medium text-[var(--foreground)]">
                正在与 ASTeam 企业服务器同步版本清单...
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                验证平台架构、通道策略与版本兼容性
              </p>
            </div>
          )}

          {/* Status: Up to date */}
          {status === 'up-to-date' && (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                当前客户端已是最新版本
              </h3>
              <p className="text-xs text-[var(--muted-foreground)] max-w-xs">
                当前版本为 v{updateInfo?.currentVersion || '1.9.5'}，已包含最新的 Office 本地生成套件、沙箱隔离与安全围栏。
              </p>
              <button
                type="button"
                onClick={handleCheckUpdates}
                className="mt-2 inline-flex items-center space-x-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:border-[var(--primary)] transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>再次检测</span>
              </button>
            </div>
          )}

          {/* Status: Error */}
          {status === 'error' && (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-3">
              <div className="flex items-start space-x-2.5">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-600 dark:text-red-400">
                    更新检测或下载过程中发生异常
                  </h4>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                    {errorMessage || '无法连接到更新服务器，请确认网络连接或服务器配置。'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-red-500/10">
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSettings();
                    }}
                    className="px-3 py-1 rounded-md border border-[var(--border)] text-[11px] hover:bg-[var(--muted)]"
                  >
                    配置服务器地址
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCheckUpdates}
                  className="px-3 py-1 rounded-md bg-[var(--primary)] text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
                >
                  重试
                </button>
              </div>
            </div>
          )}

          {/* Status: Available or Downloading or Downloaded */}
          {(status === 'available' || status === 'downloading' || status === 'downloaded' || (status === 'idle' && updateInfo?.hasUpdate)) && (
            <div className="space-y-4">
              {/* Mandatory banner */}
              {updateInfo?.isMandatory && (
                <div className="flex items-center space-x-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-amber-600 dark:text-amber-400">
                  <Zap className="h-4 w-4 shrink-0" />
                  <span className="text-[11px] font-medium">
                    本次更新为企业强制安全升级，当前版本低于最低支持基线 (v{updateInfo.minSupportedVersion})。
                  </span>
                </div>
              )}

              {/* Release Card */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">
                      {updateInfo?.title || `ASTeam Agent v${updateInfo?.latestVersion}`}
                    </h3>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      发布日期: {updateInfo?.releaseDate ? new Date(updateInfo.releaseDate).toLocaleDateString() : '最新'}
                    </p>
                  </div>
                  {updateInfo?.assets?.installer?.fileSize > 0 && (
                    <div className="text-right">
                      <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
                        包体大小: {formatBytes(updateInfo.assets.installer.fileSize)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Changelog */}
                {Array.isArray(updateInfo?.changelog) && updateInfo.changelog.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                    <span className="text-[11px] font-medium text-[var(--foreground)]">
                      更新亮点与变更清单:
                    </span>
                    <ul className="space-y-1.5 pl-0.5">
                      {updateInfo.changelog.map((log: string, idx: number) => (
                        <li key={idx} className="text-[11px] text-[var(--muted-foreground)]">
                          {renderChangelogItem(log)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Downloading Progress Bar */}
              {status === 'downloading' && (
                <div className="p-4 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[var(--foreground)] flex items-center gap-1.5">
                      <Download className="h-3.5 w-3.5 animate-bounce text-[var(--primary)]" />
                      正在下载安装包...
                    </span>
                    <span className="font-mono font-semibold text-[var(--primary)]">
                      {progress.percent}%
                    </span>
                  </div>

                  {/* Progress track */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className="h-full bg-[var(--primary)] transition-all duration-300 rounded-full"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] font-mono">
                    <span>
                      {formatBytes(progress.transferredBytes)} / {formatBytes(progress.totalBytes)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>瞬时速率: {formatSpeed(progress.bytesPerSecond)}</span>
                      {formatEta(progress.transferredBytes, progress.totalBytes, progress.bytesPerSecond) && (
                        <span className="text-[var(--primary)] font-sans">
                          ({formatEta(progress.transferredBytes, progress.totalBytes, progress.bytesPerSecond)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Downloaded Confirmation */}
              {status === 'downloaded' && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
                  <div className="flex items-start space-x-3">
                    <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-semibold text-xs">安装包下载完成并通过安全校验</h5>
                      <p className="text-[11px] opacity-90 mt-0.5">
                        SHA-256 二进制完整性哈希比对通过。
                        {restartCountdown !== null && restartCountdown > 0
                          ? `将于 ${restartCountdown} 秒后自动启动升级并平滑重启...`
                          : '点击右下方按钮立即执行平滑升级安装。'}
                      </p>
                    </div>
                  </div>
                  {restartCountdown !== null && restartCountdown > 0 && (
                    <button
                      type="button"
                      onClick={() => setRestartCountdown(null)}
                      className="text-[11px] px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 shrink-0 cursor-pointer font-medium ml-2"
                    >
                      暂停倒计时
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 bg-[var(--background)]">
          <div className="flex items-center space-x-2 text-[11px] text-[var(--muted-foreground)]">
            <HardDrive className="h-3 w-3" />
            <span>当前通道: 稳定通道 (Stable)</span>
          </div>

          <div className="flex items-center space-x-2">
            {!updateInfo?.isMandatory && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                稍后提醒
              </button>
            )}

            {(status === 'available' || (status === 'idle' && updateInfo?.hasUpdate)) && (
              <button
                type="button"
                onClick={handleStartDownload}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-medium text-white shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>立即下载更新</span>
              </button>
            )}

            {status === 'downloaded' && (
              <button
                type="button"
                onClick={handleInstallAndRestart}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer animate-pulse"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span>
                  {restartCountdown !== null && restartCountdown > 0
                    ? `立即重启并安装 (${restartCountdown}s)`
                    : '立即重启并安装'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
