import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

let db: Database.Database | null = null;

const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'medical3d.db');

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  ensureDir(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initTables(db);
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'doctor',
      status TEXT NOT NULL DEFAULT 'active',
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS patients_phone_idx ON patients(phone);

    CREATE TABLE IF NOT EXISTS medical_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      patient_name TEXT,
      patient_phone TEXT,
      patient_gender TEXT,
      patient_age INTEGER,
      hospital TEXT,
      department TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS medical_configs_code_idx ON medical_configs(code);
    CREATE INDEX IF NOT EXISTS medical_configs_creator_id_idx ON medical_configs(creator_id);

    CREATE TABLE IF NOT EXISTS medical_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL REFERENCES medical_configs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      opacity INTEGER DEFAULT 100 NOT NULL,
      file_path TEXT NOT NULL,
      visible INTEGER DEFAULT 1 NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS medical_models_config_id_idx ON medical_models(config_id);

    CREATE TABLE IF NOT EXISTS delete_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      config_id INTEGER NOT NULL,
      config_code TEXT NOT NULL,
      config_title TEXT,
      patient_name TEXT,
      hospital TEXT,
      department TEXT,
      model_count INTEGER DEFAULT 0,
      deleted_files TEXT,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS delete_logs_operator_id_idx ON delete_logs(operator_id);
  `);

  // 迁移：为已存在的 users 表添加 token_version 列（如果不存在）
  try {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
  } catch {
    // 列已存在，忽略
  }
}

/**
 * 将 PostgreSQL 风格的 $1,$2 占位符转为 SQLite 的 ? 占位符
 */
function translateSql(sql: string): string {
  return sql.replace(/\$\d+/g, '?');
}

/**
 * 将 SQLite 行转为普通对象（去掉 row 包装）
 */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    result[key] = row[key];
  }
  return result;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const database = getDb();
  const translated = translateSql(text);
  const stmt = database.prepare(translated);
  const rows = params ? stmt.all(...params) : stmt.all();
  return (rows as Record<string, unknown>[]).map(r => normalizeRow(r)) as unknown as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function execute(
  text: string,
  params?: unknown[],
): Promise<number> {
  const database = getDb();
  const translated = translateSql(text);
  const stmt = database.prepare(translated);
  const result = params ? stmt.run(...params) : stmt.run();
  return result.changes;
}

export async function insertAndGet<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T> {
  const database = getDb();
  const translated = translateSql(text);
  const stmt = database.prepare(translated);
  const result = params ? stmt.run(...params) : stmt.run();

  const id = result.lastInsertRowid as number;
  if (id > 0) {
    // 取表名：INSERT INTO table_name ... → table_name
    const tableMatch = translated.match(/INSERT\s+INTO\s+"?(\w+)"?\s+/i);
    const tableName = tableMatch ? tableMatch[1] : null;
    if (tableName) {
      const row = database.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(id);
      return normalizeRow(row as Record<string, unknown>) as unknown as T;
    }
  }
  throw new Error('INSERT 未返回数据');
}

export async function transaction<T>(
  callback: (queryFn: typeof query) => Promise<T>,
): Promise<T> {
  const database = getDb();
  const txQuery = async <R = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<R[]> => {
    const translated = translateSql(text);
    const stmt = database.prepare(translated);
    const rows = params ? stmt.all(...params) : stmt.all();
    return (rows as Record<string, unknown>[]).map(r => normalizeRow(r)) as R[];
  };

  try {
    database.prepare('BEGIN').run();
    const result = await callback(txQuery);
    database.prepare('COMMIT').run();
    return result;
  } catch (err) {
    database.prepare('ROLLBACK').run();
    throw err;
  }
}
