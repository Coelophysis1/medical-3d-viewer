'use client';

import { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Key, UserCheck, UserX, LogOut, 
  Loader2, Users, Shield, User, FileText, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface User {
  id: number;
  username: string;
  role: 'admin' | 'doctor';
  status: 'active' | 'disabled';
  created_at: string;
}

interface DeleteLog {
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
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // 创建用户对话框状态
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'doctor'>('doctor');
  const [isCreating, setIsCreating] = useState(false);
  
  // 删除确认对话框状态
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // 操作中状态
  const [operatingUserId, setOperatingUserId] = useState<number | null>(null);
  
  // Tab 切换
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  
  // 删除日志
  const [deleteLogs, setDeleteLogs] = useState<DeleteLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [filterUserId, setFilterUserId] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  
  // 检查登录状态和获取用户列表
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 获取当前用户
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        if (!meRes.ok) {
          window.location.href = '/login?redirect=/admin/users';
          return;
        }
        const meData = await meRes.json();
        if (!meData.success || meData.user.role !== 'admin') {
          window.location.href = '/upload';
          return;
        }
        setCurrentUser(meData.user);
        
        // 获取用户列表
        const usersRes = await fetch('/api/admin/users', { credentials: 'include' });
        const usersData = await usersRes.json();
        if (usersData.success) {
          setUsers(usersData.users);
        }
        setIsLoading(false);
      } catch {
        setError('加载失败');
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // 获取删除日志
  const fetchDeleteLogs = async (userId?: string) => {
    setIsLoadingLogs(true);
    try {
      const url = userId && userId !== 'all'
        ? `/api/admin/delete-logs?operator_id=${userId}`
        : '/api/admin/delete-logs';
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setDeleteLogs(data.data || []);
      }
    } catch {
      console.error('获取删除日志失败');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // 切换到日志 Tab 时加载数据
  useEffect(() => {
    if (activeTab === 'logs') {
      fetchDeleteLogs(filterUserId);
    }
  }, [activeTab, filterUserId]);
  
  // 创建用户
  const handleCreateUser = async () => {
    setError('');
    
    if (!newUsername.trim()) {
      setError('请输入用户名');
      return;
    }
    
    if (!newPassword || newPassword.length < 6) {
      setError('密码长度至少6位');
      return;
    }
    
    setIsCreating(true);
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        setError(data.error || '创建失败');
        return;
      }
      
      setUsers([data.user, ...users]);
      setCreateDialogOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('doctor');
      
    } catch {
      setError('网络错误');
    } finally {
      setIsCreating(false);
    }
  };
  
  // 重置密码
  const handleResetPassword = async (userId: number) => {
    const password = prompt('请输入新密码（至少6位）：');
    if (!password || password.length < 6) {
      alert('密码长度至少6位');
      return;
    }
    
    setOperatingUserId(userId);
    
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert('密码重置成功');
      } else {
        alert(data.error || '重置失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setOperatingUserId(null);
    }
  };
  
  // 切换用户状态
  const handleToggleStatus = async (userId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    const action = newStatus === 'disabled' ? '禁用' : '启用';
    
    if (!confirm(`确定要${action}该用户吗？`)) {
      return;
    }
    
    setOperatingUserId(userId);
    
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, status: newStatus as 'active' | 'disabled' } : u
        ));
      } else {
        alert(data.error || '操作失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setOperatingUserId(null);
    }
  };
  
  // 删除用户
  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    
    setIsDeleting(true);
    
    try {
      const res = await fetch(`/api/admin/users/${deleteUserId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      const data = await res.json();
      
      if (data.success) {
        setUsers(users.filter(u => u.id !== deleteUserId));
      } else {
        alert(data.error || '删除失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setIsDeleting(false);
      setDeleteUserId(null);
    }
  };
  
  // 注销
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  };
  
  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // 格式化日期时间
  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">用户管理</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              当前用户：<span className="font-medium text-gray-700">{currentUser?.username}</span>
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              注销
            </Button>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-0">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              用户列表
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              操作日志
            </button>
          </div>
        </div>
      </div>
      
      {/* 用户列表 Tab */}
      {activeTab === 'users' && (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  用户列表
                </CardTitle>
                <CardDescription>
                  管理系统用户账号，创建新用户或修改现有用户状态
                </CardDescription>
              </div>
              
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    创建用户
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>创建新用户</DialogTitle>
                    <DialogDescription>
                      填写用户信息创建新账号
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="new-username">用户名</Label>
                      <Input
                        id="new-username"
                        placeholder="请输入用户名"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        disabled={isCreating}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="new-password">密码</Label>
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="至少6位"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isCreating}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="new-role">角色</Label>
                      <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'doctor')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="doctor">医生</SelectItem>
                          <SelectItem value="admin">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleCreateUser} disabled={isCreating}>
                      {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      创建
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">用户名</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">角色</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">状态</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">创建时间</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{user.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role === 'admin' ? '管理员' : '医生'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                          {user.status === 'active' ? '正常' : '已禁用'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetPassword(user.id)}
                            disabled={operatingUserId === user.id}
                            title="重置密码"
                          >
                            <Key className="w-4 h-4" />
                          </Button>
                          
                          {user.id !== currentUser?.id && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleStatus(user.id, user.status)}
                                disabled={operatingUserId === user.id}
                                title={user.status === 'active' ? '禁用' : '启用'}
                              >
                                {user.status === 'active' ? (
                                  <UserX className="w-4 h-4 text-orange-500" />
                                ) : (
                                  <UserCheck className="w-4 h-4 text-green-500" />
                                )}
                              </Button>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteUserId(user.id)}
                                disabled={operatingUserId === user.id}
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {users.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  暂无用户
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* 操作日志 Tab */}
      {activeTab === 'logs' && (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  操作日志
                </CardTitle>
                <CardDescription>
                  查看所有用户的删除操作记录，日志不可修改
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">按用户筛选：</span>
                <Select value={filterUserId} onValueChange={setFilterUserId}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部用户</SelectItem>
                    {users
                      .filter(u => u.role === 'doctor')
                      .map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.username}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingLogs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : deleteLogs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                暂无操作日志
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作人</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">配置标题</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">访问码</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">患者</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">医院/科室</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">模型数</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">删除文件</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {deleteLogs.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="font-medium">{log.operator_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {log.config_title || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{log.config_code}</code>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {log.patient_name || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {log.hospital && log.department
                              ? `${log.hospital} / ${log.department}`
                              : log.hospital || log.department || '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="secondary">{log.model_count}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {log.deleted_files && log.deleted_files.length > 0 ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-sm text-gray-600">{log.deleted_files.length} 个</span>
                                {expandedLogId === log.id ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {formatDateTime(log.deleted_at)}
                          </td>
                        </tr>
                        {expandedLogId === log.id && log.deleted_files && log.deleted_files.length > 0 && (
                          <tr key={`${log.id}-files`} className="bg-gray-50">
                            <td colSpan={8} className="px-6 py-3">
                              <div className="text-xs text-gray-500 mb-1.5">已删除文件：</div>
                              <ul className="space-y-0.5">
                                {log.deleted_files.map((file, idx) => (
                                  <li key={idx} className="text-xs text-gray-600 font-mono flex items-center gap-1.5">
                                    <Trash2 className="w-3 h-3 text-red-400 flex-shrink-0" />
                                    {file}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}
      
      {/* 删除确认对话框 */}
      <AlertDialog open={deleteUserId !== null} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除该用户吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={isDeleting}>
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
