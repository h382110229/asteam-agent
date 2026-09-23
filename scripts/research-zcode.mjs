// Research script for inspecting zai-org/ZCode repository via GitHub REST API
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

  console.log('1. Fetching DESIGN.md and AGENTS.md...');
  try {
    const designText = await getFileText('DESIGN.md');
    fs.writeFileSync(path.join(outDir, 'DESIGN.md'), designText);
    console.log('Saved DESIGN.md (' + designText.length + ' chars)');
  } catch (e) {
    console.warn('Could not fetch DESIGN.md:', e.message);
  }

  try {
    const agentsText = await getFileText('AGENTS.md');
    fs.writeFileSync(path.join(outDir, 'AGENTS.md'), agentsText);
    console.log('Saved AGENTS.md (' + agentsText.length + ' chars)');
  } catch (e) {
    console.warn('Could not fetch AGENTS.md:', e.message);
  }

  console.log('\n2. Inspecting packages/provider...');
  try {
    const providerContents = await githubGet('contents/packages/provider');
    console.log('packages/provider files:', providerContents.map(c => c.name));
    if (providerContents.some(c => c.name === 'src')) {
      const srcContents = await githubGet('contents/packages/provider/src');
      console.log('packages/provider/src:', srcContents.map(c => c.name));
    }
    const pkgJson = await getFileText('packages/provider/package.json');
    fs.writeFileSync(path.join(outDir, 'provider-package.json'), pkgJson);
  } catch (e) {
    console.warn('packages/provider err:', e.message);
  }

  console.log('\n3. Inspecting packages/model-option-map...');
  try {
    const momContents = await githubGet('contents/packages/model-option-map');
    console.log('packages/model-option-map files:', momContents.map(c => c.name));
    if (momContents.some(c => c.name === 'src')) {
      const srcContents = await githubGet('contents/packages/model-option-map/src');
      console.log('packages/model-option-map/src:', srcContents.map(c => c.name));
    }
  } catch (e) {
    console.warn('packages/model-option-map err:', e.message);
  }

  console.log('\n4. Inspecting apps/zcode-cli...');
  try {
    const cliContents = await githubGet('contents/apps/zcode-cli');
    console.log('apps/zcode-cli files:', cliContents.map(c => c.name));
    if (cliContents.some(c => c.name === 'src')) {
      const srcContents = await githubGet('contents/apps/zcode-cli/src');
      console.log('apps/zcode-cli/src:', srcContents.map(c => c.name));
    }
  } catch (e) {
    console.warn('apps/zcode-cli err:', e.message);
  }

  console.log('\n5. Inspecting harness/remote...');
  try {
    const harnessContents = await githubGet('contents/harness/remote');
    console.log('harness/remote files:', harnessContents.map(c => c.name));
  } catch (e) {
    console.warn('harness/remote err:', e.message);
  }
}

main().catch(console.error);
