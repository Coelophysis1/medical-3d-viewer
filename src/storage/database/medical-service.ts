import { getSupabaseClient } from './supabase-client';
import type { MedicalConfig, ModelConfig } from '@/types/medical';

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
  const client = getSupabaseClient();
  
  // 生成唯一访问码
  let code = generateCode();
  let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await client
      .from('medical_configs')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    
    if (!existing) break;
    code = generateCode();
    attempts++;
  }
  
  // 插入配置记录
  const { data: configData, error: configError } = await client
    .from('medical_configs')
    .insert({
      code,
      title: config.title,
      patient_id: config.patient_id || null,
      creator_id: config.creator_id || null,
      patient_name: config.patient_name || null,
      patient_phone: config.patient_phone || null,
      patient_gender: config.patient_gender || null,
      patient_age: config.patient_age || null,
      hospital: config.hospital || null,
      department: config.department || null,
    })
    .select()
    .single();
  
  if (configError) {
    return { success: false, error: `创建配置失败: ${configError.message}` };
  }
  
  if (!configData) {
    return { success: false, error: '创建配置失败: 未返回数据' };
  }
  
  // 插入模型记录
  if (config.models && config.models.length > 0) {
    const modelRecords = config.models.map((model, index) => ({
      config_id: configData.id,
      name: model.name,
      color: model.color,
      opacity: Math.round(model.opacity),
      file_path: model.file_path,
      visible: model.visible ? 1 : 0,
      sort_order: index,
    }));
    
    const { error: modelError } = await client
      .from('medical_models')
      .insert(modelRecords);
    
    if (modelError) {
      // 回滚配置
      await client.from('medical_configs').delete().eq('id', configData.id);
      return { success: false, error: `创建模型失败: ${modelError.message}` };
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
  const client = getSupabaseClient();
  
  const { data: configData, error: configError } = await client
    .from('medical_configs')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  
  if (configError) {
    return { success: false, error: `查询配置失败: ${configError.message}` };
  }
  
  if (!configData) {
    return { success: false, error: '配置不存在' };
  }
  
  const { data: modelData, error: modelError } = await client
    .from('medical_models')
    .select('*')
    .eq('config_id', configData.id)
    .order('sort_order', { ascending: true });
  
  if (modelError) {
    return { success: false, error: `查询模型失败: ${modelError.message}` };
  }
  
  const models: ModelConfig[] = (modelData || []).map(m => ({
    id: m.id,
    config_id: m.config_id,
    name: m.name,
    color: m.color,
    opacity: m.opacity,
    file_path: m.file_path,
    visible: m.visible === 1,
    sort_order: m.sort_order,
  }));
  
  return {
    success: true,
    data: {
      id: configData.id,
      code: configData.code,
      title: configData.title,
      patient_name: configData.patient_name,
      patient_gender: configData.patient_gender,
      patient_age: configData.patient_age,
      hospital: configData.hospital,
      department: configData.department,
      models,
      created_at: configData.created_at,
      updated_at: configData.updated_at,
    },
  };
}

// 获取医生创建的配置列表
export async function getDoctorConfigs(creatorId: number): Promise<{ success: boolean; data?: MedicalConfig[]; error?: string }> {
  const client = getSupabaseClient();
  
  const { data: configs, error: configError } = await client
    .from('medical_configs')
    .select(`
      *,
      medical_models(count)
    `)
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });
  
  if (configError) {
    return { success: false, error: `查询配置失败: ${configError.message}` };
  }
  
  return {
    success: true,
    data: configs || [],
  };
}

// 删除配置（含关联模型、文件，并记录日志）
export async function deleteMedicalConfig(
  configId: number,
  operatorId: number,
  operatorName: string,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();

  // 1. 查询配置及关联模型
  const { data: configData, error: configError } = await client
    .from('medical_configs')
    .select('id, code, title, patient_name, hospital, department, creator_id')
    .eq('id', configId)
    .single();

  if (configError || !configData) {
    return { success: false, error: '配置不存在' };
  }

  // 权限校验：只有创建者本人可以删除
  if (configData.creator_id !== operatorId) {
    return { success: false, error: '无权删除此配置' };
  }

  const { data: modelData, error: modelError } = await client
    .from('medical_models')
    .select('id, file_path')
    .eq('config_id', configId);

  if (modelError) {
    return { success: false, error: `查询模型失败: ${modelError.message}` };
  }

  const models = modelData || [];
  const filePaths = models.map((m: { file_path: string }) => m.file_path);
  const modelCount = models.length;

  // 2. 删除文件
  const deleteErrors: string[] = [];
  for (const filePath of filePaths) {
    try {
      if (filePath.startsWith('s3://')) {
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

  // 3. 删除数据库记录（models 因 ON DELETE CASCADE 会自动删除）
  const { error: delConfigError } = await client
    .from('medical_configs')
    .delete()
    .eq('id', configId);

  if (delConfigError) {
    return { success: false, error: `删除配置记录失败: ${delConfigError.message}` };
  }

  // 4. 记录删除日志
  const { error: logError } = await client
    .from('delete_logs')
    .insert({
      operator_id: operatorId,
      operator_name: operatorName,
      config_id: configId,
      config_code: configData.code,
      config_title: configData.title,
      patient_name: configData.patient_name,
      hospital: configData.hospital,
      department: configData.department,
      model_count: modelCount,
      deleted_files: filePaths.length > 0 ? filePaths : null,
    });

  if (logError) {
    console.error('记录删除日志失败:', logError);
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
  const client = getSupabaseClient();

  const { data: logs, error: logError } = await client
    .from('delete_logs')
    .select('*')
    .eq('operator_id', operatorId)
    .order('deleted_at', { ascending: false });

  if (logError) {
    return { success: false, error: `查询删除日志失败: ${logError.message}` };
  }

  return { success: true, data: logs || [] };
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
  const client = getSupabaseClient();

  let query = client
    .from('delete_logs')
    .select('*');

  if (operatorId) {
    query = query.eq('operator_id', operatorId);
  }

  const { data: logs, error: logError } = await query
    .order('deleted_at', { ascending: false });

  if (logError) {
    return { success: false, error: `查询删除日志失败: ${logError.message}` };
  }

  return { success: true, data: logs || [] };
}
