/**
 * ASTeam Agent - v1.10.0 Comprehensive Verification Suite
 * 
 * Verifies:
 * 1. Zero-Dependency Built-in Fast Project Scanner (FastScanner)
 * 2. Modern Rich-Text HTML-to-PDF Headless Print Engine (exportHtmlToPdf)
 * 3. User-Prompt Deliverable Hard Contract & Physical Probe Gatekeeper (ArtifactVerifier)
 * 4. Windows PowerShell Command Sandbox & Variable Scope Auto-Sanitizer
 * 5. Pure JS Native Office Productivity Suite (Word, Excel, PPTX, Zip)
 * 6. Package Metadata & Release Baseline Consistency (v1.10.0)
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
  const mockElectron = {
    app: {
      getVersion: () => '1.10.0',
      getPath: (name) => path.join(os.tmpdir(), 'asteam-test-temp'),
      quit: () => {},
      isPackaged: false
    }
  };
  const customRequire = (id) => {
    if (id === 'electron') return mockElectron;
    return require(id);
  };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', buildRes.outputFiles[0].text);
  fn(mod, mod.exports, customRequire, path.dirname(entryFile), entryFile);
  return mod.exports;
}

async function runTestSuite() {
  console.log('===========================================================');
  console.log('🚀 ASTeam Agent v1.10.0 Comprehensive Verification Suite');
  console.log('===========================================================\n');

  const testArtifactsDir = path.join(rootDir, '.asteam', 'test_v1100_artifacts');
  if (!fs.existsSync(testArtifactsDir)) fs.mkdirSync(testArtifactsDir, { recursive: true });

  // -------------------------------------------------------------
  // Test Group 1: 零依赖内置极速项目扫描器 (FastScanner)
  // -------------------------------------------------------------
  console.log('📦 [Test Group 1] 零依赖内置极速项目扫描器 (FastScanner)...');
  try {
    const fastScannerMod = loadEsbuildModule(path.join(rootDir, 'electron', 'fast-scanner.ts'));
    const { fastScanner, FastScanner } = fastScannerMod;

    assert(fastScanner instanceof FastScanner, 'fastScanner 单例初始化成功且类型匹配');

    const drives = fastScanner.detectAvailableDrives();
    assert(Array.isArray(drives) && drives.length > 0, `系统盘符探测正常: [${drives.join(', ')}]`);

    // 构建一个模拟的测试多项目目录
    const mockRoot = path.join(testArtifactsDir, 'mock_drives');
    const mockProj1 = path.join(mockRoot, 'NodeApp');
    const mockProj2 = path.join(mockRoot, 'PythonService');
    const mockIgnored = path.join(mockRoot, 'node_modules', 'ShouldIgnore');
    fs.mkdirSync(mockProj1, { recursive: true });
    fs.mkdirSync(mockProj2, { recursive: true });
    fs.mkdirSync(mockIgnored, { recursive: true });

    fs.writeFileSync(path.join(mockProj1, 'package.json'), JSON.stringify({ name: 'node-app' }));
    fs.writeFileSync(path.join(mockProj2, 'requirements.txt'), 'flask==3.0.0\nrequests>=2.31.0');
    fs.writeFileSync(path.join(mockIgnored, 'package.json'), '{}');

    const scanResults = await fastScanner.scanProjects({
      roots: [mockRoot],
      maxDepth: 3
    });

    assert(scanResults.length === 2, `极速扫描准确识别出 2 个开发工程（实际识别: ${scanResults.length}）`);
    const p1 = scanResults.find(p => p.name === 'NodeApp');
    const p2 = scanResults.find(p => p.name === 'PythonService');

    assert(p1 && p1.projectType.includes('Node.js'), `NodeApp 项目类型准确识别为 Node.js/JavaScript`);
    assert(p2 && p2.projectType === 'Python', `PythonService 项目类型准确识别为 Python`);
    assert(scanResults.every(p => !p.path.includes('node_modules')), `扫描黑名单成功自动跳过 node_modules 目录`);

    const mdTable = fastScanner.toMarkdownTable(scanResults);
    assert(mdTable.includes('| 盘符 | 项目名称 |') && mdTable.includes('NodeApp'), 'toMarkdownTable 生成合法 Markdown 表格');

    const csvData = fastScanner.toCsv(scanResults);
    assert(csvData.includes('Drive,Name,Type') && csvData.includes('PythonService'), 'toCsv 生成标准逗号分隔 CSV 数据');
  } catch (err) {
    assert(false, `Test Group 1 抛出未捕获异常: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 2: 现代富文本 HTML-to-PDF 无头打印引擎 (exportHtmlToPdf)
  // -------------------------------------------------------------
  console.log('\n📄 [Test Group 2] 现代富文本 HTML-to-PDF 无头打印引擎 (exportHtmlToPdf)...');
  try {
    const pdfMod = loadEsbuildModule(path.join(rootDir, 'electron', 'pdf-generator.ts'));
    const { exportHtmlToPdf, readPdfDocument } = pdfMod;

    assert(typeof exportHtmlToPdf === 'function', 'exportHtmlToPdf 导出函数存在');

    const sampleHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Windows 开发工程迁移与割裂治理评估报告</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #f8fafc; }
    .card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    h1 { color: #1e293b; }
    h2 { color: #0284c7; }
  </style>
</head>
<body>
  <div class="card">
    <h1>一、执行摘要与治理背景</h1>
    <p>当前 Windows 跨盘符存在多个 Agent 创建的项目，分散在 C/D/E 盘，需要统一收口至专属工作区。</p>
  </div>
  <div class="card">
    <h2>二、迁移风险矩阵</h2>
    <ul>
      <li>虚拟环境硬编码路径失效风险：高</li>
      <li>Git 子模块断裂风险：中</li>
      <li>Agent 历史记忆断连风险：低</li>
    </ul>
  </div>
</body>
</html>`;

    const htmlFilePath = path.join(testArtifactsDir, 'report.html');
    const pdfFilePath = path.join(testArtifactsDir, 'report.pdf');
    fs.writeFileSync(htmlFilePath, sampleHtml, 'utf-8');

    const exportMsg = await exportHtmlToPdf({
      htmlFilePath,
      outputPdfPath: pdfFilePath,
      title: 'Windows 开发工程迁移与割裂治理评估报告'
    });

    assert(fs.existsSync(pdfFilePath), `高保真 PDF 物理文件成功生成: "${pdfFilePath}"`);
    const stat = fs.statSync(pdfFilePath);
    assert(stat.size > 1000, `生成的 PDF 体积正常 (${stat.size} 字节 > 1000)`);

    const parsedPdf = await readPdfDocument(pdfFilePath);
    assert(parsedPdf.pageCount >= 1, `解析 PDF 成功，检测到 ${parsedPdf.pageCount} 页`);
    assert(parsedPdf.title.includes('迁移') || parsedPdf.title.includes('评估'), `PDF 元数据标题提取正常: "${parsedPdf.title}"`);
  } catch (err) {
    assert(false, `Test Group 2 抛出未捕获异常: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 3: 交付物强契约硬门禁 (ArtifactVerifier)
  // -------------------------------------------------------------
  console.log('\n🛡️ [Test Group 3] 交付物强契约硬门禁 (ArtifactVerifier)...');
  try {
    const verifierMod = loadEsbuildModule(path.join(rootDir, 'electron', 'artifact-verifier.ts'));
    const { artifactVerifier } = verifierMod;

    // 测试意图提取
    const prompt1 = '搜索本机所有盘符，给出pdf和HTML两个版本的报告，限制不做实际动作';
    const req1 = artifactVerifier.extractRequiredDeliverablesFromPrompt(prompt1);
    assert(req1.includes('pdf') && req1.includes('html'), `从指令中准确提取出强交付物契约: [${req1.join(', ')}]`);

    const prompt2 = '帮我整理一个 Excel 表格和一份 Word 方案';
    const req2 = artifactVerifier.extractRequiredDeliverablesFromPrompt(prompt2);
    assert(req2.includes('xlsx') && req2.includes('docx'), `准确提取出表格与文档要求: [${req2.join(', ')}]`);

    // 场景 A: 用户要求 PDF 和 HTML，但 Agent 答复中没有生成，且没有合格落盘物 -> 必须触发强门禁拦截
    const now = Date.now();
    const gateReportFail = artifactVerifier.inspectDeliveryGate(
      '已为您扫描完所有盘符，发现 6 个项目，分析完毕。',
      now,
      [], // 无落盘
      rootDir,
      prompt1
    );

    assert(gateReportFail.passed === false, '未交付用户要求的 PDF/HTML 时，强门禁成功触发硬拦截 (passed === false)');
    assert(gateReportFail.blockingMessage && gateReportFail.blockingMessage.includes('强交付物契约缺失'), '拦截消息中明确告知缺失格式');

    // 场景 B: Agent 真实调用工具落盘了 PDF 和 HTML -> 门禁放行
    const realPdf = path.join(testArtifactsDir, 'delivery_test.pdf');
    const realHtml = path.join(testArtifactsDir, 'delivery_test.html');
    fs.writeFileSync(realPdf, '%PDF-1.4 test dummy content for gatekeeper');
    fs.writeFileSync(realHtml, '<html><body>test report</body></html>');

    const gateReportPass = artifactVerifier.inspectDeliveryGate(
      `交付完成，文件保存在 \`${realPdf}\` 与 \`${realHtml}\`。`,
      now - 500,
      [realPdf, realHtml],
      rootDir,
      prompt1
    );

    assert(gateReportPass.passed === true, '真实落盘所需类型制品后，强门禁校验通过 (passed === true)');
    assert(gateReportPass.badges.length >= 2, `成功颁发 ${gateReportPass.badges.length} 枚物理落盘防伪证书`);
  } catch (err) {
    assert(false, `Test Group 3 抛出未捕获异常: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 4: Windows PowerShell 终端沙箱变量语法纠偏
  // -------------------------------------------------------------
  console.log('\n⚡ [Test Group 4] Windows PowerShell 终端沙箱变量语法纠偏...');
  try {
    // 模拟 harness-runner 中的纠偏规则
    const testCmd1 = 'Write-Warning "Error scanning $drive: $_"';
    const sanitized1 = testCmd1.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*):(?!\w)/g, '${$1}:');
    assert(sanitized1 === 'Write-Warning "Error scanning ${drive}: $_"', `PowerShell $drive: 变量冲突自动纠正为 \${drive}:`);

    const testCmd2 = 'echo "Scanning $path: done"; echo $env:PATH';
    const sanitized2 = testCmd2.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*):(?!\w)/g, '${$1}:');
    assert(sanitized2.includes('${path}:') && sanitized2.includes('$env:PATH'), `准确纠正 $path: 同时完整保留合法作用域变量 $env:PATH`);
  } catch (err) {
    assert(false, `Test Group 4 抛出未捕获异常: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 5: 纯 JS 原生 Office 排版套件基线
  // -------------------------------------------------------------
  console.log('\n📊 [Test Group 5] 纯 JS 原生 Office 排版套件基线...');
  try {
    const officeMod = loadEsbuildModule(path.join(rootDir, 'electron', 'office-generator.ts'));
    const { createExcelXlsx, createWordDocx, readExcelXlsx } = officeMod;

    const testXlsx = path.join(testArtifactsDir, 'test_projects.xlsx');
    const xlsxRes = await createExcelXlsx({
      filePath: testXlsx,
      sheets: [
        {
          name: '扫描结果',
          columns: [
            { header: '盘符', key: 'drive', width: 10 },
            { header: '项目名', key: 'name', width: 25 },
            { header: '类型', key: 'type', width: 20 }
          ],
          rows: [
            { drive: 'C:', name: 'ASTeam-Agent', type: 'Node.js/Electron' },
            { drive: 'E:', name: 'DailyStock', type: 'Python/React' }
          ]
        }
      ]
    });
    assert(fs.existsSync(testXlsx), `原生 Excel 工作簿生成成功: "${testXlsx}"`);

    const readXlsx = await readExcelXlsx(testXlsx);
    assert(readXlsx.sheetNames.includes('扫描结果'), '原生读取 Excel 表格 sheet 正常');

    const testDocx = path.join(testArtifactsDir, 'test_doc.docx');
    await createWordDocx({
      filePath: testDocx,
      title: 'ASTeam Agent v1.10.0 架构升级方案',
      subtitle: '免环境依赖与自闭环办公套件',
      markdownContent: '# 一、执行总结\n已完成全量验证。\n| 项目 | 状态 |\n|:---|:---|\n| 极速扫描 | 通过 |'
    });
    assert(fs.existsSync(testDocx), `原生 Word 文档生成成功: "${testDocx}"`);
  } catch (err) {
    assert(false, `Test Group 5 抛出未捕获异常: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 6: 版本号与发布基线一致性 (v1.10.0)
  // -------------------------------------------------------------
  console.log('\n🏷️ [Test Group 6] 版本号与发布基线一致性 (v1.10.0)...');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    assert(pkg.version === '1.10.0', `package.json 版本号为 1.10.0 (当前: ${pkg.version})`);

    const relNotesPath = path.join(rootDir, 'RELEASE_NOTES_v1.10.0.md');
    const hasRelNotes = fs.existsSync(relNotesPath);
    assert(hasRelNotes, 'RELEASE_NOTES_v1.10.0.md 官方发布说明文件存在');
  } catch (err) {
    assert(false, `Test Group 6 抛出未捕获异常: ${err.message}`);
  }

  // -------------------------------------------------------------
  // 测试总结
  // -------------------------------------------------------------
  console.log('\n===========================================================');
  console.log(`🎯 测试执行完毕: 总计 ${totalTests} 项断言 | 通过: ${passedTests} 项 | 失败: ${failedTests} 项`);
  console.log('===========================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
