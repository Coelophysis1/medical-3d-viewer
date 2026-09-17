import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, unlink, rmdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';

// 临时分块存储目录（跨平台兼容）
const CHUNK_DIR = path.join(os.tmpdir(), 'upload-chunks');

/**
 * 将中文/特殊字符替换为安全字符
 */
function sanitizeSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[^\w\u4e00-\u9fff\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'unknown';
}

/**
 * 根据元数据生成结构化目录名
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
 * 根据原始文件名生成安全的存储文件名
 */
function buildSafeFileName(originalName: string): string {
  const baseName = originalName.replace(/\.stl$/i, '');
  const safeBase = sanitizeSegment(baseName) || 'model';
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${safeBase}_${timestamp}_${randomStr}.stl`;
}

/**
 * POST /api/upload/chunk
 * 上传单个分块
 * FormData: chunk (Blob), uploadId (string), chunkIndex (number)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) return unauthorizedResponse(authResult.error);

    const formData = await request.formData();
    const chunk = formData.get('chunk') as Blob | null;
    const uploadId = formData.get('uploadId') as string | null;

    if (!chunk || !uploadId) {
      return NextResponse.json(
        { success: false, error: '缺少分块数据或上传ID' },
        { status: 400 },
      );
    }

    // 确保上传ID安全（防止路径遍历）
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUploadId) {
      return NextResponse.json(
        { success: false, error: '无效的上传ID' },
        { status: 400 },
      );
    }

    // 创建临时目录
    const chunkDir = path.join(CHUNK_DIR, safeUploadId);
    if (!existsSync(chunkDir)) {
      await mkdir(chunkDir, { recursive: true });
    }

    // 保存分块
    const chunkIndex = formData.get('chunkIndex') as string | '0';
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    const chunkPath = path.join(chunkDir, `chunk_${chunkIndex.padStart(6, '0')}`);
    await writeFile(chunkPath, chunkBuffer);

    return NextResponse.json({
      success: true,
      chunkIndex: parseInt(chunkIndex, 10),
    });
  } catch (error) {
    console.error('分块上传失败:', error);
    return NextResponse.json(
      { success: false, error: '分块上传失败' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/upload/chunk
 * 完成分块上传，将所有分块合并并存储到最终位置
 * JSON: { uploadId, totalChunks, fileName, title, department, patientName }
 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) return unauthorizedResponse(authResult.error);

    const { uploadId, totalChunks, fileName, title, department, patientName } =
      await request.json() as {
        uploadId: string;
        totalChunks: number;
        fileName: string;
        title: string;
        department: string;
        patientName: string;
      };

    if (!uploadId || !totalChunks || !fileName) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 },
      );
    }

    // 安全检查上传ID
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUploadId) {
      return NextResponse.json(
        { success: false, error: '无效的上传ID' },
        { status: 400 },
      );
    }

    const chunkDir = path.join(CHUNK_DIR, safeUploadId);

    if (!existsSync(chunkDir)) {
      return NextResponse.json(
        { success: false, error: '分块目录不存在，请重新上传' },
        { status: 400 },
      );
    }

    // 验证所有分块是否完整
    const chunkFiles = await readdir(chunkDir);
    if (chunkFiles.length !== totalChunks) {
      return NextResponse.json(
        { success: false, error: `分块不完整：期望 ${totalChunks} 块，实际 ${chunkFiles.length} 块` },
        { status: 400 },
      );
    }

    // 排序分块文件名
    chunkFiles.sort();

    // 生成最终文件名和路径
    const safeFileName = buildSafeFileName(fileName);
    const folderPrefix = buildFolderPrefix({ title, department, patientName });

    // 合并后写入本地
    const filePath = await assembleAndSaveLocal(chunkDir, chunkFiles, safeFileName, folderPrefix);

    // 清理临时分块
    try {
      for (const f of chunkFiles) {
        await unlink(path.join(chunkDir, f));
      }
      await rmdir(chunkDir);
    } catch {
      // 清理失败不影响主流程
    }

    return NextResponse.json({
      success: true,
      file_path: filePath,
      folder_prefix: folderPrefix,
      original_name: fileName,
    });
  } catch (error) {
    console.error('分块合并失败:', error);
    return NextResponse.json(
      { success: false, error: '分块合并失败' },
      { status: 500 },
    );
  }
}

/**
 * 将分块合并后写入本地文件
 */
async function assembleAndSaveLocal(
  chunkDir: string,
  chunkFiles: string[],
  safeFileName: string,
  folderPrefix: string,
): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'stl', folderPrefix);
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  const finalPath = path.join(uploadDir, safeFileName);

  // 依次将每个分块追加写入最终文件
  for (let i = 0; i < chunkFiles.length; i++) {
    const chunkFile = chunkFiles[i];
    const chunkPath = path.join(chunkDir, chunkFile);
    const chunkData = await readFile(chunkPath);

    // 追加写入：第一次创建文件，后续追加
    if (i === 0) {
      await writeFile(finalPath, chunkData);
    } else {
      const { appendFile } = await import('fs/promises');
      await appendFile(finalPath, chunkData);
    }
  }

  return `uploads/stl/${folderPrefix}/${safeFileName}`;
}

/**
 * DELETE /api/upload/chunk
 * 取消/清理分块上传
 * JSON: { uploadId }
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult.success) return unauthorizedResponse(authResult.error);

    const { uploadId } = await request.json() as { uploadId: string };

    if (!uploadId) {
      return NextResponse.json(
        { success: false, error: '缺少上传ID' },
        { status: 400 },
      );
    }

    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
    const chunkDir = path.join(CHUNK_DIR, safeUploadId);

    if (existsSync(chunkDir)) {
      const files = await readdir(chunkDir);
      for (const f of files) {
        await unlink(path.join(chunkDir, f));
      }
      await rmdir(chunkDir);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('清理分块失败:', error);
    return NextResponse.json(
      { success: false, error: '清理分块失败' },
      { status: 500 },
    );
  }
}
