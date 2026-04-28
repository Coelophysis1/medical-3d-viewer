// 医学3D模型类型定义

// 基于 3D Slicer 解剖学配色表
export type ModelColor =
  // 核心组织与结构
  | 'bone' | 'skin' | 'muscle' | 'connective' | 'blood' | 'organ' | 'tissue'
  // 病灶与特殊状态
  | 'mass' | 'necrosis' | 'bleeding' | 'edema'
  // 环境与其他
  | 'foreign-object';

export interface ModelConfig {
  id?: number;
  config_id?: number;
  name: string;
  color: ModelColor;
  opacity: number; // 0-100
  file_path: string;
  visible: boolean;
  sort_order: number;
  file?: File; // 上传时使用
}

export interface MedicalConfig {
  id?: number;
  code: string;
  patient_id?: number;
  creator_id?: number;
  title: string;
  patient_name?: string;
  patient_phone?: string;
  patient_gender?: string;
  patient_age?: number;
  hospital?: string;
  department?: string;
  models: ModelConfig[];
  medical_models?: { count: number }[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateConfigRequest {
  title: string;
  patient_name?: string;
  patient_phone?: string;
  patient_gender?: string;
  patient_age?: number;
  hospital?: string;
  department?: string;
  models: Omit<ModelConfig, 'id' | 'config_id' | 'file'>[];
}

export interface CreateConfigResponse {
  success: boolean;
  code?: string;
  url?: string;
  error?: string;
}

export interface GetConfigResponse {
  success: boolean;
  data?: MedicalConfig;
  error?: string;
}

// 解剖学配色映射 (3D Slicer)
export const COLOR_MAP: Record<ModelColor, string> = {
  bone: '#F1D691',         // 骨骼 - 象牙米黄
  skin: '#B17A65',         // 皮肤 - 偏红深棕
  muscle: '#C06858',       // 肌肉 - 暗红褐色
  connective: '#6FB8D2',   // 结缔组织/软骨 - 淡蓝色
  blood: '#D8654F',        // 血液/动脉 - 偏橙鲜红
  organ: '#DD8265',        // 脏器/器官 - 橙粉色
  tissue: '#80AE80',       // 普通组织 - 灰绿色
  mass: '#90EE90',         // 肿块/肿瘤 - 亮黄绿色
  necrosis: '#D8BFD8',     // 坏死区 - 淡紫灰色
  bleeding: '#BC411C',     // 出血 - 深铁锈红
  edema: '#8CE0E4',        // 水肿 - 青绿色
  'foreign-object': '#DCF514', // 异物/植入物 - 荧光黄绿色
};

// 解剖学配色中文名称映射
export const COLOR_NAMES: Record<ModelColor, string> = {
  bone: '骨骼',
  skin: '皮肤',
  muscle: '肌肉',
  connective: '结缔组织',
  blood: '血液/动脉',
  organ: '脏器/器官',
  tissue: '普通组织',
  mass: '肿块/肿瘤',
  necrosis: '坏死区',
  bleeding: '出血',
  edema: '水肿',
  'foreign-object': '异物/植入物',
};

// 颜色选项排列顺序：核心组织 → 病灶 → 其他
export const COLOR_OPTIONS: ModelColor[] = [
  'bone', 'skin', 'muscle', 'connective', 'blood', 'organ', 'tissue',
  'mass', 'necrosis', 'bleeding', 'edema',
  'foreign-object',
];
