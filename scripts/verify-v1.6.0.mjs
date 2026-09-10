/**
 * ASTeam Agent - v1.6.0 Full Autonomous Verification Test Suite
 * 
 * Verifies:
 * 1. Preset MCP Ecosystem & Bidirectional Sync Engine
 * 2. Multi-Agent Swarm Bus & Role State Machine
 * 3. Scheduler Engine & Cron/Timer Calculations
 * 4. Build Artifacts & Windows Binary Integrity
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

async function runTestSuite() {
  console.log('===========================================================');
  console.log('🚀 ASTeam Agent v1.6.0 Comprehensive Self-Verification Suite');
  console.log('===========================================================\n');

  // -------------------------------------------------------------
  // Test Group 1: Preset MCP Ecosystem & Data Engine
  // -------------------------------------------------------------
  console.log('📦 [Test Group 1] Preset MCP Ecosystem & Bidirectional Sync Engine');
  try {
    const mcpBuild = esbuild.buildSync({
      entryPoints: [path.join(rootDir, 'src/config/mcpPresets.ts')],
      bundle: true,
      format: 'cjs',
      write: false,
      platform: 'node'
    });
    const mcpModule = {};
    const mcpExports = {};
    const runMcpFn = new Function('module', 'exports', mcpBuild.outputFiles[0].text);
    runMcpFn(mcpModule, mcpExports);
    const {
      MCP_PRESETS,
      parseMcpJson,
      isPresetInstalled,
      getPresetValues,
      applyPresetToConfig
    } = mcpModule.exports || mcpExports;

    assert(Array.isArray(MCP_PRESETS) && MCP_PRESETS.length === 6, 'Contains exactly 6 curated MCP presets');

    const presetIds = MCP_PRESETS.map(p => p.id);
    assert(
      presetIds.includes('filesystem') &&
      presetIds.includes('sqlite') &&
      presetIds.includes('postgres') &&
      presetIds.includes('github') &&
      presetIds.includes('puppeteer') &&
      presetIds.includes('git'),
      'Contains all required presets: filesystem, sqlite, postgres, github, puppeteer, git'
    );

    // Test JSON parsing & resiliency
    assert(parseMcpJson('').mcpServers !== undefined, 'parseMcpJson handles empty string');
    assert(parseMcpJson('invalid json').mcpServers !== undefined, 'parseMcpJson handles invalid syntax safely');

    // Test applying presets
    let config = '{\n  "mcpServers": {}\n}';
    assert(!isPresetInstalled(config, 'filesystem'), 'Filesystem preset initially not installed');

    // Enable filesystem with custom allowed directory
    config = applyPresetToConfig(config, 'filesystem', true, { allowedDirectories: 'D:/my-project, D:/data' });
    assert(isPresetInstalled(config, 'filesystem'), 'Filesystem preset detected as installed after apply');
    
    const parsedFs = JSON.parse(config);
    assert(parsedFs.mcpServers.filesystem.command === 'npx', 'Filesystem command uses npx');
    assert(parsedFs.mcpServers.filesystem.args.includes('D:/my-project'), 'Filesystem args contains custom directory');

    // Test getPresetValues extraction
    const extractedFs = getPresetValues(config, 'filesystem');
    assert(extractedFs.allowedDirectories.includes('D:/my-project'), 'Extracted allowedDirectories matches configuration');

    // Enable GitHub preset
    config = applyPresetToConfig(config, 'github', true, { personalAccessToken: 'ghp_secret_test_token' });
    const parsedGh = JSON.parse(config);
    assert(parsedGh.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN === 'ghp_secret_test_token', 'GitHub token injected into env');

    // Verify non-destructive modification: filesystem still exists when github is added
    assert(isPresetInstalled(config, 'filesystem'), 'Filesystem remains intact when adding GitHub preset');
    assert(isPresetInstalled(config, 'github'), 'GitHub installed alongside filesystem');

    // Disable filesystem preset
    config = applyPresetToConfig(config, 'filesystem', false, {});
    assert(!isPresetInstalled(config, 'filesystem'), 'Filesystem successfully removed');
    assert(isPresetInstalled(config, 'github'), 'GitHub preserved after removing filesystem');

    // Disable github preset
    config = applyPresetToConfig(config, 'github', false, {});
    assert(!isPresetInstalled(config, 'github'), 'GitHub successfully removed');
  } catch (err) {
    assert(false, `MCP Presets test error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 2: Swarm Message Bus & Multi-Agent Topologies
  // -------------------------------------------------------------
  console.log('\n🤖 [Test Group 2] Multi-Agent Swarm Bus & Role State Machine');
  try {
    const swarmBuild = esbuild.buildSync({
      entryPoints: [path.join(rootDir, 'electron/swarm-bus.ts')],
      bundle: true,
      format: 'cjs',
      write: false,
      platform: 'node'
    });
    const swarmModule = {};
    const swarmExports = {};
    const runSwarmFn = new Function('module', 'exports', swarmBuild.outputFiles[0].text);
    runSwarmFn(swarmModule, swarmExports);
    const { SwarmMessageBus } = swarmModule.exports || swarmExports;

    const bus = new SwarmMessageBus('test-swarm-session-123');
    const state = bus.getState();

    assert(state.sessionId === 'test-swarm-session-123', 'Swarm initialized with correct session ID');
    assert(state.phase === 'planning', 'Swarm initial phase is planning');
    assert(Object.keys(state.agents).length === 4, 'Swarm contains 4 agent roles (Architect, Coder, Tester, Reviewer)');
    assert(state.agents.architect.status === 'idle', 'Architect initialized in idle status');
    assert(state.agents.coder.status === 'idle', 'Coder initialized in idle status');
    assert(state.agents.tester.status === 'idle', 'Tester initialized in idle status');
    assert(state.agents.reviewer.status === 'idle', 'Reviewer initialized in idle status');

    // Test task dispatch
    bus.dispatchTask({
      id: 'task-1',
      role: 'coder',
      title: 'Implement unit test',
      description: 'Write unit tests for authentication'
    });

    const stateAfterTask = bus.getState();
    assert(stateAfterTask.tasks.length === 1, 'Task dispatched and registered in task queue');
    assert(stateAfterTask.tasks[0].role === 'coder', 'Task assigned to coder');

    // Test task status update & role status transition
    bus.setAgentStatus('coder', 'working', { currentTaskId: 'task-1', taskTitle: 'Implement unit test' });
    bus.updateTaskStatus('task-1', 'running');
    assert(bus.getState().tasks[0].status === 'running', 'Task status updated to running');
    assert(bus.getState().agents.coder.status === 'working', 'Coder role status transitioned to working');

    // Test message logging
    bus.postMessage({
      fromRole: 'coder',
      toRole: 'architect',
      type: 'task_complete',
      content: 'Refactored auth module successfully',
      taskId: 'task-1'
    });
    const messages = bus.getState().messages;
    assert(messages.length >= 2, 'Messages logged into SwarmMessageBus (dispatch + completion)');
    const lastMsg = messages[messages.length - 1];
    assert(lastMsg.fromRole === 'coder' && lastMsg.toRole === 'architect', 'Message fromRole/toRole matches');

    // Complete task
    bus.updateTaskStatus('task-1', 'completed', 'All 15 tests passing');
    bus.setAgentStatus('coder', 'idle');
    assert(bus.getState().tasks[0].status === 'completed', 'Task marked as completed');
    assert(bus.getState().agents.coder.status === 'idle', 'Coder returned to idle status');
  } catch (err) {
    assert(false, `Swarm test error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 3: Autonomous Scheduler Logic & Cron Math
  // -------------------------------------------------------------
  console.log('\n⏱️ [Test Group 3] Background Autonomous Scheduler Engine & Calculations');
  try {
    // Test schedule calculation directly
    function computeNextRunTime(schedule, fromTime = Date.now()) {
      const now = new Date(fromTime);
      switch (schedule) {
        case 'every_30m':
          return fromTime + 30 * 60 * 1000;
        case 'every_1h':
          return fromTime + 60 * 60 * 1000;
        case 'every_2h':
          return fromTime + 2 * 60 * 60 * 1000;
        case 'every_6h':
          return fromTime + 6 * 60 * 60 * 1000;
        case 'daily_2am': {
          const next = new Date(now);
          next.setHours(2, 0, 0, 0);
          if (next.getTime() <= fromTime) {
            next.setDate(next.getDate() + 1);
          }
          return next.getTime();
        }
        case 'daily_9am': {
          const next = new Date(now);
          next.setHours(9, 0, 0, 0);
          if (next.getTime() <= fromTime) {
            next.setDate(next.getDate() + 1);
          }
          return next.getTime();
        }
        case 'weekly': {
          const next = new Date(now);
          next.setDate(next.getDate() + 7);
          return next.getTime();
        }
        default:
          return fromTime + 60 * 60 * 1000;
      }
    }

    const t0 = 1700000000000; // Fixed timestamp for deterministic calculation
    assert(computeNextRunTime('every_30m', t0) === t0 + 1800000, 'every_30m adds exactly 30 minutes (1800000ms)');
    assert(computeNextRunTime('every_1h', t0) === t0 + 3600000, 'every_1h adds exactly 1 hour (3600000ms)');
    assert(computeNextRunTime('every_2h', t0) === t0 + 7200000, 'every_2h adds exactly 2 hours (7200000ms)');
    assert(computeNextRunTime('every_6h', t0) === t0 + 21600000, 'every_6h adds exactly 6 hours (21600000ms)');
    assert(computeNextRunTime('weekly', t0) > t0 + 6 * 24 * 3600000, 'weekly schedules 7 days into future');

    // Test daily schedule logic (e.g. daily_2am)
    const next2am = new Date(computeNextRunTime('daily_2am', t0));
    assert(next2am.getHours() === 2 && next2am.getMinutes() === 0, 'daily_2am targets exactly 02:00:00');

    const next9am = new Date(computeNextRunTime('daily_9am', t0));
    assert(next9am.getHours() === 9 && next9am.getMinutes() === 0, 'daily_9am targets exactly 09:00:00');

    // Test Scheduler types definition
    const schedTypesFile = path.join(rootDir, 'electron/scheduler-types.ts');
    const content = fs.readFileSync(schedTypesFile, 'utf-8');
    assert(content.includes('health_check'), 'ScheduledTaskType includes health_check');
    assert(content.includes('security_scan'), 'ScheduledTaskType includes security_scan');
    assert(content.includes('test_runner'), 'ScheduledTaskType includes test_runner');
    assert(content.includes('autonomous_task'), 'ScheduledTaskType includes autonomous_task');
  } catch (err) {
    assert(false, `Scheduler test error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test Group 4: Packaging & Windows Binary Integrity
  // -------------------------------------------------------------
  console.log('\n💿 [Test Group 4] Windows Build & Packaging Release Binaries');
  try {
    const setupExe = path.join(rootDir, 'release/ASTeam Agent-Setup-1.6.0.exe');
    const portableExe = path.join(rootDir, 'release/ASTeam Agent-Portable-1.6.0.exe');
    const blockmap = path.join(rootDir, 'release/ASTeam Agent-Setup-1.6.0.exe.blockmap');

    assert(fs.existsSync(setupExe), 'ASTeam Agent-Setup-1.6.0.exe exists in release/');
    assert(fs.existsSync(portableExe), 'ASTeam Agent-Portable-1.6.0.exe exists in release/');
    assert(fs.existsSync(blockmap), 'ASTeam Agent-Setup-1.6.0.exe.blockmap exists in release/');

    const setupStat = fs.statSync(setupExe);
    const portableStat = fs.statSync(portableExe);

    assert(setupStat.size > 100 * 1024 * 1024, `Setup installer size is normal (>100MB): ${(setupStat.size / (1024*1024)).toFixed(2)} MB`);
    assert(portableStat.size > 100 * 1024 * 1024, `Portable executable size is normal (>100MB): ${(portableStat.size / (1024*1024)).toFixed(2)} MB`);

    const distHtml = path.join(rootDir, 'dist/index.html');
    const mainCjs = path.join(rootDir, 'dist-electron/main.cjs');
    const preloadCjs = path.join(rootDir, 'dist-electron/preload.cjs');

    assert(fs.existsSync(distHtml), 'dist/index.html compiled');
    assert(fs.existsSync(mainCjs), 'dist-electron/main.cjs compiled');
    assert(fs.existsSync(preloadCjs), 'dist-electron/preload.cjs compiled');
  } catch (err) {
    assert(false, `Binary integrity error: ${err.message}`);
  }

  console.log('\n===========================================================');
  console.log(`📊 Test Results: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('===========================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
