import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink, rmdir, readdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';

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
 */
function buildSafeFileName(originalName: string): string {
  const baseName = originalName.replace(/\.stl$/i, '');
  const safeBase = sanitizeSegment(baseName) || 'model';
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${safeBase}_${timestamp}_${randomStr}.stl`;
}

// 写入本地文件系统
async function uploadFile(
  file: File,
  folderPrefix: string,
): Promise<{ file_path: string }> {
  const safeFileName = buildSafeFileName(file.name);

  // 结构化路径：public/uploads/stl/202604151503-骨科-脊柱模型-张三/
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'stl', folderPrefix);
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  const filePath = path.join(uploadDir, safeFileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const relativePath = `uploads/stl/${folderPrefix}/${safeFileName}`;
  return { file_path: relativePath };
}

/**
 * 从 file_path 提取文件夹路径
 */
function extractFolder(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : filePath;
}

// 删除本地文件，若目录为空则一并删除
async function deleteLocalFile(filePath: string): Promise<boolean> {
  const fullPath = path.join(process.cwd(), 'public', filePath);

  // 删除文件
  if (existsSync(fullPath)) {
    await unlink(fullPath);
  }

  // 尝试清理空目录
  const folder = extractFolder(filePath);
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
    const authResult = await requireAuth(request);
    if (!authResult.success) return unauthorizedResponse(authResult.error);

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

    const result = await uploadFile(file, folderPrefix);

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
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) return unauthorizedResponse(authResult.error);

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
        await deleteLocalFile(filePath);
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
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) return unauthorizedResponse(authResult.error);

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
      const folder = extractFolder(oldPath);

      const folderParts = folder.split('/');
      const folderName = folderParts[folderParts.length - 1];

      // 提取时间戳（前12位数字）
      const timestampMatch = folderName.match(/^(\d{12})-/);
      const timestamp = timestampMatch ? timestampMatch[1] : null;

      if (!timestamp) {
        continue;
      }

      let newFolderName: string;
      const cacheKey = `${folder}|${timestamp}`;
      if (processedFolders.has(cacheKey)) {
        newFolderName = processedFolders.get(cacheKey)!;
      } else {
        newFolderName = buildFolderPrefixWithTimestamp(timestamp, { title, department, patientName });
        processedFolders.set(cacheKey, newFolderName);
      }

      if (folderName === newFolderName) {
        continue;
      }

      const fileName = oldPath.split('/').pop()!;

      // 本地重命名
      const oldFullPath = path.join(process.cwd(), 'public', oldPath);
      const localParentDir = folderParts.slice(0, -1).join('/');
      const newRelativeDir = `${localParentDir}/${newFolderName}`;
      const newFullPathDir = path.join(process.cwd(), 'public', newRelativeDir);

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

    return NextResponse.json({ success: true, updated_paths: updatedPaths });
  } catch (error) {
    console.error('文件夹重命名失败:', error);
    return NextResponse.json(
      { success: false, error: '文件夹重命名失败' },
      { status: 500 },
    );
  }
}
