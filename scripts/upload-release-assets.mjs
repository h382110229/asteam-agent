import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const token = process.env.GITHUB_TOKEN || '';
const releaseId = process.env.GITHUB_RELEASE_ID || 392800294;
const repo = process.env.GITHUB_REPO || 'h382110229/asteam-agent';

const filesToUpload = [
  { filePath: 'release/ASTeam Agent-Setup-2.0.2.exe', assetName: 'ASTeam Agent-Setup-2.0.2.exe' },
  { filePath: 'release/ASTeam Agent-Portable-2.0.2.exe', assetName: 'ASTeam Agent-Portable-2.0.2.exe' },
  { filePath: 'release/latest.yml', assetName: 'latest.yml' }
];

async function uploadFile(item) {
  const { filePath, assetName } = item;
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`文件不存在: ${absPath}`);
    return false;
  }

  const stat = fs.statSync(absPath);
  const fileSize = stat.size;
  console.log(`\n🚀 开始上传: ${assetName} (${Math.round(fileSize / 1024 / 1024 * 100) / 100} MB)...`);

  const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;
  const urlObj = new URL(uploadUrl);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'User-Agent': 'ASTeam-Uploader',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✓ [HTTP ${res.statusCode}] 上传成功: ${assetName}`);
          resolve(true);
        } else {
          console.error(`❌ [HTTP ${res.statusCode}] 上传失败: ${assetName}\n${data}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`❌ 网络异常: ${err.message}`);
      resolve(false);
    });

    const fileStream = fs.createReadStream(absPath, { highWaterMark: 1024 * 1024 });
    let uploadedBytes = 0;
    let lastLogTime = Date.now();

    fileStream.on('data', chunk => {
      uploadedBytes += chunk.length;
      if (Date.now() - lastLogTime > 2500) {
        lastLogTime = Date.now();
        const percent = Math.round(uploadedBytes / fileSize * 100);
        const mb = Math.round(uploadedBytes / 1024 / 1024);
        console.log(`  -> 进度: ${percent}% (${mb} MB / ${Math.round(fileSize / 1024 / 1024)} MB)`);
      }
    });

    fileStream.pipe(req);
  });
}

for (const item of filesToUpload) {
  const ok = await uploadFile(item);
  if (!ok) {
    console.error(`文件 ${item.assetName} 上传失败，终止流程。`);
    process.exit(1);
  }
}

console.log('\n🎉 所有 3 个资产包全部上传完成！');
