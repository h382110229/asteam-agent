import fs from 'node:fs';
import path from 'node:path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  TableOfContents,
  PageBreak
} from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { safeWriteFileSync } from './file-resilience';

export interface DocxOptions {
  filePath: string;
  title: string;
  subtitle?: string;
  author?: string;
  version?: string;
  confidentiality?: string;
  includeToc?: boolean;
  markdownContent?: string;
  sections?: Array<{
    heading?: string;
    level?: number;
    paragraphs?: string[];
    bullets?: string[];
  }>;
}

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
}

export interface ExcelSheetDef {
  name: string;
  columns?: ExcelColumnDef[];
  rows: Array<Record<string, any> | any[]>;
  freezeTopRow?: boolean;
}

export interface ExcelOptions {
  filePath: string;
  title?: string;
  sheets?: ExcelSheetDef[];
  markdownContent?: string;
}

export interface ExcelReadResult {
  sheetNames: string[];
  totalSheets: number;
  sheets: Array<{
    name: string;
    rowCount: number;
    columnCount: number;
    headers: string[];
    rows: any[][];
    markdownTable: string;
  }>;
  summary: string;
}

export interface PptxSlide {
  title: string;
  keyTakeaway?: string;
  bullets?: string[];
  speakerNotes?: string;
}

export interface PptxOptions {
  filePath: string;
  title: string;
  subtitle?: string;
  author?: string;
  slides: PptxSlide[];
}

export const ECCOM_BRAND_COLORS = {
  primary: '006857',      // 松石主绿 RGB 0/104/87
  accent: 'D31245',       // 品牌强调红 RGB 211/18/69
  secondary1: '017260',   // 深青绿 RGB 1/114/96
  secondary2: '349182',   // 灰青绿 RGB 52/145/130
  secondary3: '3EB39C',   // 翡翠绿 RGB 62/179/156
  secondary4: '6BC39C',   // 薄荷绿 RGB 107/195/156
  secondary5: 'AAE4B4',   // 浅草绿 RGB 170/228/180
  neutralGray: 'A5A5A5',  // 中性灰 RGB 165/165/165
  borderGray: 'DDDDDD',   // 边框灰 RGB 221/221/221
  white: 'FFFFFF',        // 纯白 RGB 255/255/255
  darkText: '121C19',     // 深墨黑文字
  mutedText: '556B64',    // 辅助文字
  zebraBg: 'F7F9F8'       // 极浅斑马纹底色
};

/**
 * Generates an Enterprise-Grade Microsoft Word (.docx) document
 * Features:
 * - ECCOM Official Enterprise Cover Page with pine-green accent bars and brand red highlight
 * - Automatic Table of Contents (TOC)
 * - Dynamic Header & Footer with PageNumber.CURRENT of PageNumber.TOTAL_PAGES
 * - Multi-level headings outline with ECCOM pine-green brand palette
 * - Complex multi-table layout (10~20+ tables) with auto column widths, zebra striping, cantSplit and tableHeader
 */
function parseFormattedTextRuns(text: string, defaultColor = ECCOM_BRAND_COLORS.darkText, defaultSize = 21): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*.*?\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      runs.push(
        new TextRun({
          text: part.slice(2, -2),
          bold: true,
          size: defaultSize,
          color: defaultColor,
          font: 'Microsoft YaHei'
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: part,
          size: defaultSize,
          color: defaultColor,
          font: 'Microsoft YaHei'
        })
      );
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text, size: defaultSize, color: defaultColor, font: 'Microsoft YaHei' })];
}

export async function createWordDocx(options: DocxOptions): Promise<string> {
  const targetPath = path.normalize(options.filePath.endsWith('.docx') ? options.filePath : `${options.filePath}.docx`);
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const docTitle = options.title || '企业级技术方案白皮书';
  const docSubtitle = options.subtitle || '系统架构迁移与数字化转型演进方案';
  const docVersion = options.version || 'V1.0';
  const docAuthor = options.author || '华讯网络 (ECCOM) & ASTeam 联合架构团队';
  const docConfidentiality = options.confidentiality || '商业秘密 · 内部技术资料';
  const currentDateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

  // 1. Cover Page Section Elements
  const coverElements: any[] = [];

  // Top spacing
  coverElements.push(new Paragraph({ spacing: { before: 1200 } }));

  // ECCOM Brand Accent Bars (Pine Green + Accent Red)
  coverElements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '■'.repeat(26),
          color: ECCOM_BRAND_COLORS.primary, // 松石主绿 RGB 0/104/87
          size: 16
        }),
        new TextRun({
          text: '■'.repeat(6),
          color: ECCOM_BRAND_COLORS.accent, // 华讯强调红 RGB 211/18/69
          size: 16
        })
      ],
      spacing: { after: 300 }
    })
  );

  // Main Title
  coverElements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: docTitle,
          bold: true,
          size: 48, // 24pt
          color: ECCOM_BRAND_COLORS.darkText,
          font: 'Microsoft YaHei'
        })
      ],
      spacing: { after: 200 }
    })
  );

  // Subtitle
  if (docSubtitle) {
    coverElements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: docSubtitle,
            size: 24, // 12pt
            color: '475569',
            font: 'Microsoft YaHei'
          })
        ],
        spacing: { after: 1600 }
      })
    );
  } else {
    coverElements.push(new Paragraph({ spacing: { after: 1600 } }));
  }

  // Cover Metadata Table (Clean layout without outer borders)
  const metaRows = [
    ['方案版本', docVersion],
    ['编制团队', docAuthor],
    ['密级程度', docConfidentiality],
    ['发布日期', currentDateStr],
    ['方案状态', '正式发布 / 评审基线']
  ];

  const metaTableRows = metaRows.map(([label, val]) =>
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: label,
                  bold: true,
                  color: '64748B',
                  size: 20,
                  font: 'Microsoft YaHei'
                })
              ]
            })
          ],
          width: { size: 28, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
            left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
          },
          margins: { top: 80, bottom: 80, left: 100, right: 100 }
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: val,
                  bold: false,
                  color: '1E293B',
                  size: 20,
                  font: 'Microsoft YaHei'
                })
              ]
            })
          ],
          width: { size: 72, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
            left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
          },
          margins: { top: 80, bottom: 80, left: 100, right: 100 }
        })
      ]
    })
  );

  coverElements.push(
    new Table({
      rows: metaTableRows,
      width: { size: 85, type: WidthType.PERCENTAGE }
    })
  );

  // 2. Body Elements (TOC, Headings, Complex Tables, Paragraphs)
  const bodyElements: any[] = [];

  // Extract headings from markdown content for table of contents
  const extractedHeadings: Array<{ level: number; text: string }> = [];
  if (options.markdownContent) {
    for (const l of options.markdownContent.split('\n')) {
      const trimmed = l.trim();
      if (trimmed.startsWith('# ')) {
        extractedHeadings.push({ level: 1, text: trimmed.slice(2).trim() });
      } else if (trimmed.startsWith('## ')) {
        extractedHeadings.push({ level: 2, text: trimmed.slice(3).trim() });
      } else if (trimmed.startsWith('### ')) {
        extractedHeadings.push({ level: 3, text: trimmed.slice(4).trim() });
      }
    }
  }

  // Table of Contents (优雅静态结构化目录，杜绝动态域导致的 Word 安全警告与创建目录错误)
  if (options.includeToc !== false && extractedHeadings.length >= 2) {
    bodyElements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '目  录',
            bold: true,
            size: 32,
            color: ECCOM_BRAND_COLORS.primary,
            font: 'Microsoft YaHei'
          })
        ],
        spacing: { before: 200, after: 300 }
      })
    );

    for (const h of extractedHeadings) {
      if (h.level === 1) {
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: h.text,
                bold: true,
                size: 22,
                color: ECCOM_BRAND_COLORS.primary,
                font: 'Microsoft YaHei'
              })
            ],
            spacing: { before: 140, after: 60 }
          })
        );
      } else if (h.level === 2) {
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `•  ${h.text}`,
                size: 20,
                color: ECCOM_BRAND_COLORS.darkText,
                font: 'Microsoft YaHei'
              })
            ],
            spacing: { after: 50 },
            indent: { left: 360 }
          })
        );
      } else if (h.level === 3) {
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `-  ${h.text}`,
                size: 18,
                color: ECCOM_BRAND_COLORS.mutedText,
                font: 'Microsoft YaHei'
              })
            ],
            spacing: { after: 40 },
            indent: { left: 640 }
          })
        );
      }
    }

    bodyElements.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Parse Markdown Content or Structured Sections
  if (options.markdownContent) {
    const lines = options.markdownContent.split('\n');
    let currentTableRows: string[][] = [];
    let inTable = false;

    const flushTable = () => {
      if (currentTableRows.length > 0) {
        // Compute column widths based on maximum characters per column
        const numCols = Math.max(...currentTableRows.map(r => r.length));
        const colMaxChars: number[] = new Array(numCols).fill(4);

        for (const row of currentTableRows) {
          for (let c = 0; c < numCols; c++) {
            const cellLen = row[c] ? row[c].length : 0;
            if (cellLen > colMaxChars[c]) {
              colMaxChars[c] = cellLen;
            }
          }
        }

        const totalChars = colMaxChars.reduce((sum, val) => sum + val, 0);
        const colWidthPercentages = colMaxChars.map(chars =>
          Math.max(10, Math.min(60, Math.round((chars / Math.max(1, totalChars)) * 100)))
        );

        // Normalize sum to 100%
        const sumPct = colWidthPercentages.reduce((s, p) => s + p, 0);
        const normalizedWidths = colWidthPercentages.map(p => Math.round((p / sumPct) * 100));

        const tableRows = currentTableRows.map((row, rIdx) => {
          const isHeader = rIdx === 0;
          // Pad row if missing columns
          while (row.length < numCols) row.push('');

          return new TableRow({
            tableHeader: isHeader,
            cantSplit: true,
            children: row.map((cellText, cIdx) => {
              const cleaned = cellText.trim();
              const isNumeric = /^[\d.,%+-]+$/.test(cleaned);

              return new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cleaned,
                        bold: isHeader,
                        size: isHeader ? 19 : 18,
                        color: isHeader ? ECCOM_BRAND_COLORS.white : ECCOM_BRAND_COLORS.darkText,
                        font: 'Microsoft YaHei'
                      })
                    ],
                    alignment: isHeader
                      ? AlignmentType.CENTER
                      : isNumeric
                        ? AlignmentType.RIGHT
                        : AlignmentType.LEFT
                  })
                ],
                width: { size: normalizedWidths[cIdx] || 20, type: WidthType.PERCENTAGE },
                shading: {
                  fill: isHeader ? ECCOM_BRAND_COLORS.primary : rIdx % 2 === 1 ? ECCOM_BRAND_COLORS.zebraBg : ECCOM_BRAND_COLORS.white,
                  type: ShadingType.CLEAR
                },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 2, color: ECCOM_BRAND_COLORS.borderGray },
                  bottom: { style: BorderStyle.SINGLE, size: 2, color: ECCOM_BRAND_COLORS.borderGray },
                  left: { style: BorderStyle.SINGLE, size: 2, color: ECCOM_BRAND_COLORS.borderGray },
                  right: { style: BorderStyle.SINGLE, size: 2, color: ECCOM_BRAND_COLORS.borderGray }
                }
              });
            })
          });
        });

        bodyElements.push(
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
        bodyElements.push(new Paragraph({ spacing: { after: 180 } }));
        currentTableRows = [];
      }
      inTable = false;
    };

    let inCodeBlock = false;
    let currentCodeLines: string[] = [];

    const flushCodeBlock = () => {
      if (currentCodeLines.length > 0) {
        bodyElements.push(
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: currentCodeLines.map(cl =>
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: cl || ' ',
                            font: 'Consolas',
                            size: 18,
                            color: '0F172A'
                          })
                        ],
                        spacing: { before: 20, after: 20 }
                      })
                    ),
                    shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
                      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
                      left: { style: BorderStyle.SINGLE, size: 8, color: '1E3A8A' },
                      right: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' }
                    },
                    margins: { top: 80, bottom: 80, left: 120, right: 120 }
                  })
                ]
              })
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
        bodyElements.push(new Paragraph({ spacing: { after: 120 } }));
        currentCodeLines = [];
      }
      inCodeBlock = false;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (inTable) flushTable();
        if (inCodeBlock) {
          currentCodeLines.push('');
        }
        continue;
      }

      // Code Block: ```lang ... ```
      if (line.startsWith('```')) {
        if (inTable) flushTable();
        if (inCodeBlock) {
          flushCodeBlock();
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        currentCodeLines.push(rawLine);
        continue;
      }

      // Markdown Table row: | col1 | col2 |
      if (line.startsWith('|') && line.endsWith('|')) {
        // Separator row: |---|---|
        if (/^\|[-:\s|]+\|$/.test(line)) {
          continue;
        }
        inTable = true;
        const cells = line
          .slice(1, -1)
          .split('|')
          .map(c => c.trim());
        currentTableRows.push(cells);
        continue;
      } else if (inTable) {
        flushTable();
      }

      // Headings
      if (line.startsWith('# ')) {
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.slice(2).trim(),
                bold: true,
                size: 32, // 16pt
                color: ECCOM_BRAND_COLORS.primary,
                font: 'Microsoft YaHei'
              })
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 360, after: 160 }
          })
        );
      } else if (line.startsWith('## ')) {
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.slice(3).trim(),
                bold: true,
                size: 26, // 13pt
                color: ECCOM_BRAND_COLORS.darkText,
                font: 'Microsoft YaHei'
              })
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 280, after: 120 }
          })
        );
      } else if (line.startsWith('### ')) {
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.slice(4).trim(),
                bold: true,
                size: 22, // 11pt
                color: ECCOM_BRAND_COLORS.secondary2,
                font: 'Microsoft YaHei'
              })
            ],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 80 }
          })
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        // Bullet point
        const textContent = line.slice(2).trim();
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: '•  ',
                bold: true,
                size: 21,
                color: ECCOM_BRAND_COLORS.primary,
                font: 'Microsoft YaHei'
              }),
              ...parseFormattedTextRuns(textContent, ECCOM_BRAND_COLORS.darkText, 21)
            ],
            spacing: { after: 80 },
            indent: { left: 360 }
          })
        );
      } else if (/^\d+[\.、]\s+/.test(line)) {
        // Numbered list
        const numMatch = line.match(/^(\d+[\.、]\s+)(.*)$/);
        const prefix = numMatch ? numMatch[1] : '';
        const textContent = numMatch ? numMatch[2] : line;
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: prefix,
                bold: true,
                size: 21,
                color: ECCOM_BRAND_COLORS.primary,
                font: 'Microsoft YaHei'
              }),
              ...parseFormattedTextRuns(textContent, ECCOM_BRAND_COLORS.darkText, 21)
            ],
            spacing: { after: 80 },
            indent: { left: 360 }
          })
        );
      } else if (line.startsWith('>')) {
        // Callout box / quote
        const quoteContent = line.replace(/^>\s*/, '').trim();
        bodyElements.push(
          new Paragraph({
            children: parseFormattedTextRuns(quoteContent, ECCOM_BRAND_COLORS.primary, 20),
            spacing: { before: 100, after: 120 },
            indent: { left: 400, right: 400 },
            shading: { fill: ECCOM_BRAND_COLORS.zebraBg, type: ShadingType.CLEAR },
            border: {
              left: { style: BorderStyle.SINGLE, size: 16, color: ECCOM_BRAND_COLORS.primary }
            }
          })
        );
      } else {
        // Standard Paragraph
        bodyElements.push(
          new Paragraph({
            children: parseFormattedTextRuns(line, ECCOM_BRAND_COLORS.darkText, 21),
            spacing: { after: 140, line: 360 },
            alignment: AlignmentType.BOTH
          })
        );
      }
    }

    if (inTable) flushTable();
    if (inCodeBlock) flushCodeBlock();
  }

  // Structured sections support
  if (options.sections && options.sections.length > 0) {
    for (const sec of options.sections) {
      if (sec.heading) {
        bodyElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: sec.heading,
                bold: true,
                size: sec.level === 1 ? 30 : 24,
                color: ECCOM_BRAND_COLORS.primary,
                font: 'Microsoft YaHei'
              })
            ],
            heading: sec.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            spacing: { before: 260, after: 120 }
          })
        );
      }
      if (sec.paragraphs) {
        for (const p of sec.paragraphs) {
          bodyElements.push(
            new Paragraph({
              children: [new TextRun({ text: p, size: 21, font: 'Microsoft YaHei' })],
              spacing: { after: 120 }
            })
          );
        }
      }
      if (sec.bullets) {
        for (const b of sec.bullets) {
          bodyElements.push(
            new Paragraph({
              children: [new TextRun({ text: `• ${b}`, size: 21, font: 'Microsoft YaHei' })],
              spacing: { after: 80 },
              indent: { left: 360 }
            })
          );
        }
      }
    }
  }

  // Build Document with two sections: Cover Section + Body Section
  const doc = new Document({
    sections: [
      // 1. Cover Page Section
      {
        properties: {},
        children: coverElements
      },
      // 2. Main Content Section (with Header, Footer and Page Numbers)
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: docTitle,
                    size: 16,
                    color: ECCOM_BRAND_COLORS.neutralGray,
                    font: 'Microsoft YaHei'
                  }),
                  new TextRun({
                    text: `\t${docConfidentiality}`,
                    size: 16,
                    color: ECCOM_BRAND_COLORS.neutralGray,
                    font: 'Microsoft YaHei'
                  })
                ],
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: ECCOM_BRAND_COLORS.borderGray }
                },
                spacing: { after: 200 }
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: '华讯网络 (ECCOM) 专业技术方案交付白皮书\t第 ',
                    size: 16,
                    color: ECCOM_BRAND_COLORS.neutralGray,
                    font: 'Microsoft YaHei'
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: ECCOM_BRAND_COLORS.primary,
                    bold: true
                  }),
                  new TextRun({
                    text: ' 页 / 共 ',
                    size: 16,
                    color: ECCOM_BRAND_COLORS.neutralGray,
                    font: 'Microsoft YaHei'
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: ECCOM_BRAND_COLORS.neutralGray,
                    bold: true
                  }),
                  new TextRun({
                    text: ' 页',
                    size: 16,
                    color: '94A3B8',
                    font: 'Microsoft YaHei'
                  })
                ],
                border: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
                },
                spacing: { before: 160 }
              })
            ]
          })
        },
        children: [
          new Paragraph({ children: [new PageBreak()] }),
          ...bodyElements
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const writeRes = safeWriteFileSync(targetPath, buffer);
  const stats = fs.statSync(writeRes.actualPath);
  return `成功生成企业级专业 Word 文档 (.docx): "${writeRes.actualPath}" (${stats.size} 字节，已包含封面、目录、页眉页脚与专业排版表格)${writeRes.isFallback ? ` [提示: 原目标已被系统锁定占用，自动安全写入新版本: ${writeRes.actualPath}]` : ''}`;
}

/**
 * Generates an Enterprise-Grade Microsoft Excel (.xlsx) workbook using pure JS (exceljs)
 * Zero dependency on external Python/pandas/LibreOffice
 */
export async function createExcelXlsx(options: ExcelOptions): Promise<string> {
  const targetPath = path.normalize(options.filePath.endsWith('.xlsx') ? options.filePath : `${options.filePath}.xlsx`);
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ASTeam Agent Enterprise Engine';
  workbook.lastModifiedBy = 'ASTeam Agent';
  workbook.created = new Date();
  workbook.modified = new Date();

  // If structured sheets provided
  if (options.sheets && options.sheets.length > 0) {
    for (const sheetDef of options.sheets) {
      const sheet = workbook.addWorksheet(sheetDef.name || 'Sheet1', {
        views: sheetDef.freezeTopRow !== false ? [{ state: 'frozen', ySplit: 1 }] : []
      });

      if (sheetDef.columns && sheetDef.columns.length > 0) {
        sheet.columns = sheetDef.columns.map(c => ({
          header: c.header,
          key: c.key,
          width: c.width || 18
        }));
      }

      // Add rows
      if (sheetDef.rows && sheetDef.rows.length > 0) {
        sheet.addRows(sheetDef.rows);
      }

      // Style Header Row (Row 1)
      const headerRow = sheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ECCOM_BRAND_COLORS.primary } // ECCOM Pine Green RGB 0/104/87
        };
        cell.font = {
          name: 'Microsoft YaHei',
          color: { argb: 'FFFFFF' },
          bold: true,
          size: 11
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: ECCOM_BRAND_COLORS.borderGray } },
          bottom: { style: 'thin', color: { argb: ECCOM_BRAND_COLORS.borderGray } },
          left: { style: 'thin', color: { argb: ECCOM_BRAND_COLORS.borderGray } },
          right: { style: 'thin', color: { argb: ECCOM_BRAND_COLORS.borderGray } }
        };
      });

      // Style Data Rows & Auto adjust column width
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.height = 22;
          const isOdd = rowNumber % 2 === 1;
          row.eachCell((cell) => {
            cell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: ECCOM_BRAND_COLORS.darkText } };
            cell.alignment = {
              vertical: 'middle',
              horizontal: typeof cell.value === 'number' ? 'right' : 'left'
            };
            if (isOdd) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: ECCOM_BRAND_COLORS.zebraBg }
              };
            }
            cell.border = {
              top: { style: 'thin', color: { argb: ECCOM_BRAND_COLORS.borderGray } },
              bottom: { style: 'thin', color: { argb: ECCOM_BRAND_COLORS.borderGray } },
              left: { style: 'thin', color: { argb: ECCOM_BRAND_COLORS.borderGray } },
              right: { style: 'thin', color: { argb: ECCOM_BRAND_COLORS.borderGray } }
            };
          });
        }
      });

      // Auto-fit column widths
      sheet.columns.forEach((column: any) => {
        let maxLen = 10;
        column.eachCell?.({ includeEmpty: true }, (cell: any) => {
          const valStr = cell.value ? String(cell.value) : '';
          maxLen = Math.max(maxLen, valStr.length * 1.4);
        });
        column.width = Math.min(60, Math.max(12, Math.round(maxLen)));
      });
    }
  } else if (options.markdownContent) {
    // Parse markdown tables into Sheet1
    const sheet = workbook.addWorksheet('数据清单', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    const lines = options.markdownContent.split('\n');
    const tableRows: string[][] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (/^\|[-:\s|]+\|$/.test(line)) continue;
        const cells = line.slice(1, -1).split('|').map(c => c.trim());
        tableRows.push(cells);
      }
    }

    if (tableRows.length > 0) {
      const headers = tableRows[0];
      sheet.columns = headers.map((h, i) => ({ header: h, key: `col_${i}`, width: 20 }));
      for (let i = 1; i < tableRows.length; i++) {
        sheet.addRow(tableRows[i]);
      }

      // Style Header
      const headerRow = sheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ECCOM_BRAND_COLORS.primary }
        };
        cell.font = { name: 'Microsoft YaHei', color: { argb: 'FFFFFF' }, bold: true, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    }
  } else {
    // Default empty sheet
    workbook.addWorksheet('Sheet1');
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const writeRes = safeWriteFileSync(targetPath, Buffer.from(buffer));
  const stats = fs.statSync(writeRes.actualPath);
  return `成功生成企业级 Excel 工作簿 (.xlsx): "${writeRes.actualPath}" (${stats.size} 字节，包含 ${workbook.worksheets.length} 个工作表)${writeRes.isFallback ? ` [提示: 原目标已被系统锁定占用，自动安全写入新版本: ${writeRes.actualPath}]` : ''}`;
}

/**
 * Reads and parses an Excel (.xlsx) file using pure JS (exceljs)
 * Zero dependency on external Python/pandas
 */
export async function readExcelXlsx(filePath: string, sheetName?: string): Promise<ExcelReadResult> {
  const targetPath = path.normalize(filePath);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Excel 文件不存在: "${targetPath}"`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(targetPath);

  const sheetNames = workbook.worksheets.map(ws => ws.name);
  const resultSheets: ExcelReadResult['sheets'] = [];

  for (const worksheet of workbook.worksheets) {
    if (sheetName && worksheet.name !== sheetName) continue;

    const rows: any[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rowValues = (row.values as any[]).slice(1); // ExcelJS values is 1-indexed
      rows.push(rowValues.map(v => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object' && v.result !== undefined) return v.result; // Formula result
        if (typeof v === 'object' && v.text !== undefined) return v.text;     // Rich text
        return v;
      }));
    });

    const headers = rows.length > 0 ? rows[0].map(h => String(h || '')) : [];
    const dataRows = rows.slice(1);

    // Build markdown representation
    let mdTable = '';
    if (headers.length > 0) {
      mdTable += `| ${headers.join(' | ')} |\n`;
      mdTable += `| ${headers.map(() => '---').join(' | ')} |\n`;
      for (const r of dataRows.slice(0, 100)) { // Limit display to first 100 rows for preview
        const paddedRow = headers.map((_, idx) => (r[idx] !== undefined && r[idx] !== null ? String(r[idx]) : ''));
        mdTable += `| ${paddedRow.join(' | ')} |\n`;
      }
      if (dataRows.length > 100) {
        mdTable += `| ... (省略其余 ${dataRows.length - 100} 行) |\n`;
      }
    }

    resultSheets.push({
      name: worksheet.name,
      rowCount: dataRows.length,
      columnCount: headers.length,
      headers,
      rows: dataRows,
      markdownTable: mdTable
    });
  }

  const summary = `【Excel 原生读取结果】\n文件: "${targetPath}"\n工作表总数: ${sheetNames.length} (${sheetNames.join(', ')})\n` +
    resultSheets.map(s => `\n### Sheet: "${s.name}" (共 ${s.rowCount} 行，${s.columnCount} 列)\n${s.markdownTable}`).join('\n');

  return {
    sheetNames,
    totalSheets: sheetNames.length,
    sheets: resultSheets,
    summary
  };
}

/**
 * Generates a styled Microsoft PowerPoint (.pptx) presentation
 */
export async function createPowerPointPptx(options: PptxOptions): Promise<string> {
  const targetPath = path.normalize(options.filePath.endsWith('.pptx') ? options.filePath : `${options.filePath}.pptx`);
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  // Define ECCOM brand colors
  const primaryColor = ECCOM_BRAND_COLORS.primary;    // 松石主绿 006857
  const accentRed = ECCOM_BRAND_COLORS.accent;        // 品牌强调红 D31245
  const deepGreen = ECCOM_BRAND_COLORS.secondary1;    // 深青绿 017260
  const emeraldGreen = ECCOM_BRAND_COLORS.secondary3; // 翡翠绿 3EB39C
  const lightBg = ECCOM_BRAND_COLORS.zebraBg;         // 浅背景 F7F9F8
  const darkText = ECCOM_BRAND_COLORS.darkText;

  // 1. Cover Slide
  const coverSlide = pptx.addSlide();
  coverSlide.background = { color: deepGreen };

  // Cover Accent Top Bar (Pine Green + Brand Red Accent)
  coverSlide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: '80%',
    h: 0.15,
    fill: { color: primaryColor }
  });
  coverSlide.addShape(pptx.ShapeType.rect, {
    x: '80%',
    y: 0,
    w: '20%',
    h: 0.15,
    fill: { color: accentRed }
  });

  // Cover Title
  coverSlide.addText(options.title || '华讯网络 (ECCOM) 智能方案汇报', {
    x: 1.0,
    y: 2.2,
    w: 11.3,
    h: 1.5,
    fontSize: 38,
    bold: true,
    color: 'FFFFFF',
    fontFace: 'Microsoft YaHei'
  });

  // Cover Subtitle
  if (options.subtitle) {
    coverSlide.addText(options.subtitle, {
      x: 1.0,
      y: 3.8,
      w: 11.3,
      h: 0.8,
      fontSize: 20,
      color: ECCOM_BRAND_COLORS.secondary4, // 薄荷浅绿
      fontFace: 'Microsoft YaHei'
    });
  }

  // Cover Footer Info
  coverSlide.addText(`汇报日期：${new Date().toLocaleDateString('zh-CN')}  |  制作：${options.author || '华讯网络 (ECCOM) 架构团队'}`, {
    x: 1.0,
    y: 6.2,
    w: 11.3,
    h: 0.5,
    fontSize: 14,
    color: ECCOM_BRAND_COLORS.secondary5,
    fontFace: 'Microsoft YaHei'
  });

  // 2. Content Slides
  const slides = options.slides || [];
  slides.forEach((slideData, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: lightBg };

    // Header bar with Pine Green bottom border
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: '100%',
      h: 1.0,
      fill: { color: 'FFFFFF' },
      line: { color: ECCOM_BRAND_COLORS.borderGray, width: 1 }
    });

    // Top Brand Accent Line
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: '100%',
      h: 0.05,
      fill: { color: primaryColor }
    });

    // Slide Number & Tag
    slide.addText(`0${idx + 1}`, {
      x: 0.6,
      y: 0.25,
      w: 0.6,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: primaryColor,
      fontFace: 'Arial'
    });

    // Slide Title
    slide.addText(slideData.title, {
      x: 1.3,
      y: 0.25,
      w: 10.5,
      h: 0.5,
      fontSize: 22,
      bold: true,
      color: darkText,
      fontFace: 'Microsoft YaHei'
    });

    // Key Takeaway Card (if present)
    let contentTop = 1.4;
    if (slideData.keyTakeaway) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.8,
        y: contentTop,
        w: 11.7,
        h: 0.85,
        fill: { color: 'F0FDF4' }, // Light Emerald Tint
        line: { color: emeraldGreen, width: 1 },
        rectRadius: 0.1
      });

      slide.addText(`💡 核心观点：${slideData.keyTakeaway}`, {
        x: 1.0,
        y: contentTop + 0.12,
        w: 11.3,
        h: 0.6,
        fontSize: 15,
        bold: true,
        color: primaryColor,
        fontFace: 'Microsoft YaHei'
      });
      contentTop += 1.1;
    }

    // Bullets Content Box
    const bullets = slideData.bullets || [];
    if (bullets.length > 0) {
      const bulletItems = bullets.map(b => ({
        text: b,
        options: {
          fontSize: 16,
          color: darkText,
          bullet: { type: 'bullet' as const, code: '2022' },
          fontFace: 'Microsoft YaHei',
          spacing: { line: 360 }
        }
      }));

      slide.addText(bulletItems, {
        x: 0.8,
        y: contentTop,
        w: 11.7,
        h: 4.5,
        valign: 'top'
      });
    }

    // Speaker Notes
    if (slideData.speakerNotes) {
      slide.addNotes(slideData.speakerNotes);
    }
  });

  const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  const writeRes = safeWriteFileSync(targetPath, buffer);
  const stats = fs.statSync(writeRes.actualPath);
  return `成功生成 PowerPoint 演示文稿 (.pptx): "${writeRes.actualPath}" (${stats.size} 字节，共 ${slides.length + 1} 页)${writeRes.isFallback ? ` [提示: 原目标已被系统锁定占用，自动安全写入新版本: ${writeRes.actualPath}]` : ''}`;
}
