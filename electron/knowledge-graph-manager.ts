import fs from 'node:fs';
import path from 'node:path';
import { storageHub } from './storage-hub';

export interface CodeSymbolItem {
  name: string;
  kind: 'class' | 'interface' | 'type' | 'function' | 'service' | 'variable' | 'enum';
  workspacePath: string;
  filePath: string;
  line: number;
  snippet: string;
  signature?: string;
  exportType: 'named' | 'default';
}

export interface WorkspaceGraphNode {
  workspacePath: string;
  name: string;
  filesCount: number;
  symbolsCount: number;
  lastIndexedAt: number;
}

export interface CrossWorkspaceKnowledgeGraph {
  workspaces: WorkspaceGraphNode[];
  symbols: CodeSymbolItem[];
  indexedAt: number;
}

export class KnowledgeGraphManager {
  private static instance: KnowledgeGraphManager;
  private graphFilePath: string;
  private registeredWorkspaces: Set<string> = new Set();
  private symbolsMap: Map<string, CodeSymbolItem[]> = new Map(); // key: symbol name (lower)
  private allSymbols: CodeSymbolItem[] = [];
  private lastIndexedAt = 0;

  private constructor() {
    this.graphFilePath = path.join(storageHub.getDataRootDir(), 'knowledge_graph.json');
    this.loadGraph();
  }

  public static getInstance(): KnowledgeGraphManager {
    if (!KnowledgeGraphManager.instance) {
      KnowledgeGraphManager.instance = new KnowledgeGraphManager();
    }
    return KnowledgeGraphManager.instance;
  }

  private loadGraph(): void {
    try {
      if (fs.existsSync(this.graphFilePath)) {
        const raw = fs.readFileSync(this.graphFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.workspaces)) {
          for (const w of parsed.workspaces) {
            if (w.workspacePath && fs.existsSync(w.workspacePath)) {
              this.registeredWorkspaces.add(w.workspacePath);
            }
          }
        }
        if (Array.isArray(parsed.symbols)) {
          this.allSymbols = parsed.symbols;
          this.rebuildIndex();
          this.lastIndexedAt = parsed.indexedAt || Date.now();
        }
      }
    } catch (e) {
      console.warn('[KnowledgeGraphManager] Failed to load knowledge graph, initializing new:', e);
    }
  }

  private saveGraph(): void {
    try {
      const data: CrossWorkspaceKnowledgeGraph = {
        workspaces: this.getWorkspacesInfo(),
        symbols: this.allSymbols,
        indexedAt: Date.now()
      };
      fs.writeFileSync(this.graphFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[KnowledgeGraphManager] Failed to save graph:', e);
    }
  }

  private rebuildIndex(): void {
    this.symbolsMap.clear();
    for (const s of this.allSymbols) {
      const key = s.name.toLowerCase();
      const list = this.symbolsMap.get(key) || [];
      list.push(s);
      this.symbolsMap.set(key, list);
    }
  }

  public registerWorkspace(workspacePath: string): void {
    if (!workspacePath || !fs.existsSync(workspacePath)) return;
    const normalized = path.normalize(workspacePath);
    this.registeredWorkspaces.add(normalized);
    this.indexWorkspace(normalized);
  }

  public unregisterWorkspace(workspacePath: string): void {
    const normalized = path.normalize(workspacePath);
    this.registeredWorkspaces.delete(normalized);
    this.allSymbols = this.allSymbols.filter(s => s.workspacePath !== normalized);
    this.rebuildIndex();
    this.saveGraph();
  }

  public getRegisteredWorkspaces(): string[] {
    return Array.from(this.registeredWorkspaces);
  }

  public getWorkspacesInfo(): WorkspaceGraphNode[] {
    return Array.from(this.registeredWorkspaces).map(w => {
      const syms = this.allSymbols.filter(s => s.workspacePath === w);
      const uniqueFiles = new Set(syms.map(s => s.filePath));
      return {
        workspacePath: w,
        name: path.basename(w),
        filesCount: uniqueFiles.size,
        symbolsCount: syms.length,
        lastIndexedAt: this.lastIndexedAt
      };
    });
  }

  /**
   * 联合索引指定工作区的代码符号
   */
  public indexWorkspace(workspacePath: string): { symbolsFound: number; filesScanned: number } {
    const normalized = path.normalize(workspacePath);
    if (!fs.existsSync(normalized)) return { symbolsFound: 0, filesScanned: 0 };

    // 移除旧符号
    this.allSymbols = this.allSymbols.filter(s => s.workspacePath !== normalized);

    const newSymbols: CodeSymbolItem[] = [];
    let filesScanned = 0;

    const scanFiles = (dir: string, depth = 0) => {
      if (depth > 6) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === 'release' ||
            entry.name === 'dist-electron'
          ) {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanFiles(fullPath, depth + 1);
          } else if (entry.isFile() && /\.(ts|tsx|js|jsx|py|java|go|rs|cs)$/i.test(entry.name)) {
            filesScanned++;
            this.extractSymbolsFromFile(normalized, fullPath, newSymbols);
          }
        }
      } catch {}
    };

    scanFiles(normalized);

    this.allSymbols.push(...newSymbols);
    this.rebuildIndex();
    this.lastIndexedAt = Date.now();
    this.saveGraph();

    return { symbolsFound: newSymbols.length, filesScanned };
  }

  /**
   * 正则与轻量语法解析：提取 Class, Interface, Type, Function, Service
   */
  private extractSymbolsFromFile(workspacePath: string, filePath: string, targetList: CodeSymbolItem[]): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const patterns: Array<{ regex: RegExp; kind: CodeSymbolItem['kind'] }> = [
        { regex: /export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, kind: 'class' },
        { regex: /export\s+interface\s+([A-Za-z0-9_$]+)/, kind: 'interface' },
        { regex: /export\s+type\s+([A-Za-z0-9_$]+)/, kind: 'type' },
        { regex: /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, kind: 'function' },
        { regex: /export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/, kind: 'function' },
        { regex: /export\s+enum\s+([A-Za-z0-9_$]+)/, kind: 'enum' },
        { regex: /class\s+([A-Za-z0-9_$]+(?:Service|Manager|Client|Provider))/, kind: 'service' }
      ];

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i].trim();
        for (const { regex, kind } of patterns) {
          const match = lineText.match(regex);
          if (match && match[1]) {
            const symName = match[1];
            targetList.push({
              name: symName,
              kind,
              workspacePath,
              filePath,
              line: i + 1,
              snippet: lineText.slice(0, 150),
              exportType: lineText.includes('default') ? 'default' : 'named'
            });
            break;
          }
        }
      }
    } catch {}
  }

  /**
   * 跨仓库检索符号契约与位置
   */
  public searchSymbols(query: string, maxResults = 10): CodeSymbolItem[] {
    if (!query || !query.trim()) return [];
    const clean = query.trim().toLowerCase();

    // 1. 精确匹配
    const exact = this.symbolsMap.get(clean) || [];
    if (exact.length >= maxResults) {
      return exact.slice(0, maxResults);
    }

    // 2. 前缀或子串模糊匹配
    const results: CodeSymbolItem[] = [...exact];
    const seen = new Set(exact.map(s => `${s.filePath}:${s.line}`));

    for (const [key, items] of this.symbolsMap.entries()) {
      if (key !== clean && key.includes(clean)) {
        for (const item of items) {
          const id = `${item.filePath}:${item.line}`;
          if (!seen.has(id)) {
            seen.add(id);
            results.push(item);
            if (results.length >= maxResults) break;
          }
        }
      }
      if (results.length >= maxResults) break;
    }

    return results;
  }

  /**
   * 生成跨工程上下文辅助 Prompt，注入给 Agent
   */
  public generateCrossWorkspaceContext(symbolQuery: string): string {
    const hits = this.searchSymbols(symbolQuery, 5);
    if (hits.length === 0) return '';

    const lines: string[] = [
      `\n【跨工作区知识图谱检索结果 (Cross-Workspace Knowledge Graph)】`,
      `根据关键词 "${symbolQuery}"，在关联企业工程库中定位到以下外部契约与符号定义：`
    ];

    for (const hit of hits) {
      const wsName = path.basename(hit.workspacePath);
      const relPath = path.relative(hit.workspacePath, hit.filePath);
      lines.push(`- [${wsName}] \`${hit.kind} ${hit.name}\` (${relPath}:${hit.line})`);
      lines.push(`  定义切片: \`${hit.snippet}\``);
    }

    return lines.join('\n');
  }
}

export const knowledgeGraphManager = KnowledgeGraphManager.getInstance();
