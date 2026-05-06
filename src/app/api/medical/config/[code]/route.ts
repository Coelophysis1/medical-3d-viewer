import { NextRequest, NextResponse } from 'next/server';
import { getMedicalConfig, deleteMedicalConfig } from '@/storage/database/medical-service';
import { requireAuth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    
    if (!code || typeof code !== 'string' || code.trim() === '') {
      return NextResponse.json(
        { success: false, error: '缺少访问码参数' },
        { status: 400 }
      );
    }
    
    const result = await getMedicalConfig(code.trim());
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: result.data,
    });
    
  } catch (error) {
    console.error('Get config error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code || typeof code !== 'string' || code.trim() === '') {
      return NextResponse.json(
        { success: false, error: '缺少访问码参数' },
        { status: 400 }
      );
    }

    // 验证登录状态
    const authResult = await requireAuth(request);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || '请先登录' },
        { status: 401 }
      );
    }

    // 先获取配置以确认存在且拿到 configId
    const configResult = await getMedicalConfig(code.trim());
    if (!configResult.success || !configResult.data) {
      return NextResponse.json(
        { success: false, error: configResult.error || '配置不存在' },
        { status: 404 }
      );
    }

    const configId = configResult.data.id;
    if (!configId) {
      return NextResponse.json(
        { success: false, error: '配置ID无效' },
        { status: 400 }
      );
    }

    const result = await deleteMedicalConfig(
      configId,
      authResult.user.id,
      authResult.user.username,
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete config error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
