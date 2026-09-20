import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';

export interface OfficeExtractResult {
  text: string;
  summary: string;
  charCount: number;
  type: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'unknown';
}

/**
 * 针对 Word (.docx) 压缩包实施“脱壳分流与结构化纯文本提取”：
 * - 提取 document.xml 中的段落与层级标题
 * - 提取表格结构并转换为 Markdown 规范表格
 * - 统计内嵌图片媒体，避免几兆甚至几十兆的无意义 Base64 撑爆 1M 上下文
 */
export function extractDocxContent(buffer: Buffer): { text: string; summary: string; charCount: number } {
  try {
    const zip = new AdmZip(buffer);
    const docEntry = zip.getEntry('word/document.xml');
    if (!docEntry) {
      return {
        text: '（未能在 Word 压缩包中找到 word/document.xml）',
        summary: 'Word 文档结构异常',
        charCount: 0
      };
    }

    // 统计内部媒体图片数量
    const entries = zip.getEntries();
    let imageCount = 0;
    for (const entry of entries) {
      if (entry.entryName.startsWith('word/media/')) {
        imageCount++;
      }
    }

    const xml = docEntry.getData().toString('utf-8');

    // 结构化解析表格与段落
    let tableCount = 0;
    let paragraphCount = 0;

    // 分离文档流：将表格 <w:tbl> 转化为 Markdown 表格并替换占位
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

    // 提取段落 <w:p>
    const paragraphs: string[] = [];
    const pMatches = xmlWithTablePlaceholders.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

    for (const pXml of pMatches) {
      const tblPlaceholderMatch = pXml.match(/___ASTEAM_TABLE_(\d+)___/);
      if (tblPlaceholderMatch) {
        const tableIdx = parseInt(tblPlaceholderMatch[1], 10);
        if (tables[tableIdx]) {
          paragraphs.push(tables[tableIdx]);
          continue;
        }
      }

      const tMatches = pXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
      const pText = tMatches
        .map(t => t.replace(/<w:t\b[^>]*>/, '').replace(/<\/w:t>/, ''))
        .join('')
        .trim();

      if (pText) {
        paragraphCount++;
        if (pXml.includes('<w:heading') || pXml.includes('Heading') || pXml.includes('标题')) {
          paragraphs.push(`\n### ${pText}\n`);
        } else {
          paragraphs.push(pText);
        }
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
    const summary = `Word 文档（已提取 ${combinedText.length} 字、${tableCount} 个表格、${paragraphCount} 个段落${imageCount > 0 ? `，内含 ${imageCount} 张图片` : ''}）`;

    return {
      text: combinedText,
      summary,
      charCount: combinedText.length
    };
  } catch (err: any) {
    return {
      text: `（Word 文档脱壳解析异常: ${err.message}）`,
      summary: 'Word 解析失败',
      charCount: 0
    };
  }
}

/**
 * 针对 PowerPoint (.pptx) 演示文稿实施结构化幻灯片提取：
 * - 解析 ppt/slides/slide*.xml
 * - 按幻灯片序号提取每页的标题、要点列表与表格
 * - 丢弃每页母版和高清图片背景，浓缩为紧凑大纲
 */
export function extractPptxContent(buffer: Buffer): { text: string; summary: string; charCount: number } {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    
    // 找出所有 slide 文件并排序
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
        charCount: 0
      };
    }

    const slideTexts: string[] = [];
    slideEntries.forEach((entry, idx) => {
      const xml = entry.getData().toString('utf-8');
      
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

      if (paragraphs.length > 0) {
        const title = paragraphs[0];
        const body = paragraphs.slice(1).map(p => `- ${p}`).join('\n');
        slideTexts.push(`### 幻灯片 ${idx + 1}: ${title}\n${body}`);
      } else {
        slideTexts.push(`### 幻灯片 ${idx + 1}\n*(纯图片或无文本幻灯片)*`);
      }
    });

    const combinedText = slideTexts.join('\n\n---\n\n').trim();
    const summary = `PPT 演示文稿（共 ${slideEntries.length} 页幻灯片，已提取 ${combinedText.length} 字大纲）`;

    return {
      text: combinedText,
      summary,
      charCount: combinedText.length
    };
  } catch (err: any) {
    return {
      text: `（PPT 解析异常: ${err.message}）`,
      summary: 'PPT 解析失败',
      charCount: 0
    };
  }
}

/**
 * 针对 Excel (.xlsx) 表格实施结构化解析：
 * - 使用 exceljs 遍历每个 Worksheet
 * - 提取 Sheet 名称、表头与前 100 行数据（避免无限大表爆显存）
 * - 输出规整的 Markdown 表格
 */
export async function extractXlsxContent(buffer: Buffer): Promise<{ text: string; summary: string; charCount: number }> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheetTexts: string[] = [];
    let totalRows = 0;

    workbook.eachSheet((worksheet) => {
      const rowCount = worksheet.rowCount;
      totalRows += rowCount;
      const rows: string[][] = [];

      // 提取前 80 行数据展示，避免极端大表
      const maxRowsToExtract = Math.min(rowCount, 80);
      for (let r = 1; r <= maxRowsToExtract; r++) {
        const row = worksheet.getRow(r);
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= 25) { // 限制最多 25 列
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
      charCount: combinedText.length
    };
  } catch (err: any) {
    return {
      text: `（Excel 表格解析异常: ${err.message}）`,
      summary: 'Excel 解析失败',
      charCount: 0
    };
  }
}

/**
 * 针对 PDF (.pdf) 文档提取纯文本与大纲信息：
 * - 利用 pdf-lib 快速统计页数与基础元数据
 * - 扫描提取文本流，避免几兆甚至几十兆原生 PDF 二进制撑爆上下文
 */
export async function extractPdfContent(buffer: Buffer): Promise<{ text: string; summary: string; charCount: number }> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    const title = pdfDoc.getTitle() || '';
    const author = pdfDoc.getAuthor() || '';

    // 从 PDF 流中启发式抽取可读文本字符块
    const rawStr = buffer.toString('latin1');
    const textChunks: string[] = [];
    
    // 匹配 BT ... ET 文本块中的括号字符串 (text) Tj 或 [ (text) ] TJ
    const textMatches = rawStr.match(/\(([^)]+)\)\s*(?:Tj|TJ|'|")/g) || [];
    for (const match of textMatches) {
      const clean = match.replace(/^\(/, '').replace(/\)\s*(?:Tj|TJ|'|")$/, '').trim();
      if (clean && clean.length > 1 && !/^[\x00-\x1F\x7F]+$/.test(clean)) {
        textChunks.push(clean);
      }
    }

    let extractedText = '';
    if (textChunks.length > 20) {
      // 简单拼接，限制长度
      extractedText = textChunks.slice(0, 1500).join(' ').slice(0, 30000);
    }

    let finalText = `### PDF 文档信息\n- 页数: ${pageCount} 页\n${title ? `- 标题: ${title}\n` : ''}${author ? `- 作者: ${author}\n` : ''}`;
    if (extractedText.trim().length > 100) {
      finalText += `\n\n#### 提取正文摘要:\n${extractedText}`;
    } else {
      finalText += `\n\n*(当前 PDF 为扫描件/高密排版，建议使用专门的 OCR 技能或脚本进行针对性深度解析)*`;
    }

    const summary = `PDF 文档（共 ${pageCount} 页${title ? `，标题: ${title}` : ''}）`;
    return {
      text: finalText,
      summary,
      charCount: finalText.length
    };
  } catch (err: any) {
    return {
      text: `（PDF 解析异常: ${err.message}）`,
      summary: 'PDF 解析失败',
      charCount: 0
    };
  }
}

/**
 * 统一门面方法：智能判断文档类型并执行最佳脱壳轻量化提取
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

  // 兜底文本尝试
  const asText = buffer.toString('utf-8');
  return {
    text: asText.slice(0, 50000),
    summary: `常规文本文件 (${Math.round(buffer.length / 1024)} KB)`,
    charCount: asText.length,
    type: 'unknown'
  };
}
