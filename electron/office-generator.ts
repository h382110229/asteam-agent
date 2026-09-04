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
  ShadingType
} from 'docx';
import PptxGenJS from 'pptxgenjs';

export interface DocxOptions {
  filePath: string;
  title: string;
  subtitle?: string;
  author?: string;
  markdownContent?: string;
  sections?: Array<{
    heading?: string;
    level?: number;
    paragraphs?: string[];
    bullets?: string[];
  }>;
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

/**
 * Generates a styled Microsoft Word (.docx) document
 */
export async function createWordDocx(options: DocxOptions): Promise<string> {
  const targetPath = path.normalize(options.filePath.endsWith('.docx') ? options.filePath : `${options.filePath}.docx`);
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const docChildren: any[] = [];

  // Document Title Header
  docChildren.push(
    new Paragraph({
      text: options.title || '企业级技术方案白皮书',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 }
    })
  );

  if (options.subtitle) {
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: options.subtitle,
            italics: true,
            color: '64748B',
            size: 24
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 }
      })
    );
  }

  // Metadata block
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `生成日期：${new Date().toLocaleDateString('zh-CN')}    作者/团队：${options.author || 'ASTeam Agent'}`,
          color: '94A3B8',
          size: 20
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  // If markdown content provided, parse lines into headings, bullets, paragraphs
  if (options.markdownContent) {
    const lines = options.markdownContent.split('\n');
    let currentTableRows: string[][] = [];
    let inTable = false;

    const flushTable = () => {
      if (currentTableRows.length > 0) {
        const tableRows = currentTableRows.map((row, rIdx) => {
          const isHeader = rIdx === 0;
          return new TableRow({
            children: row.map(cell => new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell.trim(),
                      bold: isHeader,
                      size: 20,
                      color: isHeader ? 'FFFFFF' : '1E293B'
                    })
                  ]
                })
              ],
              shading: isHeader ? { fill: '2563EB', type: ShadingType.CLEAR } : undefined,
              margins: { top: 100, bottom: 100, left: 150, right: 150 }
            }))
          });
        });

        docChildren.push(
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
        docChildren.push(new Paragraph({ spacing: { after: 150 } }));
        currentTableRows = [];
      }
      inTable = false;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (inTable) flushTable();
        continue;
      }

      // Markdown Table line: | col1 | col2 |
      if (line.startsWith('|') && line.endsWith('|')) {
        // Skip separator line |---|---|
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
        docChildren.push(
          new Paragraph({
            text: line.slice(2).trim(),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 120 }
          })
        );
      } else if (line.startsWith('## ')) {
        docChildren.push(
          new Paragraph({
            text: line.slice(3).trim(),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 100 }
          })
        );
      } else if (line.startsWith('### ')) {
        docChildren.push(
          new Paragraph({
            text: line.slice(4).trim(),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 180, after: 80 }
          })
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `•  ${line.slice(2).trim()}`,
                size: 22,
                color: '334155'
              })
            ],
            spacing: { after: 80 },
            indent: { left: 360 }
          })
        );
      } else if (/^\d+\.\s+/.test(line)) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.trim(),
                size: 22,
                color: '334155'
              })
            ],
            spacing: { after: 80 },
            indent: { left: 360 }
          })
        );
      } else {
        // Clean bold marks **text**
        const cleanedText = line.replace(/\*\*(.*?)\*\*/g, '$1');
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: cleanedText,
                size: 22,
                color: '1E293B'
              })
            ],
            spacing: { after: 120 },
            alignment: AlignmentType.BOTH
          })
        );
      }
    }

    if (inTable) flushTable();
  }

  // If structured sections provided
  if (options.sections && options.sections.length > 0) {
    for (const sec of options.sections) {
      if (sec.heading) {
        docChildren.push(
          new Paragraph({
            text: sec.heading,
            heading: sec.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 100 }
          })
        );
      }
      if (sec.paragraphs) {
        for (const p of sec.paragraphs) {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: p, size: 22 })],
              spacing: { after: 120 }
            })
          );
        }
      }
      if (sec.bullets) {
        for (const b of sec.bullets) {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `• ${b}`, size: 22 })],
              spacing: { after: 80 },
              indent: { left: 360 }
            })
          );
        }
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(targetPath, buffer);
  return `成功生成 Word 文档 (.docx): "${targetPath}" (${buffer.byteLength} 字节)`;
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

  // Define brand colors
  const primaryColor = '2563EB'; // Blue 600
  const darkNavy = '0F172A';     // Slate 900
  const lightBg = 'F8FAFC';      // Slate 50

  // 1. Cover Slide
  const coverSlide = pptx.addSlide();
  coverSlide.background = { color: darkNavy };

  // Cover Accent Top Bar
  coverSlide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: '100%',
    h: 0.15,
    fill: { color: primaryColor }
  });

  // Cover Title
  coverSlide.addText(options.title || 'ASTeam 智能方案汇报', {
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
      color: '94A3B8',
      fontFace: 'Microsoft YaHei'
    });
  }

  // Cover Footer Info
  coverSlide.addText(`汇报日期：${new Date().toLocaleDateString('zh-CN')}  |  制作：${options.author || 'ASTeam Agent'}`, {
    x: 1.0,
    y: 6.2,
    w: 11.3,
    h: 0.5,
    fontSize: 14,
    color: '64748B',
    fontFace: 'Microsoft YaHei'
  });

  // 2. Content Slides
  const slides = options.slides || [];
  slides.forEach((slideData, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: lightBg };

    // Header bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: '100%',
      h: 1.0,
      fill: { color: 'FFFFFF' },
      line: { color: 'E2E8F0', width: 1 }
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
      color: darkNavy,
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
        fill: { color: 'EFF6FF' },
        line: { color: 'BFDBFE', width: 1 },
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
          color: '334155',
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

    // Attach Speaker Notes (讲者演讲逐字稿)
    if (slideData.speakerNotes) {
      slide.addNotes(slideData.speakerNotes);
    }
  });

  await pptx.writeFile({ fileName: targetPath });
  const stats = fs.statSync(targetPath);
  return `成功生成 PowerPoint 演示文稿 (.pptx): "${targetPath}" (${stats.size} 字节，共 ${slides.length + 1} 页)`;
}
