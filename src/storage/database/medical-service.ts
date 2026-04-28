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
