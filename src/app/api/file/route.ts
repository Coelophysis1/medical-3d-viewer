import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

// GET /api/file?key=s3://xxx — 从对象存储读取文件并返回内容
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { success: false, error: '缺少文件key参数' },
        { status: 400 }
      );
    }

    // 去除 s3:// 前缀
    const s3Key = key.startsWith('s3://') ? key.slice(5) : key;

    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    // 直接读取文件内容并返回，避免CORS和重定向问题
    const data = await storage.readFile({ fileKey: s3Key });

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('获取文件失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文件失败' },
      { status: 500 }
    );
  }
}
