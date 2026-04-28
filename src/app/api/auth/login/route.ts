import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, initializeAdmin, initializeUsers } from '@/storage/database/user-service';
import { signToken, setAuthCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // 初始化管理员账号和额外用户（如果环境变量配置了）
    await initializeAdmin();
    await initializeUsers();
    
    const body = await request.json();
    const { username, password } = body;
    
    // 参数校验
    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json(
        { success: false, error: '请输入用户名' },
        { status: 400 }
      );
    }
    
    if (!password || typeof password !== 'string' || password.trim() === '') {
      return NextResponse.json(
        { success: false, error: '请输入密码' },
        { status: 400 }
      );
    }
    
    // 验证用户
    const result = await authenticateUser(username.trim(), password);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }
    
    const user = result.user!;
    
    // 签发 JWT
    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role as 'admin' | 'doctor',
    });
    
    // 创建响应并设置 Cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
    
    setAuthCookie(response, token);
    
    return response;
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: '登录失败，请稍后重试' },
      { status: 500 }
    );
  }
}
