import { NextRequest, NextResponse } from 'next/server';

// ==============================
// 管理后台 IP 白名单
// ==============================
// 环境变量: ADMIN_IP_WHITELIST=127.0.0.1,192.168.1.0/24,10.0.0.0/8
// 未配置则不限制（允许所有 IP 访问）

function isIpInCidr(ip: string, cidr: string): boolean {
  const [network, prefixLenStr] = cidr.split('/');
  const prefixLen = parseInt(prefixLenStr, 10);

  if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;

  const ipNum = ipToInt(ip);
  const networkNum = ipToInt(network);

  if (ipNum === null || networkNum === null) return false;

  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipNum & mask) === (networkNum & mask);
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) + num;
  }
  return result >>> 0;
}

function isIpAllowed(ip: string, whitelist: string[]): boolean {
  for (const entry of whitelist) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    if (trimmed.includes('/')) {
      if (isIpInCidr(ip, trimmed)) return true;
    } else {
      if (ip === trimmed) return true;
    }
  }
  return false;
}

function getClientIp(request: NextRequest): string {
  // 依次检查反向代理头
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',');
    return ips[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return '127.0.0.1'; // 兜底
}

// ==============================
// 登录频率限制（基于 IP）
// ==============================
// 环境变量: LOGIN_RATE_LIMIT=5/60  (5次/60秒，默认)
// 格式: <次数>/<秒数>

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const limitStr = process.env.LOGIN_RATE_LIMIT || '5/60';
  const [maxAttemptsStr, windowSecondsStr] = limitStr.split('/');
  const maxAttempts = parseInt(maxAttemptsStr, 10) || 5;
  const windowSeconds = parseInt(windowSecondsStr, 10) || 60;

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, retryAfter: 0 };
}

// 定期清理过期的频率限制记录（每5分钟）
if (typeof globalThis !== 'undefined') {
  const cleanup = globalThis as Record<string, unknown>;
  if (!cleanup.__rateLimitCleanupTimer) {
    cleanup.__rateLimitCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of rateLimitMap.entries()) {
        if (now > (entry as { resetAt: number }).resetAt) {
          rateLimitMap.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }
}

// ==============================
// Next.js Middleware
// ==============================

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 管理后台 IP 白名单
  const adminPaths = ['/admin', '/api/admin'];
  const isAdminPath = adminPaths.some(p => pathname.startsWith(p));

  if (isAdminPath) {
    const whitelistStr = process.env.ADMIN_IP_WHITELIST;
    if (whitelistStr) {
      const whitelist = whitelistStr.split(',').filter(Boolean);
      const clientIp = getClientIp(request);

      if (!isIpAllowed(clientIp, whitelist)) {
        // API 请求返回 JSON 错误
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { success: false, error: '访问被拒绝：IP 地址不在白名单中' },
            { status: 403 }
          );
        }
        // 页面请求重定向到首页
        return NextResponse.redirect(new URL('/?error=ip_forbidden', request.url));
      }
    }
  }

  // 2. 登录接口频率限制
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const clientIp = getClientIp(request);
    const { allowed, retryAfter } = checkRateLimit(clientIp);

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: `登录尝试过于频繁，请 ${retryAfter} 秒后再试` },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/auth/login',
  ],
};
