import React, { useState, useEffect } from 'react';
import { Table, FileSpreadsheet, FolderOpen, ExternalLink, Search, RefreshCw, AlertCircle } from 'lucide-react';

interface SheetData {
  name: string;
  rowCount: number;
  columnCount: number;
  rows: string[][];
}

interface ExcelPreviewProps {
  filePath?: string;
  title?: string;
  initialSheets?: SheetData[];
}

export const ExcelPreview: React.FC<ExcelPreviewProps> = ({ filePath, title, initialSheets }) => {
  const [sheets, setSheets] = useState<SheetData[]>(initialSheets || []);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(!initialSheets || initialSheets.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath || (initialSheets && initialSheets.length > 0)) {
      if (initialSheets && initialSheets.length > 0) {
        setSheets(initialSheets);
        setLoading(false);
      }
      return;
    }

    let isMounted = true;
    const loadExcelData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!window.electronAPI?.getArtifactPreview) {
          throw new Error('当前客户端不支持直接解析表格');
        }
        const res = await window.electronAPI.getArtifactPreview(filePath);
        if (!isMounted) return;
        if (res.success && res.sheets && res.sheets.length > 0) {
          setSheets(res.sheets);
        } else {
          setError(res.error || '未能在文件中读取到有效的表格工作表');
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || '加载表格失败');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadExcelData();
    return () => {
      isMounted = false;
    };
  }, [filePath, initialSheets]);

  const currentSheet = sheets[activeSheetIndex];
  const allRows = currentSheet?.rows || [];
  const headerRow = allRows[0] || [];
  const dataRows = allRows.slice(1);

  // 搜索过滤
  const filteredRows = searchTerm.trim()
    ? dataRows.filter(row => row.some(cell => String(cell).toLowerCase().includes(searchTerm.toLowerCase())))
    : dataRows;

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--foreground)] select-text">
      {/* 顶部操作工具栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)] shrink-0 gap-2">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate max-w-[260px]" title={title || filePath}>
              {title || (filePath ? filePath.split(/[\\/]/).pop() : 'Excel 表格数据')}
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)]">
              {currentSheet ? `工作表: ${currentSheet.name} · 共 ${currentSheet.rowCount || allRows.length} 行` : '准备中...'}
            </div>
          </div>
        </div>

        {/* 搜索框与定位按钮 */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="在表格中搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--primary)] w-36 sm:w-44 text-[var(--foreground)]"
            />
          </div>

          {filePath && (
            <>
              <button
                type="button"
                onClick={() => window.electronAPI?.showItemInFolder(filePath)}
                title="在系统文件管理器中高亮定位"
                className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] transition-colors cursor-pointer text-[var(--foreground)]"
              >
                <FolderOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span className="hidden md:inline">定位</span>
              </button>
              <button
                type="button"
                onClick={() => window.electronAPI?.openPath(filePath)}
                title="调用系统默认软件打开 (如 Excel)"
                className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] transition-colors cursor-pointer text-[var(--foreground)]"
              >
                <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                <span className="hidden md:inline">打开</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 工作表 (Sheet Tabs) 选项卡 */}
      {sheets.length > 1 && (
        <div className="flex items-center space-x-1 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--muted)]/30 overflow-x-auto shrink-0 scrollbar-none">
          {sheets.map((s, idx) => (
            <button
              key={s.name}
              type="button"
              onClick={() => {
                setActiveSheetIndex(idx);
                setSearchTerm('');
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeSheetIndex === idx
                  ? 'bg-[var(--card)] text-[var(--primary)] shadow-2xs border border-[var(--border)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/60'
              }`}
            >
              {s.name} ({s.rowCount || s.rows.length})
            </button>
          ))}
        </div>
      )}

      {/* 表格内容主体 */}
      <div className="flex-1 overflow-auto p-4 scrollbar-thin">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] space-y-2">
            <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
            <div className="text-xs">正在极速解析 Excel 表格数据...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] space-y-3 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <div className="text-xs font-medium text-[var(--foreground)]">{error}</div>
            {filePath && (
              <button
                type="button"
                onClick={() => window.electronAPI?.openPath(filePath)}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors cursor-pointer"
              >
                直接用本地 Excel 打开
              </button>
            )}
          </div>
        ) : allRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] space-y-2">
            <Table className="h-8 w-8 stroke-1 text-[var(--muted-foreground)]/50" />
            <div className="text-xs">当前工作表无数据内容</div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] overflow-hidden shadow-2xs bg-[var(--card)]">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-[var(--muted)]/80 sticky top-0 z-10 border-b border-[var(--border)]">
                <tr>
                  <th className="w-12 px-3 py-2 text-center text-[10px] font-mono text-[var(--muted-foreground)] border-r border-[var(--border)]/50 select-none">
                    #
                  </th>
                  {headerRow.map((col, cIdx) => (
                    <th
                      key={cIdx}
                      className="px-3.5 py-2 font-semibold text-[var(--foreground)] border-r border-[var(--border)]/50 last:border-r-0 whitespace-nowrap"
                    >
                      {String(col || `列 ${cIdx + 1}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono">
                {filteredRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--muted)]/40 transition-colors">
                    <td className="px-3 py-1.5 text-center text-[10px] text-[var(--muted-foreground)] border-r border-[var(--border)]/40 select-none bg-[var(--muted)]/20">
                      {rIdx + 1}
                    </td>
                    {headerRow.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3.5 py-1.5 text-[var(--foreground)] border-r border-[var(--border)]/30 last:border-r-0 whitespace-nowrap max-w-xs truncate"
                        title={row[cIdx] ? String(row[cIdx]) : ''}
                      >
                        {row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 底部状态条 */}
      {currentSheet && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-[var(--border)] bg-[var(--card)] text-[11px] text-[var(--muted-foreground)] shrink-0">
          <div>
            显示 {filteredRows.length} 行 {searchTerm && `(过滤自全部 ${dataRows.length} 行)`}
          </div>
          <div className="font-mono">
            {allRows.length > 300 && '⚠️ 为保障渲染性能，当前仅呈现前 300 行采样'}
          </div>
        </div>
      )}
    </div>
  );
};
