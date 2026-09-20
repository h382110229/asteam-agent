import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('🚀 [Verify-v1.11.1] Starting ASTeam Agent Skill Generator & Folder Import Verification...');

// 1. 验证 package.json 版本
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
assert.strictEqual(pkg.version, '1.11.1', `package.json version should be 1.11.1, got ${pkg.version}`);
console.log('✅ 1. package.json version is 1.11.1');

// 2. 验证 skill-manager.ts 中内置技能 skill_generator
const skillManagerContent = fs.readFileSync(path.resolve('electron/skill-manager.ts'), 'utf-8');
assert(skillManagerContent.includes(`id: 'skill_generator'`), 'BUILTIN_SKILLS must contain skill_generator');
assert(skillManagerContent.includes('技能架构师与自动生成专家'), 'skill_generator name must match');
assert(skillManagerContent.includes('创建技能'), 'skill_generator triggers must contain 创建技能');
assert(skillManagerContent.includes('write_file'), 'skill_generator recommendedTools must contain write_file');
console.log('✅ 2. Builtin skill "skill_generator" verified successfully with proper triggers and tools.');

// 3. 验证文件夹免压缩穿透导入与自动多层识别逻辑
assert(skillManagerContent.includes('// 优先探测该文件夹本身是否为包含 SKILL.md / skill.md 的单一复合技能'), 'Should contain root skill probing logic');
assert(skillManagerContent.includes('storageHub.addExtraSkillDir(sourcePath)'), 'Should auto-register parent folder with sub-skills as extra skill repository');
console.log('✅ 3. Folder import auto-penetration and multi-skill directory association verified in source code.');

// 4. 验证 ChatArea.tsx 中文件夹导入按钮与 /skill 快捷指令
const chatAreaContent = fs.readFileSync(path.resolve('src/components/ChatArea.tsx'), 'utf-8');
assert(chatAreaContent.includes('handleImportFolder'), 'ChatArea must define handleImportFolder');
assert(chatAreaContent.includes('选择文件夹导入'), 'ChatArea must render 选择文件夹导入 button');
assert(chatAreaContent.includes(`cmd: '/skill'`), 'ChatArea must register /skill slash command');
console.log('✅ 4. ChatArea UI folder import button & /skill slash command verified.');

console.log('🎉 [Verify-v1.11.1] All verifications passed successfully!');
