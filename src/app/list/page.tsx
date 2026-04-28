'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Eye, FileBox, Calendar, Building2 } from 'lucide-react';

interface ModelConfig {
  id: number;
  code: string;
  title: string;
  hospital: string | null;
  department: string | null;
  createdAt: string;
  modelCount: number;
}

interface PatientInfo {
  id: number;
  name: string;
}

function ListContent() {
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patient_id');

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!patientId) {
      setError('缺少患者信息');
      setIsLoading(false);
      return;
    }

    const fetchConfigs = async () => {
      try {
        const res = await fetch(`/api/patient/${patientId}/configs`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (data.success) {
          setPatient(data.patient);
          setConfigs(data.configs);
        } else {
          setError(data.error || '获取数据失败');
        }
      } catch {
        setError('网络错误，请重试');
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfigs();
  }, [patientId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const handleView = (code: string) => {
    window.location.href = `/view?code=${code}`;
  };

  const handleBack = () => {
    window.location.href = '/verify';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={handleBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回验证
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部标题栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {patient?.name} 的模型
              </h1>
              <p className="text-sm text-gray-500">
                共 {configs.length} 个模型配置
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 模型列表 */}
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        {configs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <FileBox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>暂无模型记录</p>
            </CardContent>
          </Card>
        ) : (
          configs.map((config) => (
            <Card key={config.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">
                      {config.title}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm text-gray-500">
                      {config.department && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{config.department}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatDate(config.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileBox className="w-3.5 h-3.5 shrink-0" />
                        <span>{config.modelCount} 个模型</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleView(config.code)}
                    className="shrink-0 bg-blue-600 hover:bg-blue-700"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    查看
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default function ListPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <ListContent />
    </Suspense>
  );
}
