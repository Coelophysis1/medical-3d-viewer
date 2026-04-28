'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, Trash2, Plus, FileBox, Eye, LogOut, Loader2, History } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COLOR_MAP, COLOR_OPTIONS, COLOR_NAMES, ModelColor } from '@/types/medical';

// 动态导入 QRCode 组件，避免 SSR 问题
const QRCode = dynamic(() => import('@/components/QRCode'), { ssr: false });

const MAX_FILES = 50;

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  color: ModelColor;
  opacity: number;
  visible: boolean;
  filePath: string;
  folderPrefix: string;
}

interface CurrentUser {
  id: number;
  username: string;
  role: 'admin' | 'doctor';
}

export default function UploadPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [title, setTitle] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [hospital, setHospital] = useState('');
  const [department, setDepartment] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        
        if (!data.success) {
          window.location.href = '/login?redirect=/upload';
          return;
        }
        
        setCurrentUser(data.user);
        setIsCheckingAuth(false);
      } catch {
        window.location.href = '/login?redirect=/upload';
      }
    };
    
    checkAuth();
  }, []);

  // 注销
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    // 过滤出 STL 文件
    const stlFiles = Array.from(uploadedFiles).filter(file => 
      file.name.toLowerCase().endsWith('.stl')
    );

    if (stlFiles.length === 0) {
      setError('请选择 STL 格式的文件');
      event.target.value = '';
      return;
    }

    // 计算可上传的数量
    const availableSlots = MAX_FILES - files.length;
    const filesToUpload = stlFiles.slice(0, availableSlots);

    if (filesToUpload.length < stlFiles.length) {
      setError(`已达到最大文件数限制（${MAX_FILES}个），仅上传前 ${filesToUpload.length} 个文件`);
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: filesToUpload.length });
    setError('');

    // 并行上传所有文件
    const uploadPromises = filesToUpload.map(async (file, index) => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('department', department);
        formData.append('patientName', patientName);

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadResult = await uploadResponse.json();

        // 更新进度
        setUploadProgress(prev => ({ ...prev, current: index + 1 }));

        if (uploadResult.success) {
          return {
            success: true,
            data: {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              file,
              name: file.name.replace(/\.stl$/i, ''),
              color: COLOR_OPTIONS[index % COLOR_OPTIONS.length],
              opacity: 100,
              visible: true,
              filePath: uploadResult.file_path,
              folderPrefix: uploadResult.folder_prefix || '',
            },
          };
        } else {
          return { success: false, fileName: file.name, error: uploadResult.error };
        }
      } catch (err) {
        return { success: false, fileName: file.name, error: '网络错误' };
      }
    });

    const results = await Promise.all(uploadPromises);

    // 分类结果
    const successFiles: UploadedFile[] = [];
    const failedFiles: string[] = [];

    results.forEach(result => {
      if (result.success && 'data' in result && result.data) {
        successFiles.push(result.data as UploadedFile);
      } else if (!result.success && 'fileName' in result && result.fileName) {
        failedFiles.push(result.fileName);
      }
    });

    // 更新文件列表
    setFiles(prev => [...prev, ...successFiles]);

    // 显示上传失败的文件
    if (failedFiles.length > 0) {
      setError(`以下文件上传失败：${failedFiles.join('、')}`);
    }

    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    event.target.value = '';
  }, [files.length, title, department, patientName]);

  const removeFile = async (id: string) => {
    const file = files.find(f => f.id === id);
    if (!file) return;
    // 后台静默删除服务器上的文件
    try {
      await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [file.filePath] }),
      });
    } catch {
      // 删除失败不阻塞前端操作
    }
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAllFiles = async () => {
    if (files.length === 0) return;
    // 批量删除服务器上的所有已上传文件
    try {
      await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: files.map(f => f.filePath) }),
      });
    } catch {
      // 删除失败不阻塞前端操作
    }
    setFiles([]);
  };

  const updateFile = (id: string, updates: Partial<UploadedFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleSubmit = async () => {
    setError('');
    setGeneratedUrl('');

    if (!title.trim()) {
      setError('页面标题为必填项');
      return;
    }

    if (files.length === 0) {
      setError('至少需要上传一个3D模型文件');
      return;
    }

    // 验证患者年龄
    if (patientAge.trim()) {
      const age = Number(patientAge.trim());
      if (!Number.isInteger(age) || age <= 0) {
        setError('患者年龄必须为正整数');
        return;
      }
    }

    // 验证手机号格式
    if (patientPhone.trim()) {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(patientPhone.trim())) {
        setError('手机号格式不正确');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // 提交前：检查文件夹名称是否与最新元数据一致，不一致则重命名
      let currentFiles = [...files];
      try {
        const renameResponse = await fetch('/api/upload', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_paths: currentFiles.map(f => f.filePath),
            title: title.trim(),
            department: department.trim(),
            patientName: patientName.trim(),
          }),
        });
        const renameResult = await renameResponse.json();

        if (renameResult.success && renameResult.updated_paths) {
          const updatedPaths: Record<string, string> = renameResult.updated_paths;
          const changedKeys = Object.keys(updatedPaths);

          if (changedKeys.length > 0) {
            // 更新文件路径和 folderPrefix
            currentFiles = currentFiles.map(f => {
              const newPath = updatedPaths[f.filePath];
              if (newPath) {
                // 从新路径中提取新的 folderPrefix
                const pathParts = newPath.split('/');
                // 本地: STL文件/新前缀/xxx.stl → pathParts[1]
                // S3: stl/新前缀/xxx.stl → pathParts[1]
                const newFolderPrefix = pathParts.length >= 2 ? pathParts[1] : f.folderPrefix;
                return { ...f, filePath: newPath, folderPrefix: newFolderPrefix };
              }
              return f;
            });
            // 同步到 state
            setFiles(currentFiles);
          }
        }
      } catch (renameErr) {
        console.error('文件夹重命名检查失败:', renameErr);
        // 重命名失败不阻塞提交流程，使用原路径继续
      }

      const response = await fetch('/api/medical/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          patient_name: patientName.trim() || undefined,
          patient_phone: patientPhone.trim() || undefined,
          patient_gender: patientGender || undefined,
          patient_age: patientAge.trim() ? Number(patientAge.trim()) : undefined,
          hospital: hospital.trim() || undefined,
          department: department.trim() || undefined,
          models: currentFiles.map(f => ({
            name: f.name.trim() || f.file.name,
            color: f.color,
            opacity: f.opacity,
            file_path: f.filePath,
            visible: f.visible,
            sort_order: 0,
          })),
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || '提交失败');
        return;
      }

      setGeneratedUrl(result.url);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedUrl);
  };

  // 加载中状态
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部标题栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">医学3D模型配置系统</h1>
              <p className="text-sm text-gray-500 mt-1">配置并发布您的医学三维模型展示页面</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                当前用户：<span className="font-medium text-gray-700">{currentUser?.username}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = '/history'}
              >
                <History className="w-4 h-4 mr-2" />
                历史记录
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                注销
              </Button>
              <Button
                variant="default"
                size="lg"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? '提交中...' : '提交并预览'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* 全局配置区 */}
        <Card>
          <CardHeader>
            <CardTitle>全局配置</CardTitle>
            <CardDescription>定义项目的基本属性和界面风格</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 页面标题 - 独占一行 */}
            <div className="space-y-2">
              <Label htmlFor="title">
                页面标题 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：术前三维重建分析"
              />
            </div>

            {/* 其他配置项 - 两列布局 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientName">患者姓名</Label>
                <Input
                  id="patientName"
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                  placeholder="例如：张三"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientPhone">患者手机号</Label>
                <Input
                  id="patientPhone"
                  value={patientPhone}
                  onChange={e => setPatientPhone(e.target.value)}
                  placeholder="例如：13812345678"
                  type="tel"
                  maxLength={11}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientGender">患者性别</Label>
                <Input
                  id="patientGender"
                  value={patientGender}
                  onChange={e => setPatientGender(e.target.value)}
                  placeholder="例如：男"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientAge">患者年龄</Label>
                <Input
                  id="patientAge"
                  type="number"
                  min="1"
                  step="1"
                  value={patientAge}
                  onChange={e => setPatientAge(e.target.value)}
                  placeholder="请输入正整数"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hospital">医院名称</Label>
                <Input
                  id="hospital"
                  value={hospital}
                  onChange={e => setHospital(e.target.value)}
                  placeholder="例如：某某医院"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">科室名称</Label>
                <Input
                  id="department"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="例如：骨科"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 文件上传区 */}
        <Card>
          <CardHeader>
            <CardTitle>模型文件上传</CardTitle>
            <CardDescription>上传STL格式的三维模型文件，最多50个</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 上传按钮区域 */}
              <div className="flex items-center gap-4">
                <label className={`cursor-pointer ${isUploading || files.length >= MAX_FILES ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors ${
                    isUploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                  }`}>
                    <Upload className="w-4 h-4" />
                    <span>{isUploading ? '上传中...' : '上传STL文件'}</span>
                  </div>
                  <input
                    type="file"
                    accept=".stl"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={files.length >= MAX_FILES || isUploading}
                  />
                </label>
                {files.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={clearAllFiles}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    disabled={isUploading}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    清除并重新上传
                  </Button>
                )}
                <span className="text-sm text-gray-500">
                  已上传 {files.length}/{MAX_FILES} 个文件
                </span>
              </div>

              {/* 上传进度提示 */}
              {isUploading && uploadProgress.total > 0 && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  <span className="text-blue-700">
                    正在上传文件 {uploadProgress.current}/{uploadProgress.total}...
                  </span>
                </div>
              )}

              {/* 文件列表 */}
              {files.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-48">名称</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-24">颜色</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-48">透明度</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">文件路径</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-16">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {files.map((file, index) => (
                        <tr key={file.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <Input
                              value={file.name}
                              onChange={e => updateFile(file.id, { name: e.target.value })}
                              placeholder="输入模型名称"
                              className="h-9"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Select
                              value={file.color}
                              onValueChange={(value: ModelColor) => updateFile(file.id, { color: value })}
                            >
                              <SelectTrigger className="w-32 h-9">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-4 h-4 rounded-full" 
                                    style={{ backgroundColor: COLOR_MAP[file.color] }}
                                  />
                                  <SelectValue />
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                {COLOR_OPTIONS.map(color => (
                                  <SelectItem key={color} value={color}>
                                    <div className="flex items-center gap-2">
                                      <div 
                                        className="w-4 h-4 rounded-full" 
                                        style={{ backgroundColor: COLOR_MAP[color] }}
                                      />
                                      <span>{COLOR_NAMES[color]}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Slider
                                value={[file.opacity]}
                                onValueChange={value => updateFile(file.id, { opacity: value[0] })}
                                min={0}
                                max={100}
                                step={25}
                                className="w-24"
                              />
                              <span className="text-sm text-gray-600 w-10">{file.opacity}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2 text-sm text-gray-600">
                              <FileBox className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <span className="break-all leading-relaxed">{file.filePath}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(file.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileBox className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-500">点击上方按钮上传STL格式文件</p>
                  <p className="text-sm text-gray-400 mt-1">支持同时上传多个文件</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        {/* 生成的访问链接 */}
        {generatedUrl && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-700">提交成功</CardTitle>
              <CardDescription>您的3D模型展示页面已创建完成</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 二维码区域 */}
              <div className="flex flex-col items-center py-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-green-100">
                  <QRCode url={generatedUrl} size={200} />
                </div>
                <p className="text-sm text-muted-foreground mt-2">扫码查看3D模型</p>
              </div>
              
              <div className="flex items-center gap-2">
                <Input
                  value={generatedUrl}
                  readOnly
                  className="bg-white"
                />
                <Button onClick={copyToClipboard} variant="outline">
                  复制链接
                </Button>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => window.open(generatedUrl, '_blank')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  预览页面
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFiles([]);
                    setTitle('');
                    setPatientName('');
                    setHospital('');
                    setDepartment('');
                    setGeneratedUrl('');
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  创建新配置
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
