// 医学3D模型类型定义

export type ModelColor = 
  | 'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'teal' | 'cyan' 
  | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple' | 'fuchsia' | 'pink'
  | 'rose' | 'stone' | 'slate' | 'zinc' | 'neutral' | 'gray' | 'slate-gray'
  | 'coral' | 'gold' | 'navy';

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

// 24色颜色映射
export const COLOR_MAP: Record<ModelColor, string> = {
  red: '#EF4444',
  orange: '#F97316',
  yellow: '#EAB308',
  lime: '#84CC16',
  green: '#22C55E',
  teal: '#14B8A6',
  cyan: '#06B6D4',
  sky: '#0EA5E9',
  blue: '#3B82F6',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  purple: '#A855F7',
  fuchsia: '#D946EF',
  pink: '#EC4899',
  rose: '#F43F5E',
  stone: '#78716C',
  slate: '#64748B',
  zinc: '#71717A',
  neutral: '#737373',
  gray: '#6B7280',
  'slate-gray': '#708090',
  coral: '#FF6B6B',
  gold: '#FFD700',
  navy: '#1E3A5F',
};

// 24色中文名称映射
export const COLOR_NAMES: Record<ModelColor, string> = {
  red: '红色',
  orange: '橙色',
  yellow: '黄色',
  lime: 'lime绿',
  green: '绿色',
  teal: '青色',
  cyan: '青色蓝',
  sky: '天蓝色',
  blue: '蓝色',
  indigo: '靛蓝色',
  violet: '紫罗兰',
  purple: '紫色',
  fuchsia: '品红色',
  pink: '粉色',
  rose: '玫瑰红',
  stone: '石灰色',
  slate: '板岩色',
  zinc: '锌灰色',
  neutral: '中性灰',
  gray: '灰色',
  'slate-gray': '蓝灰色',
  coral: '珊瑚色',
  gold: '金色',
  navy: '深蓝色',
};

export const COLOR_OPTIONS: ModelColor[] = [
  'red', 'orange', 'yellow', 'lime', 'green', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'fuchsia', 'pink', 'rose', 'stone', 'slate', 'zinc',
  'neutral', 'gray', 'slate-gray', 'coral', 'gold', 'navy',
];
