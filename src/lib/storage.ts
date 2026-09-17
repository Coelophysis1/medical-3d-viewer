import { promises as fs } from 'fs';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * 确保上传目录存在
 */
export async function ensureUploadDir(subPath?: string): Promise<string> {
  const dir = subPath ? path.join(UPLOAD_DIR, subPath) : UPLOAD_DIR;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 保存文件到本地文件系统
 */
export async function saveFile(filePath: string, buffer: Buffer): Promise<void> {
  const fullPath = path.join(UPLOAD_DIR, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
}

/**
 * 创建文件读取流
 */
export function readFileStream(filePath: string) {
  const fullPath = path.join(UPLOAD_DIR, filePath);
  return createReadStream(fullPath);
}

/**
 * 读取文件内容为 Buffer
 */
export async function readFile(filePath: string): Promise<Buffer> {
  const fullPath = path.join(UPLOAD_DIR, filePath);
  return await fs.readFile(fullPath);
}

/**
 * 通过可写流写入文件 (用于流式合并)
 */
export function writeFileStream(filePath: string) {
  const fullPath = path.join(UPLOAD_DIR, filePath);
  return createWriteStream(fullPath);
}

/**
 * 删除文件
 */
export async function deleteFile(filePath: string): Promise<void> {
  const fullPath = path.join(UPLOAD_DIR, filePath);
  try {
    await fs.unlink(fullPath);
  } catch {
    // 文件不存在, 忽略
  }
}

/**
 * 删除文件夹 (递归)
 */
export async function deleteFolder(folderPath: string): Promise<void> {
  const fullPath = path.join(UPLOAD_DIR, folderPath);
  try {
    await fs.rm(fullPath, { recursive: true, force: true });
  } catch {
    // 目录不存在, 忽略
  }
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  const fullPath = path.join(UPLOAD_DIR, filePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 列出目录内容
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  const fullPath = path.join(UPLOAD_DIR, dirPath);
  try {
    return await fs.readdir(fullPath);
  } catch {
    return [];
  }
}
