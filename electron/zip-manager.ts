import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { safeWriteFileSync } from './file-resilience';

export interface CompressZipOptions {
  sourcePaths?: string[] | string;
  sourcePath?: string;
  targetZipPath?: string;
  outputZipPath?: string;
  comment?: string;
}

export interface ExtractZipOptions {
  zipPath?: string;
  zipFilePath?: string;
  outputDir?: string;
  targetDir?: string;
  overwrite?: boolean;
}

/**
 * 纯 JS 原生 ZIP 压缩打包器 (基于 adm-zip)
 * 支持将单一文件、多文件或整个目录递归打包为 .zip 文件，零外部 7z/tar/WinRAR 依赖
 */
export async function compressZip(
  arg1: string | CompressZipOptions,
  arg2?: string
): Promise<string> {
  let rawSources: string[] = [];
  let targetZipPath = '';
  let comment = '';

  if (typeof arg1 === 'object' && arg1 !== null) {
    const s = arg1.sourcePaths || arg1.sourcePath || [];
    rawSources = Array.isArray(s) ? s : [s];
    targetZipPath = arg1.targetZipPath || arg1.outputZipPath || '';
    comment = arg1.comment || '';
  } else if (typeof arg1 === 'string') {
    rawSources = [arg1];
    targetZipPath = arg2 || '';
  }

  if (!targetZipPath) {
    throw new Error('compressZip 失败: 未指定目标 ZIP 文件路径 (targetZipPath)');
  }

  if (rawSources.length === 0) {
    throw new Error('compressZip 失败: 未提供任何待压缩的源文件或目录 (sourcePaths 不能为空)');
  }

  const zip = new AdmZip();

  for (const src of rawSources) {
    if (!src || !fs.existsSync(src)) {
      throw new Error(`压缩源文件或目录不存在: ${src}`);
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      zip.addLocalFolder(src, path.basename(src));
    } else {
      zip.addLocalFile(src);
    }
  }

  if (comment) {
    zip.addZipComment(comment);
  }

  const buffer = zip.toBuffer();
  const writeRes = safeWriteFileSync(targetZipPath, buffer);
  const entries = zip.getEntries();

  return `成功创建并压缩 ZIP 归档: "${writeRes.actualPath}" (${buffer.length} 字节，共包含 ${entries.length} 个文件/条目)${writeRes.isFallback ? ` [提示: 原目标已被系统独占锁定，自动安全写入新版本: ${writeRes.actualPath}]` : ''}`;
}

/**
 * 纯 JS 原生 ZIP 解压提取器 (基于 adm-zip)
 * 支持解压任意标准 .zip 文件至目标目录，自动递归创建子目录，杜绝调用外部命令行
 */
export async function extractZip(
  arg1: string | ExtractZipOptions,
  arg2?: string
): Promise<string> {
  let zipFilePath = '';
  let targetDir = '';
  let overwrite = true;

  if (typeof arg1 === 'object' && arg1 !== null) {
    zipFilePath = arg1.zipPath || arg1.zipFilePath || '';
    targetDir = arg1.outputDir || arg1.targetDir || '';
    overwrite = arg1.overwrite ?? true;
  } else if (typeof arg1 === 'string') {
    zipFilePath = arg1;
    targetDir = arg2 || '';
  }

  if (!zipFilePath) {
    throw new Error('extractZip 失败: 未指定待解压的 ZIP 文件路径 (zipPath)');
  }

  if (!fs.existsSync(zipFilePath)) {
    throw new Error(`待解压的 ZIP 文件不存在: "${zipFilePath}"`);
  }

  if (!targetDir) {
    targetDir = path.dirname(zipFilePath);
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const zip = new AdmZip(zipFilePath);
  const entries = zip.getEntries();
  zip.extractAllTo(targetDir, overwrite);

  const nonDirEntries = entries.filter(e => !e.isDirectory);

  return `成功解压缩 ZIP 归档: "${zipFilePath}" 至目录 "${targetDir}" (共提取还原 ${nonDirEntries.length} 个文件)`;
}
