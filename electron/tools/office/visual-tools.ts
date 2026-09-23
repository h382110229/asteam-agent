import fs from 'node:fs';
import path from 'node:path';
import { nativeImage } from 'electron';

export interface VisualInspectionResult {
  success: boolean;
  imageId: string;
  name: string;
  localPath: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  base64DataUrl?: string;
  message: string;
}

/**
 * ASTeam 2.0.0 Level 2 动态微距变焦工具 (inspect_image_detail)
 * 当 Agent 从文档拓扑清单或复合切片画幅中发现需要深入审核的关键图纸时，
 * 自主按需调阅单张超高分辨率原图，实现“既纵览全局，又深审细节”，兼顾 Token 经济性与审图精度。
 */
export async function inspectImageDetail(
  imagePathOrId: string,
  options?: {
    cropBox?: { x: number; y: number; width: number; height: number };
    maxDimension?: number;
  }
): Promise<VisualInspectionResult> {
  if (!imagePathOrId || imagePathOrId.trim() === '') {
    return {
      success: false,
      imageId: '',
      name: '',
      localPath: '',
      mimeType: '',
      sizeBytes: 0,
      message: 'inspectImageDetail 失败: 必须提供 imagePathOrId 参数。'
    };
  }

  let resolvedPath = imagePathOrId.trim();

  // 若传入的是 file:/// 格式路径，进行规范化
  if (resolvedPath.startsWith('file:///')) {
    resolvedPath = decodeURIComponent(resolvedPath.slice(8));
    if (/^\/[a-zA-Z]:/.test(resolvedPath)) {
      resolvedPath = resolvedPath.slice(1);
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    return {
      success: false,
      imageId: path.basename(resolvedPath),
      name: path.basename(resolvedPath),
      localPath: resolvedPath,
      mimeType: '',
      sizeBytes: 0,
      message: `未找到指定图像文件: ${resolvedPath}，请核对文档提取给出的本地路径。`
    };
  }

  const stat = fs.statSync(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.gif') mimeType = 'image/gif';
  else if (ext === '.svg') mimeType = 'image/svg+xml';

  try {
    let nImg = nativeImage.createFromPath(resolvedPath);
    let size = nImg.getSize();

    // 局部裁剪支持
    if (options?.cropBox && options.cropBox.width > 0 && options.cropBox.height > 0) {
      nImg = nImg.crop({
        x: Math.max(0, Math.min(size.width, options.cropBox.x)),
        y: Math.max(0, Math.min(size.height, options.cropBox.y)),
        width: Math.min(size.width, options.cropBox.width),
        height: Math.min(size.height, options.cropBox.height)
      });
      size = nImg.getSize();
    }

    // 针对极大图（如超 4096px 的全景拓扑图）进行合理等比缩放，防止单图超网关限制
    const maxDim = options?.maxDimension || 2048;
    if (size.width > maxDim || size.height > maxDim) {
      const ratio = Math.min(maxDim / size.width, maxDim / size.height);
      nImg = nImg.resize({
        width: Math.round(size.width * ratio),
        height: Math.round(size.height * ratio),
        quality: 'better'
      });
      size = nImg.getSize();
    }

    const pngBuf = nImg.toPNG();
    const base64Url = `data:image/png;base64,${pngBuf.toString('base64')}`;

    return {
      success: true,
      imageId: path.basename(resolvedPath),
      name: path.basename(resolvedPath),
      localPath: resolvedPath,
      mimeType: 'image/png',
      sizeBytes: pngBuf.length,
      width: size.width,
      height: size.height,
      base64DataUrl: base64Url,
      message: `已成功加载图像「${path.basename(resolvedPath)}」超清视觉数据 (分辨率: ${size.width}x${size.height}, 体积: ${(pngBuf.length / 1024).toFixed(1)} KB)，已挂载至多模态视界。`
    };
  } catch (err: any) {
    // 降级使用 raw buffer
    const rawBuf = fs.readFileSync(resolvedPath);
    return {
      success: true,
      imageId: path.basename(resolvedPath),
      name: path.basename(resolvedPath),
      localPath: resolvedPath,
      mimeType,
      sizeBytes: stat.size,
      base64DataUrl: `data:${mimeType};base64,${rawBuf.toString('base64')}`,
      message: `已降级直接读取原图「${path.basename(resolvedPath)}」Base64 视觉数据。`
    };
  }
}
