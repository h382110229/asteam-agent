import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { safeWriteFileSync } from './file-resilience';

export interface PdfOptions {
  filePath: string;
  title: string;
  subtitle?: string;
  author?: string;
  version?: string;
  confidentiality?: string;
  markdownContent?: string;
  sections?: Array<{
    heading?: string;
    paragraphs?: string[];
  }>;
}

export interface ReadPdfResult {
  filePath: string;
  pageCount: number;
  title: string;
  author: string;
  summary: string;
  markdownContent: string;
}

/**
 * 探测宿主系统中可用的 CJK 中文字体文件
 */
function getAvailableCjkFontPath(): string | null {
  const candidates = [
    'C:\\Windows\\Fonts\\simhei.ttf',
    'C:\\Windows\\Fonts\\simsun.ttc',
    'C:\\Windows\\Fonts\\msyh.ttc',
    '/System/Library/Fonts/PingFang.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc'
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

/**
 * 纯 JS 企业级 PDF 原生生成器 (基于 pdf-lib 与 fontkit 字体子集化)
 * 具备标准政企风格封面、多章节排版与自动页码计算，零外部 Python/LibreOffice 依赖
 */
export async function createPdfDocument(options: PdfOptions): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const title = options.title || '企业级技术方案白皮书';
  const subtitle = options.subtitle || '基于 ASTeam Agent 原生纯 JS 引擎自动化生成';
  const author = options.author || 'ASTeam Core Team';
  const version = options.version || 'V1.0';
  const confidentiality = options.confidentiality || '内部技术资料 · 商业秘密';

  // 注入 PDF 标准元数据
  pdfDoc.setTitle(title);
  pdfDoc.setAuthor(author);
  pdfDoc.setSubject(subtitle);
  pdfDoc.setProducer('ASTeam Agent v1.8.1 (Pure JS Engine)');
  pdfDoc.setCreationDate(new Date());

  // 加载并子集化中文字体
  const fontPath = getAvailableCjkFontPath();
  let fontBold: any = null;
  let fontRegular: any = null;
  let hasCjkFont = false;

  if (fontPath) {
    try {
      const fontBytes = fs.readFileSync(fontPath);
      const embedded = await pdfDoc.embedFont(fontBytes, { subset: true });
      fontBold = embedded;
      fontRegular = embedded;
      hasCjkFont = true;
    } catch (fontErr) {
      console.warn('[PDFGenerator] Failed to embed CJK font, falling back to StandardFonts:', fontErr);
    }
  }

  if (!hasCjkFont) {
    fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  const safeStr = (str: string): string => {
    if (!str) return '';
    if (hasCjkFont) return str;
    return str.replace(/[^\x00-\x7F]/g, '?');
  };

  // 1. 封面页 (Cover Page)
  const coverPage = pdfDoc.addPage([595.28, 841.89]); // A4 尺寸 (pt)
  const { width, height } = coverPage.getSize();

  // 顶部装饰条 (科技深蓝)
  coverPage.drawRectangle({
    x: 0,
    y: height - 16,
    width: width,
    height: 16,
    color: rgb(0.12, 0.23, 0.54)
  });

  // 密级标识
  coverPage.drawText(safeStr(`【${confidentiality}】`), {
    x: 50,
    y: height - 60,
    size: 11,
    font: fontRegular,
    color: rgb(0.58, 0.64, 0.72)
  });

  // 标题
  coverPage.drawText(safeStr(title), {
    x: 50,
    y: height - 200,
    size: 22,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16)
  });

  // 副标题
  coverPage.drawText(safeStr(subtitle), {
    x: 50,
    y: height - 235,
    size: 13,
    font: fontRegular,
    color: rgb(0.39, 0.45, 0.55)
  });

  // 分隔线
  coverPage.drawLine({
    start: { x: 50, y: height - 260 },
    end: { x: width - 50, y: height - 260 },
    thickness: 1.5,
    color: rgb(0.85, 0.88, 0.92)
  });

  // 编制元信息
  const metaY = 160;
  coverPage.drawText(safeStr(`版本号 (Version): ${version}`), { x: 50, y: metaY + 40, size: 10, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });
  coverPage.drawText(safeStr(`编制团队 (Author): ${author}`), { x: 50, y: metaY + 20, size: 10, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });
  coverPage.drawText(safeStr(`生成时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`), { x: 50, y: metaY, size: 10, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });

  // 2. 正文页 (Content Pages)
  let currentPage = pdfDoc.addPage([595.28, 841.89]);
  let currentY = height - 60;
  let pageIndex = 1;

  const checkPageBreak = (neededHeight: number) => {
    if (currentY - neededHeight < 60) {
      currentPage.drawText(safeStr(`第 ${pageIndex} 页`), {
        x: width / 2 - 20,
        y: 30,
        size: 9,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5)
      });
      currentPage = pdfDoc.addPage([595.28, 841.89]);
      pageIndex++;
      currentY = height - 60;
    }
  };

  const lines = (options.markdownContent || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      currentY -= 10;
      continue;
    }

    if (line.startsWith('# ')) {
      checkPageBreak(40);
      currentY -= 15;
      currentPage.drawText(safeStr(line.replace(/^#\s+/, '')), {
        x: 50,
        y: currentY,
        size: 16,
        font: fontBold,
        color: rgb(0.12, 0.23, 0.54)
      });
      currentY -= 25;
    } else if (line.startsWith('## ')) {
      checkPageBreak(30);
      currentY -= 10;
      currentPage.drawText(safeStr(line.replace(/^##\s+/, '')), {
        x: 50,
        y: currentY,
        size: 13,
        font: fontBold,
        color: rgb(0.15, 0.2, 0.3)
      });
      currentY -= 20;
    } else if (line.startsWith('### ')) {
      checkPageBreak(25);
      currentPage.drawText(safeStr(line.replace(/^###\s+/, '')), {
        x: 50,
        y: currentY,
        size: 11,
        font: fontBold,
        color: rgb(0.2, 0.25, 0.35)
      });
      currentY -= 18;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      checkPageBreak(18);
      currentPage.drawText(safeStr(`•  ${line.replace(/^[-*]\s+/, '')}`), {
        x: 60,
        y: currentY,
        size: 10,
        font: fontRegular,
        color: rgb(0.2, 0.25, 0.3)
      });
      currentY -= 16;
    } else {
      checkPageBreak(18);
      const textToDraw = line.length > 80 ? line.slice(0, 80) + '...' : line;
      currentPage.drawText(safeStr(textToDraw), {
        x: 50,
        y: currentY,
        size: 10,
        font: fontRegular,
        color: rgb(0.25, 0.25, 0.3)
      });
      currentY -= 16;
    }
  }

  currentPage.drawText(safeStr(`第 ${pageIndex} 页`), {
    x: width / 2 - 20,
    y: 30,
    size: 9,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5)
  });

  const pdfBytes = await pdfDoc.save();
  const writeRes = safeWriteFileSync(options.filePath, Buffer.from(pdfBytes));

  return `成功生成企业级专业 PDF 文档: "${writeRes.actualPath}" (${pdfBytes.length} 字节，共 ${pdfDoc.getPageCount()} 页)${writeRes.isFallback ? ` [提示: 原目标已被系统独占锁定，自动安全写入新版本: ${writeRes.actualPath}]` : ''}`;
}

/**
 * 纯 JS 原生 PDF 结构与信息提取器 (基于 pdf-lib)
 */
export async function readPdfDocument(filePath: string): Promise<ReadPdfResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF 文件不存在: ${filePath}`);
  }

  const fileBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });

  const pageCount = pdfDoc.getPageCount();
  const title = pdfDoc.getTitle() || path.basename(filePath, '.pdf');
  const author = pdfDoc.getAuthor() || '未知作者';
  const creationDate = pdfDoc.getCreationDate() ? pdfDoc.getCreationDate()?.toLocaleString('zh-CN') : '未知';

  const markdownParts: string[] = [
    `# ${title} (PDF 概要分析)`,
    `- **物理路径**: ${filePath}`,
    `- **总页数**: ${pageCount} 页`,
    `- **文档作者**: ${author}`,
    `- **创建时间**: ${creationDate}`,
    `\n---\n`
  ];

  for (let i = 0; i < pageCount; i++) {
    const p = pdfDoc.getPage(i);
    const { width, height } = p.getSize();
    markdownParts.push(`## 第 ${i + 1} 页 (尺寸: ${Math.round(width)} x ${Math.round(height)} pt)`);
    markdownParts.push(`> [第 ${i + 1} 页正文流就绪]`);
  }

  const summary = `【PDF 原生解析结果】\n文件: "${filePath}"\n标题: ${title}\n作者: ${author}\n页数: ${pageCount} 页\n创建时间: ${creationDate}\n\n` + markdownParts.join('\n');

  return {
    filePath,
    pageCount,
    title,
    author,
    summary,
    markdownContent: markdownParts.join('\n')
  };
}
