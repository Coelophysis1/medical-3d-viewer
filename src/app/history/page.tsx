'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// 动态导入 QRCode 组件，避免 SSR 问题
const QRCode = dynamic(() => import('@/components/QRCode'), { ssr: false });

interface MedicalConfig {
  id: number;
  code: string;
  title: string;
  patient_name?: string;
  patient_phone?: string;
  hospital?: string;
  department?: string;
  created_at: string;
  medical_models?: { count: number }[];
}

interface UserInfo {
  id: number;
  username: string;
  role: string;
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">加载中...</div>}>
      <HistoryContent />
    </Suspense>
  );
}

function HistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [configs, setConfigs] = useState<MedicalConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedConfig, setSelectedConfig] = useState<MedicalConfig | null>(null);

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });
        const data = await response.json();
        
        if (!data.success || !data.user) {
          window.location.href = '/login?redirect=/history';
          return;
        }
        
        setCurrentUser(data.user);
      } catch {
        window.location.href = '/login?redirect=/history';
      }
    };
    
    checkAuth();
  }, []);

  // 获取历史记录
  useEffect(() => {
    if (!currentUser) return;
    
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/doctor/history', {
          credentials: 'include',
        });
        const data = await response.json();
        
        if (data.success) {
          setConfigs(data.data || []);
        } else {
          setError(data.error || '获取历史记录失败');
        }
      } catch {
        setError('网络错误，请稍后重试');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchHistory();
  }, [currentUser]);

  // 检查是否有从上传成功页面跳转来的高亮项
  useEffect(() => {
    const highlightCode = searchParams.get('highlight');
    if (highlightCode && configs.length > 0) {
      const config = configs.find(c => c.code === highlightCode);
      if (config) {
        setSelectedConfig(config);
      }
    }
  }, [searchParams, configs]);

  // 注销
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    window.location.href = '/login';
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取访问 URL
  const getViewUrl = (code: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_COZE_PROJECT_DOMAIN_DEFAULT || window.location.origin;
    return `${baseUrl}/view?code=${code}`;
  };

  // 复制链接
  const copyLink = async (code: string) => {
    const url = getViewUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      alert('链接已复制到剪贴板');
    } catch {
      // 降级方案
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('链接已复制到剪贴板');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <div className="bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">上传历史</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {currentUser?.username}
            </span>
            <button
              onClick={() => window.location.href = '/upload'}
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              新建配置
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              注销
            </button>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg">
            {error}
          </div>
        )}

        {configs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">暂无上传记录</p>
            <button
              onClick={() => window.location.href = '/upload'}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              去上传
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {configs.map((config) => (
              <div
                key={config.id}
                className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* 列表显示格式：年月日时间-科室-标题-患者姓名 */}
                    <p className="text-sm text-foreground break-all leading-relaxed">
                      {formatDate(config.created_at)}-{config.department || '未知科室'}-{config.title || '未命名'}-{config.patient_name || '未知患者'}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => setSelectedConfig(config)}
                      className="px-3 py-2 text-sm bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                    >
                      详细信息
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedConfig && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedConfig(null)}
        >
          <div
            className="bg-card rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground mb-4">
              {selectedConfig.title}
            </h2>
            
            {/* 二维码 */}
            <div className="flex justify-center mb-4">
              <div className="w-48 h-48 bg-white rounded-xl flex items-center justify-center shadow-sm">
                <QRCode
                  url={getViewUrl(selectedConfig.code)}
                  size={180}
                  logoSize={0.3}
                />
              </div>
            </div>
            
            <p className="text-center text-sm text-muted-foreground mb-4">
              扫描二维码查看3D模型
            </p>
            
            {/* 信息 */}
            <div className="space-y-2 text-sm mb-4">
              {selectedConfig.patient_name && (
                <p><span className="text-muted-foreground">患者：</span>{selectedConfig.patient_name}</p>
              )}
              {selectedConfig.patient_phone && (
                <p><span className="text-muted-foreground">联系方式：</span>{selectedConfig.patient_phone}</p>
              )}
              {selectedConfig.hospital && (
                <p><span className="text-muted-foreground">医院：</span>{selectedConfig.hospital}</p>
              )}
              {selectedConfig.department && (
                <p><span className="text-muted-foreground">科室：</span>{selectedConfig.department}</p>
              )}
              <p><span className="text-muted-foreground">创建时间：</span>{formatDate(selectedConfig.created_at)}</p>
              <p><span className="text-muted-foreground">模型数量：</span>{selectedConfig.medical_models?.[0]?.count || 0} 个</p>
            </div>
            
            {/* 链接 */}
            <div className="flex items-center gap-2 mb-4 p-2 bg-muted rounded-lg">
              <input
                type="text"
                value={getViewUrl(selectedConfig.code)}
                readOnly
                className="flex-1 bg-transparent text-sm text-foreground outline-none"
              />
              <button
                onClick={() => copyLink(selectedConfig.code)}
                className="text-sm text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
              >
                复制
              </button>
            </div>
            
            {/* 按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => window.open(getViewUrl(selectedConfig.code), '_blank')}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                预览页面
              </button>
              <button
                onClick={() => setSelectedConfig(null)}
                className="flex-1 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
