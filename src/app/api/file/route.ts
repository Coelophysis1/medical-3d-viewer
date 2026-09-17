import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * GET /api/file?key=uploads/stl/xxx/xxx.stl
 * 从本地文件系统读取上传的文件并返回原始内容
 * 注意：此接口不加 requireAuth，因为患者通过 /view 页面访问时无登录态。
 * 安全靠路径白名单（仅允许 uploads/stl/ 前缀）+ 路径遍历防护保障。
 */
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { success: false, error: '缺少文件key参数' },
        { status: 400 }
      );
    }

    // 安全检查1: 只允许 uploads/stl/ 前缀的路径
    if (!key.startsWith('uploads/stl/')) {
      return NextResponse.json(
        { success: false, error: '非法的文件路径' },
        { status: 403 }
      );
    }

    // 安全检查2: 严格的路径遍历防护（使用 resolve 消除 ../）
    const publicDir = path.resolve(process.cwd(), 'public');
    const targetPath = path.resolve(publicDir, key);

    // 确保 resolve 后的路径仍在 public/uploads/stl/ 目录内
    const allowedBase = path.resolve(publicDir, 'uploads', 'stl') + path.sep;
    if (!targetPath.startsWith(allowedBase)) {
      return NextResponse.json(
        { success: false, error: '非法的文件路径' },
        { status: 403 }
      );
    }

    try {
      const data = await fs.readFile(targetPath);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'private, no-cache',
        },
      });
    } catch {
      return NextResponse.json(
        { success: false, error: '文件不存在' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('获取文件失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文件失败' },
      { status: 500 }
    );
  }
}
