import { query, queryOne, insertAndGet } from './db';

export interface Patient {
  id: number;
  name: string;
  phone: string;
  created_at: string;
}

export interface PatientConfig {
  id: number;
  code: string;
  title: string;
  hospital: string | null;
  department: string | null;
  patient_id: number | null;
  created_at: string;
  models: Array<{
    id: number;
    name: string;
  }>;
}

// 创建或获取患者（根据姓名+手机号）
export async function getOrCreatePatient(name: string, phone: string): Promise<Patient> {
  // 先查找是否存在
  const existing = await queryOne<Patient>(
    'SELECT * FROM patients WHERE name = $1 AND phone = $2',
    [name, phone]
  );

  if (existing) {
    return existing;
  }

  // 不存在则创建（带重试，处理并发或序列不同步导致的主键冲突）
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const newPatient = await insertAndGet<Patient>(
        'INSERT INTO patients (name, phone) VALUES ($1, $2) RETURNING *',
        [name, phone]
      );
      return newPatient;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 主键冲突（序列不同步或并发插入）
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        // 并发插入同一条记录：重新查询即可
        const retryExisting = await queryOne<Patient>(
          'SELECT * FROM patients WHERE name = $1 AND phone = $2',
          [name, phone]
        );

        if (retryExisting) {
          return retryExisting;
        }

        // 序列不同步导致的主键冲突：查询最大ID，用 max(id)+1 显式指定ID重试
        const maxRow = await queryOne<{ max_id: number }>(
          'SELECT MAX(id) as max_id FROM patients'
        );

        if (maxRow) {
          try {
            const retryPatient = await insertAndGet<Patient>(
              'INSERT INTO patients (id, name, phone) VALUES ($1, $2, $3) RETURNING *',
              [maxRow.max_id + 1, name, phone]
            );
            return retryPatient;
          } catch {
            // 显式ID也冲突，继续重试
          }
        }

        // 最后再试一次普通插入（可能序列已被其他请求修复）
        if (attempt < 2) continue;
      }

      throw new Error(`创建患者失败: ${msg}`);
    }
  }

  throw new Error('创建患者失败: 多次重试后仍失败');
}

// 根据姓名和手机号验证患者身份
export async function verifyPatient(name: string, phone: string): Promise<Patient | null> {
  return queryOne<Patient>(
    'SELECT * FROM patients WHERE name = $1 AND phone = $2',
    [name, phone]
  );
}

// 根据患者ID获取所有模型配置（按时间倒序）
export async function getPatientConfigs(patientId: number): Promise<PatientConfig[]> {
  const configs = await query<Record<string, unknown>>(
    `SELECT mc.id, mc.code, mc.title, mc.hospital, mc.department, mc.patient_id, mc.created_at
     FROM medical_configs mc
     WHERE mc.patient_id = $1
     ORDER BY mc.created_at DESC`,
    [patientId]
  );

  const result: PatientConfig[] = [];
  for (const config of configs) {
    const models = await query<{ id: number; name: string }>(
      'SELECT id, name FROM medical_models WHERE config_id = $1 ORDER BY sort_order ASC',
      [config.id]
    );

    result.push({
      id: config.id as number,
      code: config.code as string,
      title: config.title as string,
      hospital: config.hospital as string | null,
      department: config.department as string | null,
      patient_id: config.patient_id as number | null,
      created_at: config.created_at as string,
      models,
    });
  }

  return result;
}

// 根据患者ID获取患者信息
export async function getPatientById(patientId: number): Promise<Patient | null> {
  return queryOne<Patient>(
    'SELECT * FROM patients WHERE id = $1',
    [patientId]
  );
}

// 更新配置关联到患者
export async function updateConfigPatient(configId: number, patientId: number | null): Promise<void> {
  const { execute } = await import('./db');
  const affected = await execute(
    'UPDATE medical_configs SET patient_id = $1 WHERE id = $2',
    [patientId, configId]
  );
  if (affected === 0) {
    throw new Error('更新配置失败: 配置不存在');
  }
}
