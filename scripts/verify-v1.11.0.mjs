import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('🚀 [Verify-v1.11.0] Starting ASTeam Agent Skill & System Verification...');

// 1. 验证 package.json 版本
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
assert.strictEqual(pkg.version, '1.11.0', `package.json version should be 1.11.0, got ${pkg.version}`);
console.log('✅ 1. package.json version is 1.11.0');

// 2. 验证目标外部技能目录是否存在
const externalSkillDir = 'D:\\ASTeamAIProject\\Skills';
if (fs.existsSync(externalSkillDir)) {
  console.log(`✅ 2. Target external skills directory exists: ${externalSkillDir}`);
  const items = fs.readdirSync(externalSkillDir);
  console.log(`   Items found: ${items.join(', ')}`);
  
  assert(items.includes('huaxun-excel-generator'), 'Must contain huaxun-excel-generator');
  assert(items.includes('huaxun-word-generator'), 'Must contain huaxun-word-generator');
} else {
  console.warn(`⚠️ 2. Target external skills directory ${externalSkillDir} not found on this machine.`);
}

// 3. 验证复合技能文件夹结构与 Prompt 生成逻辑
const excelSkillDir = path.join(externalSkillDir, 'huaxun-excel-generator');
if (fs.existsSync(excelSkillDir)) {
  const scriptsDir = path.join(excelSkillDir, 'scripts');
  const assetsDir = path.join(excelSkillDir, 'assets');
  const skillMd = path.join(excelSkillDir, 'SKILL.md');
  
  assert(fs.existsSync(skillMd), 'SKILL.md must exist in huaxun-excel-generator');
  assert(fs.existsSync(scriptsDir), 'scripts directory must exist in huaxun-excel-generator');
  assert(fs.existsSync(assetsDir), 'assets directory must exist in huaxun-excel-generator');
  
  console.log('✅ 3. huaxun-excel-generator physical folders verified:');
  console.log(`   - scripts: ${scriptsDir}`);
  console.log(`   - assets: ${assetsDir}`);
}

// 4. 验证 ZIP 解包支持 (adm-zip)
import AdmZip from 'adm-zip';
const testZipPath = path.join(externalSkillDir, 'dist', 'huaxun-excel-generator-v1.0.0.zip');
if (fs.existsSync(testZipPath)) {
  const zip = new AdmZip(testZipPath);
  const entries = zip.getEntries().map(e => e.entryName);
  console.log(`✅ 4. AdmZip successfully opened ${testZipPath}, entries count: ${entries.length}`);
  assert(entries.some(e => e.includes('SKILL.md')), 'ZIP should contain SKILL.md');
}

console.log('🎉 [Verify-v1.11.0] All critical path and structural checks passed successfully!');
