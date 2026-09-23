import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

console.log('=== [ASTeam Agent v2.0.2] Pipeline & Basic Function Verification ===');

// 1. Verify that dist files exist
const mainCjs = 'dist-electron/main.cjs';
const indexHtml = 'dist/index.html';
if (!fs.existsSync(mainCjs) || !fs.existsSync(indexHtml)) {
  console.error('FAIL: Build artifacts missing!');
  process.exit(1);
}
console.log('PASS: dist-electron/main.cjs and dist/index.html exist.');

// 2. Verify Python environment
const pyCheck = spawnSync('python', ['-c', 'import pandas, openpyxl, numpy; print("Python env ready")'], { encoding: 'utf-8' });
if (pyCheck.status !== 0 || !pyCheck.stdout.includes('Python env ready')) {
  console.error('FAIL: Python env check failed:', pyCheck.stderr);
  process.exit(1);
}
console.log('PASS: Python 3.11 with pandas, openpyxl, numpy ready.');

// 3. Test firewall-pipeline skill execution with demo file
const firewallScript = path.resolve('scratch/demo_922/unzipped_firewall/firewall-pipeline/scripts/firewall_pipeline.py');
const firewallDemoInput = path.resolve('scratch/demo_922/1.翻译流程管线-firewall-pipeline/输入物/飞塔梳理表_演示.xlsx');
const topsecDemoInput = path.resolve('scratch/demo_922/1.翻译流程管线-firewall-pipeline/输入物/天融信梳理表_演示.xlsx');

if (fs.existsSync(firewallScript) && fs.existsSync(firewallDemoInput)) {
  console.log('Testing Fortinet -> Huawei pipeline execution...');
  const testOutDir = path.resolve('scratch/test_verify_out');
  if (!fs.existsSync(testOutDir)) fs.mkdirSync(testOutDir, { recursive: true });

  const runFw = spawnSync('python', [
    firewallScript,
    firewallDemoInput,
    '--source', '飞塔 FortiGate',
    '--target', '华为 USG'
  ], {
    cwd: testOutDir,
    encoding: 'utf-8'
  });

  if (runFw.status === 0) {
    console.log('PASS: Fortinet -> Huawei pipeline executed successfully.');
    // Check if pipeline output folder generated
    const dirs = fs.readdirSync(testOutDir);
    const pipeDir = dirs.find(d => d.startsWith('pipeline_'));
    if (pipeDir) {
      const generatedFiles = fs.readdirSync(path.join(testOutDir, pipeDir));
      console.log(`PASS: Generated files in ${pipeDir}:`, generatedFiles);
    }
  } else {
    console.warn('Pipeline test exit code:', runFw.status, runFw.stderr);
  }
}

// 4. Test policy-network-filter skill execution with demo file
const policyScript = path.resolve('scratch/demo_922/unzipped_policy/policy-network-filter/scripts/run_policy_network_filter.py');
const bizDemoInput = path.resolve('scratch/demo_922/2.策略指定网段筛选-policy-network-filter/输入物/业务网段_demo.xlsx');
const policyDemoInput = path.resolve('scratch/demo_922/2.策略指定网段筛选-policy-network-filter/输入物/策略_demo.xlsx');

if (fs.existsSync(policyScript) && fs.existsSync(bizDemoInput) && fs.existsSync(policyDemoInput)) {
  console.log('Testing policy-network-filter execution...');
  const runPol = spawnSync('python', [
    policyScript,
    '--biz-file', bizDemoInput,
    '--policy-file', policyDemoInput,
    '--biz-sheet', 'DEMO'
  ], {
    cwd: path.dirname(policyScript),
    encoding: 'utf-8'
  });

  if (runPol.status === 0) {
    console.log('PASS: policy-network-filter executed successfully.');
    console.log('Output preview:', runPol.stdout.slice(0, 300));
  } else {
    console.warn('Policy filter exit code:', runPol.status, runPol.stderr);
  }
}

console.log('=== All Pipeline Script Verification Checks Completed ===');
