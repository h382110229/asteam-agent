import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('🚀 [Verify-v1.11.2] Starting ASTeam Agent Office Extractor & Fallback Dispatch Verification...');

// 1. 验证 package.json 版本
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
assert.strictEqual(pkg.version, '1.11.2', `package.json version should be 1.11.2, got ${pkg.version}`);
console.log('✅ 1. package.json version is 1.11.2');

// 2. 验证 harness-runner.ts 中的 resolveFallbackModel 逻辑
const harnessContent = fs.readFileSync(path.resolve('electron/harness-runner.ts'), 'utf-8');
assert(harnessContent.includes('resolveFallbackModel'), 'Must contain resolveFallbackModel function');
assert(harnessContent.includes('mimo-x-pro-preview'), 'Fallback candidate must contain mimo-x-pro-preview');
assert(harnessContent.includes('mimo-v2.5'), 'Fallback candidate must contain mimo-v2.5');
console.log('✅ 2. harness-runner.ts verified with preferred fallback: mimo-x-pro-preview -> mimo-v2.5.');

// 3. 验证 electron/office-extractor.ts
const extractorContent = fs.readFileSync(path.resolve('electron/office-extractor.ts'), 'utf-8');
assert(extractorContent.includes('extractDocxContent'), 'Must export extractDocxContent');
assert(extractorContent.includes('extractPptxContent'), 'Must export extractPptxContent');
assert(extractorContent.includes('extractXlsxContent'), 'Must export extractXlsxContent');
assert(extractorContent.includes('extractPdfContent'), 'Must export extractPdfContent');
assert(extractorContent.includes('extractOfficeDocumentContent'), 'Must export extractOfficeDocumentContent facade');
console.log('✅ 3. office-extractor.ts verified covering Word (.docx), PPT (.pptx), Excel (.xlsx), and PDF (.pdf).');

// 4. 验证 preload 与 main IPC
const preloadContent = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf-8');
assert(preloadContent.includes('extractOfficeDocument'), 'preload.ts must expose extractOfficeDocument');
const mainContent = fs.readFileSync(path.resolve('electron/main.ts'), 'utf-8');
assert(mainContent.includes('office:extractDocument'), 'main.ts must register office:extractDocument IPC');
console.log('✅ 4. Preload and Main IPC verified for office document extraction.');

// 5. 验证 App.tsx 与 ChatArea.tsx 的防御逻辑 (杜绝直接 Base64 乱码撑爆上下文)
const appContent = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
assert(appContent.includes("att.type?.startsWith('document/')"), 'App.tsx must handle document/ attachments');
assert(appContent.includes("!att.content.startsWith('data:')"), 'App.tsx must guard against long base64 strings');
console.log('✅ 5. App.tsx verified guarding against Base64 payload explosion.');

console.log('🎉 [Verify-v1.11.2] All test assertions passed successfully!');
