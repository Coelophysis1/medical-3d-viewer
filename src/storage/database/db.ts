import { Pool, PoolConfig, QueryResultRow } from 'pg';

// 数据库连接池（单例）
let pool: Pool | null = null;

/**
 * 获取数据库连接池
 * 
 * 环境变量：
 * - DATABASE_URL: PostgreSQL 连接字符串（优先使用）
 *   格式: postgresql://user:password@host:port/database
 * - 或者单独配置:
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 */
export function getPool(): Pool {
  if (pool) return pool;

  const config: PoolConfig = {};

  const databaseUrl = process.env.DATABASE_URL || process.env.PGDATABASE_URL;
  if (databaseUrl) {
    config.connectionString = databaseUrl;
  } else {
    config.host = process.env.DB_HOST || 'localhost';
    config.port = parseInt(process.env.DB_PORT || '5432', 10);
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASSWORD || '';
    config.database = process.env.DB_NAME || 'medical_3d';
  }

  config.max = 20;           // 最大连接数
  config.idleTimeoutMillis = 30000;  // 空闲连接超时 30s
  config.connectionTimeoutMillis = 5000;  // 连接超时 5s

  pool = new Pool(config);

  pool.on('error', (err) => {
    console.error('数据库连接池异常:', err.message);
  });

  return pool;
}

/**
 * 执行 SQL 查询，返回结果行
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/**
 * 执行 SQL 查询，返回单行结果（或 null）
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 执行 SQL 命令（INSERT/UPDATE/DELETE），返回影响行数
 */
export async function execute(
  text: string,
  params?: unknown[],
): Promise<number> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result.rowCount ?? 0;
}

/**
 * 执行 INSERT 并返回生成的行
 */
export async function insertAndGet<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T> {
  const pool = getPool();
  const result = await pool.query<T>(text, params);
  if (result.rows.length === 0) {
    throw new Error('INSERT 未返回数据，请确认 SQL 包含 RETURNING *');
  }
  return result.rows[0];
}

/**
 * 在事务中执行回调
 */
export async function transaction<T>(
  callback: (queryFn: typeof query) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const txQuery = async <R extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<R[]> => {
      const result = await client.query<R>(text, params);
      return result.rows;
    };
    
    const result = await callback(txQuery);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
