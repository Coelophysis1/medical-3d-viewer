import { getSupabaseClient } from './supabase-client';
import type { User, InsertUser } from './shared/schema';

export type UserRole = 'admin' | 'doctor';
export type UserStatus = 'active' | 'disabled';

export interface UserWithPassword extends User {
  password_hash: string;
}

export interface CreateUserData {
  username: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserData {
  password?: string;
  status?: UserStatus;
}

// 密码哈希（服务端使用 bcrypt）
async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(password, 10);
}

// 验证密码
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcrypt');
  return bcrypt.compare(password, hash);
}

// 初始化管理员账号（从环境变量读取，未配置则使用默认值）
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'Admin@123456';
export async function initializeAdmin(): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  
  const adminUsername = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  
  // 检查是否已存在
  const { data: existing } = await client
    .from('users')
    .select('id')
    .eq('username', adminUsername)
    .maybeSingle();
  
  if (existing) {
    return { success: true, message: '管理员账号已存在' };
  }
  
  // 创建管理员
  const passwordHash = await hashPassword(adminPassword);
  
  const { error } = await client
    .from('users')
    .insert({
      username: adminUsername,
      password_hash: passwordHash,
      role: 'admin',
      status: 'active',
    });
  
  if (error) {
    return { success: false, message: `创建管理员失败: ${error.message}` };
  }
  
  return { success: true, message: '管理员账号创建成功' };
}

// 初始化额外用户（从环境变量读取，格式: user1:pass1:role1,user2:pass2:role2）
// 例如: INITIAL_USERS=doctor1:Doctor@123:doctor,doctor2:Doctor@456:doctor
// 如果环境变量未配置，使用默认值
const DEFAULT_INITIAL_USERS = 'doctor1:Doctor@123:doctor';
export async function initializeUsers(): Promise<{ success: boolean; message: string }> {
  const initialUsers = process.env.INITIAL_USERS || DEFAULT_INITIAL_USERS;
  
  const client = getSupabaseClient();
  const results: string[] = [];
  
  const userEntries = initialUsers.split(',').map(s => s.trim()).filter(Boolean);
  
  for (const entry of userEntries) {
    const parts = entry.split(':');
    if (parts.length < 2) {
      results.push(`跳过无效格式: ${entry}`);
      continue;
    }
    
    const username = parts[0].trim();
    const password = parts[1].trim();
    const role = (parts[2] || 'doctor').trim();
    
    if (!['admin', 'doctor'].includes(role)) {
      results.push(`跳过无效角色 ${role} for ${username}`);
      continue;
    }
    
    // 检查是否已存在
    const { data: existing } = await client
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    
    if (existing) {
      results.push(`用户 ${username} 已存在`);
      continue;
    }
    
    const passwordHash = await hashPassword(password);
    
    const { error } = await client
      .from('users')
      .insert({
        username,
        password_hash: passwordHash,
        role,
        status: 'active',
      });
    
    if (error) {
      results.push(`创建 ${username} 失败: ${error.message}`);
    } else {
      results.push(`创建 ${username} 成功`);
    }
  }
  
  return { success: true, message: results.join('; ') };
}

// 创建用户
export async function createUser(data: CreateUserData): Promise<{ success: boolean; user?: User; error?: string }> {
  const client = getSupabaseClient();
  
  // 检查用户名是否已存在
  const { data: existing } = await client
    .from('users')
    .select('id')
    .eq('username', data.username)
    .maybeSingle();
  
  if (existing) {
    return { success: false, error: '用户名已存在' };
  }
  
  const passwordHash = await hashPassword(data.password);
  
  const { data: user, error } = await client
    .from('users')
    .insert({
      username: data.username,
      password_hash: passwordHash,
      role: data.role || 'doctor',
      status: 'active',
    })
    .select()
    .single();
  
  if (error) {
    return { success: false, error: `创建用户失败: ${error.message}` };
  }
  
  // 不返回 password_hash
  const { password_hash, ...userWithoutHash } = user;
  return { success: true, user: userWithoutHash as User };
}

// 根据用户名获取用户（含密码哈希，用于登录验证）
export async function getUserByUsername(username: string): Promise<UserWithPassword | null> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  return data as UserWithPassword;
}

// 根据ID获取用户
export async function getUserById(id: number): Promise<User | null> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('users')
    .select('id, username, role, status, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  return data as User;
}

// 获取所有用户
export async function getAllUsers(): Promise<User[]> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('users')
    .select('id, username, role, status, created_at, updated_at')
    .order('created_at', { ascending: false });
  
  if (error) {
    return [];
  }
  
  return data as User[];
}

// 更新用户
export async function updateUser(id: number, data: UpdateUserData): Promise<{ success: boolean; user?: User; error?: string }> {
  const client = getSupabaseClient();
  
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  
  if (data.password) {
    updateData.password_hash = await hashPassword(data.password);
  }
  
  if (data.status) {
    updateData.status = data.status;
  }
  
  const { data: user, error } = await client
    .from('users')
    .update(updateData)
    .eq('id', id)
    .select('id, username, role, status, created_at, updated_at')
    .single();
  
  if (error) {
    return { success: false, error: `更新用户失败: ${error.message}` };
  }
  
  return { success: true, user: user as User };
}

// 删除用户
export async function deleteUser(id: number): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  
  const { error } = await client
    .from('users')
    .delete()
    .eq('id', id);
  
  if (error) {
    return { success: false, error: `删除用户失败: ${error.message}` };
  }
  
  return { success: true };
}

// 用户登录验证
export async function authenticateUser(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  const user = await getUserByUsername(username);
  
  if (!user) {
    return { success: false, error: '用户名或密码错误' };
  }
  
  if (user.status === 'disabled') {
    return { success: false, error: '账号已被禁用' };
  }
  
  const isValid = await verifyPassword(password, user.password_hash);
  
  if (!isValid) {
    return { success: false, error: '用户名或密码错误' };
  }
  
  // 不返回 password_hash
  const { password_hash, ...userWithoutHash } = user;
  return { success: true, user: userWithoutHash as User };
}
