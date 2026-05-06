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

interface DeleteLog {
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
  const [deleteLogs, setDeleteLogs] = useState<DeleteLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedConfig, setSelectedConfig] = useState<MedicalConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'history' | 'logs'>('history');

  // 删除确认状态
  const [deleteTarget, setDeleteTarget] = useState<MedicalConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // 获取删除日志
  useEffect(() => {
    if (!currentUser || activeTab !== 'logs') return;

    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/doctor/delete-logs', {
          credentials: 'include',
        });
        const data = await response.json();

        if (data.success) {
          setDeleteLogs(data.data || []);
        }
      } catch {
        // 静默失败
      }
    };

    fetchLogs();
  }, [currentUser, activeTab]);

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
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('链接已复制到剪贴板');
    }
  };

  // 删除配置
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/medical/config/${deleteTarget.code}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setConfigs(prev => prev.filter(c => c.code !== deleteTarget.code));
        setDeleteTarget(null);
        if (selectedConfig?.code === deleteTarget.code) {
          setSelectedConfig(null);
        }
      } else {
        alert(data.error || '删除失败');
      }
    } catch {
      alert('网络错误，请稍后重试');
    } finally {
      setIsDeleting(false);
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

      {/* Tab 切换 */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'history'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            上传记录
            {activeTab === 'history' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'logs'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            删除日志
            {activeTab === 'logs' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* 主内容 */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg">
            {error}
          </div>
        )}

        {/* 上传记录 Tab */}
        {activeTab === 'history' && (
          <>
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
                        <p className="text-sm text-foreground break-all leading-relaxed">
                          {formatDate(config.created_at)}-{config.department || '未知科室'}-{config.title || '未命名'}-{config.patient_name || '未知患者'}
                        </p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => setSelectedConfig(config)}
                          className="px-3 py-2 text-sm bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                        >
                          详细信息
                        </button>
                        <button
                          onClick={() => setDeleteTarget(config)}
                          className="px-3 py-2 text-sm bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 删除日志 Tab */}
        {activeTab === 'logs' && (
          <>
            {deleteLogs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">暂无删除记录</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {deleteLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-card border border-border rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground break-all leading-relaxed">
                          {log.config_title || '未命名'}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {log.patient_name && <span>患者：{log.patient_name}</span>}
                          {log.hospital && <span>医院：{log.hospital}</span>}
                          {log.department && <span>科室：{log.department}</span>}
                          <span>模型数量：{log.model_count}</span>
                          <span>访问码：{log.config_code}</span>
                        </div>
                        {log.deleted_files && log.deleted_files.length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium">删除文件：</span>
                            <span className="break-all">{log.deleted_files.join('、')}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(log.deleted_at)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          操作人：{log.operator_name}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
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

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="bg-card rounded-xl shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground mb-2">
              确认删除
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              确定要删除配置「{deleteTarget.title || '未命名'}」吗？此操作将同时删除关联的 STL 文件，且不可恢复。
            </p>
            <div className="bg-muted/50 rounded-lg p-3 mb-4 text-sm space-y-1">
              {deleteTarget.patient_name && (
                <p><span className="text-muted-foreground">患者：</span>{deleteTarget.patient_name}</p>
              )}
              {deleteTarget.hospital && (
                <p><span className="text-muted-foreground">医院：</span>{deleteTarget.hospital}</p>
              )}
              {deleteTarget.department && (
                <p><span className="text-muted-foreground">科室：</span>{deleteTarget.department}</p>
              )}
              <p><span className="text-muted-foreground">模型数量：</span>{deleteTarget.medical_models?.[0]?.count || 0} 个</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2 bg-destructive text-white rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
