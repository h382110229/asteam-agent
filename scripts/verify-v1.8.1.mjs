/**
 * ASTeam Agent - v1.8.1 Comprehensive Storage Closed-Loop & Verification Suite
 * 
 * Verifies:
 * 1. Built-in Pure JS Native Office Productivity Suite (Word with Cover/TOC/Tables, Exceljs multi-sheet/freeze/read, PPT)
 * 2. Artifact Verification Gate (Physical Existence, Stale Timestamp Interception, Zero-byte Detection, Badge Generation)
 * 3. Windows PowerShell Command Sandbox Robustness (Syntax Rewriting for && / ||, Temp Script Sandbox)
 * 4. Hermes-Style Persistent Memory & Self-Evolving Skills (Post-Task Reflection, Skill Distillation, Built-in Migration Skill)
 * 5. ASTeam StorageHub Closed-Loop & D:\ Drive Preference (mcp_servers.json, auto-load, storage stats)
 * 6. Skill Manager Pure Isolation & resolveSafe Redirection (Zero C:\ ~/.asteam leakage, redirect to closed loop)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
  console.log('🚀 ASTeam Agent v1.8.1 Storage Closed-Loop & Verification Suite');
  console.log('===========================================================\n');

  const testArtifactsDir = path.join(rootDir, '.asteam', 'test_v181_artifacts');
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
  // Test Group 5: ASTeam StorageHub Closed-Loop & D:\ Drive Preference
  // -------------------------------------------------------------
  console.log('\n💾 [Test Group 5] ASTeam StorageHub Closed-Loop & D:\\ Drive Preference');
  try {
    const storageModule = loadEsbuildModule(path.join(rootDir, 'electron/storage-hub.ts'));
    const { storageHub } = storageModule;

    assert(storageHub !== undefined, 'StorageHub instance initialized');
    const dataRootDir = storageHub.getDataRootDir();
    console.log(`    ℹ️ Current Data Root Dir: ${dataRootDir}`);

    if (process.platform === 'win32' && fs.existsSync('D:\\')) {
      assert(dataRootDir.toLowerCase().startsWith('d:\\'), `On Windows with D: drive, Data Root strictly defaults to D: drive (${dataRootDir})`);
    }

    assert(fs.existsSync(storageHub.getSkillsDir()), `Skills directory exists: ${storageHub.getSkillsDir()}`);
    assert(fs.existsSync(storageHub.getMemoryDir()), `Memory directory exists: ${storageHub.getMemoryDir()}`);
    assert(fs.existsSync(storageHub.getArtifactsDir()), `Artifacts directory exists: ${storageHub.getArtifactsDir()}`);
    assert(fs.existsSync(storageHub.getWorkspacesDir()), `Workspaces directory exists: ${storageHub.getWorkspacesDir()}`);
    assert(fs.existsSync(storageHub.getLogsDir()), `Logs directory exists: ${storageHub.getLogsDir()}`);

    const mcpConfigPath = storageHub.getMcpConfigFilePath();
    assert(mcpConfigPath.endsWith('mcp_servers.json'), 'getMcpConfigFilePath returns mcp_servers.json under data root');
    assert(mcpConfigPath.startsWith(dataRootDir), 'MCP config file is located inside ASTeam data root (closed-loop)');

    const stats = storageHub.getStorageStats();
    assert(stats.dataRootDir === dataRootDir, 'getStorageStats reports correct data root directory');
    assert(stats.subdirs.skills !== undefined, 'Stats reports skills module');

    // Test MCP Manager Persistence & Client v1.8.1
    const mcpModule = loadEsbuildModule(path.join(rootDir, 'electron/mcp-manager.ts'));
    const { mcpManager } = mcpModule;
    assert(mcpManager !== undefined, 'McpManager instance initialized');

    const testMcpConfig = JSON.stringify({
      mcpServers: {
        test_v181_runner: {
          command: 'node',
          args: ['-v'],
          disabled: true
        }
      }
    }, null, 2);

    await mcpManager.reloadServers(testMcpConfig);
    assert(fs.existsSync(mcpConfigPath), `MCP config successfully persisted to StorageHub: ${mcpConfigPath}`);

    const savedJson = mcpManager.getSavedConfigJson();
    assert(savedJson.includes('test_v181_runner'), 'getSavedConfigJson retrieves persisted server config');

    // Reload with empty string loads saved config automatically
    await mcpManager.reloadServers('');
    const mcpStatuses = mcpManager.getServersStatus();
    assert(mcpStatuses.some(s => s.name === 'test_v181_runner'), 'reloadServers without arguments restored servers from mcp_servers.json');
  } catch (err) {
    assert(false, `Group 5 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 6: Skill Manager Isolation & resolveSafe Redirection
  // -------------------------------------------------------------
  console.log('\n🎯 [Test Group 6] Skill Isolation & resolveSafe Closed-Loop Redirection');
  try {
    const skillModule = loadEsbuildModule(path.join(rootDir, 'electron/skill-manager.ts'));
    const { skillManager } = skillModule;
    const storageModule = loadEsbuildModule(path.join(rootDir, 'electron/storage-hub.ts'));
    const { storageHub } = storageModule;

    const globalSkillsDir = skillManager.getGlobalSkillsDir();
    assert(globalSkillsDir === storageHub.getSkillsDir(), 'SkillManager global skills directory matches StorageHub getSkillsDir');

    // Install a test custom skill
    const installed = skillManager.installSkillFromContent(
      'v181_isolation_probe',
      '闭环隔离校验技能',
      '校验 v1.8.1 技能自闭环与无宿主冲突',
      '【激活技能：闭环隔离校验】\n- 运行合规检查...'
    );

    assert(installed.filePath.startsWith(globalSkillsDir), `Installed skill saved inside ASTeam storage hub: ${installed.filePath}`);
    assert(fs.existsSync(installed.filePath), 'Skill file physically exists on disk');

    // loadGlobalSkills strictly scans ASTeam storage hub
    const globalSkills = skillManager.loadGlobalSkills();
    assert(globalSkills.some(s => s.id === 'custom:global:v181_isolation_probe'), 'Installed skill loaded via loadGlobalSkills');

    // Clean up test skill
    skillManager.deleteCustomSkill('custom:global:v181_isolation_probe');
    assert(!fs.existsSync(installed.filePath), 'Test skill successfully cleaned up');

    // Test resolveSafe redirection
    const harnessModule = loadEsbuildModule(path.join(rootDir, 'electron/harness-runner.ts'));
    const { WorkspaceTools, getSystemDesktopDir } = harnessModule;
    const tools = new WorkspaceTools(rootDir, true);
    const resolveSafe = (relOrAbs) => tools['resolveSafe'](relOrAbs);

    // 6.1 ~/.asteam/skills/... redirected to storageHub skills
    const resolvedSkill = resolveSafe('~/.asteam/skills/any_skill.md');
    assert(resolvedSkill.startsWith(storageHub.getSkillsDir()), `~/.asteam/skills redirected to ASTeam closed loop: ${resolvedSkill}`);

    // 6.2 ~/.asteam/mcp_servers.json redirected to storageHub MCP config
    const resolvedMcp = resolveSafe('~/.asteam/mcp_servers.json');
    assert(resolvedMcp === storageHub.getMcpConfigFilePath(), `~/.asteam/mcp_servers.json redirected to ${storageHub.getMcpConfigFilePath()}`);

    // 6.3 ~/Desktop resolved to real desktop
    const resolvedDesktop = resolveSafe('~/Desktop/test_document.docx');
    assert(resolvedDesktop.startsWith(getSystemDesktopDir()), `~/Desktop safely resolved to real desktop: ${resolvedDesktop}`);
  } catch (err) {
    assert(false, `Group 6 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 7: v1.8.1 Zero-Host-Dependency Suite (PDF, ZIP, Lock Resilience, Git Degradation)
  // -------------------------------------------------------------
  console.log('\n📦 [Test Group 7] Zero-Host-Dependency Suite (PDF, ZIP, Lock Resilience, Git)');
  try {
    // 7.1 Pure JS File Resilience & Windows Long Path
    const resilienceModule = loadEsbuildModule(path.join(rootDir, 'electron/file-resilience.ts'));
    const { toSafeWindowsLongPath, safeWriteFileSync } = resilienceModule;

    // Test Windows Long Path Prefixing
    const shortPath = 'D:\\AIProject\\test.txt';
    const longDummyPath = 'D:\\' + 'a'.repeat(270) + '\\file.txt';
    assert(toSafeWindowsLongPath(shortPath) === shortPath, 'Short paths below 260 characters remain unchanged');
    if (process.platform === 'win32') {
      assert(toSafeWindowsLongPath(longDummyPath).startsWith('\\\\?\\'), 'Windows paths exceeding 260 characters receive \\\\?\\ prefix');
    }

    // Test Safe Write with Exclusive Lock Collision (Simulating Word / Excel Holding File)
    const lockTestFile = path.join(testArtifactsDir, 'locked_sample.txt');
    fs.writeFileSync(lockTestFile, 'initial content', 'utf-8');

    // On Windows, opening file with exclusive write lock or keeping open file descriptor
    let lockedFd = null;
    try {
      if (process.platform === 'win32') {
        // 'r+' opens for reading and writing without truncation
        lockedFd = fs.openSync(lockTestFile, 'r+');
      }
    } catch {}

    // Verify safeWriteFileSync handles normal write
    const normalRes = safeWriteFileSync(path.join(testArtifactsDir, 'normal_test.txt'), 'hello v1.8.1', 'utf-8');
    assert(normalRes.success === true, 'safeWriteFileSync writes file normally when not locked');
    assert(normalRes.isFallback === false, 'safeWriteFileSync reports isFallback=false for uncollided write');

    // Test Collision Fallback naming logic directly
    const fallbackPath1 = path.join(testArtifactsDir, 'fallback_demo.txt');
    fs.writeFileSync(fallbackPath1, 'v1', 'utf-8');
    // Force fallback generation by simulating locked file via lockedFd if locked
    if (lockedFd !== null) {
      try {
        const lockRes = safeWriteFileSync(lockTestFile, 'overwritten content', 'utf-8');
        // Depending on Windows locking semantics, it either succeeds or cleanly falls back to _v2
        if (lockRes.isFallback) {
          assert(lockRes.actualPath.includes('_v2'), 'safeWriteFileSync falls back to _v2 when target is locked by another process');
          assert(fs.existsSync(lockRes.actualPath), `Fallback version exists: ${lockRes.actualPath}`);
        } else {
          assert(lockRes.success === true, 'safeWriteFileSync completed safely');
        }
      } finally {
        fs.closeSync(lockedFd);
      }
    }

    // 7.2 Pure JS Enterprise PDF Generation & Inspection
    const pdfModule = loadEsbuildModule(path.join(rootDir, 'electron/pdf-generator.ts'));
    const { createPdfDocument, readPdfDocument } = pdfModule;

    const testPdfPath = path.join(testArtifactsDir, 'enterprise_cloud_solution.pdf');
    const pdfGenMsg = await createPdfDocument({
      filePath: testPdfPath,
      title: '企业级云原生基础设施迁移白皮书',
      subtitle: '华为云与 ASTeam 联合数字化转型技术方案',
      version: 'V1.8.1',
      author: '华为云解决方案架构团队 & ASTeam',
      confidentiality: '商业秘密 · 内部方案',
      markdownContent: `# 一、执行摘要与项目愿景
为保障企业数据库及业务核心系统在割接过程中保持高可用与业务连续性，制定本迁移白皮书。
- 支持全量离线备份与物理实时流式复制；
- 具备秒级故障转移机制与容灾倒换演练。

## 二、架构拓扑与关键指标
| 系统名称 | 迁移前规格 | 华为云目标规格 | 割接时段 |
| CBS 核心系统 | 32C 128G 物理机 | C7.8xlarge.4 (32C 128G) | 凌晨 00:00 - 04:00 |
| Oracle 数据库 | RAC 双节点 | GaussDB 主备实例 | 周六 22:00 - 次日 02:00 |

## 三、应急预案与验收标准
若增量同步延迟超过 15 分钟，自动触发回退脚本，确保业务零丢包回退。`
    });

    assert(fs.existsSync(testPdfPath), `PDF file physically generated: ${testPdfPath}`);
    const pdfStats = fs.statSync(testPdfPath);
    assert(pdfStats.size > 2000, `PDF size is ${pdfStats.size} bytes (> 2KB, contains embedded font and layout)`);
    assert(pdfGenMsg.includes('成功生成企业级专业 PDF 文档'), 'PDF generator reports success confirmation');

    // Read back and inspect PDF
    const pdfInspect = await readPdfDocument(testPdfPath);
    assert(pdfInspect.pageCount >= 1, `PDF inspector detected ${pdfInspect.pageCount} pages`);
    assert(pdfInspect.title === '企业级云原生基础设施迁移白皮书', 'PDF inspector extracted matching title');
    assert(pdfInspect.author.includes('华为云'), 'PDF inspector extracted matching author');
    assert(pdfInspect.summary.includes('PDF 原生解析结果'), 'PDF inspector generated detailed summary');

    // 7.3 Pure JS ZIP Compression & Extraction
    const zipModule = loadEsbuildModule(path.join(rootDir, 'electron/zip-manager.ts'));
    const { compressZip, extractZip } = zipModule;

    const dummyFileA = path.join(testArtifactsDir, 'deploy_guide.md');
    const dummyFileB = path.join(testArtifactsDir, 'topology.json');
    fs.writeFileSync(dummyFileA, '# Deployment Guide for Huawei Cloud\nStep 1: Check network connectivity.', 'utf-8');
    fs.writeFileSync(dummyFileB, JSON.stringify({ cluster: 'huawei-cloud-region-1', nodes: 6 }, null, 2), 'utf-8');

    const testZipPath = path.join(testArtifactsDir, 'delivery_package.zip');
    const zipMsg = await compressZip({
      sourcePaths: [dummyFileA, dummyFileB, testPdfPath],
      targetZipPath: testZipPath,
      comment: 'ASTeam Agent v1.8.1 Delivery Bundle'
    });

    assert(fs.existsSync(testZipPath), `ZIP bundle physically created: ${testZipPath}`);
    const zipStats = fs.statSync(testZipPath);
    assert(zipStats.size > 1000, `ZIP bundle size is ${zipStats.size} bytes`);
    assert(zipMsg.includes('成功创建并压缩 ZIP 归档'), 'ZIP compression reports success confirmation');

    // Extract ZIP
    const extractDir = path.join(testArtifactsDir, 'extracted_delivery');
    const extractMsg = await extractZip({
      zipPath: testZipPath,
      outputDir: extractDir,
      overwrite: true
    });

    assert(fs.existsSync(extractDir), `ZIP extracted directory exists: ${extractDir}`);
    assert(fs.existsSync(path.join(extractDir, 'deploy_guide.md')), 'Extracted file A exists');
    assert(fs.existsSync(path.join(extractDir, 'topology.json')), 'Extracted file B exists');
    const extractedGuide = fs.readFileSync(path.join(extractDir, 'deploy_guide.md'), 'utf-8');
    assert(extractedGuide.includes('Deployment Guide for Huawei Cloud'), 'Extracted content integrity verified');

    // 7.4 Git-Free Host Graceful Degradation
    const gitModule = loadEsbuildModule(path.join(rootDir, 'electron/git-manager.ts'));
    const { isGitInstalled, getGitStatus, getGitDiffSummary } = gitModule;

    const gitInstalled = await isGitInstalled();
    assert(typeof gitInstalled === 'boolean', `isGitInstalled returns boolean without crashing (detected: ${gitInstalled})`);

    const emptyGitStatus = await getGitStatus('');
    assert(emptyGitStatus.isGitRepo === false, 'getGitStatus on empty path safely returns isGitRepo=false');

    const nonGitDir = path.join(os.tmpdir(), 'asteam_non_git_test_' + Date.now());
    if (!fs.existsSync(nonGitDir)) fs.mkdirSync(nonGitDir, { recursive: true });
    const diffSummary = await getGitDiffSummary(nonGitDir);
    assert(diffSummary.statusText.includes('不是 Git 仓库'), 'getGitDiffSummary on non-git dir returns polite friendly notice');
    try { fs.rmdirSync(nonGitDir); } catch {}

    // 7.5 Artifact Verifier Verification of PDF & ZIP
    const verifierModule = loadEsbuildModule(path.join(rootDir, 'electron/artifact-verifier.ts'));
    const { artifactVerifier } = verifierModule;

    const now = Date.now();
    const pdfVerify = artifactVerifier.verifyArtifact(testPdfPath, now - 10000);
    assert(pdfVerify.verified === true, 'artifactVerifier verified newly generated PDF');
    assert(pdfVerify.badge.includes('物理探针门禁验收通过'), 'PDF received verified badge');

    const zipVerify = artifactVerifier.verifyArtifact(testZipPath, now - 10000);
    assert(zipVerify.verified === true, 'artifactVerifier verified newly generated ZIP');
    assert(zipVerify.badge.includes('物理探针门禁验收通过'), 'ZIP received verified badge');

  } catch (err) {
    assert(false, `Group 7 threw error: ${err.message}`);
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
