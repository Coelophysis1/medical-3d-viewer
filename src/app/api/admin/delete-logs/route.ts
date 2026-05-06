import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { getAllDeleteLogs } from '@/storage/database/medical-service';

// GET: 获取所有删除日志（管理员权限，支持按操作者筛选）
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);

  if (!authResult.success) {
    if (authResult.error === '无管理员权限') {
      return forbiddenResponse(authResult.error);
    }
    return unauthorizedResponse(authResult.error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const operatorId = searchParams.get('operator_id');
    const result = await getAllDeleteLogs(operatorId ? parseInt(operatorId, 10) : undefined);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('Get all delete logs error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
