import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink, rmdir, readdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { S3Storage } from 'coze-coding-dev-sdk';

const isProd = process.env.COZE_PROJECT_ENV === 'PROD';

/**
 * 将中文/特殊字符替换为安全字符，用于目录名
 * 仅保留字母、数字、中文、短横、下划线，其余替换为下划线
 */
function sanitizeSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[^\w\u4e00-\u9fff\-]/g, '_')  // 保留字母、数字、中文、短横
    .replace(/_+/g, '_')                       // 合并连续下划线
    .replace(/^_|_$/g, '')                     // 去掉首尾下划线
    || 'unknown';
}

/**
 * 根据元数据生成结构化目录名：年月日时间(精确到分钟)-科室-页面标题-患者姓名
 */
function buildFolderPrefix(meta: {
  title?: string;
  department?: string;
  patientName?: string;
}): string {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');

  const dept = sanitizeSegment(meta.department || '未知科室');
  const ttl = sanitizeSegment(meta.title || '未命名');
  const patient = sanitizeSegment(meta.patientName || '未知患者');

  return `${dateStr}-${dept}-${ttl}-${patient}`;
}

/**
 * 使用已有的时间戳 + 元数据重建目录名（用于重命名场景，保留原始时间戳）
 */
function buildFolderPrefixWithTimestamp(timestamp: string, meta: {
  title?: string;
  department?: string;
  patientName?: string;
}): string {
  const dept = sanitizeSegment(meta.department || '未知科室');
  const ttl = sanitizeSegment(meta.title || '未命名');
  const patient = sanitizeSegment(meta.patientName || '未知患者');
  return `${timestamp}-${dept}-${ttl}-${patient}`;
}

/**
 * 根据原始文件名生成安全的存储文件名：原始名_时间戳_随机串.stl
 * 例如 spinal_fixator.stl → spinal_fixator_1776238413326_fpgbgg.stl
 */
function buildSafeFileName(originalName: string): string {
  const baseName = originalName.replace(/\.stl$/i, '');
  const safeBase = sanitizeSegment(baseName) || 'model';
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${safeBase}_${timestamp}_${randomStr}.stl`;
}

// 生产环境：使用对象存储
async function uploadToS3(
  file: File,
  folderPrefix: string,
): Promise<{ file_path: string }> {
  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '',
    secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });

  const buffer = Buffer.from(await file.arrayBuffer());

  const safeFileName = buildSafeFileName(file.name);

  // 结构化路径：stl/202604151503-骨科-脊柱模型-张三/spinal_fixator_1776238413326_fpgbgg.stl
  const s3Key = `stl/${folderPrefix}/${safeFileName}`;

  const actualKey = await storage.uploadFile({
    fileContent: buffer,
    fileName: s3Key,
    contentType: 'application/octet-stream',
  });

  // 返回 s3:// 前缀标记，便于加载时区分来源
  return { file_path: `s3://${actualKey}` };
}

// 开发环境：写入本地文件系统
async function uploadToLocal(
  file: File,
  folderPrefix: string,
): Promise<{ file_path: string }> {
  const safeFileName = buildSafeFileName(file.name);

  // 结构化路径：public/STL文件/202604151503-骨科-脊柱模型-张三/
  const uploadDir = path.join(process.cwd(), 'public', 'STL文件', folderPrefix);
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  const filePath = path.join(uploadDir, safeFileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const relativePath = `STL文件/${folderPrefix}/${safeFileName}`;
  return { file_path: relativePath };
}

/**
 * 从 file_path 提取文件夹路径
 * 本地：STL文件/202604151503-骨科-xxx/xxx.stl → STL文件/202604151503-骨科-xxx
 * S3：s3://stl/202604151503-骨科-xxx/xxx.stl → stl/202604151503-骨科-xxx
 */
function extractFolder(filePath: string): { folder: string; isS3: boolean } {
  if (filePath.startsWith('s3://')) {
    const key = filePath.slice(5); // stl/202604151503-骨科-xxx/xxx.stl
    const lastSlash = key.lastIndexOf('/');
    return { folder: lastSlash > 0 ? key.substring(0, lastSlash) : key, isS3: true };
  }
  const lastSlash = filePath.lastIndexOf('/');
  return { folder: lastSlash > 0 ? filePath.substring(0, lastSlash) : filePath, isS3: false };
}

// 生产环境：从 S3 删除文件，并清理空目录
async function deleteFromS3(filePath: string): Promise<boolean> {
  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '',
    secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });

  const s3Key = filePath.slice(5); // 去掉 s3://
  await storage.deleteFile({ fileKey: s3Key });

  // 检查目录下是否还有文件，没有则无需额外处理（S3 无真实目录）
  return true;
}

// 开发环境：删除本地文件，若目录为空则一并删除
async function deleteFromLocal(filePath: string): Promise<boolean> {
  const fullPath = path.join(process.cwd(), 'public', filePath);

  // 删除文件
  if (existsSync(fullPath)) {
    await unlink(fullPath);
  }

  // 尝试清理空目录
  const { folder } = extractFolder(filePath);
  const folderPath = path.join(process.cwd(), 'public', folder);
  if (existsSync(folderPath)) {
    try {
      const remaining = await readdir(folderPath);
      if (remaining.length === 0) {
        await rmdir(folderPath);
      }
    } catch {
      // 目录可能已被删除或不为空，忽略
    }
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '没有上传文件' },
        { status: 400 },
      );
    }

    // 验证文件类型
    if (!file.name.toLowerCase().endsWith('.stl')) {
      return NextResponse.json(
        { success: false, error: '只支持STL格式文件' },
        { status: 400 },
      );
    }

    // 从 formData 读取元数据，用于构建结构化目录
    const title = (formData.get('title') as string) || '';
    const department = (formData.get('department') as string) || '';
    const patientName = (formData.get('patientName') as string) || '';
    const folderPrefix = buildFolderPrefix({ title, department, patientName });

    // 根据环境选择上传方式
    const result = isProd
      ? await uploadToS3(file, folderPrefix)
      : await uploadToLocal(file, folderPrefix);

    return NextResponse.json({
      success: true,
      file_path: result.file_path,
      folder_prefix: folderPrefix,
      original_name: file.name,
    });
  } catch (error) {
    console.error('文件上传失败:', error);
    return NextResponse.json(
      { success: false, error: '文件上传失败' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/upload — 批量删除已上传的文件
 * 请求体：{ paths: string[] }，每项为 file_path（本地相对路径或 s3:// 前缀路径）
 * 删除文件后，若所在目录为空则一并清理
 */
export async function DELETE(request: NextRequest) {
  try {
    const { paths } = await request.json() as { paths: string[] };

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少要删除的文件路径' },
        { status: 400 },
      );
    }

    const errors: string[] = [];

    for (const filePath of paths) {
      try {
        if (filePath.startsWith('s3://')) {
          await deleteFromS3(filePath);
        } else {
          await deleteFromLocal(filePath);
        }
      } catch (err) {
        console.error(`删除文件失败: ${filePath}`, err);
        errors.push(filePath);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: `部分文件删除失败: ${errors.join(', ')}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('文件删除失败:', error);
    return NextResponse.json(
      { success: false, error: '文件删除失败' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/upload — 根据最新元数据重命名已上传文件的文件夹
 * 当用户上传文件后修改了页面标题/科室/患者姓名，提交时调用此接口同步文件夹名
 *
 * 请求体：
 * {
 *   file_paths: string[],        // 当前所有文件的路径
 *   title: string,               // 最新页面标题
 *   department: string,           // 最新科室
 *   patientName: string           // 最新患者姓名
 * }
 *
 * 响应：
 * {
 *   success: true,
 *   updated_paths: { 旧路径: 新路径, ... }  // 仅包含实际发生变化的文件
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { file_paths, title, department, patientName } = await request.json() as {
      file_paths: string[];
      title: string;
      department: string;
      patientName: string;
    };

    if (!Array.isArray(file_paths) || file_paths.length === 0) {
      return NextResponse.json({ success: true, updated_paths: {} });
    }

    const updatedPaths: Record<string, string> = {};

    // 按当前文件夹分组处理，避免同一目录反复创建/删除
    const processedFolders = new Map<string, string>(); // oldFolder -> newFolderName

    for (const oldPath of file_paths) {
      const { folder, isS3 } = extractFolder(oldPath);

      // 从 folder 中提取目录名部分
      // 本地: "STL文件/202604151516-骨科-旧标题-张三" → 目录名 = "202604151516-骨科-旧标题-张三"
      // S3:   "stl/202604151516-骨科-旧标题-张三"      → 目录名 = "202604151516-骨科-旧标题-张三"
      const folderParts = folder.split('/');
      const folderName = folderParts[folderParts.length - 1];

      // 提取时间戳（前12位数字）
      const timestampMatch = folderName.match(/^(\d{12})-/);
      const timestamp = timestampMatch ? timestampMatch[1] : null;

      if (!timestamp) {
        // 无法提取时间戳，跳过该文件
        continue;
      }

      // 用原始时间戳 + 最新元数据生成新目录名
      let newFolderName: string;
      const cacheKey = `${folder}|${timestamp}`;
      if (processedFolders.has(cacheKey)) {
        newFolderName = processedFolders.get(cacheKey)!;
      } else {
        newFolderName = buildFolderPrefixWithTimestamp(timestamp, { title, department, patientName });
        processedFolders.set(cacheKey, newFolderName);
      }

      // 目录名未变化，无需重命名
      if (folderName === newFolderName) {
        continue;
      }

      // 提取文件名
      const fileName = oldPath.split('/').pop()!;

      if (isS3) {
        // S3: 读取旧文件 → 上传到新路径 → 删除旧文件
        const oldS3Key = oldPath.slice(5); // 去掉 s3://
        const s3ParentDir = folderParts.slice(0, -1).join('/');
        const newS3Key = `${s3ParentDir}/${newFolderName}/${fileName}`;

        const storage = new S3Storage({
          endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
          accessKey: '',
          secretKey: '',
          bucketName: process.env.COZE_BUCKET_NAME,
          region: 'cn-beijing',
        });

        const data = await storage.readFile({ fileKey: oldS3Key });
        const actualKey = await storage.uploadFile({
          fileContent: Buffer.from(data),
          fileName: newS3Key,
          contentType: 'application/octet-stream',
        });
        await storage.deleteFile({ fileKey: oldS3Key });

        updatedPaths[oldPath] = `s3://${actualKey}`;
      } else {
        // 本地: 移动文件，清理空旧目录
        const oldFullPath = path.join(process.cwd(), 'public', oldPath);
        const localParentDir = folderParts.slice(0, -1).join('/');
        const newRelativeDir = `${localParentDir}/${newFolderName}`;
        const newFullPathDir = path.join(process.cwd(), 'public', newRelativeDir);

        // 确保新目录存在
        if (!existsSync(newFullPathDir)) {
          await mkdir(newFullPathDir, { recursive: true });
        }

        const newFullPath = path.join(newFullPathDir, fileName);
        await rename(oldFullPath, newFullPath);

        // 清理旧目录（如果为空）
        const oldDirFullPath = path.join(process.cwd(), 'public', folder);
        if (existsSync(oldDirFullPath)) {
          try {
            const remaining = await readdir(oldDirFullPath);
            if (remaining.length === 0) {
              await rmdir(oldDirFullPath);
            }
          } catch {
            // 目录可能已被删除或不为空，忽略
          }
        }

        const newRelativePath = `${newRelativeDir}/${fileName}`;
        updatedPaths[oldPath] = newRelativePath;
      }
    }

    return NextResponse.json({ success: true, updated_paths: updatedPaths });
  } catch (error) {
    console.error('文件夹重命名失败:', error);
    return NextResponse.json(
      { success: false, error: '文件夹重命名失败' },
      { status: 500 },
    );
  }
}
