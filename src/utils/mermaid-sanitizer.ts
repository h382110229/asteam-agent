/**
 * 清理 Mermaid 可能意外注入至 document.body 的语法错误炸弹节点，防止遮挡或卡死界面
 */
export function cleanupStrayMermaidElements() {
  try {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('svg[id^="dmermaid-"], div[id^="dmermaid-"], svg[id^="mermaid-"]').forEach(el => {
      if (el.parentElement === document.body) {
        el.remove();
      }
    });
  } catch {}
}

/**
 * 智能清洗并修复 LLM 生成的 Mermaid 代码中的常见语法缺陷：
 * 1. 规范化转义换行符与多余转义符 (\n, \r\n, \t)
 * 2. 剥离可能残留的 Markdown 围栏代码块 (```mermaid ... ```)
 * 3. 规范化 subgraph 语法：subgraph id ["title"] 或 subgraph "title"
 * 4. 修复箭头标注 |...|：彻底剥离多重嵌套引号 ("'...'")，安全转义内部双引号并统一包裹双引号 (幂等性保证)
 * 5. 修复圆括号节点中嵌套括号导致的崩溃 (如 `A(服务 (Daemon))` => `A["服务 (Daemon)"]`)
 * 6. 规范化节点方括号文本 [ ... ]：自动为无引号或包含未转义字符的节点添加安全双引号
 */
export function sanitizeMermaidCode(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim();

  // 1. 剥离 Markdown 围栏代码块
  clean = clean.replace(/^```(?:mermaid)?/gim, '').replace(/```$/gm, '').trim();

  // 2. 规范化转义换行符与多余转义符
  if (clean.includes('\\n') || clean.includes('\\r')) {
    clean = clean
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '  ');
  }

  // 3. 规范化 subgraph 语法：subgraph id ["title"] 或 subgraph "title"
  clean = clean.replace(/subgraph\s+([a-zA-Z0-9_\u4e00-\u9fa5]+)\[/g, 'subgraph $1 [');

  // 4. 修复箭头标注 |...|：彻底剥离多重嵌套引号 ("'...'")，幂等安全包裹
  clean = clean.replace(/(-->|-.->|==>|---|~~~)\|([^|\r\n]+?)\|/g, (match, arrow, label) => {
    let inner = label.trim();
    while ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
      inner = inner.slice(1, -1).trim();
    }
    // 内部双引号转为单引号
    inner = inner.replace(/"/g, "'");
    return `${arrow}|"${inner}"|`;
  });

  // 5. 修复圆括号节点中嵌套括号导致的崩溃 (如 `A(服务 (Daemon))` => `A["服务 (Daemon)"]`)
  clean = clean.replace(/([a-zA-Z0-9_\u4e00-\u9fa5-]+)\(\s*([^()]+?\([^()]+?\)[^()]*?)\s*\)/g, (match, id, text) => {
    const escaped = text.trim().replace(/"/g, "'");
    return `${id}["${escaped}"]`;
  });

  // 6. 规范化节点方括号文本 [ ... ]：自动为无引号或混合引号的节点添加安全双引号
  clean = clean.replace(/([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*\[\s*([^\[\]\r\n]+?)\s*\](?!\()/g, (match, id, text) => {
    if (id.trim() === 'subgraph') return match;
    let inner = text.trim();
    while ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
      inner = inner.slice(1, -1).trim();
    }
    inner = inner.replace(/"/g, "'");
    return `${id}["${inner}"]`;
  });

  return clean.trim();
}
