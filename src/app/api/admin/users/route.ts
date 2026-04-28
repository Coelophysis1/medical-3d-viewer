import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { getAllUsers, createUser } from '@/storage/database/user-service';
import type { UserRole } from '@/storage/database/user-service';

// GET: 获取所有用户列表
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  
  if (!authResult.success) {
    if (authResult.error === '无管理员权限') {
      return forbiddenResponse(authResult.error);
    }
    return unauthorizedResponse(authResult.error);
  }
  
  try {
    const users = await getAllUsers();
    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { success: false, error: '获取用户列表失败' },
      { status: 500 }
    );
  }
}

// POST: 创建新用户
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  
  if (!authResult.success) {
    if (authResult.error === '无管理员权限') {
      return forbiddenResponse(authResult.error);
    }
    return unauthorizedResponse(authResult.error);
  }
  
  try {
    const body = await request.json();
    const { username, password, role } = body;
    
    // 参数校验
    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json(
        { success: false, error: '请输入用户名' },
        { status: 400 }
      );
    }
    
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { success: false, error: '密码长度至少6位' },
        { status: 400 }
      );
    }
    
    if (role && !['admin', 'doctor'].includes(role)) {
      return NextResponse.json(
        { success: false, error: '无效的角色类型' },
        { status: 400 }
      );
    }
    
    const result = await createUser({
      username: username.trim(),
      password,
      role: role as UserRole,
    });
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true, user: result.user });
    
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { success: false, error: '创建用户失败' },
      { status: 500 }
    );
  }
}
