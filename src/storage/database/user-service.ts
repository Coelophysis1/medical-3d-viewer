import { query, queryOne, insertAndGet, execute } from './db';
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
  const adminUsername = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  // 检查是否已存在
  const existing = await queryOne('SELECT id FROM users WHERE username = $1', [adminUsername]);

  if (existing) {
    return { success: true, message: '管理员账号已存在' };
  }

  // 创建管理员
  const passwordHash = await hashPassword(adminPassword);

  try {
    await execute(
      'INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, $3, $4)',
      [adminUsername, passwordHash, 'admin', 'active']
    );
    return { success: true, message: '管理员账号创建成功' };
  } catch (err) {
    return { success: false, message: `创建管理员失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// 初始化额外用户（从环境变量读取，格式: user1:pass1:role1,user2:pass2:role2）
const DEFAULT_INITIAL_USERS = 'doctor1:Doctor@123:doctor';
export async function initializeUsers(): Promise<{ success: boolean; message: string }> {
  const initialUsers = process.env.INITIAL_USERS || DEFAULT_INITIAL_USERS;
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
    const existing = await queryOne('SELECT id FROM users WHERE username = $1', [username]);

    if (existing) {
      results.push(`用户 ${username} 已存在`);
      continue;
    }

    const passwordHash = await hashPassword(password);

    try {
      await execute(
        'INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, $3, $4)',
        [username, passwordHash, role, 'active']
      );
      results.push(`创建 ${username} 成功`);
    } catch (err) {
      results.push(`创建 ${username} 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: true, message: results.join('; ') };
}

// 创建用户
export async function createUser(data: CreateUserData): Promise<{ success: boolean; user?: User; error?: string }> {
  // 检查用户名是否已存在
  const existing = await queryOne('SELECT id FROM users WHERE username = $1', [data.username]);

  if (existing) {
    return { success: false, error: '用户名已存在' };
  }

  const passwordHash = await hashPassword(data.password);

  try {
    const user = await insertAndGet<Record<string, unknown>>(
      `INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, $3, $4) RETURNING id, username, role, status, created_at, updated_at`,
      [data.username, passwordHash, data.role || 'doctor', 'active']
    );

    return { success: true, user: user as unknown as User };
  } catch (err) {
    return { success: false, error: `创建用户失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// 根据用户名获取用户（含密码哈希，用于登录验证）
export async function getUserByUsername(username: string): Promise<UserWithPassword | null> {
  return queryOne<UserWithPassword>(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );
}

// 根据ID获取用户
export async function getUserById(id: number): Promise<User | null> {
  return queryOne<User>(
    'SELECT id, username, role, status, created_at, updated_at FROM users WHERE id = $1',
    [id]
  );
}

// 获取所有用户
export async function getAllUsers(): Promise<User[]> {
  return query<User>(
    'SELECT id, username, role, status, created_at, updated_at FROM users ORDER BY created_at DESC'
  );
}

// 获取所有医生用户（用于日志筛选下拉）
export async function getDoctorUsers(): Promise<Array<{ id: number; username: string }>> {
  return query<{ id: number; username: string }>(
    "SELECT id, username FROM users WHERE role = 'doctor' ORDER BY username"
  );
}

// 更新用户
export async function updateUser(id: number, data: UpdateUserData): Promise<{ success: boolean; user?: User; error?: string }> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.password) {
    updates.push(`password_hash = $${paramIndex++}`);
    params.push(await hashPassword(data.password));
  }

  if (data.status) {
    updates.push(`status = $${paramIndex++}`);
    params.push(data.status);
  }

  updates.push(`updated_at = $${paramIndex++}`);
  params.push(new Date().toISOString());

  params.push(id);

  try {
    const user = await insertAndGet<Record<string, unknown>>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, role, status, created_at, updated_at`,
      params
    );

    return { success: true, user: user as unknown as User };
  } catch (err) {
    return { success: false, error: `更新用户失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// 删除用户
export async function deleteUser(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const affected = await execute('DELETE FROM users WHERE id = $1', [id]);
    if (affected === 0) {
      return { success: false, error: '用户不存在' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: `删除用户失败: ${err instanceof Error ? err.message : String(err)}` };
  }
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
  const { password_hash: _ph, ...userWithoutHash } = user;
  return { success: true, user: userWithoutHash as unknown as User };
}
