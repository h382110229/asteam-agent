import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface GitStatusSummary {
  branch: string;
  isGitRepo: boolean;
  files: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}

function runGit(repoPath: string, args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`git ${args}`, { cwd: repoPath, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function getGitStatus(repoPath: string): Promise<GitStatusSummary> {
  if (!repoPath || !fs.existsSync(repoPath)) {
    return { branch: '', isGitRepo: false, files: [], totalAdditions: 0, totalDeletions: 0 };
  }

  try {
    const isRepo = await runGit(repoPath, 'rev-parse --is-inside-work-tree').catch(() => 'false');
    if (isRepo !== 'true') {
      return { branch: '', isGitRepo: false, files: [], totalAdditions: 0, totalDeletions: 0 };
    }

    let branch = await runGit(repoPath, 'branch --show-current').catch(() => '');
    if (!branch) {
      branch = await runGit(repoPath, 'rev-parse --short HEAD').catch(() => 'HEAD');
    }

    // Get porcelain status
    const statusRaw = await runGit(repoPath, 'status --porcelain -u').catch(() => '');
    // Get numstat for changes
    const numstatRaw = await runGit(repoPath, 'diff --numstat HEAD').catch(() => '');

    const statMap: Record<string, { additions: number; deletions: number }> = {};
    if (numstatRaw) {
      for (const line of numstatRaw.split('\n')) {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          const add = parseInt(parts[0], 10) || 0;
          const del = parseInt(parts[1], 10) || 0;
          const file = parts[2].trim();
          statMap[file] = { additions: add, deletions: del };
        }
      }
    }

    const files: GitFileStatus[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    if (statusRaw) {
      for (const line of statusRaw.split('\n')) {
        if (!line.trim()) continue;
        const code = line.slice(0, 2);
        const filePath = line.slice(3).trim();

        let status: GitFileStatus['status'] = 'modified';
        if (code.includes('?')) status = 'untracked';
        else if (code.includes('A')) status = 'added';
        else if (code.includes('D')) status = 'deleted';
        else if (code.includes('M')) status = 'modified';

        const stats = statMap[filePath] || { additions: status === 'untracked' ? 10 : 1, deletions: 0 };
        totalAdditions += stats.additions;
        totalDeletions += stats.deletions;

        files.push({
          path: filePath,
          status,
          staged: code[0] !== ' ' && code[0] !== '?',
          additions: stats.additions,
          deletions: stats.deletions
        });
      }
    }

    return {
      branch,
      isGitRepo: true,
      files,
      totalAdditions,
      totalDeletions
    };
  } catch {
    return { branch: '', isGitRepo: false, files: [], totalAdditions: 0, totalDeletions: 0 };
  }
}

export async function getFileDiff(repoPath: string, relPath: string): Promise<string> {
  try {
    const diff = await runGit(repoPath, `diff HEAD -- "${relPath}"`);
    if (diff) return diff;

    // Check unstaged diff
    const unstagedDiff = await runGit(repoPath, `diff -- "${relPath}"`);
    if (unstagedDiff) return unstagedDiff;

    // If untracked new file, read full file and format as diff
    const fullPath = path.join(repoPath, relPath);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').map(l => `+${l}`).join('\n');
        return `--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,${content.split('\n').length} @@\n${lines}`;
      }
    }
    return '(无变更差异)';
  } catch (err: any) {
    return `无法读取差异: ${err.message}`;
  }
}

export async function discardFileChange(repoPath: string, relPath: string): Promise<boolean> {
  try {
    const fullPath = path.join(repoPath, relPath);
    // If untracked file, remove it
    const status = await runGit(repoPath, `status --porcelain "${relPath}"`);
    if (status.includes('?')) {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      return true;
    }

    // Otherwise checkout from HEAD
    await runGit(repoPath, `checkout HEAD -- "${relPath}"`);
    return true;
  } catch {
    return false;
  }
}

export async function getGitDiffSummary(repoPath: string): Promise<{ branch: string; statusText: string; diffText: string }> {
  try {
    const status = await getGitStatus(repoPath);
    if (!status.isGitRepo) {
      return { branch: '', statusText: '当前工作区不是 Git 仓库', diffText: '' };
    }
    const diffRaw = await runGit(repoPath, 'diff HEAD').catch(() => '');
    const unstagedDiff = diffRaw || await runGit(repoPath, 'diff').catch(() => '');
    const fileList = status.files.map(f => `  - ${f.path} (${f.status}, +${f.additions}/-${f.deletions})`).join('\n');
    const statusText = `分支: ${status.branch}\n变更文件 (${status.files.length} 个, +${status.totalAdditions}/-${status.totalDeletions}):\n${fileList || '  (无未提交文件)'}`;
    return {
      branch: status.branch,
      statusText,
      diffText: (unstagedDiff || '').slice(0, 15000) || '(无未提交差异)'
    };
  } catch (err: any) {
    return { branch: '', statusText: `Git 状态获取失败: ${err.message}`, diffText: '' };
  }
}

