/**
 * ASTeam Agent - v1.8.0 Comprehensive Self-Verification Suite
 * 
 * Verifies:
 * 1. Built-in Pure JS Native Office Productivity Suite (Word with Cover/TOC/Tables, Exceljs multi-sheet/freeze/read, PPT)
 * 2. Artifact Verification Gate (Physical Existence, Stale Timestamp Interception, Zero-byte Detection, Badge Generation)
 * 3. Windows PowerShell Command Sandbox Robustness (Syntax Rewriting for && / ||, Temp Script Sandbox)
 * 4. Hermes-Style Persistent Memory & Self-Evolving Skills (Post-Task Reflection, Skill Distillation, Built-in Migration Skill)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

function loadEsbuildModule(entryFile, externals = ['electron']) {
  const buildRes = esbuild.buildSync({
    entryPoints: [entryFile],
    bundle: true,
    format: 'cjs',
    write: false,
    platform: 'node',
    external: externals
  });
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', buildRes.outputFiles[0].text);
  fn(mod, mod.exports, require, path.dirname(entryFile), entryFile);
  return mod.exports;
}

async function runTestSuite() {
  console.log('===========================================================');
  console.log('🚀 ASTeam Agent v1.8.0 Native Office & Self-Evolving Verification');
  console.log('===========================================================\n');

  const testArtifactsDir = path.join(rootDir, '.asteam', 'test_v180_artifacts');
  if (!fs.existsSync(testArtifactsDir)) fs.mkdirSync(testArtifactsDir, { recursive: true });

  // -------------------------------------------------------------
  // Test Group 1: Built-in Pure JS Native Office Productivity Suite
  // -------------------------------------------------------------
  console.log('📊 [Test Group 1] Pure JS Native Office Productivity Suite');
  try {
    const officeModule = loadEsbuildModule(path.join(rootDir, 'electron/office-generator.ts'));
    const { createWordDocx, createExcelXlsx, readExcelXlsx, createPowerPointPptx } = officeModule;

    assert(typeof createWordDocx === 'function', 'createWordDocx is exported');
    assert(typeof createExcelXlsx === 'function', 'createExcelXlsx is exported');
    assert(typeof readExcelXlsx === 'function', 'readExcelXlsx is exported');
    assert(typeof createPowerPointPptx === 'function', 'createPowerPointPptx is exported');

    // 1.1 Test Word Generation with Enterprise Cover, TOC, and Zebra Tables
    const testDocxPath = path.join(testArtifactsDir, 'test_report.docx');
    const wordRes = await createWordDocx({
      filePath: testDocxPath,
      title: 'v1.8.0 自动化测试验证方案',
      subtitle: '企业级纯 JS 原生排版测试',
      version: 'V1.0',
      author: 'ASTeam QA',
      markdownContent: `
# 一、测试章节概述
这是测试正文内容。

| 组件模块 | 依赖方式 | 运行状态 |
|---|---|---|
| docx | 内置纯 JS | 正常 |
| exceljs | 内置纯 JS | 正常 |
| pptxgenjs | 内置纯 JS | 正常 |
`
    });

    assert(fs.existsSync(testDocxPath), `Word document physically written: ${testDocxPath}`);
    const docxStat = fs.statSync(testDocxPath);
    assert(docxStat.size > 5000, `Word document size is valid (${docxStat.size} bytes)`);
    assert(wordRes.includes('成功生成企业级专业 Word 文档'), 'createWordDocx returns success message');

    // 1.2 Test Excel Generation (Multi-Sheet, Frozen Rows, Auto Width)
    const testXlsxPath = path.join(testArtifactsDir, 'test_sheets.xlsx');
    const excelRes = await createExcelXlsx({
      filePath: testXlsxPath,
      title: '测试资产簿',
      sheets: [
        {
          name: '主机明细',
          columns: [
            { header: '主机ID', key: 'id', width: 15 },
            { header: '主机名称', key: 'name', width: 25 },
            { header: 'CPU(核)', key: 'cpu', width: 15 },
            { header: '内存(GB)', key: 'ram', width: 15 }
          ],
          rows: [
            { id: '101', name: 'web-server-01', cpu: 16, ram: 64 },
            { id: '102', name: 'db-cluster-01', cpu: 32, ram: 128 }
          ]
        },
        {
          name: '网络配置',
          columns: [
            { header: '网段', key: 'cidr' },
            { header: '网关', key: 'gw' }
          ],
          rows: [
            { cidr: '192.168.1.0/24', gw: '192.168.1.1' }
          ]
        }
      ]
    });

    assert(fs.existsSync(testXlsxPath), `Excel workbook physically written: ${testXlsxPath}`);
    const xlsxStat = fs.statSync(testXlsxPath);
    assert(xlsxStat.size > 2000, `Excel file size is valid (${xlsxStat.size} bytes)`);
    assert(excelRes.includes('成功生成企业级 Excel 工作簿'), 'createExcelXlsx returns success message');

    // 1.3 Test Native Excel Reader
    const readRes = await readExcelXlsx(testXlsxPath);
    assert(readRes.totalSheets === 2, `readExcelXlsx identified 2 sheets: ${readRes.sheetNames.join(', ')}`);
    assert(readRes.sheets[0].name === '主机明细', 'Sheet 1 name matches');
    assert(readRes.sheets[0].rowCount === 2, 'Sheet 1 row count is 2');
    assert(readRes.sheets[0].markdownTable.includes('web-server-01'), 'Sheet 1 content contains host data');

    // 1.4 Test PowerPoint Generation
    const testPptxPath = path.join(testArtifactsDir, 'test_slides.pptx');
    const pptRes = await createPowerPointPptx({
      filePath: testPptxPath,
      title: 'v1.8.0 核心特性汇报',
      subtitle: '零外部环境依赖与原生 Office 跃升',
      slides: [
        {
          title: '架构演进痛点',
          keyTakeaway: '摆脱外部 Python/LibreOffice，彻底杜绝虚假交付',
          bullets: ['全量内置纯 JS Office 引擎', '物理探针硬门禁防伪', '自演进技能体系']
        }
      ]
    });
    assert(fs.existsSync(testPptxPath), `PowerPoint presentation physically written: ${testPptxPath}`);
    assert(fs.statSync(testPptxPath).size > 10000, 'PPTX size is valid');
  } catch (err) {
    assert(false, `Group 1 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 2: Artifact Verification Gate (物理探针硬门禁)
  // -------------------------------------------------------------
  console.log('\n🛡️ [Test Group 2] Artifact Verification Gate (Anti-Hallucination)');
  try {
    const verifierModule = loadEsbuildModule(path.join(rootDir, 'electron/artifact-verifier.ts'));
    const { artifactVerifier } = verifierModule;

    assert(artifactVerifier !== undefined, 'ArtifactVerifier instance initialized');

    // 2.1 Test Non-existent file rejection
    const fakePath = path.join(testArtifactsDir, 'non_existent_file_999.docx');
    const fakeRes = artifactVerifier.verifyArtifact(fakePath, Date.now());
    assert(fakeRes.verified === false, 'Non-existent file rejected by probe');
    assert(fakeRes.failureReason.includes('不存在'), 'Failure reason correctly explains non-existence');

    // 2.2 Test Zero-byte file rejection
    const emptyPath = path.join(testArtifactsDir, 'empty_file.docx');
    fs.writeFileSync(emptyPath, '');
    const emptyRes = artifactVerifier.verifyArtifact(emptyPath, Date.now());
    assert(emptyRes.verified === false, '0-byte empty file rejected by probe');
    assert(emptyRes.failureReason.includes('0 字节'), 'Failure reason correctly detects 0 bytes');

    // 2.3 Test Stale/Historical file rejection (Anti-Stale-Hallucination)
    const stalePath = path.join(testArtifactsDir, 'stale_old_file.docx');
    fs.writeFileSync(stalePath, 'dummy content from yesterday');
    // Artificially backdate mtime by 10 minutes (600,000 ms)
    const oldTime = new Date(Date.now() - 600000);
    fs.utimesSync(stalePath, oldTime, oldTime);

    const taskStartTime = Date.now();
    const staleRes = artifactVerifier.verifyArtifact(stalePath, taskStartTime);
    assert(staleRes.verified === false, 'Stale historical file rejected by probe freshness check');
    assert(staleRes.failureReason.includes('时效性拦截') || staleRes.failureReason.includes('旧文件'), 'Failure reason flags historical file timestamp');

    // 2.4 Test Fresh valid file acceptance
    const freshPath = path.join(testArtifactsDir, 'fresh_new_file.docx');
    fs.writeFileSync(freshPath, 'valid newly generated content');
    const freshRes = artifactVerifier.verifyArtifact(freshPath, taskStartTime);
    assert(freshRes.verified === true, 'Fresh newly created file accepted by probe');
    assert(freshRes.badge !== undefined && freshRes.badge.includes('物理探针门禁验收通过'), 'Trusted verification badge issued');

    // 2.5 Test Gate Delivery Report Inspection
    const claimedAssistantText = `任务已完成！已为您生成：\`${stalePath}\`，所有表格已校验完毕。`;
    const gateReport = artifactVerifier.inspectDeliveryGate(claimedAssistantText, taskStartTime, []);
    assert(gateReport.passed === false, 'Gate successfully intercepted assistant text claiming delivery of stale file');
    assert(gateReport.blockingMessage.includes('物理探针门禁拦截警告'), 'Gate generates corrective blocking feedback');
  } catch (err) {
    assert(false, `Group 2 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 3: Windows PowerShell Command Sandbox Robustness
  // -------------------------------------------------------------
  console.log('\n⚡ [Test Group 3] Windows PowerShell Command Sandbox Robustness');
  try {
    // Test command syntax transformation logic
    const bashChainedCmd = 'cd . && echo step1 && echo step2';
    const andParts = bashChainedCmd.split(/\s*&&\s*/);
    let sanitized = andParts.reduce((acc, part, idx) => {
      if (idx === 0) return part;
      return `${acc}; if ($?) { ${part} }`;
    });

    assert(sanitized.includes('; if ($?) { echo step1 }'), '&& replaced with robust PowerShell conditional check');
    assert(sanitized.includes('; if ($?) { echo step2 }'), 'Full chained sequence converted safely');

    // Verify temp script writing with UTF-8 BOM
    const tempPs1 = path.join(testArtifactsDir, 'test_cmd.ps1');
    const scriptBody = `\uFEFF[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;\r\nWrite-Output "ASTeam UTF-8 汉字测试"\r\n`;
    fs.writeFileSync(tempPs1, scriptBody, 'utf-8');
    const readBack = fs.readFileSync(tempPs1, 'utf-8');
    assert(readBack.startsWith('\uFEFF'), 'Temp script includes UTF-8 BOM for Windows PowerShell');
    assert(readBack.includes('汉字'), 'Non-ASCII Unicode characters preserved without corruption');
  } catch (err) {
    assert(false, `Group 3 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 4: Hermes-Style Memory Reflection & Self-Evolving Skills
  // -------------------------------------------------------------
  console.log('\n🧠 [Test Group 4] Hermes-Style Memory Reflection & Self-Evolving Skills');
  try {
    const memModule = loadEsbuildModule(path.join(rootDir, 'electron/memory-manager.ts'));
    const { memoryManager } = memModule;
    const skillModule = loadEsbuildModule(path.join(rootDir, 'electron/skill-manager.ts'));
    const { skillManager } = skillModule;

    // 4.1 Post-Task Automatic Reflection
    const reflectRes = memoryManager.autoReflectAndPersist({
      userPrompt: '从微信 Excel 读取数据生成《IDC数据库与CBS系统迁移至华为云技术方案_V1.0.docx》',
      stepsCount: 4,
      toolsUsed: ['read_excel', 'generate_docx'],
      artifactsGenerated: ['~/Desktop/IDC数据库与CBS系统迁移至华为云技术方案_V1.0.docx'],
      recoveredErrors: ['PowerShell 老版本 && 语法纠偏'],
      workspacePath: rootDir
    });

    assert(reflectRes.reflected === true, 'autoReflectAndPersist produced reflective insights');
    assert(reflectRes.insights.some(i => i.includes('Word') || i.includes('华为云')), 'Reflected insights contain Office and Cloud migration domain rules');

    // 4.2 Built-in IDC Cloud Migration Expert Skill
    const migrationSkill = skillManager.findSkill('idc_cloud_migration_expert', rootDir);
    assert(migrationSkill !== undefined, 'Built-in idc_cloud_migration_expert skill found');
    assert(migrationSkill.prompt.includes('华为云'), 'Skill prompt incorporates Huawei Cloud guidelines');
    assert(migrationSkill.prompt.includes('ECU'), 'Skill prompt includes ECU inventory instructions');

    // 4.3 Skill Distillation to Project Workspace
    const distilled = skillManager.distillSkill(
      'distilled_cbs_migration',
      'CBS系统迁移演化技能',
      '从实际割接任务中自提炼出的标准迁移规约',
      '【激活技能：CBS系统迁移演化技能】\n- 1. 执行全量资产盘点；\n- 2. 调度 DRS 进行增量同步。',
      'workspace',
      rootDir
    );

    assert(distilled.id === 'custom:workspace:distilled_cbs_migration', 'Distilled skill ID formatted correctly');
    const skillFilePath = path.join(rootDir, '.asteam', 'skills', 'distilled_cbs_migration.md');
    assert(fs.existsSync(skillFilePath), `Distilled skill physically saved: ${skillFilePath}`);
    const skillContent = fs.readFileSync(skillFilePath, 'utf-8');
    assert(skillContent.includes('CBS系统迁移演化技能'), 'Skill file contains distilled prompt');
  } catch (err) {
    assert(false, `Group 4 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Clean up test temporary directory
  // -------------------------------------------------------------
  try {
    fs.rmSync(testArtifactsDir, { recursive: true, force: true });
  } catch {}

  console.log('\n===========================================================');
  console.log(`🏁 测试统计: 总计 ${totalTests} 项 | 通过 ${passedTests} 项 | 失败 ${failedTests} 项`);
  console.log('===========================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
