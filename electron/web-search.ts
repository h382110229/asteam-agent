import { net } from 'electron';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOptions {
  maxResults?: number;
  engine?: 'auto' | 'bing' | 'duckduckgo' | 'tavily';
  tavilyApiKey?: string;
  timeoutMs?: number;
}

export interface WebFetchOptions {
  maxLength?: number;
  timeoutMs?: number;
}

/**
 * Safe proxy-aware and CDN-friendly fetch using Chromium's network stack
 */
export async function safeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (typeof net !== 'undefined' && typeof net.fetch === 'function') {
    try {
      return await (net.fetch as any)(input, init);
    } catch (err: any) {
      console.warn('[web-search] net.fetch failed, fallback to global fetch:', err?.message || err);
      return await globalThis.fetch(input, init);
    }
  }
  return await globalThis.fetch(input, init);
}

/**
 * Convert raw HTML into clean, structured Markdown preserving headings, code blocks, lists, and links
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  // 1. Try to extract main content area if available (removes headers, navigation, footers)
  let workingHtml = html;
  const mainMatch = html.match(/<(?:article|main|div\s+class="[^"]*(?:content|article|post|documentation|doc)[^"]*")[^>]*>([\s\S]*?)<\/(?:article|main|div)>/i);
  if (mainMatch && mainMatch[1] && mainMatch[1].length > 300) {
    workingHtml = mainMatch[1];
  }

  // 2. Strip noise elements
  let text = workingHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 3. Preformatted code blocks
  text = text.replace(/<pre[^>]*><code(?: class="([^"]*)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, cls, code) => {
    const lang = (cls || '').replace(/.*(?:language-|lang-)(\w+).*/, '$1') || '';
    const cleanCode = code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    return `\n\`\`\`${lang}\n${cleanCode.trim()}\n\`\`\`\n`;
  });

  // 4. Inline code
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => {
    const cleanCode = code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    return ` \`${cleanCode.trim()}\` `;
  });

  // 5. Headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');

  // 6. Links
  text = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, content) => {
    const cleanContent = content.replace(/<[^>]+>/g, '').trim();
    if (!cleanContent) return '';
    return `[${cleanContent}](${href})`;
  });

  // 7. List items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');

  // 8. Paragraphs & line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');

  // 9. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 10. Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // 11. Normalize newlines and spaces
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');
  return text.trim();
}

/**
 * Fetch and parse Bing search results (zero-config, high availability)
 */
async function searchBing(query: string, maxResults: number = 6, timeoutMs: number = 8000): Promise<SearchResultItem[]> {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });

    if (!res.ok) {
      throw new Error(`Bing search HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();
    const items: SearchResultItem[] = [];
    const regex = /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null && items.length < maxResults) {
      const rawUrl = match[1];
      const rawTitle = match[2];
      const rawSnippet = match[3] || '';

      const title = rawTitle
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
      const snippet = rawSnippet
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();

      if (title && rawUrl && rawUrl.startsWith('http')) {
        items.push({ title, url: rawUrl, snippet });
      }
    }

    return items;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch and parse DuckDuckGo HTML search results
 */
async function searchDuckDuckGo(query: string, maxResults: number = 6, timeoutMs: number = 8000): Promise<SearchResultItem[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await safeFetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `q=${encodeURIComponent(query)}`
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo HTTP ${res.status}`);
    }

    const html = await res.text();
    const items: SearchResultItem[] = [];
    const regex = /<h2 class="result__title">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null && items.length < maxResults) {
      let rawUrl = match[1];
      // Decode DuckDuckGo redirect url
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        rawUrl = decodeURIComponent(uddgMatch[1]);
      }
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const snippet = match[3].replace(/<[^>]+>/g, '').trim();

      if (title && rawUrl.startsWith('http')) {
        items.push({ title, url: rawUrl, snippet });
      }
    }

    return items;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tavily AI Search API (Structured markdown output)
 */
async function searchTavily(query: string, apiKey: string, maxResults: number = 6, timeoutMs: number = 10000): Promise<SearchResultItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await safeFetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false
      })
    });

    if (!res.ok) {
      throw new Error(`Tavily API ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as any;
    const items: SearchResultItem[] = (data.results || []).map((r: any) => ({
      title: r.title || '无标题',
      url: r.url,
      snippet: r.content || ''
    }));

    return items;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Unified Web Search Engine with smart multi-provider fallback
 */
export async function searchWeb(query: string, options: WebSearchOptions = {}): Promise<string> {
  const trimmed = query?.trim();
  if (!trimmed) {
    return '【搜索失败】: 检索词为空，请输入具体技术关键词或错误码。';
  }

  const maxResults = options.maxResults || 6;
  const timeoutMs = options.timeoutMs || 8000;
  let items: SearchResultItem[] = [];
  let usedEngine = 'bing';

  // 1. If Tavily API Key provided, prioritize Tavily
  if (options.tavilyApiKey) {
    try {
      items = await searchTavily(trimmed, options.tavilyApiKey, maxResults, timeoutMs);
      usedEngine = 'Tavily AI Search';
    } catch (tavilyErr: any) {
      console.warn('[searchWeb] Tavily failed, fallback to Bing:', tavilyErr.message);
    }
  }

  // 2. Try Bing Search (high domestic/international availability)
  if (items.length === 0 && options.engine !== 'duckduckgo') {
    try {
      items = await searchBing(trimmed, maxResults, timeoutMs);
      usedEngine = 'Bing Web Search';
    } catch (bingErr: any) {
      console.warn('[searchWeb] Bing failed, fallback to DuckDuckGo:', bingErr.message);
    }
  }

  // 3. Fallback to DuckDuckGo
  if (items.length === 0) {
    try {
      items = await searchDuckDuckGo(trimmed, maxResults, timeoutMs);
      usedEngine = 'DuckDuckGo';
    } catch (ddgErr: any) {
      console.warn('[searchWeb] DuckDuckGo failed:', ddgErr.message);
    }
  }

  if (items.length === 0) {
    return `【实时检索结果】\n关键词: "${trimmed}"\n未能检索到有效网络结果或网络握手超时。建议：\n1. 检查本地网络与代理配置；\n2. 精简关键词或改用英文术语重试；\n3. 若已知具体文档链接，可直接调用 \`web_fetch\` 抓取该页面。`;
  }

  const lines = [
    `【实时技术检索结果 · 源自 ${usedEngine}】`,
    `查询词: "${trimmed}" · 共检索到 ${items.length} 条高相关性结果：\n`
  ];

  items.forEach((item, index) => {
    lines.push(`### [${index + 1}] ${item.title}`);
    lines.push(`- **直达链接**: ${item.url}`);
    lines.push(`- **摘要说明**: ${item.snippet}\n`);
  });

  lines.push('💡 **智能体后续指引**: 可进一步挑选关键 URL，调用 `web_fetch` 工具抓取完整官方文档或源码实现。');

  return lines.join('\n');
}

/**
 * Fetch webpage content and extract clean structured Markdown
 */
export async function fetchWebPage(url: string, options: WebFetchOptions = {}): Promise<string> {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl || !trimmedUrl.startsWith('http')) {
    return '【抓取失败】: 无效的 URL 地址，必须以 http:// 或 https:// 开头。';
  }

  const maxLength = options.maxLength || 12000;
  const timeoutMs = options.timeoutMs || 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await safeFetch(trimmedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ASTeamAgent/1.5',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });

    if (!res.ok) {
      return `[HTTP ${res.status}] 页面获取失败: ${res.statusText} (${trimmedUrl})`;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const jsonText = await res.text();
      return `【网页 JSON 数据返回 (${trimmedUrl})】:\n\`\`\`json\n${jsonText.slice(0, maxLength)}\n\`\`\``;
    }

    const rawHtml = await res.text();
    const markdown = htmlToMarkdown(rawHtml);

    if (!markdown) {
      return `【网页内容提取为空 (${trimmedUrl})】: 页面可能为动态纯 JS 渲染 (SPA)，正文未包含在初始 HTML 中。`;
    }

    const isTruncated = markdown.length > maxLength;
    const cleanContent = isTruncated ? markdown.slice(0, maxLength) : markdown;

    return [
      `【在线技术文档抓取结果】:`,
      `- **目标 URL**: ${trimmedUrl}`,
      `- **提取字数**: 约 ${cleanContent.length} 字符${isTruncated ? ' (已自动安全截断)' : ''}`,
      `\n--- 正文内容开始 ---\n`,
      cleanContent,
      `\n--- 正文内容结束 ---`,
      isTruncated ? '\n\n⚠️ [注: 网页内容较长，已截取前段核心正文与代码块]' : ''
    ].join('\n');
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return `【抓取超时】: 连接目标页面超过 ${timeoutMs / 1000} 秒 (${trimmedUrl})`;
    }
    return `【页面抓取异常】: ${err.message || String(err)} (${trimmedUrl})`;
  } finally {
    clearTimeout(timeoutId);
  }
}
