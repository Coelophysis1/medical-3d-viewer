import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { getUserById } from '@/storage/database/user-service';
import type { User } from '@/storage/database/shared/schema';

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'token';
const TOKEN_EXPIRES_IN = '7d'; // 7天过期

// JWT Payload 类型（兼容 jose 的 JWTPayload）
export interface JWTPayload {
  userId: number;
  username: string;
  role: 'admin' | 'doctor';
  [key: string]: unknown; // 添加索引签名以兼容 jose
}

// 获取 JWT 密钥（Uint8Array 格式）
function getSecretKey(): Uint8Array {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET 环境变量未配置');
  }
  return new TextEncoder().encode(JWT_SECRET);
}

// 签发 JWT Token
export async function signToken(payload: JWTPayload): Promise<string> {
  const secretKey = getSecretKey();
  
  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRES_IN)
    .sign(secretKey);
  
  return token;
}

// 验证 JWT Token
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// 从请求中获取当前用户
export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  
  if (!token) {
    return null;
  }
  
  const payload = await verifyToken(token);
  
  if (!payload) {
    return null;
  }
  
  const user = await getUserById(payload.userId);
  
  return user;
}

// 认证结果类型
export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

// 登录验证中间件（用于保护需要登录的页面/API）
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const user = await getCurrentUser(request);
  
  if (!user) {
    return { success: false, error: '未登录' };
  }
  
  if (user.status === 'disabled') {
    return { success: false, error: '账号已被禁用' };
  }
  
  return { success: true, user };
}

// 管理员权限验证中间件
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const authResult = await requireAuth(request);
  
  if (!authResult.success) {
    return authResult;
  }
  
  if (authResult.user!.role !== 'admin') {
    return { success: false, error: '无管理员权限' };
  }
  
  return authResult;
}

// 设置登录 Cookie
export function setAuthCookie(response: NextResponse, token: string): void {
  // 使用 SameSite=None + Partitioned 以支持 iframe 环境（如 Coze 预览）
  // 参考文档: https://developer.chrome.com/docs/privacy-sandbox/chips/
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,  // 必须为 true 才能使用 SameSite=None
    sameSite: 'none',  // 允许跨站请求（iframe 场景）
    partitioned: true,  // CHIPS: 独立分区存储，支持 iframe
    maxAge: 7 * 24 * 60 * 60, // 7天
    path: '/',
  });
}

// 清除登录 Cookie
export function clearAuthCookie(response: NextResponse): void {
  response.cookies.delete(COOKIE_NAME);
}

// 生成未登录的 JSON 响应
export function unauthorizedResponse(error: string = '未登录'): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status: 401 }
  );
}

// 生成无权限的 JSON 响应
export function forbiddenResponse(error: string = '无权限'): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status: 403 }
  );
}
