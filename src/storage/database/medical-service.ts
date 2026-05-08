import { query, queryOne, insertAndGet, execute } from './db';
import type { MedicalConfig, ModelConfig, ModelColor } from '@/types/medical';

// 生成随机访问码
function generateCode(length: number = 5): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 创建配置
export async function createMedicalConfig(config: Omit<MedicalConfig, 'id' | 'code' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; code?: string; url?: string; error?: string }> {
  // 生成唯一访问码
  let code = generateCode();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await queryOne('SELECT id FROM medical_configs WHERE code = $1', [code]);
    if (!existing) break;
    code = generateCode();
    attempts++;
  }

  // 插入配置记录
  const configData = await insertAndGet<{
    id: number; code: string; title: string;
  }>(
    `INSERT INTO medical_configs (code, title, patient_id, creator_id, patient_name, patient_phone, patient_gender, patient_age, hospital, department)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, code, title`,
    [
      code,
      config.title,
      config.patient_id || null,
      config.creator_id || null,
      config.patient_name || null,
      config.patient_phone || null,
      config.patient_gender || null,
      config.patient_age || null,
      config.hospital || null,
      config.department || null,
    ]
  );

  // 插入模型记录
  if (config.models && config.models.length > 0) {
    for (let index = 0; index < config.models.length; index++) {
      const model = config.models[index];
      try {
        await execute(
          `INSERT INTO medical_models (config_id, name, color, opacity, file_path, visible, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            configData.id,
            model.name,
            model.color,
            Math.round(model.opacity),
            model.file_path,
            model.visible ? 1 : 0,
            index,
          ]
        );
      } catch (modelErr) {
        // 回滚配置
        await execute('DELETE FROM medical_configs WHERE id = $1', [configData.id]);
        return { success: false, error: `创建模型失败: ${modelErr instanceof Error ? modelErr.message : String(modelErr)}` };
      }
    }
  }

  const baseUrl = process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000';
  return {
    success: true,
    code,
    url: `${baseUrl}/view?code=${code}`,
  };
}

// 获取配置
export async function getMedicalConfig(code: string): Promise<{ success: boolean; data?: MedicalConfig; error?: string }> {
  const configData = await queryOne<Record<string, unknown>>(
    'SELECT * FROM medical_configs WHERE code = $1',
    [code]
  );

  if (!configData) {
    return { success: false, error: '配置不存在' };
  }

  const modelData = await query<Record<string, unknown>>(
    'SELECT * FROM medical_models WHERE config_id = $1 ORDER BY sort_order ASC',
    [configData.id]
  );

  const models: ModelConfig[] = modelData.map(m => ({
    id: m.id as number,
    config_id: m.config_id as number,
    name: m.name as string,
    color: m.color as ModelColor,
    opacity: m.opacity as number,
    file_path: m.file_path as string,
    visible: m.visible === 1,
    sort_order: m.sort_order as number,
  }));

  return {
    success: true,
    data: {
      id: configData.id as number,
      code: configData.code as string,
      title: configData.title as string,
      patient_name: configData.patient_name as string | undefined,
      patient_gender: configData.patient_gender as string | undefined,
      patient_age: configData.patient_age as number | undefined,
      hospital: configData.hospital as string | undefined,
      department: configData.department as string | undefined,
      models,
      created_at: configData.created_at as string,
      updated_at: configData.updated_at as string | undefined,
    },
  };
}

// 获取医生创建的配置列表
export async function getDoctorConfigs(creatorId: number): Promise<{ success: boolean; data?: MedicalConfig[]; error?: string }> {
  const configs = await query<Record<string, unknown>>(
    `SELECT mc.*, 
       (SELECT COUNT(*) FROM medical_models mm WHERE mm.config_id = mc.id) as model_count
     FROM medical_configs mc
     WHERE mc.creator_id = $1
     ORDER BY mc.created_at DESC`,
    [creatorId]
  );

  // 转换为前端期望的格式（medical_models: [{count: N}]）
  const result = configs.map(c => ({
    ...c,
    medical_models: [{ count: parseInt(String(c.model_count), 10) }],
  }));

  return {
    success: true,
    data: result as unknown as MedicalConfig[],
  };
}

// 删除配置（含关联模型、文件，并记录日志）
export async function deleteMedicalConfig(
  configId: number,
  operatorId: number,
  operatorName: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. 查询配置
  const configData = await queryOne<Record<string, unknown>>(
    'SELECT id, code, title, patient_name, hospital, department, creator_id FROM medical_configs WHERE id = $1',
    [configId]
  );

  if (!configData) {
    return { success: false, error: '配置不存在' };
  }

  // 权限校验：只有创建者本人可以删除
  if (configData.creator_id !== operatorId) {
    return { success: false, error: '无权删除此配置' };
  }

  // 2. 查询关联模型
  const modelData = await query<{ file_path: string }>(
    'SELECT file_path FROM medical_models WHERE config_id = $1',
    [configId]
  );

  const filePaths = modelData.map(m => m.file_path);
  const modelCount = modelData.length;

  // 3. 删除文件
  const deleteErrors: string[] = [];
  for (const filePath of filePaths) {
    try {
      if (filePath.startsWith('s3://')) {
        // S3 文件删除（生产环境）
        const { S3Storage } = await import('coze-coding-dev-sdk');
        const storage = new S3Storage({
          endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
          accessKey: '',
          secretKey: '',
          bucketName: process.env.COZE_BUCKET_NAME,
          region: 'cn-beijing',
        });
        const s3Key = filePath.slice(5);
        await storage.deleteFile({ fileKey: s3Key });
      } else {
        // 本地文件删除
        const path = await import('path');
        const { unlink, rmdir, readdir } = await import('fs/promises');
        const { existsSync } = await import('fs');
        const fullPath = path.join(process.cwd(), 'public', filePath);
        if (existsSync(fullPath)) {
          await unlink(fullPath);
        }
        // 清理空目录
        const lastSlash = filePath.lastIndexOf('/');
        if (lastSlash > 0) {
          const folder = filePath.substring(0, lastSlash);
          const folderPath = path.join(process.cwd(), 'public', folder);
          if (existsSync(folderPath)) {
            try {
              const remaining = await readdir(folderPath);
              if (remaining.length === 0) {
                await rmdir(folderPath);
              }
            } catch {
              // 目录可能已被删除或不为空，忽略
            }
          }
        }
      }
    } catch (err) {
      console.error(`删除文件失败: ${filePath}`, err);
      deleteErrors.push(filePath);
    }
  }

  // 4. 删除数据库记录（models 因 ON DELETE CASCADE 会自动删除）
  await execute('DELETE FROM medical_configs WHERE id = $1', [configId]);

  // 5. 记录删除日志
  try {
    await execute(
      `INSERT INTO delete_logs (operator_id, operator_name, config_id, config_code, config_title, patient_name, hospital, department, model_count, deleted_files)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        operatorId,
        operatorName,
        configId,
        configData.code as string,
        configData.title as string | null,
        configData.patient_name as string | null,
        configData.hospital as string | null,
        configData.department as string | null,
        modelCount,
        filePaths.length > 0 ? filePaths : null,
      ]
    );
  } catch (logErr) {
    console.error('记录删除日志失败:', logErr);
    // 日志写入失败不影响删除结果
  }

  if (deleteErrors.length > 0) {
    return { success: true, error: `部分文件删除失败: ${deleteErrors.join(', ')}` };
  }

  return { success: true };
}

// 获取医生的删除日志
export async function getDoctorDeleteLogs(
  operatorId: number,
): Promise<{ success: boolean; data?: Array<{
  id: number;
  operator_name: string;
  config_code: string;
  config_title: string | null;
  patient_name: string | null;
  hospital: string | null;
  department: string | null;
  model_count: number;
  deleted_files: string[] | null;
  deleted_at: string;
}>; error?: string }> {
  try {
    const logs = await query<Record<string, unknown>>(
      'SELECT * FROM delete_logs WHERE operator_id = $1 ORDER BY deleted_at DESC',
      [operatorId]
    );
    return { success: true, data: logs as unknown as Array<{
      id: number;
      operator_name: string;
      config_code: string;
      config_title: string | null;
      patient_name: string | null;
      hospital: string | null;
      department: string | null;
      model_count: number;
      deleted_files: string[] | null;
      deleted_at: string;
    }> };
  } catch (err) {
    return { success: false, error: `查询删除日志失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// 获取所有删除日志（管理员用，支持按操作者筛选）
export async function getAllDeleteLogs(
  operatorId?: number,
): Promise<{ success: boolean; data?: Array<{
  id: number;
  operator_id: number;
  operator_name: string;
  config_code: string;
  config_title: string | null;
  patient_name: string | null;
  hospital: string | null;
  department: string | null;
  model_count: number;
  deleted_files: string[] | null;
  deleted_at: string;
}>; error?: string }> {
  try {
    let logs: Record<string, unknown>[];
    if (operatorId) {
      logs = await query(
        'SELECT * FROM delete_logs WHERE operator_id = $1 ORDER BY deleted_at DESC',
        [operatorId]
      );
    } else {
      logs = await query(
        'SELECT * FROM delete_logs ORDER BY deleted_at DESC'
      );
    }
    return { success: true, data: logs as unknown as Array<{
      id: number;
      operator_id: number;
      operator_name: string;
      config_code: string;
      config_title: string | null;
      patient_name: string | null;
      hospital: string | null;
      department: string | null;
      model_count: number;
      deleted_files: string[] | null;
      deleted_at: string;
    }> };
  } catch (err) {
    return { success: false, error: `查询删除日志失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}
