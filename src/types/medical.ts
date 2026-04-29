// 医学3D模型类型定义
// 基于 3DSlicer 颜色表的组织/器官颜色

export type ModelColor = 
  | 'tissue' | 'bone' | 'skin' | 'connective_tissue' | 'blood' | 'organ'
  | 'mass' | 'muscle' | 'foreign_object' | 'teeth' | 'fat' | 'gray_matter'
  | 'white_matter' | 'nerve' | 'vein' | 'artery' | 'ligament' | 'tendon'
  | 'cartilage' | 'lymph_node' | 'lymphatic_vessel' | 'cerebrospinal_fluid'
  | 'bile' | 'fluid' | 'edema' | 'bleeding' | 'necrosis'
  | 'target_volume' | 'airway';

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

// 3DSlicer 组织/器官颜色映射
export const COLOR_MAP: Record<ModelColor, string> = {
  tissue: '#80AE80',
  bone: '#F1D691',
  skin: '#B17A65',
  connective_tissue: '#6FB8D2',
  blood: '#D8654F',
  organ: '#DD8265',
  mass: '#90EE90',
  muscle: '#C06858',
  foreign_object: '#DCF514',
  teeth: '#FFFADC',
  fat: '#E6DC46',
  gray_matter: '#C8C8EB',
  white_matter: '#FAFAD2',
  nerve: '#F4D631',
  vein: '#0097CE',
  artery: '#D8654F',
  ligament: '#B7D6D3',
  tendon: '#98BDCF',
  cartilage: '#6FB8D2',
  lymph_node: '#44AC64',
  lymphatic_vessel: '#6FC583',
  cerebrospinal_fluid: '#55BCFF',
  bile: '#00911E',
  fluid: '#AAFAFA',
  edema: '#8CE0E4',
  bleeding: '#BC411C',
  necrosis: '#D8BFD8',
  target_volume: '#FFFF00',
  airway: '#99CCFF',
};

// 旧颜色名到新组织/器官颜色的兼容映射（用于已存在的旧数据）
export const LEGACY_COLOR_MAP: Record<string, string> = {
  red: '#D8654F',        // → blood/artery
  orange: '#DD8265',     // → organ
  yellow: '#E6DC46',     // → fat
  lime: '#90EE90',       // → mass
  green: '#44AC64',      // → lymph_node
  teal: '#6FB8D2',       // → connective_tissue/cartilage
  cyan: '#55BCFF',       // → cerebrospinal_fluid
  sky: '#0097CE',        // → vein
  blue: '#0097CE',       // → vein
  indigo: '#6FB8D2',     // → connective_tissue
  violet: '#C8C8EB',     // → gray_matter
  purple: '#D8BFD8',     // → necrosis
  fuchsia: '#D8654F',    // → blood
  pink: '#B17A65',       // → skin
  rose: '#D8654F',       // → blood
  stone: '#80AE80',      // → tissue
  slate: '#64748B',
  zinc: '#71717A',
  neutral: '#737373',
  gray: '#6B7280',
  'slate-gray': '#708090',
  coral: '#C06858',      // → muscle
  gold: '#F1D691',       // → bone
  navy: '#1E3A5F',
};

/** 获取模型颜色值，兼容旧数据 */
export function getModelColor(colorKey: string): string {
  if (colorKey in COLOR_MAP) return COLOR_MAP[colorKey as ModelColor];
  if (colorKey in LEGACY_COLOR_MAP) return LEGACY_COLOR_MAP[colorKey];
  return '#888888';
}

// 组织/器官中文名称映射
export const COLOR_NAMES: Record<ModelColor, string> = {
  tissue: '常规软组织',
  bone: '骨骼',
  skin: '皮肤',
  connective_tissue: '结缔组织',
  blood: '血液',
  organ: '一般器官',
  mass: '肿块/病灶',
  muscle: '肌肉',
  foreign_object: '异物 (植入物)',
  teeth: '牙齿',
  fat: '脂肪',
  gray_matter: '脑灰质',
  white_matter: '脑白质',
  nerve: '神经',
  vein: '静脉',
  artery: '动脉',
  ligament: '韧带',
  tendon: '肌腱',
  cartilage: '软骨',
  lymph_node: '淋巴结',
  lymphatic_vessel: '淋巴管',
  cerebrospinal_fluid: '脑脊液',
  bile: '胆汁',
  fluid: '一般体液',
  edema: '水肿区',
  bleeding: '出血区',
  necrosis: '坏死区',
  target_volume: '靶区',
  airway: '支气管/气道',
};

export const COLOR_OPTIONS: ModelColor[] = [
  'tissue', 'bone', 'skin', 'connective_tissue', 'blood', 'organ',
  'mass', 'muscle', 'foreign_object', 'teeth', 'fat', 'gray_matter',
  'white_matter', 'nerve', 'vein', 'artery', 'ligament', 'tendon',
  'cartilage', 'lymph_node', 'lymphatic_vessel', 'cerebrospinal_fluid',
  'bile', 'fluid', 'edema', 'bleeding', 'necrosis',
  'target_volume', 'airway',
];
