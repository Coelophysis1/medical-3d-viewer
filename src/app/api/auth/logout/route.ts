import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, getCurrentUser } from '@/lib/auth';
import { incrementTokenVersion } from '@/storage/database/user-service';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  // 使服务端 Token 失效：递增 token_version，旧 Token 验证不通过
  const user = await getCurrentUser(request);
  if (user) {
    try {
      await incrementTokenVersion(user.id);
    } catch {
      // 即使数据库更新失败，也继续清除 Cookie
    }
  }

  clearAuthCookie(response);
  return response;
}
