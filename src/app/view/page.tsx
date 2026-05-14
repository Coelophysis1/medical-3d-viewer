'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AlertCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { MedicalConfig, getModelColor, ModelColor } from '@/types/medical';

// Three.js 必须在客户端渲染，使用 dynamic + ssr:false 避免 SSR 问题
const ThreeDViewer = dynamic(() => import('@/components/ThreeDViewer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">初始化3D引擎...</p>
      </div>
    </div>
  ),
});

interface ModelData {
  name: string;
  color: ModelColor;
  opacity: number;
  visible: boolean;
}

function ViewPageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  
  const [config, setConfig] = useState<MedicalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelVisibility, setModelVisibility] = useState<Record<number, boolean>>({});
  const [modelOpacity, setModelOpacity] = useState<Record<number, number>>({});
  const [modelVolumes, setModelVolumes] = useState<{ x: number; y: number; z: number }[]>([]);
  const [panelCollapsed, setPanelCollapsed] = useState(true);

  useEffect(() => {
    if (!code) {
      setError('缺少访问码参数');
      setLoading(false);
      return;
    }

    fetch(`/api/medical/config/${code}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setConfig(data.data);
          // 初始化可见性和透明度
          const visibility: Record<number, boolean> = {};
          const opacity: Record<number, number> = {};
          data.data.models.forEach((m: ModelData, i: number) => {
            visibility[i] = m.visible;
            opacity[i] = m.opacity;
          });
          setModelVisibility(visibility);
          setModelOpacity(opacity);
        } else {
          setError(data.error || '配置不存在');
        }
        setLoading(false);
      })
      .catch(() => {
        setError('加载失败，请检查访问链接是否正确');
        setLoading(false);
      });
  }, [code]);

  const toggleVisibility = (index: number) => {
    const newVisibility = !modelVisibility[index];
    setModelVisibility(prev => ({ ...prev, [index]: newVisibility }));
  };

  const updateOpacity = (index: number, value: number) => {
    setModelOpacity(prev => ({ ...prev, [index]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">加载失败</h2>
            <p className="text-gray-600">{error || '未知错误'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* 顶部信息栏 */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 lg:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg lg:text-xl font-bold text-gray-900 truncate">{config.title}</h1>
            <div className="flex flex-wrap items-center gap-2 lg:gap-4 mt-1 text-xs lg:text-sm text-gray-500">
              {config.patient_name && <span>患者：{config.patient_name}</span>}
              {config.patient_gender && <span>性别：{config.patient_gender}</span>}
              {config.patient_age && <span>年龄：{config.patient_age}岁</span>}
              {config.hospital && <span>医院：{config.hospital}</span>}
              {config.department && <span>科室：{config.department}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 ml-2 flex-shrink-0">
            <Badge variant="outline" className="text-xs">
              医学3D打印中心
            </Badge>
            <img
              src="/logo.jpg"
              alt="Logo"
              width={40}
              height={40}
              className="rounded-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* 3D视窗 - 全屏 */}
      <div className="flex-1 relative">
        <div className="w-full h-full">
          <ThreeDViewer 
            key={config.id}
            models={config.models.map((m, i) => ({
              ...m,
              visible: modelVisibility[i] ?? m.visible,
              opacity: modelOpacity[i] ?? m.opacity,
            }))}
            onVolumesLoaded={(volumes) => setModelVolumes(volumes)}
          />
        </div>

        {/* 悬浮模型控制面板 - 左上角 */}
        <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 md:top-3 md:left-3 z-10 w-36 sm:w-44 md:w-64 max-h-[calc(100vh-60px)] sm:max-h-[calc(100vh-80px)] md:max-h-[calc(100vh-100px)] flex flex-col">
          <div className="bg-white/95 backdrop-blur-sm rounded-md sm:rounded-lg shadow-lg border border-gray-200/80 flex flex-col min-h-0 max-h-full">
            {/* 面板头部 - 始终可见 */}
            <button
              onClick={() => setPanelCollapsed(prev => !prev)}
              className="flex items-center justify-between w-full px-2 py-1.5 sm:px-2.5 sm:py-2 md:px-3 md:py-2 hover:bg-gray-50/80 rounded-t-md sm:rounded-t-lg transition-colors text-left flex-shrink-0"
            >
              <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
                {panelCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
                )}
                <span className="text-xs sm:text-sm font-medium text-gray-700">模型控制</span>
                <Badge variant="secondary" className="text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0">
                  {config.models.length}
                </Badge>
              </div>
              <span className="text-[9px] sm:text-[10px] text-gray-400 hidden sm:block">
                {panelCollapsed ? '展开' : '收起'}
              </span>
            </button>

            {/* 模型列表 - 可折叠 */}
            {!panelCollapsed && (
              <div className="flex-1 min-h-0 overflow-y-auto border-t border-gray-100">
                <div className="p-1.5 sm:p-2 space-y-1 sm:space-y-1.5">
                  {config.models.map((model, index) => (
                    <div 
                      key={index}
                      className="rounded border border-gray-100 sm:rounded-md bg-white/80"
                      style={{ 
                        borderLeftWidth: 2, 
                        borderLeftColor: getModelColor(model.color) 
                      }}
                    >
                      <div className="px-2 py-1.5 sm:px-2.5 sm:py-2">
                        <div className="flex items-center justify-between gap-1 sm:gap-2">
                          <div className="flex items-center gap-1 sm:gap-1.5 flex-1 min-w-0">
                            <div 
                              className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: getModelColor(model.color) }}
                            />
                            <span className="font-medium text-[10px] sm:text-xs break-all leading-tight">
                              {model.name}
                            </span>
                          </div>
                          <Switch
                            checked={modelVisibility[index] ?? true}
                            onCheckedChange={() => toggleVisibility(index)}
                            className="scale-[0.65] sm:scale-75 origin-right"
                          />
                        </div>
                        {modelVolumes[index] !== undefined && modelVolumes[index] > 0 && (
                          <div className="mt-0.5 sm:mt-1 bg-gray-50 rounded px-1 py-0.5 sm:px-1.5 text-[8px] sm:text-[10px] text-gray-600 font-mono">
                            体积: {formatVolume(modelVolumes[index])} mm³
                          </div>
                        )}
                        <div className="mt-1 sm:mt-1.5 space-y-0.5 sm:space-y-1">
                          <div className="flex items-center justify-between text-[9px] sm:text-[11px] text-gray-500">
                            <span>透明度</span>
                            <span className="tabular-nums font-medium">{modelOpacity[index] ?? model.opacity}%</span>
                          </div>
                          <Slider
                            value={[modelOpacity[index] ?? model.opacity]}
                            onValueChange={(value) => updateOpacity(index, value[0])}
                            min={0}
                            max={100}
                            step={25}
                            className="scale-[0.85] sm:scale-100 origin-left w-[calc(100%+15px)] sm:w-full"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ViewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">页面加载中...</p>
        </div>
      </div>
    }>
      <ViewPageContent />
    </Suspense>
  );
}
