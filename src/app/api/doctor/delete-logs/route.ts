import { NextRequest, NextResponse } from 'next/server';
import { getDoctorDeleteLogs } from '@/storage/database/medical-service';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // 验证登录状态
    const authResult = await requireAuth(request);

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || '请先登录' },
        { status: 401 }
      );
    }

    const result = await getDoctorDeleteLogs(authResult.user.id);

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
    console.error('Get delete logs error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
