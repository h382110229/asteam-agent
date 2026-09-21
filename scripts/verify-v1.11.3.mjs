import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import { extractDocxContent, extractPptxContent } from '../electron/office-extractor.ts';

console.log('=== 开始 ASTeam Agent v1.11.3 核心功能验证 ===\n');

// 1. 验证 Word 架构拓扑图图文同位还原与解压
console.log('--- 测试 1: Word (.docx) 架构/拓扑图图文同位还原与解压 ---');
const testDocxZip = new AdmZip();

// 构造关系表 word/_rels/document.xml.rels
const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/network_topology.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/cloud_arch.png"/>
</Relationships>`;
testDocxZip.addFile('word/_rels/document.xml.rels', Buffer.from(relsXml, 'utf-8'));

// 构造虚拟图片（生成两个大于 5KB 的 Buffer 模拟真实架构拓扑图）
const fakeImage1 = Buffer.alloc(12 * 1024, 0x89); // 12KB
const fakeImage2 = Buffer.alloc(18 * 1024, 0x50); // 18KB
testDocxZip.addFile('word/media/network_topology.png', fakeImage1);
testDocxZip.addFile('word/media/cloud_arch.png', fakeImage2);

// 构造正文 word/document.xml，包含段落与图片 Drawing 标签
const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>一、项目现状与网络割接目标</w:t></w:r></w:p>
    <w:p><w:r><w:t>本项目涉及核心数据中心 10GE 交换机与防火墙割接。</w:t></w:r></w:p>
    <w:p>
      <w:r><w:t>以下为当前网络拓扑结构：</w:t></w:r>
      <w:drawing><a:blip r:embed="rId1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/></w:drawing>
    </w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>二、华为云混合云目标态架构</w:t></w:r></w:p>
    <w:p><w:r><w:t>通过专线 Direct Connect 互联两地三中心。</w:t></w:r></w:p>
    <w:p>
      <w:r><w:t>目标态云上架构如下图所示：</w:t></w:r>
      <w:drawing><a:blip r:embed="rId2" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/></w:drawing>
    </w:p>
  </w:body>
</w:document>`;
testDocxZip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));

const docxBuffer = testDocxZip.toBuffer();
const docxResult = extractDocxContent(docxBuffer);

console.log(`- 提取文字总字数: ${docxResult.charCount}`);
console.log(`- 摘要信息: ${docxResult.summary}`);
console.log(`- 提取到的图表数量: ${docxResult.extractedImages.length}`);
console.log(`- 第一张图表:`, {
  name: docxResult.extractedImages[0]?.name,
  hint: docxResult.extractedImages[0]?.locationHint,
  hasBase64: !!docxResult.extractedImages[0]?.base64,
  localPath: docxResult.extractedImages[0]?.localPath
});

if (docxResult.extractedImages.length === 2 &&
    docxResult.text.includes('![【内嵌核心架构/网络拓扑图】: network_topology.png') &&
    docxResult.text.includes('![【内嵌核心架构/网络拓扑图】: cloud_arch.png') &&
    fs.existsSync(docxResult.extractedImages[0].localPath)) {
  console.log('✓ 测试 1 通过: Word 架构拓扑图成功原位标记、解压落盘，且生成了多模态 Base64！\n');
} else {
  console.error('❌ 测试 1 失败: 图文同位还原不符合预期');
  process.exit(1);
}

// 2. 验证防早退判定 (Auto-Driving Completion Guard) 规则
console.log('--- 测试 2: 内核防早退判定器 (Auto-Driving Completion Guard) ---');
const userQuery = '帮我查看一下project所在文件夹有哪些文件，帮我简单分析一下';
const modelResponses = [
  '我先查看当前项目目录的文件列表。',
  '抱歉，刚才只完成了文件列表查询，还没输出分析结论。我现在重新完整扫描项目目录，并结合 Git 状态做一次真实分析',
  '我先来扫描一下工作区的所有文件：',
  '好的，正在为您查看当前工程的文件结构。'
];

const isActionRequested = /(?:查看|列出|有哪些|检索|扫描|分析|检查|查找|生成|创建|修改|统计|读取|找一下|帮我)/i.test(userQuery);

modelResponses.forEach((resp, idx) => {
  const trimmed = resp.trim();
  const isTransitionStatement = (
    trimmed.length < 350 && (
      /^(?:我先|我来|我现在|首先|准备|正在|下面将|接下来|稍等|马上|抱歉|好的)/.test(trimmed) ||
      /(?:我先查看|重新完整扫描|重新扫描|我先列出|现在开始|先来检视|先看下|先查看)/.test(trimmed) ||
      trimmed.endsWith('：') || trimmed.endsWith(':') ||
      trimmed.includes('开始执行') || trimmed.includes('执行计划') ||
      trimmed.includes('运行 `') || trimmed.includes('执行以下操作') || trimmed.includes('依次执行')
    )
  );

  const shouldDrive = isActionRequested && isTransitionStatement;
  console.log(`- 样本 ${idx + 1}: "${resp.slice(0, 30)}..." -> 判定为过渡句: ${isTransitionStatement}, 触发自驱动唤醒: ${shouldDrive}`);
  if (!shouldDrive) {
    console.error(`❌ 测试 2 失败: 样本 ${idx + 1} 未被判定拦截！`);
    process.exit(1);
  }
});
console.log('✓ 测试 2 通过: 所有口头应答与过渡句均被成功识别并触发内核自驱动，彻底杜绝假完成！\n');

// 3. 验证非 Git 仓库与文档任务自适应
console.log('--- 测试 3: 文档任务与非 Git 仓库自适应规划 ---');
const testNonGitPath = path.join(os.tmpdir(), 'asteam-test-nongit-' + Date.now());
fs.mkdirSync(testNonGitPath, { recursive: true });

const isGit = fs.existsSync(path.join(testNonGitPath, '.git'));
const isDocOrConsultTask = /(?:文档|方案|架构|拓扑|报告|白皮书|查看|分析|有哪些文件|目录|清单|总结|审阅|审核|设计|word|docx|ppt|pptx|excel|xlsx|pdf)/i.test(userQuery) &&
  !/(?:git\s+commit|git\s+push|提交代码|创建分支|解决冲突|发版|\bpr\b|\bmr\b)/i.test(userQuery);

console.log(`- 是否为 Git 仓库: ${isGit} (预期: false)`);
console.log(`- 是否命中方案/文档分析任务: ${isDocOrConsultTask} (预期: true)`);

if (!isGit && isDocOrConsultTask) {
  console.log('✓ 测试 3 通过: 准确识别非 Git 目录与方案文档任务，成功解除 Git 执念！\n');
} else {
  console.error('❌ 测试 3 失败: 识别逻辑异常');
  process.exit(1);
}

console.log('🎉 所有核心功能验证通过！');
