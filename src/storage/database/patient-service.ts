import { getSupabaseClient } from './supabase-client';

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
  const client = getSupabaseClient();

  // 先查找是否存在
  const { data: existing } = await client
    .from('patients')
    .select('*')
    .eq('name', name)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    return existing as Patient;
  }

  // 不存在则创建（带重试，处理并发或序列不同步导致的主键冲突）
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: newPatient, error } = await client
      .from('patients')
      .insert({ name, phone })
      .select()
      .single();

    if (!error && newPatient) {
      return newPatient as Patient;
    }

    if (error) {
      const msg = error.message || '';
      // 主键冲突（序列不同步或并发插入）
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        // 并发插入同一条记录：重新查询即可
        const { data: retryExisting } = await client
          .from('patients')
          .select('*')
          .eq('name', name)
          .eq('phone', phone)
          .maybeSingle();

        if (retryExisting) {
          return retryExisting as Patient;
        }

        // 序列不同步导致的主键冲突：查询最大ID，用 max(id)+1 显式指定ID重试
        const { data: maxRow } = await client
          .from('patients')
          .select('id')
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (maxRow) {
          const nextId = maxRow.id + 1;
          const { data: retryPatient, error: retryError } = await client
            .from('patients')
            .insert({ id: nextId, name, phone })
            .select()
            .single();

          if (!retryError && retryPatient) {
            return retryPatient as Patient;
          }
        }

        // 最后再试一次普通插入（可能序列已被其他请求修复）
        if (attempt < 2) continue;
      }

      throw new Error(`创建患者失败: ${error.message}`);
    }
  }

  throw new Error('创建患者失败: 多次重试后仍失败');
}

// 根据姓名和手机号验证患者身份
export async function verifyPatient(name: string, phone: string): Promise<Patient | null> {
  const client = getSupabaseClient();

  const { data } = await client
    .from('patients')
    .select('*')
    .eq('name', name)
    .eq('phone', phone)
    .maybeSingle();

  return data as Patient | null;
}

// 根据患者ID获取所有模型配置（按时间倒序）
export async function getPatientConfigs(patientId: number): Promise<PatientConfig[]> {
  const client = getSupabaseClient();

  // 获取患者的所有配置
  const { data: configs, error } = await client
    .from('medical_configs')
    .select(`
      id,
      code,
      title,
      hospital,
      department,
      patient_id,
      created_at,
      models:medical_models(
        id,
        name
      )
    `)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取配置失败: ${error.message}`);
  }

  return (configs || []) as PatientConfig[];
}

// 根据患者ID获取患者信息
export async function getPatientById(patientId: number): Promise<Patient | null> {
  const client = getSupabaseClient();

  const { data } = await client
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  return data as Patient | null;
}

// 更新配置关联到患者
export async function updateConfigPatient(configId: number, patientId: number | null): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client
    .from('medical_configs')
    .update({ patient_id: patientId })
    .eq('id', configId);

  if (error) {
    throw new Error(`更新配置失败: ${error.message}`);
  }
}
