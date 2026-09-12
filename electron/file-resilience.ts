import fs from 'node:fs';
import path from 'node:path';

export interface SafeWriteResult {
  success: boolean;
  actualPath: string;
  isFallback: boolean;
  originalPath: string;
  message?: string;
}

/**
 * toSafeWindowsLongPath: automatically prefix with \\\?\\ when length > 240
 */
export function toSafeWindowsLongPath(targetPath: string): string {
  if (process.platform !== 'win32') return targetPath;
  if (!targetPath) return targetPath;
  const norm = path.normalize(targetPath);
  if (norm.length > 240 && !norm.startsWith('\\\\\?\\')) {
    return '\\\\?\\' + path.resolve(norm);
  }
  return targetPath;
}

/**
 * safeWriteFileSync: catches EBUSY / EPERM (file locked by Office)\
 * and automatically saves as _v2, _v3 fallback copy.
 */
export function safeWriteFileSync(
  targetPath: string,
  data: string | Uint8Array | Buffer,
  options: fs.WriteFileOptions = 'utf-8'
): SafeWriteResult {
  const safeTarget = toSafeWindowsLongPath(targetPath);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }

  try {
    fs.writeFileSync(safeTarget, data, options);
    return {
      success: true,
      actualPath: targetPath,
      isFallback: false,
      originalPath: targetPath
    };
  } catch (err: any) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      const ext = path.extname(targetPath);
      const baseName = path.basename(targetPath, ext);
      let counter = 2;
      let fallbackCandidate = path.join(dir, baseName + '_v' + counter + ext);

      while (fs.existsSync(fallbackCandidate)) {
        try {
          const h = fs.openSync(toSafeWindowsLongPath(fallbackCandidate), 'r+');
          fs.closeSync(h);
          break;
        } catch {
          counter++;
          fallbackCandidate = path.join(dir, baseName + '_v' + counter + ext);
        }
      }

      try {
        const safeFallback = toSafeWindowsLongPath(fallbackCandidate);
        fs.writeFileSync(safeFallback, data, options);
        return {
          success: true,
          actualPath: fallbackCandidate,
          isFallback: true,
          originalPath: targetPath,
          message: '检测到目标喇浅 "' + path.basename(targetPath) + '" 正被外部应用(如 Office/WPS)独卦打开，已楚能另存为艛本 "' + path.basename(fallbackCandidate) + '"，保障任务无中断交付！'
        };
      } catch (fallbackErr: any) {
        throw new Error('安全另存副本写入失败: ' + fallbackErr.message);
      }
    }
    throw err;
  }
}
