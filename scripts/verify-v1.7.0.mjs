/**
 * ASTeam Agent - v1.7.0 Comprehensive Self-Verification Suite
 * 
 * Verifies:
 * 1. Enterprise Private Hub & Security Verification (SHA-256, Permission Sandboxing, Dangerous Pattern Detection)
 * 2. Dynamic Elastic Sub-Agent Swarm & Worker Pool (Spawning, Concurrency Limit, Watchdog, Map-Reduce Aggregation)
 * 3. Cross-Workspace Knowledge Graph (Symbol Extraction, Inverted Index, Fuzzy Query)
 * 4. Enterprise Outbound Security Fence (API Keys, Private IPs, DB Passwords, PII Redaction & Blocking)
 * 5. Compliance Inspection & Structured HTML/PDF Reporting Engine
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  console.log('🚀 ASTeam Agent v1.7.0 Enterprise & Swarm Verification Suite');
  console.log('===========================================================\n');

  // -------------------------------------------------------------
  // Test Group 1: Enterprise Private Hub & Security Verification
  // -------------------------------------------------------------
  console.log('🏢 [Test Group 1] Enterprise Private Hub & Security Verification');
  try {
    const hubModule = loadEsbuildModule(path.join(rootDir, 'electron/enterprise-hub-manager.ts'));
    const { enterpriseHubManager } = hubModule;

    assert(enterpriseHubManager !== undefined, 'EnterpriseHubManager singleton instance is initialized');

    // 1.1 SHA-256 Calculation
    const testFilePath = path.join(rootDir, 'package.json');
    const computedHash = enterpriseHubManager.computeSha256(testFilePath);
    const expectedHash = crypto.createHash('sha256').update(fs.readFileSync(testFilePath)).digest('hex');
    assert(computedHash === expectedHash, `SHA-256 hash matches Node.js crypto standard: ${computedHash.slice(0, 16)}...`);

    // 1.2 Security Audit & Sandboxing for Dangerous Operations
    const testExtDir = path.join(rootDir, '.asteam', 'test_security_ext');
    if (!fs.existsSync(testExtDir)) fs.mkdirSync(testExtDir, { recursive: true });

    const safeFile = path.join(testExtDir, 'safe_tool.js');
    fs.writeFileSync(safeFile, 'function add(a, b) { return a + b; }\nmodule.exports = add;', 'utf-8');

    const manifestSafe = {
      id: 'test_safe',
      name: 'Safe Math Tool',
      version: '1.0.0',
      description: 'A benign math utility',
      type: 'mcp_server',
      permissions: ['fs:read']
    };
    const auditSafe = enterpriseHubManager.auditSecurity(testExtDir, manifestSafe);
    assert(auditSafe.securityLevel === 'trusted', 'Benign extension evaluated as trusted');
    assert(auditSafe.detectedRisks.length === 0, 'Zero risks detected in safe code');

    // Introduce dangerous script
    const dangerousFile = path.join(testExtDir, 'danger.bat');
    fs.writeFileSync(dangerousFile, 'rmdir /s /q c:\\\nformat d:', 'utf-8');
    const auditDanger = enterpriseHubManager.auditSecurity(testExtDir, manifestSafe);
    assert(auditDanger.securityLevel === 'danger', 'Dangerous format/recursive wipe script flagged as danger');
    assert(auditDanger.detectedRisks.some(r => r.includes('清空') || r.includes('格式化')), 'Dangerous risks detected in manifest');

    // Clean up test ext
    try {
      fs.rmSync(testExtDir, { recursive: true, force: true });
    } catch {}

    // 1.3 Manifest Resolution
    const manifestFromPkg = enterpriseHubManager.resolveManifest(rootDir, 'asteam-agent');
    assert(manifestFromPkg.name === 'asteam-agent', 'resolveManifest correctly reads package.json');
    assert(manifestFromPkg.type === 'mcp_server', 'Defaults to mcp_server type');
  } catch (err) {
    assert(false, `Test Group 1 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 2: Dynamic Elastic Sub-Agent Swarm & Worker Pool
  // -------------------------------------------------------------
  console.log('\n⚡ [Test Group 2] Dynamic Elastic Sub-Agent Swarm & Worker Pool');
  try {
    const poolModule = loadEsbuildModule(path.join(rootDir, 'electron/swarm-worker-pool.ts'));
    const busModule = loadEsbuildModule(path.join(rootDir, 'electron/swarm-bus.ts'));
    const { ElasticWorkerPool } = poolModule;
    const { SwarmMessageBus } = busModule;

    const bus = new SwarmMessageBus('test-session-v1.7');
    const pool = new ElasticWorkerPool(bus, 2); // Concurrency limit = 2

    assert(bus.getState().workers.length === 0, 'Worker pool initially empty');
    assert(bus.getState().workerPoolMetrics.maxConcurrency === 2, 'Concurrency limit initialized to 2');

    // 2.1 Dynamic Worker Spawning
    const worker1 = bus.spawnWorker({
      name: 'Coder-Worker-Frontend',
      role: 'coder',
      taskTitle: '构建前端 UI 组件'
    });
    assert(worker1.name === 'Coder-Worker-Frontend', 'Worker 1 spawned successfully');
    assert(bus.getState().workers.length === 1, 'Worker registered in bus state');
    assert(bus.getState().workerPoolMetrics.totalSpawned === 1, 'totalSpawned counter incremented');

    // 2.2 Worker Progress Update & Completion
    bus.updateWorkerProgress(worker1.id, 50, 'running', { tokenDelta: 350 });
    assert(bus.getState().workers[0].progress === 50, 'Worker progress updated to 50%');
    assert(bus.getState().workers[0].status === 'running', 'Worker status is running');
    assert(bus.getState().workerPoolMetrics.totalTokens === 350, 'Token count accumulated in pool metrics');

    bus.completeWorker(worker1.id, 'Frontend component compiled', 150);
    assert(bus.getState().workers[0].status === 'completed', 'Worker completed status recorded');
    assert(bus.getState().workerPoolMetrics.completedWorkers === 1, 'completedWorkers count incremented');

    // 2.3 Parallel Job Execution & Map-Reduce Aggregation
    const subTasks = [
      {
        task: { id: 'task-c1', title: '实现服务端 API', role: 'coder', input: '' },
        workerName: 'Coder-Worker-Backend',
        executor: async (w, update) => {
          update(50, 'running');
          return 'RESTful API v1 created successfully';
        }
      },
      {
        task: { id: 'task-t1', title: '执行单元测试', role: 'tester', input: '' },
        workerName: 'Tester-Worker-Unit',
        executor: async (w, update) => {
          update(100, 'running');
          return '15 unit tests passed with 100% coverage';
        }
      }
    ];

    const results = await pool.executeJobs(subTasks);
    assert(results.length === 2, 'Both parallel jobs completed execution');
    assert(results.every(r => r.success), 'All parallel worker jobs succeeded');

    const summary = pool.mapReduceResults(results);
    assert(summary.totalTasks === 2, 'Map-Reduce recorded 2 tasks');
    assert(summary.successfulTasks === 2, 'Map-Reduce recorded 2 successful tasks');
    assert(summary.consolidatedMarkdown.includes('Coder Sub-Agents'), 'Map-Reduce includes Coder section');
    assert(summary.consolidatedMarkdown.includes('Tester Sub-Agents'), 'Map-Reduce includes Tester section');
  } catch (err) {
    assert(false, `Test Group 2 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 3: Cross-Workspace Knowledge Graph Engine
  // -------------------------------------------------------------
  console.log('\n🧠 [Test Group 3] Cross-Workspace Knowledge Graph Engine');
  try {
    const kgModule = loadEsbuildModule(path.join(rootDir, 'electron/knowledge-graph-manager.ts'));
    const { knowledgeGraphManager } = kgModule;

    assert(knowledgeGraphManager !== undefined, 'KnowledgeGraphManager instance initialized');

    // 3.1 Workspace Indexing
    const scanRes = knowledgeGraphManager.indexWorkspace(rootDir);
    assert(scanRes.filesScanned > 0, `Scanned ${scanRes.filesScanned} workspace source files`);
    assert(scanRes.symbolsFound > 0, `Extracted ${scanRes.symbolsFound} exported classes, interfaces & functions`);

    // 3.2 Symbol Search & Dependency Resolution
    const searchClass = knowledgeGraphManager.searchSymbols('StorageHub');
    assert(searchClass.length > 0, 'Successfully indexed and searched "StorageHub" symbol');
    assert(searchClass[0].kind === 'class', '"StorageHub" symbol correctly identified as class');

    const searchMgr = knowledgeGraphManager.searchSymbols('SwarmOrchestrator');
    assert(searchMgr.length > 0, 'Successfully found "SwarmOrchestrator" across workspace');

    // 3.3 Context Generation
    const contextPrompt = knowledgeGraphManager.generateCrossWorkspaceContext('StorageHub');
    assert(contextPrompt.includes('StorageHub'), 'Cross-workspace context prompt contains symbol name');
    assert(contextPrompt.includes('跨工作区知识图谱'), 'Context formatted with standard header');
  } catch (err) {
    assert(false, `Test Group 3 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 4: Enterprise Outbound Security Fence & Redaction
  // -------------------------------------------------------------
  console.log('\n🛡️ [Test Group 4] Enterprise Outbound Security Fence & Redaction');
  try {
    const fenceModule = loadEsbuildModule(path.join(rootDir, 'electron/security-fence-manager.ts'));
    const { securityFenceManager } = fenceModule;

    assert(securityFenceManager !== undefined, 'SecurityFenceManager instance initialized');
    assert(securityFenceManager.getConfig().mode === 'redact', 'Default mode is smart redaction');

    // 4.1 API Key Redaction
    const promptWithKey = 'Use key sk-abcdef1234567890abcdef1234567890 to call OpenAI API';
    const redactedKey = securityFenceManager.sanitizeText(promptWithKey);
    assert(!redactedKey.sanitized.includes('sk-abcdef1234567890abcdef1234567890'), 'Plaintext API Key is redacted');
    assert(redactedKey.sanitized.includes('<API_KEY_REDACTED_1>'), 'Replaced with semantic placeholder <API_KEY_REDACTED_1>');
    assert(redactedKey.redactedItems.some(i => i.type === 'LLM API Key'), 'Detected LLM API Key category');

    // 4.2 Private IP & Database Password Redaction
    const promptWithIpAndDb = 'Connect to postgres://admin:SuperSecretPass999@192.168.1.150:5432/finance';
    const redactedIpAndDb = securityFenceManager.sanitizeText(promptWithIpAndDb);
    assert(!redactedIpAndDb.sanitized.includes('192.168.1.150'), 'Private IP is redacted');
    assert(!redactedIpAndDb.sanitized.includes('SuperSecretPass999'), 'Database plaintext password is redacted');
    assert(redactedIpAndDb.sanitized.includes('<PRIVATE_IP_REDACTED_'), 'Replaced with private IP placeholder');

    // 4.3 PII Phone Number Redaction
    const promptWithPhone = 'Contact security officer at 13912345678 for access approvals';
    const redactedPhone = securityFenceManager.sanitizeText(promptWithPhone);
    assert(!redactedPhone.sanitized.includes('13912345678'), 'Phone number is redacted');
    assert(redactedPhone.sanitized.includes('<PHONE_REDACTED_'), 'Replaced with phone placeholder');

    // 4.4 Strict Blocking Mode
    securityFenceManager.saveConfig({ mode: 'block' });
    const blockedRes = securityFenceManager.sanitizeText('Leaking key sk-123456789012345678901234567890');
    assert(blockedRes.isBlocked === true, 'Strict blocking mode triggers isBlocked=true');
    assert(blockedRes.blockReason.includes('企业安全阻断'), 'Block reason contains explanation');

    // 4.5 Whitelist Protection
    securityFenceManager.saveConfig({ mode: 'redact', whitelistPatterns: ['localhost', '127.0.0.1'] });
    const whiteRes = securityFenceManager.sanitizeText('Local server at http://127.0.0.1:3000');
    assert(whiteRes.sanitized.includes('127.0.0.1'), 'Whitelisted 127.0.0.1 remains untouched');

    // 4.6 Message Batch Sanitization
    const msgs = [
      { role: 'system', content: 'You are an agent.' },
      { role: 'user', content: 'My key is sk-abcdef1234567890abcdef1234567890 on 10.0.1.25' }
    ];
    const sanitizedBatch = securityFenceManager.sanitizeMessages(msgs);
    assert(sanitizedBatch.totalRedactions === 2, 'Batch sanitization identified 2 sensitive assets');
    assert(sanitizedBatch.sanitizedMessages[1].content.includes('<API_KEY_REDACTED_'), 'User message redacted in batch');
  } catch (err) {
    assert(false, `Test Group 4 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 5: Compliance Inspection & HTML/PDF Report Engine
  // -------------------------------------------------------------
  console.log('\n📊 [Test Group 5] Compliance Inspection & HTML/PDF Report Engine');
  try {
    const schedModule = loadEsbuildModule(path.join(rootDir, 'electron/scheduler-manager.ts'));
    const { schedulerManager } = schedModule;

    // 5.1 Structured HTML Report Generator
    const htmlOutput = schedulerManager.generateStructuredHtmlReport({
      title: '企业安全合规综合体检',
      workspace: rootDir,
      score: 98,
      status: 'pass',
      timestamp: '2026-09-10 12:00:00',
      durationMs: 1250,
      violations: [],
      compliancePasses: [
        '企业出境安全围栏处于活跃防御模式: [智能脱敏占位]',
        '全库文件未检出任何明文泄漏的 API Key 或私钥',
        '已挂载生效 1 份团队级工程规约规范 (.asteamrules)'
      ]
    });

    assert(typeof htmlOutput === 'string' && htmlOutput.includes('<!DOCTYPE html>'), 'Generated valid HTML5 doctype document');
    assert(htmlOutput.includes('ASTeam Enterprise Audit Engine'), 'Contains ASTeam Enterprise Audit header badge');
    assert(htmlOutput.includes('98'), 'Contains compliance score 98');
    assert(htmlOutput.includes('window.print()'), 'Contains PDF export/print trigger button');

    // 5.2 Task Presets
    const tasks = schedulerManager.getTasks();
    const complianceTask = tasks.find(t => t.type === 'enterprise_compliance');
    assert(complianceTask !== undefined, 'Default task list contains enterprise_compliance preset');
    assert(complianceTask.schedule === 'daily_9am', 'Compliance task scheduled for daily_9am');
  } catch (err) {
    assert(false, `Test Group 5 threw error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Summary & Exit
  // -------------------------------------------------------------
  console.log('\n===========================================================');
  console.log(`📊 Test Results: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('===========================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
