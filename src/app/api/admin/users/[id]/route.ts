import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { updateUser, deleteUser } from '@/storage/database/user-service';
import type { UserStatus } from '@/storage/database/user-service';

// PATCH: 更新用户（重置密码、禁用/启用）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin(request);
  
  if (!authResult.success) {
    if (authResult.error === '无管理员权限') {
      return forbiddenResponse(authResult.error);
    }
    return unauthorizedResponse(authResult.error);
  }
  
  try {
    const { id } = await params;
    const userId = parseInt(id, 10);
    
    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: '无效的用户ID' },
        { status: 400 }
      );
    }
    
    // 不允许管理员禁用或删除自己
    if (userId === authResult.user!.id) {
      return NextResponse.json(
        { success: false, error: '不能修改自己的账号' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const { password, status } = body;
    
    // 参数校验
    if (password && typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: '密码格式无效' },
        { status: 400 }
      );
    }
    
    if (password && password.length < 6) {
      return NextResponse.json(
        { success: false, error: '密码长度至少6位' },
        { status: 400 }
      );
    }
    
    if (status && !['active', 'disabled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: '无效的状态' },
        { status: 400 }
      );
    }
    
    if (!password && !status) {
      return NextResponse.json(
        { success: false, error: '没有要更新的内容' },
        { status: 400 }
      );
    }
    
    const result = await updateUser(userId, {
      password: password || undefined,
      status: status as UserStatus | undefined,
    });
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true, user: result.user });
    
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { success: false, error: '更新用户失败' },
      { status: 500 }
    );
  }
}

// DELETE: 删除用户
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin(request);
  
  if (!authResult.success) {
    if (authResult.error === '无管理员权限') {
      return forbiddenResponse(authResult.error);
    }
    return unauthorizedResponse(authResult.error);
  }
  
  try {
    const { id } = await params;
    const userId = parseInt(id, 10);
    
    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: '无效的用户ID' },
        { status: 400 }
      );
    }
    
    // 不允许管理员删除自己
    if (userId === authResult.user!.id) {
      return NextResponse.json(
        { success: false, error: '不能删除自己的账号' },
        { status: 400 }
      );
    }
    
    const result = await deleteUser(userId);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { success: false, error: '删除用户失败' },
      { status: 500 }
    );
  }
}
