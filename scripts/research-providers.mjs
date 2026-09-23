// Inspect providers, model bindings, and zcode-cli packages
import fs from 'fs';
import path from 'path';

async function githubGet(endpoint) {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com/repos/zai-org/ZCode/${endpoint.replace(/^\//, '')}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ASTeam-Research-Agent',
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function getFileText(filePath) {
  const data = await githubGet(`contents/${filePath}`);
  if (data.content && data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  throw new Error(`Not a file or not base64: ${filePath}`);
}

async function main() {
  const outDir = path.resolve('scratch/zcode-research');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('1. Checking packages/provider/src/registry.ts...');
  try {
    const text = await getFileText('packages/provider/src/registry.ts');
    fs.writeFileSync(path.join(outDir, 'registry.ts'), text);
    console.log('Saved registry.ts (' + text.length + ' chars)');
  } catch (e) {
    console.warn('registry.ts error:', e.message);
  }

  console.log('2. Checking packages/provider/src/sources.ts...');
  try {
    const text = await getFileText('packages/provider/src/sources.ts');
    fs.writeFileSync(path.join(outDir, 'sources.ts'), text);
    console.log('Saved sources.ts (' + text.length + ' chars)');
  } catch (e) {
    console.warn('sources.ts error:', e.message);
  }

  console.log('3. Checking packages/model-option-map/src/option-maps.ts...');
  try {
    const text = await getFileText('packages/model-option-map/src/option-maps.ts');
    fs.writeFileSync(path.join(outDir, 'option-maps.ts'), text);
    console.log('Saved option-maps.ts (' + text.length + ' chars)');
  } catch (e) {
    console.warn('option-maps.ts error:', e.message);
  }

  console.log('4. Listing apps/zcode-cli/packages...');
  try {
    const cliPkgs = await githubGet('contents/apps/zcode-cli/packages');
    console.log('apps/zcode-cli/packages:', cliPkgs.map(p => p.name));
    fs.writeFileSync(path.join(outDir, 'cli-packages.json'), JSON.stringify(cliPkgs, null, 2));
  } catch (e) {
    console.warn('apps/zcode-cli/packages error:', e.message);
  }
}

main().catch(console.error);
