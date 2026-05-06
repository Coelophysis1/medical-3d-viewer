# 医疗3D模型展示系统 - 项目规范

## 项目概述

本项目是一个医疗3D模型网页展示系统，支持上传、配置和展示STL格式的医疗三维模型。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **3D渲染**: Three.js
- **UI组件**: shadcn/ui (基于 Radix UI)
- **样式**: Tailwind CSS 4
- **数据库**: Supabase (PostgreSQL)
- **认证**: JWT Cookie (jose)
- **二维码**: qr-code-styling

## 项目结构

```
/workspace/projects/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 首页（系统介绍）
│   │   ├── layout.tsx            # 根布局
│   │   ├── login/                # 登录页面
│   │   │   └── page.tsx
│   │   ├── upload/               # 上传端页面（需登录）
│   │   │   └── page.tsx
│   │   ├── view/                 # 展示端页面
│   │   │   └── page.tsx
│   │   ├── verify/               # 患者验证页面
│   │   │   └── page.tsx
│   │   ├── list/                 # 患者模型列表页面
│   │   │   └── page.tsx
│   │   ├── history/              # 医生历史记录页面（需登录）
│   │   │   └── page.tsx
│   │   ├── admin/users/          # 用户管理页面（需管理员权限）
│   │   │   └── page.tsx
│   │   └── api/
│   │       ├── auth/             # 认证相关接口
│   │       │   ├── login/route.ts
│   │       │   ├── logout/route.ts
│   │       │   └── me/route.ts
│   │       ├── admin/users/      # 用户管理接口
│   │       │   ├── route.ts
│   │       │   └── [id]/route.ts
│   │       ├── admin/delete-logs/ # 管理员删除日志接口
│   │       │   └── route.ts
│   │       ├── doctor/           # 医生相关接口
│   │       │   ├── history/route.ts
│   │       │   └── delete-logs/route.ts
│   │       ├── patient/          # 患者相关接口
│   │       │   ├── verify/route.ts
│   │       │   └── [id]/configs/route.ts
│   │       ├── upload/           # 文件上传接口
│   │       │   ├── route.ts              # POST 小文件上传 / DELETE 批量删除 / PATCH 重命名
│   │       │   └── chunk/route.ts        # POST 分块上传 / PUT 合并分块 / DELETE 取消分块
│   │       └── medical/
│   │           └── config/
│   │               ├── route.ts           # POST 创建配置
│   │               └── [code]/route.ts    # GET 获取配置
│   ├── components/
│   │   ├── ui/                   # shadcn/ui 组件库
│   │   ├── ThreeDViewer.tsx      # Three.js 3D视图组件
│   │   └── QRCode.tsx            # 二维码生成组件
│   ├── lib/
│   │   └── auth.ts               # JWT认证工具
│   ├── types/
│   │   └── medical.ts            # 医疗模型类型定义
│   └── storage/
│       └── database/
│           ├── supabase-client.ts    # Supabase客户端
│           ├── medical-service.ts     # 医疗数据服务
│           ├── patient-service.ts     # 患者数据服务
│           ├── user-service.ts        # 用户数据服务
│           └── shared/
│               └── schema.ts         # 数据库Schema
├── public/
│   ├── logo.png                  # 二维码嵌入Logo
│   └── STL文件/                  # STL文件存储目录
├── .coze                         # Coze CLI配置
├── .env.local                    # 环境变量配置
├── package.json
└── tsconfig.json
```

## 核心页面

### 1. 首页 (`/`)
- 系统介绍
- 功能导航卡片
- 跳转至上传页面

### 2. 登录页 (`/login`)
- 用户名/密码登录
- JWT Cookie认证
- 根据角色跳转（admin→用户管理，doctor→上传页面）

### 3. 上传端 (`/upload`) - 需登录
- 全局配置区：标题、患者姓名、患者手机号、医院、科室
- 模型文件上传：STL格式
- 模型参数配置：名称、颜色、透明度
- 提交后生成二维码（带医院Logo）
- 显示访问链接

### 4. 展示端 (`/view?code=xxx`)
- Three.js 3D渲染视图
- 鼠标左键旋转、右键平移、中键缩放
- 左上角悬浮模型控制面板（可折叠）
- 颜色映射、显隐控制、透明度调整
- 显示模型体积

### 5. 患者验证页 (`/verify`)
- 输入姓名+手机号验证身份
- 验证成功跳转到模型列表

### 6. 模型列表页 (`/list?patient_id=xxx`)
- 显示患者所有模型配置
- 按时间倒序排列
- 点击查看具体模型

### 7. 用户管理页 (`/admin/users`) - 需管理员权限
- 用户列表
- 创建新用户
- 重置密码、禁用/启用、删除用户
- 操作日志 Tab：查看所有医生用户的删除操作记录，支持按用户筛选

### 8. 医生历史记录页 (`/history`) - 需登录
- 显示当前用户上传的所有模型配置
- 按时间倒序排列
- 显示标题、患者姓名、医院、科室、日期、模型数量
- 可查看二维码
- 可点击查看模型或复制访问链接
- 删除功能：可删除整条配置记录，同步删除关联的 STL 文件和文件夹
- 删除日志 Tab：显示所有删除操作记录，不可修改

## 数据库表结构

### users
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| username | text | 用户名（唯一） |
| password_hash | text | bcrypt哈希密码 |
| role | text | 角色：admin/doctor |
| status | text | 状态：active/disabled |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### patients
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| name | text | 患者姓名 |
| phone | text | 手机号 |
| created_at | timestamp | 创建时间 |

### medical_configs
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| code | text | 访问码 |
| title | text | 页面标题 |
| patient_name | text | 患者姓名 |
| patient_id | integer | 关联患者ID |
| patient_phone | text | 患者手机号 |
| patient_gender | text | 患者性别 |
| patient_age | integer | 患者年龄 |
| hospital | text | 医院名称 |
| department | text | 科室名称 |
| creator_id | integer | 创建者用户ID |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### medical_models
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| config_id | integer | 关联配置ID |
| name | text | 模型名称 |
| color | text | 渲染颜色 |
| opacity | integer | 透明度 |
| file_path | text | STL文件路径 |
| visible | integer | 是否可见 |
| sort_order | integer | 排序 |
| created_at | timestamp | 创建时间 |

### delete_logs
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| operator_id | integer | 操作人用户ID |
| operator_name | text | 操作人用户名 |
| config_id | integer | 被删除的配置ID |
| config_code | text | 被删除的配置访问码 |
| config_title | text | 配置标题 |
| patient_name | text | 患者姓名 |
| hospital | text | 医院名称 |
| department | text | 科室名称 |
| model_count | integer | 模型数量 |
| deleted_files | text[] | 被删除的文件路径列表 |
| deleted_at | timestamp | 删除时间 |

## API接口

### 认证接口

#### POST /api/auth/login
登录

**请求体：**
```json
{ "username": "admin", "password": "Admin@123456" }
```

**响应：**
```json
{ "success": true, "user": { "id": 1, "username": "admin", "role": "admin" } }
```

#### POST /api/auth/logout
注销

#### GET /api/auth/me
获取当前登录用户信息

### 用户管理接口（需管理员权限）

#### GET /api/admin/users
获取用户列表

#### POST /api/admin/users
创建新用户

**请求体：**
```json
{ "username": "doctor1", "password": "Doctor@123", "role": "doctor" }
```

#### PATCH /api/admin/users/[id]
更新用户（重置密码/禁用）

#### DELETE /api/admin/users/[id]
删除用户

### 患者接口

#### POST /api/patient/verify
验证患者身份

**请求体：**
```json
{ "name": "张三", "phone": "13812345678" }
```

**响应：**
```json
{ "success": true, "patient": { "id": 1, "name": "张三", "phone": "138****5678" } }
```

#### GET /api/patient/[id]/configs
获取患者的模型列表

### 医生历史记录接口

#### GET /api/doctor/history
获取当前登录医生的上传历史记录（需登录）

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "code": "r7eYa",
      "title": "术前三维重建",
      "patient_name": "张三",
      "patient_phone": "13812345678",
      "hospital": "某某医院",
      "department": "骨科",
      "created_at": "2026-04-10T15:21:58.110Z",
      "medical_models": [{"count": 3}]
    }
  ]
}
```

#### GET /api/doctor/delete-logs
获取当前登录医生的删除日志（需登录）

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "operator_name": "doctor1",
      "config_code": "r7eYa",
      "config_title": "术前三维重建",
      "patient_name": "张三",
      "hospital": "某某医院",
      "department": "骨科",
      "model_count": 3,
      "deleted_files": ["STL文件/xxx/xxx.stl"],
      "deleted_at": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

### 管理员接口（需管理员权限）

#### GET /api/admin/delete-logs
获取所有用户的删除日志（需管理员权限）

**查询参数：**
- `operator_id`（可选）：按操作者用户ID筛选

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "operator_id": 2,
      "operator_name": "doctor1",
      "config_code": "r7eYa",
      "config_title": "术前三维重建",
      "patient_name": "张三",
      "hospital": "某某医院",
      "department": "骨科",
      "model_count": 3,
      "deleted_files": ["STL文件/xxx/xxx.stl"],
      "deleted_at": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

### 医疗配置接口

#### POST /api/medical/config
创建医疗3D模型配置

**请求体：**
```json
{
  "title": "页面标题",
  "patient_name": "患者姓名",
  "patient_phone": "手机号",
  "hospital": "医院名称",
  "department": "科室名称",
  "models": [
    {
      "name": "模型名称",
      "color": "purple",
      "opacity": 100,
      "file_path": "STL文件/xxx.stl",
      "visible": true,
      "sort_order": 0
    }
  ]
}
```

**响应：**
```json
{
  "success": true,
  "code": "r7eYa",
  "url": "https://xxx/view?code=r7eYa"
}
```

#### GET /api/medical/config/[code]
根据访问码获取配置

#### DELETE /api/medical/config/[code]
删除配置（需登录，仅创建者可删除）

**操作：**
1. 删除关联的 STL 文件和空目录
2. 删除数据库中的 medical_models 记录（CASCADE）
3. 删除 medical_configs 记录
4. 写入 delete_logs 日志

**响应：**
```json
{ "success": true }
```

### 文件上传接口

#### POST /api/upload
上传STL文件（适用于8MB以内的文件）

#### DELETE /api/upload
批量删除文件

#### PATCH /api/upload
重命名文件夹

#### POST /api/upload/chunk
分块上传（适用于超过8MB的大文件）

**请求体（FormData）：**
```json
{ "chunk": "<Blob>", "uploadId": "唯一上传ID", "chunkIndex": "0" }
```

#### PUT /api/upload/chunk
完成分块上传，合并所有分块

**请求体（JSON）：**
```json
{ "uploadId": "唯一上传ID", "totalChunks": 8, "fileName": "骨骼.stl", "title": "术前三维重建", "department": "骨科", "patientName": "张三" }
```

#### DELETE /api/upload/chunk
取消/清理分块上传

**请求体（JSON）：**
```json
{ "uploadId": "唯一上传ID" }
```

## 模型颜色选项（基于3DSlicer组织/器官颜色表）

| 颜色键 | 组织/器官 | 色值 |
|--------|----------|------|
| tissue | 常规软组织 | #80AE80 |
| bone | 骨骼 | #F1D691 |
| skin | 皮肤 | #B17A65 |
| connective_tissue | 结缔组织 | #6FB8D2 |
| blood | 血液 | #D8654F |
| organ | 一般器官 | #DD8265 |
| mass | 肿块/病灶 | #90EE90 |
| muscle | 肌肉 | #C06858 |
| foreign_object | 异物 (植入物) | #DCF514 |
| teeth | 牙齿 | #FFFADC |
| fat | 脂肪 | #E6DC46 |
| gray_matter | 脑灰质 | #C8C8EB |
| white_matter | 脑白质 | #FAFAD2 |
| nerve | 神经 | #F4D631 |
| vein | 静脉 | #0097CE |
| artery | 动脉 | #D8654F |
| ligament | 韧带 | #B7D6D3 |
| tendon | 肌腱 | #98BDCF |
| cartilage | 软骨 | #6FB8D2 |
| lymph_node | 淋巴结 | #44AC64 |
| lymphatic_vessel | 淋巴管 | #6FC583 |
| cerebrospinal_fluid | 脑脊液 | #55BCFF |
| bile | 胆汁 | #00911E |
| fluid | 一般体液 | #AAFAFA |
| edema | 水肿区 | #8CE0E4 |
| bleeding | 出血区 | #BC411C |
| necrosis | 坏死区 | #D8BFD8 |
| target_volume | 靶区 | #FFFF00 |
| airway | 支气管/气道 | #AFD8F4 |

## 环境变量

```env
# JWT密钥
JWT_SECRET=your-jwt-secret-key

# 初始管理员账号（首次登录时自动创建）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@123456

# 额外初始用户（格式: username:password:role，多个用逗号分隔，首次登录时自动创建）
INITIAL_USERS=doctor1:Doctor@123:doctor
```

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 类型检查
pnpm ts-check

# 代码检查
pnpm lint

# 构建
pnpm build

# 生产运行
pnpm start
```

## 访问方式

患者可通过三种方式访问模型：
1. **二维码扫描** → 直接查看（最简单）
2. **访问码** → 输入访问码查看
3. **姓名+手机号** → 验证后查看所有模型列表

## 注意事项

1. **STL文件**：生产环境存储在S3对象存储，开发环境存储在本地
2. **访问码**：自动生成5位字母数字组合
3. **认证Cookie**：使用CHIPS技术支持iframe环境
4. **二维码Logo**：存储在 `public/logo.png`
