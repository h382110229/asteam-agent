import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';

export interface ExtractedImageItem {
  id: string;
  name: string;
  localPath: string;
  mimeType: string;
  size: number;
  base64?: string;
  locationHint?: string;
}

export interface OfficeExtractResult {
  text: string;
  summary: string;
  charCount: number;
  type: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'unknown';
  extractedImages?: ExtractedImageItem[];
}

/**
 * 获取本地安全图片解压缓存目录
 */
function getExtractedImagesCacheDir(): string {
  const dir = path.join(os.tmpdir(), 'asteam-extracted-images');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
  return dir;
}

function getMimeTypeByExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/png';
}

/**
 * 针对 Word (.docx) 压缩包实施“脱壳分流、图文原位还原与结构化提取”：
 * - 解析 word/_rels/document.xml.rels，建立图片资源引用索引
 * - 提取 document.xml 中的段落与层级标题
 * - 提取表格结构并转换为 Markdown 规范表格
 * - 原位定位并标记图片（架构图、网络拓扑图、割接流程图等），解压至本地磁盘供多模态模型审图
 */
export function extractDocxContent(buffer: Buffer): { text: string; summary: string; charCount: number; extractedImages: ExtractedImageItem[] } {
  try {
    const zip = new AdmZip(buffer);
    const docEntry = zip.getEntry('word/document.xml');
    if (!docEntry) {
      return {
        text: '（未能在 Word 压缩包中找到 word/document.xml）',
        summary: 'Word 文档结构异常',
        charCount: 0,
        extractedImages: []
      };
    }

    const docHash = crypto.createHash('md5').update(buffer.slice(0, 4096)).digest('hex').slice(0, 8);
    const cacheDir = getExtractedImagesCacheDir();

    // 1. 解析关系表 word/_rels/document.xml.rels
    const relsEntry = zip.getEntry('word/_rels/document.xml.rels');
    const relsMap = new Map<string, string>(); // rId -> entryPath
    if (relsEntry) {
      const relsXml = relsEntry.getData().toString('utf-8');
      const relMatches = relsXml.matchAll(/<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/gi);
      for (const m of relMatches) {
        const id = m[1];
        let target = m[2].replace(/\\/g, '/');
        // 处理相对路径 media/image1.png 或 ../media/image1.png
        target = target.replace(/^\.\.\//, '').replace(/^\/?/, '');
        if (!target.startsWith('word/')) {
          target = `word/${target}`;
        }
        relsMap.set(id, target);
      }
    }

    // 2. 解压落盘有效图片并索引元数据
    const savedImagesMap = new Map<string, ExtractedImageItem>();
    const entries = zip.getEntries();
    let totalMediaImages = 0;

    for (const entry of entries) {
      if (entry.entryName.startsWith('word/media/')) {
        totalMediaImages++;
        const imgBuffer = entry.getData();
        const baseName = path.basename(entry.entryName);
        const diskFileName = `docx_${docHash}_${baseName}`;
        const diskPath = path.join(cacheDir, diskFileName);

        try {
          fs.writeFileSync(diskPath, imgBuffer);
        } catch {}

        const mime = getMimeTypeByExt(baseName);
        // 仅对大于 5KB 的图片做多模态 Base64 预备（过滤极其微小的单点装饰像素，保留真正的架构/拓扑图）
        const isCoreDiagram = imgBuffer.length >= 5 * 1024;
        savedImagesMap.set(entry.entryName, {
          id: baseName,
          name: baseName,
          localPath: diskPath,
          mimeType: mime,
          size: imgBuffer.length,
          base64: isCoreDiagram && savedImagesMap.size < 8 ? `data:${mime};base64,${imgBuffer.toString('base64')}` : undefined
        });
      }
    }

    const xml = docEntry.getData().toString('utf-8');

    // 3. 结构化解析表格
    let tableCount = 0;
    let paragraphCount = 0;
    const tables: string[] = [];

    const xmlWithTablePlaceholders = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tblXml) => {
      tableCount++;
      const rows: string[][] = [];

      const trMatches = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
      for (const tr of trMatches) {
        const rowCells: string[] = [];
        const tcMatches = tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
        for (const tc of tcMatches) {
          const tMatches = tc.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
          const cellText = tMatches
            .map(t => t.replace(/<w:t\b[^>]*>/, '').replace(/<\/w:t>/, ''))
            .join('')
            .replace(/[\r\n\t]/g, ' ')
            .trim();
          rowCells.push(cellText.replace(/\|/g, '\\|') || ' ');
        }
        if (rowCells.length > 0) {
          rows.push(rowCells);
        }
      }

      if (rows.length === 0) return '\n\n';

      const maxCols = Math.max(...rows.map(r => r.length));
      const normalizedRows = rows.map(r => {
        while (r.length < maxCols) r.push(' ');
        return r;
      });

      const header = `| ${normalizedRows[0].join(' | ')} |`;
      const divider = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
      const body = normalizedRows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');

      const mdTable = `\n\n${header}\n${divider}\n${body}\n\n`;
      const placeholder = `___ASTEAM_TABLE_${tables.length}___`;
      tables.push(mdTable);
      return placeholder;
    });

    // 4. 提取段落 <w:p> 并精准就位还原内嵌架构/拓扑图
    const paragraphs: string[] = [];
    const pMatches = xmlWithTablePlaceholders.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    let currentSectionHeading = '文档正文';
    const usedImages: ExtractedImageItem[] = [];

    for (const pXml of pMatches) {
      const tblPlaceholderMatch = pXml.match(/___ASTEAM_TABLE_(\d+)___/);
      if (tblPlaceholderMatch) {
        const tableIdx = parseInt(tblPlaceholderMatch[1], 10);
        if (tables[tableIdx]) {
          paragraphs.push(tables[tableIdx]);
          continue;
        }
      }

      // 提取段落文本
      const tMatches = pXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
      const pText = tMatches
        .map(t => t.replace(/<w:t\b[^>]*>/, '').replace(/<\/w:t>/, ''))
        .join('')
        .trim();

      const isHeading = pXml.includes('<w:heading') || pXml.includes('Heading') || pXml.includes('标题');
      if (isHeading && pText) {
        currentSectionHeading = pText;
      }

      // 扫描该段落中内嵌的图片引用 (DrawingML a:blip 或 VML imagedata)
      const embeddedRIds: string[] = [];
      const blipMatches = Array.from(pXml.matchAll(/(?:r:embed|r:id)="([^"]+)"/gi));
      for (const bm of blipMatches) {
        embeddedRIds.push(bm[1]);
      }

      const inlineImageMarkers: string[] = [];
      for (const rId of embeddedRIds) {
        const entryPath = relsMap.get(rId);
        if (entryPath && savedImagesMap.has(entryPath)) {
          const imgMeta = savedImagesMap.get(entryPath)!;
          imgMeta.locationHint = currentSectionHeading;
          if (!usedImages.some(u => u.name === imgMeta.name)) {
            usedImages.push(imgMeta);
          }
          const diskPosix = imgMeta.localPath.replace(/\\/g, '/');
          inlineImageMarkers.push(`\n\n![【内嵌核心架构/网络拓扑图】: ${imgMeta.name}](file:///${diskPosix})\n> 📌 **[文档图表位置标记]**: 原文在「${currentSectionHeading}」处内嵌了核心架构/拓扑图（本地路径: \`${imgMeta.localPath}\`，已接入视觉多模态分析）。\n`);
        }
      }

      if (pText || inlineImageMarkers.length > 0) {
        paragraphCount++;
        let combinedParagraph = '';
        if (pText) {
          combinedParagraph = isHeading ? `\n### ${pText}\n` : pText;
        }
        if (inlineImageMarkers.length > 0) {
          combinedParagraph = combinedParagraph ? `${combinedParagraph}\n${inlineImageMarkers.join('\n')}` : inlineImageMarkers.join('\n');
        }
        paragraphs.push(combinedParagraph);
      }
    }

    let combinedText = paragraphs.join('\n\n');
    tables.forEach((tbl, idx) => {
      const placeholder = `___ASTEAM_TABLE_${idx}___`;
      if (combinedText.includes(placeholder)) {
        combinedText = combinedText.replace(placeholder, tbl);
      } else if (!paragraphs.includes(tbl)) {
        combinedText += `\n\n${tbl}`;
      }
    });

    combinedText = combinedText.replace(/\n{3,}/g, '\n\n').trim();
    const summary = `Word 文档（已提取 ${combinedText.length} 字、${tableCount} 个表格、${paragraphCount} 个段落，精准原位标记 ${usedImages.length} 张关键架构/拓扑图${totalMediaImages > usedImages.length ? `，总计媒体 ${totalMediaImages} 项` : ''}）`;

    return {
      text: combinedText,
      summary,
      charCount: combinedText.length,
      extractedImages: usedImages
    };
  } catch (err: any) {
    return {
      text: `（Word 文档脱壳解析异常: ${err.message}）`,
      summary: 'Word 解析失败',
      charCount: 0,
      extractedImages: []
    };
  }
}

/**
 * 针对 PowerPoint (.pptx) 演示文稿实施结构化幻灯片提取与图文原位还原：
 * - 解析 ppt/slides/slide*.xml 与关联的 slide*.xml.rels
 * - 按幻灯片序号提取每页的标题、要点列表与内嵌架构/汇报图表
 * - 保持幻灯片图文同位，支持多模态读图
 */
export function extractPptxContent(buffer: Buffer): { text: string; summary: string; charCount: number; extractedImages: ExtractedImageItem[] } {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const docHash = crypto.createHash('md5').update(buffer.slice(0, 4096)).digest('hex').slice(0, 8);
    const cacheDir = getExtractedImagesCacheDir();

    // 1. 索引所有媒体图片并解压
    const mediaMap = new Map<string, ExtractedImageItem>();
    for (const entry of entries) {
      if (entry.entryName.startsWith('ppt/media/')) {
        const imgBuffer = entry.getData();
        const baseName = path.basename(entry.entryName);
        const diskPath = path.join(cacheDir, `pptx_${docHash}_${baseName}`);
        try {
          fs.writeFileSync(diskPath, imgBuffer);
        } catch {}
        const mime = getMimeTypeByExt(baseName);
        const isCore = imgBuffer.length >= 8 * 1024;
        mediaMap.set(entry.entryName, {
          id: baseName,
          name: baseName,
          localPath: diskPath,
          mimeType: mime,
          size: imgBuffer.length,
          base64: isCore && mediaMap.size < 8 ? `data:${mime};base64,${imgBuffer.toString('base64')}` : undefined
        });
      }
    }

    // 2. 找出所有 slide 文件并排序
    const slideEntries = entries
      .filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/\d+/)![0], 10);
        const numB = parseInt(b.entryName.match(/\d+/)![0], 10);
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      return {
        text: '（未在 PPT 文件中找到幻灯片页）',
        summary: 'PPT 结构为空',
        charCount: 0,
        extractedImages: []
      };
    }

    const slideTexts: string[] = [];
    const usedImages: ExtractedImageItem[] = [];

    slideEntries.forEach((entry, idx) => {
      const slideNum = idx + 1;
      const xml = entry.getData().toString('utf-8');

      // 读取该 slide 的关系文件 ppt/slides/_rels/slide{N}.xml.rels
      const relsEntryName = `ppt/slides/_rels/${path.basename(entry.entryName)}.rels`;
      const relsEntry = zip.getEntry(relsEntryName);
      const slideRelsMap = new Map<string, string>();
      if (relsEntry) {
        const relsXml = relsEntry.getData().toString('utf-8');
        const relMatches = relsXml.matchAll(/<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/gi);
        for (const m of relMatches) {
          const id = m[1];
          let target = m[2].replace(/\\/g, '/');
          target = target.replace(/^\.\.\//, '').replace(/^\/?/, '');
          if (!target.startsWith('ppt/')) {
            target = `ppt/${target}`;
          }
          slideRelsMap.set(id, target);
        }
      }

      // 提取幻灯片内嵌图片
      const slideImages: ExtractedImageItem[] = [];
      const blipMatches = Array.from(xml.matchAll(/(?:r:embed|r:id)="([^"]+)"/gi));
      for (const bm of blipMatches) {
        const rId = bm[1];
        const targetEntry = slideRelsMap.get(rId);
        if (targetEntry && mediaMap.has(targetEntry)) {
          const item = mediaMap.get(targetEntry)!;
          item.locationHint = `第 ${slideNum} 页幻灯片`;
          if (!slideImages.some(si => si.name === item.name)) {
            slideImages.push(item);
            if (!usedImages.some(ui => ui.name === item.name)) {
              usedImages.push(item);
            }
          }
        }
      }

      // 提取所有文本标签 <a:t>
      const paragraphs: string[] = [];
      const pMatches = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [];

      for (const p of pMatches) {
        const tMatches = p.match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g) || [];
        const lineText = tMatches
          .map(t => t.replace(/<a:t\b[^>]*>/, '').replace(/<\/a:t>/, ''))
          .join('')
          .trim();
        if (lineText) {
          paragraphs.push(lineText);
        }
      }

      let slideBlock = '';
      if (paragraphs.length > 0) {
        const title = paragraphs[0];
        const body = paragraphs.slice(1).map(p => `- ${p}`).join('\n');
        slideBlock = `### 幻灯片 ${slideNum}: ${title}\n${body}`;
      } else {
        slideBlock = `### 幻灯片 ${slideNum}\n*(无文字大纲)*`;
      }

      if (slideImages.length > 0) {
        const imgMarkdown = slideImages.map(img => {
          const diskPosix = img.localPath.replace(/\\/g, '/');
          return `\n![幻灯片 ${slideNum} 核心架构/图表: ${img.name}](file:///${diskPosix})\n> 💡 *[幻灯片插图]*: 本页内嵌架构拓扑/演示图表（本地路径: \`${img.localPath}\`）。`;
        }).join('\n');
        slideBlock += `\n${imgMarkdown}`;
      }

      slideTexts.push(slideBlock);
    });

    const combinedText = slideTexts.join('\n\n---\n\n').trim();
    const summary = `PPT 演示文稿（共 ${slideEntries.length} 页幻灯片，提取 ${combinedText.length} 字大纲，关联 ${usedImages.length} 张核心架构/演示图）`;

    return {
      text: combinedText,
      summary,
      charCount: combinedText.length,
      extractedImages: usedImages
    };
  } catch (err: any) {
    return {
      text: `（PPT 解析异常: ${err.message}）`,
      summary: 'PPT 解析失败',
      charCount: 0,
      extractedImages: []
    };
  }
}

/**
 * 针对 Excel (.xlsx) 表格实施结构化解析
 */
export async function extractXlsxContent(buffer: Buffer): Promise<{ text: string; summary: string; charCount: number; extractedImages: ExtractedImageItem[] }> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheetTexts: string[] = [];
    let totalRows = 0;

    workbook.eachSheet((worksheet) => {
      const rowCount = worksheet.rowCount;
      totalRows += rowCount;
      const rows: string[][] = [];

      const maxRowsToExtract = Math.min(rowCount, 80);
      for (let r = 1; r <= maxRowsToExtract; r++) {
        const row = worksheet.getRow(r);
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= 25) {
            const val = cell.text || (cell.value !== null && cell.value !== undefined ? String(cell.value) : '');
            cells.push(val.replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|').trim() || ' ');
          }
        });
        if (cells.length > 0 && cells.some(c => c.trim().length > 0)) {
          rows.push(cells);
        }
      }

      if (rows.length > 0) {
        const maxCols = Math.max(...rows.map(r => r.length));
        const normalizedRows = rows.map(r => {
          while (r.length < maxCols) r.push(' ');
          return r;
        });

        const header = `| ${normalizedRows[0].join(' | ')} |`;
        const divider = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
        const body = normalizedRows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');
        
        let sheetContent = `### 工作表: ${worksheet.name} (共 ${rowCount} 行数据)\n\n${header}\n${divider}\n${body}`;
        if (rowCount > maxRowsToExtract) {
          sheetContent += `\n\n*(注: 表格行数较多，已节选前 ${maxRowsToExtract} 行展示，建议复杂数据处理通过调用脚本直接读取)*`;
        }
        sheetTexts.push(sheetContent);
      }
    });

    const combinedText = sheetTexts.join('\n\n---\n\n').trim();
    const summary = `Excel 工作簿（包含 ${workbook.worksheets.length} 个工作表，共 ${totalRows} 行数据）`;

    return {
      text: combinedText,
      summary,
      charCount: combinedText.length,
      extractedImages: []
    };
  } catch (err: any) {
    return {
      text: `（Excel 表格解析异常: ${err.message}）`,
      summary: 'Excel 解析失败',
      charCount: 0,
      extractedImages: []
    };
  }
}

/**
 * 针对 PDF (.pdf) 文档实施纯 JS 轻量化文本与元数据解析
 */
export async function extractPdfContent(buffer: Buffer): Promise<{ text: string; summary: string; charCount: number; extractedImages: ExtractedImageItem[] }> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    const title = pdfDoc.getTitle() || '';
    const author = pdfDoc.getAuthor() || '';

    const rawStr = buffer.toString('latin1');
    const textChunks: string[] = [];
    
    const textMatches = rawStr.match(/\(([^)]+)\)\s*(?:Tj|TJ|'|")/g) || [];
    for (const match of textMatches) {
      const clean = match.replace(/^\(/, '').replace(/\)\s*(?:Tj|TJ|'|")$/, '').trim();
      if (clean && clean.length > 1 && !/^[\x00-\x1F\x7F]+$/.test(clean)) {
        textChunks.push(clean);
      }
    }

    let extractedText = '';
    if (textChunks.length > 20) {
      extractedText = textChunks.slice(0, 1500).join(' ').slice(0, 30000);
    }

    let finalText = `### PDF 文档信息\n- 页数: ${pageCount} 页\n${title ? `- 标题: ${title}\n` : ''}${author ? `- 作者: ${author}\n` : ''}`;
    if (extractedText.trim().length > 100) {
      finalText += `\n\n#### 提取正文摘要:\n${extractedText}`;
    } else {
      finalText += `\n\n*(当前 PDF 为扫描件或紧凑排版，建议使用专门的 OCR 技能或针对性工具读取)*`;
    }

    const summary = `PDF 文档（共 ${pageCount} 页${title ? `，标题: ${title}` : ''}）`;
    return {
      text: finalText,
      summary,
      charCount: finalText.length,
      extractedImages: []
    };
  } catch (err: any) {
    return {
      text: `（PDF 解析异常: ${err.message}）`,
      summary: 'PDF 解析失败',
      charCount: 0,
      extractedImages: []
    };
  }
}

/**
 * 统一门面方法：智能判断文档类型并执行最佳脱壳轻量化提取与图文同位还原
 */
export async function extractOfficeDocumentContent(
  fileName: string,
  buffer: Buffer
): Promise<OfficeExtractResult> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (ext === 'docx') {
    const res = extractDocxContent(buffer);
    return { ...res, type: 'word' };
  }

  if (ext === 'pptx') {
    const res = extractPptxContent(buffer);
    return { ...res, type: 'powerpoint' };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const res = await extractXlsxContent(buffer);
    return { ...res, type: 'excel' };
  }

  if (ext === 'pdf') {
    const res = await extractPdfContent(buffer);
    return { ...res, type: 'pdf' };
  }

  const asText = buffer.toString('utf-8');
  return {
    text: asText.slice(0, 50000),
    summary: `常规文本文件 (${Math.round(buffer.length / 1024)} KB)`,
    charCount: asText.length,
    type: 'unknown',
    extractedImages: []
  };
}
