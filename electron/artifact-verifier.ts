import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ArtifactVerificationResult {
  verified: boolean;
  filePath: string;
  exists: boolean;
  sizeBytes: number;
  mtimeMs: number;
  ageSeconds: number;
  failureReason?: string;
  badge?: string;
}

export interface GateInspectionReport {
  passed: boolean;
  checkedArtifacts: ArtifactVerificationResult[];
  blockingMessage?: string;
  badges: string[];
}

export class ArtifactVerifier {
  /**
   * 解析路径别名（如 ~/Desktop/... 或 Desktop/...）为物理绝对路径
   */
  public resolveAbsolutePath(targetPath: string, workspacePath?: string | null): string {
    if (!targetPath || !targetPath.trim()) return '';
    let clean = targetPath.trim().replace(/^["'`]|["'`]$/g, '');

    // 针对桌面别名进行映射
    const desktopDir = path.join(os.homedir(), 'Desktop');
    if (clean.startsWith('~/Desktop/') || clean.startsWith('~/Desktop\\')) {
      clean = path.join(desktopDir, clean.slice(10));
    } else if (clean.startsWith('Desktop/') || clean.startsWith('Desktop\\')) {
      clean = path.join(desktopDir, clean.slice(8));
    } else if (clean.startsWith('~/') || clean.startsWith('~\\')) {
      clean = path.join(os.homedir(), clean.slice(2));
    } else if (!path.isAbsolute(clean)) {
      if (clean.toLowerCase().includes('desktop')) {
        clean = path.join(desktopDir, path.basename(clean));
      } else if (workspacePath && fs.existsSync(workspacePath)) {
        clean = path.resolve(workspacePath, clean);
      } else {
        clean = path.resolve(clean);
      }
    }

    return path.normalize(clean);
  }

  /**
   * 对单个交付制品执行底层物理探针硬校验
   * @param targetPath 目标物理文件路径
   * @param sessionStartTimeMs 本轮任务发起时的物理毫秒时间戳
   */
  public verifyArtifact(targetPath: string, sessionStartTimeMs: number, workspacePath?: string | null): ArtifactVerificationResult {
    const resolved = this.resolveAbsolutePath(targetPath, workspacePath);
    if (!resolved) {
      return {
        verified: false,
        filePath: targetPath,
        exists: false,
        sizeBytes: 0,
        mtimeMs: 0,
        ageSeconds: 0,
        failureReason: '路径为空或无法解析为有效的文件系统物理路径'
      };
    }

    if (!fs.existsSync(resolved)) {
      return {
        verified: false,
        filePath: resolved,
        exists: false,
        sizeBytes: 0,
        mtimeMs: 0,
        ageSeconds: 0,
        failureReason: `目标物理文件未在磁盘中真实创建 (路径不存在: "${resolved}")`
      };
    }

    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return {
          verified: false,
          filePath: resolved,
          exists: true,
          sizeBytes: 0,
          mtimeMs: stat.mtimeMs,
          ageSeconds: 0,
          failureReason: `目标路径 "${resolved}" 是一个目录而非交付文件制品`
        };
      }

      // 1. 体积校验（必须 > 0 字节）
      if (stat.size <= 0) {
        return {
          verified: false,
          filePath: resolved,
          exists: true,
          sizeBytes: 0,
          mtimeMs: stat.mtimeMs,
          ageSeconds: Math.round((Date.now() - stat.mtimeMs) / 1000),
          failureReason: `目标文件体积异常为 0 字节（空文件），物理写入尚未完成或失败`
        };
      }

      // 2. 时间戳新鲜度强校验（严禁将早于本轮任务发起的旧文件误判为新生成物）
      // 允许 3 秒的时钟偏差容限
      const clockToleranceMs = 3000;
      if (stat.mtimeMs < sessionStartTimeMs - clockToleranceMs) {
        const timeGapSec = Math.round((sessionStartTimeMs - stat.mtimeMs) / 1000);
        return {
          verified: false,
          filePath: resolved,
          exists: true,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
          ageSeconds: Math.round((Date.now() - stat.mtimeMs) / 1000),
          failureReason: `【时效性拦截】检测到该文件为历史旧文件（修改时间早于本轮任务发起时间 ${timeGapSec} 秒，最后修改时间: ${new Date(stat.mtimeMs).toLocaleTimeString()}）。严禁认领历史旧文件伪造交付物！`
        };
      }

      // 校验全部通过
      const badge = this.buildVerificationBadge(resolved, stat.size, stat.mtimeMs);
      return {
        verified: true,
        filePath: resolved,
        exists: true,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
        ageSeconds: Math.round((Date.now() - stat.mtimeMs) / 1000),
        badge
      };
    } catch (err: any) {
      return {
        verified: false,
        filePath: resolved,
        exists: false,
        sizeBytes: 0,
        mtimeMs: 0,
        ageSeconds: 0,
        failureReason: `读取物理文件信息异常: ${err.message}`
      };
    }
  }

  /**
   * 从模型文本中提取声称已交付或已生成的文件路径
   */
  public extractClaimedArtifactPaths(text: string): string[] {
    if (!text) return [];
    const results = new Set<string>();

    // 匹配 Windows 绝对路径：例如 C:\Users\xxx\Desktop\xxx.docx
    const winAbsRegex = /(?:[A-Za-z]:[\\/][^"'\n\r<>|*?`]+?\.(?:docx|xlsx|xls|pptx|pdf|zip|md|json|csv|html))/gi;
    let m: RegExpExecArray | null;
    while ((m = winAbsRegex.exec(text)) !== null) {
      results.add(m[0].trim());
    }

    // 匹配 ~ 或 Desktop 相对路径：例如 ~/Desktop/xxx.docx 或 Desktop/xxx.docx
    const aliasRegex = /(?:~?\/Desktop[\\/][^"'\n\r<>|*?`]+?\.(?:docx|xlsx|xls|pptx|pdf|zip|md|json|csv|html))/gi;
    while ((m = aliasRegex.exec(text)) !== null) {
      results.add(m[0].trim());
    }

    // 匹配 Markdown 链接或反引号中的路径：`xxx.docx`
    const codeSpanRegex = /`([^`\n\r]+?\.(?:docx|xlsx|xls|pptx|pdf|zip))`(?:\s*(?:已生成|成功生成|生成成功|文件已就绪|交付完成))/gi;
    while ((m = codeSpanRegex.exec(text)) !== null) {
      results.add(m[1].trim());
    }

    return Array.from(results);
  }

  /**
   * 对大模型最终答复进行交付物探针总门禁审查
   */
  public inspectDeliveryGate(
    responseText: string,
    sessionStartTimeMs: number,
    trackedGeneratedPaths: string[],
    workspacePath?: string | null
  ): GateInspectionReport {
    // 合并模型文本中提到的路径和会话执行过程中工具真实调用产生的目标路径
    const claimedPaths = this.extractClaimedArtifactPaths(responseText);
    const allPathsToCheck = Array.from(new Set([...claimedPaths, ...trackedGeneratedPaths]));

    // 若本轮无任何交付物声明且工具无生成，直接放行
    if (allPathsToCheck.length === 0) {
      return {
        passed: true,
        checkedArtifacts: [],
        badges: []
      };
    }

    const checkedArtifacts: ArtifactVerificationResult[] = [];
    const badges: string[] = [];
    let hasFailedClaim = false;
    let blockingReasons: string[] = [];

    for (const p of allPathsToCheck) {
      // 忽略临时文件或 node_modules
      if (p.includes('node_modules') || p.includes('.git') || p.includes('.system_generated')) {
        continue;
      }
      const res = this.verifyArtifact(p, sessionStartTimeMs, workspacePath);
      checkedArtifacts.push(res);

      if (!res.verified) {
        hasFailedClaim = true;
        blockingReasons.push(`- 交付物 "${p}": ${res.failureReason}`);
      } else if (res.badge) {
        badges.push(res.badge);
      }
    }

    if (hasFailedClaim) {
      const blockingMessage = `【物理探针门禁拦截警告 (Artifact Verification Failed)】
内核底层物理探针拦截到未经验收合格的交付物声明！
严禁在纯文本中伪造交付或认领未落盘/历史旧文件！
未通过探针明细：
${blockingReasons.join('\n')}

请立即调用具体的本地原生生成工具（如 generate_docx, generate_excel, write_file）完成真实的物理落盘，然后再向用户汇报！`;

      return {
        passed: false,
        checkedArtifacts,
        blockingMessage,
        badges: []
      };
    }

    return {
      passed: true,
      checkedArtifacts,
      badges
    };
  }

  /**
   * 格式化物理落盘防伪证书
   */
  private buildVerificationBadge(resolvedPath: string, sizeBytes: number, mtimeMs: number): string {
    const formattedSize = sizeBytes > 1024 * 1024
      ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(sizeBytes / 1024).toFixed(1)} KB`;
    const timeStr = new Date(mtimeMs).toLocaleTimeString('zh-CN', { hour12: false });
    return `🛡️ **[物理探针门禁验收通过]**\n- 物理真实路径: \`${resolvedPath}\`\n- 验证时间戳: \`${timeStr}\` (新鲜落盘)\n- 物理体积: \`${formattedSize}\` (${sizeBytes} 字节)\n- 校验结果: 真实有效已就绪`;
  }
}

export const artifactVerifier = new ArtifactVerifier();
