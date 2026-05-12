# 医学3D模型可视化平台 — 项目功能介绍

## 项目概述

本平台是面向医院临床场景的医学三维模型展示系统，支持医生上传 STL 格式的医疗三维模型，配置可视化参数后生成可分享的 3D 展示页面。患者可通过二维码、访问码或身份验证查看自己的模型，医生和管理员可通过后台管理历史记录和用户。

——苏州大学附属第一医院医学3D打印中心

---

## 角色体系

| 角色 | 权限 |
|------|------|
| **医生 (doctor)** | 上传模型、配置参数、生成展示页面、查看/删除自己的历史记录 |
| **管理员 (admin)** | 拥有医生全部权限，额外可管理用户账号、查看所有医生的操作日志 |
| **患者 (无账号)** | 通过身份验证查看自己的模型列表和3D展示 |

---

## 功能模块

### 1. 首页 (`/`)

系统入口页面，提供：
- 平台简介：苏大附一院医学3D模型可视化平台
- 功能导航卡片：配置与上传、3D模型展示
- 三步使用说明：上传模型 → 配置参数 → 分享访问
- 跳转至上传页面

---

### 2. 登录 (`/login`)

- 用户名/密码登录
- 基于 JWT Cookie 的身份认证
- 登录后根据角色自动跳转：
  - 管理员 → 用户管理页 (`/admin/users`)
  - 医生 → 上传页 (`/upload`) 或之前访问的页面
- 支持重定向参数（`?redirect=/upload`）
- **登录频率限制**：默认 60 秒内最多 5 次尝试，超出返回 HTTP 429

---

### 3. 模型上传与配置 (`/upload`) — 需登录

这是医生的核心工作界面，包含两大区域：

#### 全局配置区
| 字段 | 说明 | 必填 |
|------|------|------|
| 页面标题 | 展示页面的标题，如"术前三维重建分析" | 是 |
| 患者姓名 | 关联的患者姓名 | 否 |
| 患者手机号 | 用于患者身份验证查询 | 否 |
| 患者性别 | 男/女 | 否 |
| 患者年龄 | 正整数 | 否 |
| 医院名称 | 如"某某医院" | 否 |
| 科室名称 | 如"骨科" | 否 |

#### 模型文件上传区
- **支持格式**：STL（ASCII/Binary 均可）
- **文件上限**：最多 50 个模型
- **大文件支持**：超过 8MB 的文件自动切换为分块上传（5MB/块），避免反向代理请求体限制
- **上传进度**：实时显示当前上传文件序号和大文件分块百分比
- **文件管理**：支持单个删除、全部清除重新上传

#### 模型参数配置
每个上传的模型可独立配置：
- **名称**：自定义模型名称
- **颜色**：基于 3DSlicer 组织/器官颜色表，提供 29 种专业医学颜色（见下表）
- **透明度**：0%~100%，步进 25%

#### 提交与分享
提交后系统自动生成：
- **访问码**：5 位字母数字随机组合（如 `r7eYa`）
- **访问链接**：`/view?code=r7eYa`
- **二维码**：嵌入医院 Logo，患者扫码即可查看

---

### 4. 3D 模型展示 (`/view?code=xxx`)

患者或医生查看模型的核心页面，基于 Three.js 实现专业级 3D 渲染。

#### 渲染模式

| 模式 | 特点 |
|------|------|
| **经典渲染**（默认） | Lambert 光照 + 强方向光，轻量流畅，适合快速预览 |
| **电影渲染** | ACES 色调映射 + IBL 环境光 + MeshPhysicalMaterial 次表面散射 + SSAO 环境遮蔽 + SMAA 抗锯齿，呈现极致画质 |

#### 交互操作
- **鼠标左键**：旋转模型
- **鼠标右键**：平移视图
- **鼠标中键/滚轮**：缩放
- **复位视角**按钮：一键恢复默认视角

#### 悬浮控制面板（左上角，可折叠）
- 模型列表：显示每个模型的名称和体积
- 颜色映射：可重新选择模型颜色
- 显隐控制：开关切换模型可见性
- 透明度调节：滑块调整模型透明度

#### 悬浮按钮（右上角）
| 按钮 | 功能 |
|------|------|
| 复位视角 | 恢复默认相机位置和角度 |
| 切换背景 | 在黑色/灰色/白色（经典）或黑色/灰色/淡灰（电影）间切换 |
| 经典渲染/电影渲染 | 切换渲染模式，当前模式高亮显示 |
| 旋转展示 | 开启/关闭模型自动旋转展示，绕当前视角垂直轴逆时针旋转，方便全方位展示 |

#### 背景色配置
| 背景 | 经典渲染 | 电影渲染 |
|------|---------|---------|
| 黑色 | #000000 | #000000 |
| 灰色 | #808080 | #808080 |
| 浅色 | #ffffff | #f0f0f0 |

---

### 5. 患者身份验证 (`/verify`)

患者无需账号即可查看模型：
- 输入姓名 + 手机号进行身份验证
- 验证成功后跳转至该患者的模型列表页
- 手机号格式校验（11位中国大陆手机号）

---

### 6. 患者模型列表 (`/list?patient_id=xxx`)

- 显示该患者关联的所有模型配置
- 按创建时间倒序排列
- 每条记录显示：标题、科室、日期、模型数量
- 点击"查看"跳转至 3D 展示页

---

### 7. 医生历史记录 (`/history`) — 需登录

医生的个人工作台，包含两个 Tab：

#### 上传记录
- 显示当前医生创建的所有模型配置
- 每条记录格式：日期-科室-标题-患者姓名
- 操作：
  - **详细信息**：弹出详情面板，显示二维码、访问链接、患者信息，支持预览和复制链接
  - **删除**：确认后删除整条配置记录，同步删除关联的 STL 文件和文件夹，操作记入删除日志

#### 删除日志
- 显示当前医生的所有删除操作记录（只读，不可修改）
- 每条记录包含：配置标题、患者、医院/科室、模型数量、访问码、删除的文件列表、操作时间

---

### 8. 用户管理 (`/admin/users`) — 需管理员权限

管理员的后台管理界面，包含两个 Tab：

#### 用户列表
- 显示所有系统用户
- 操作：
  - **创建用户**：设置用户名、密码、角色（管理员/医生）
  - **重置密码**：为用户设置新密码
  - **禁用/启用**：切换用户账号状态
  - **删除用户**：移除用户账号（不可删除自己）

#### 操作日志
- 查看所有医生用户的删除操作记录（只读，不可修改）
- 支持按医生用户筛选
- 点击行可展开查看被删除的文件详细路径列表
- 每条记录包含：操作人、配置标题、访问码、患者、医院/科室、模型数量、删除文件数、操作时间

---

## 3D 渲染技术细节

### 渲染管线架构

```
经典渲染模式：
  Opaque Pass (MSAA 4x) → 直接输出

电影渲染模式：
  Opaque Pass → EffectComposer → RenderPass → SSAOPass → SMAAPass → OutputPass (ACES)
  Transparent Pass → WBOIT Accumulation/Revealage → Composite (含 ACES)
  → 最终合成
```

### WBOIT (加权混合顺序无关透明)

采用 McGuire 2013 年的 WBOIT 算法实现正确的透明渲染：
- **Pass 1**：不透明物体渲染（支持 EffectComposer 后处理管线）
- **Pass 2**：透明物体 WBOIT 累积/揭示渲染
- **Pass 3**：全屏四边形合成

### 电影渲染特性
- **ACES Filmic 色调映射**：防止高光过曝，自然色彩压缩
- **IBL 环境光照**：基于 RoomEnvironment + PMREMGenerator 生成虚拟摄影棚环境图
- **三点照明**：主光 + 补光 + 轮廓光，跟随摄像机旋转
- **MeshPhysicalMaterial + Fake SSS**：通过 transmission/thickness/ior/clearcoat 模拟次表面散射
- **SSAO 环境遮蔽**：增强模型细节的深度感
- **SMAA 抗锯齿**：后处理抗锯齿 + MSAA 渲染目标

### 旋转展示算法
- **旋转中心**：模型几何中心（controls.target）
- **旋转轴**：相机局部 Y 轴（当前视角的垂直向上方向）
- **旋转速度**：每帧 0.008 弧度（约 13 秒一圈）
- **交互处理**：旋转时禁用手动控制，停止时无缝切换回 TrackballControls

### 29 种专业医学颜色

基于 3DSlicer 组织/器官颜色表：

| 颜色键 | 组织/器官 | 色值 | | 颜色键 | 组织/器官 | 色值 |
|--------|----------|------|-|--------|----------|------|
| tissue | 常规软组织 | #80AE80 | | gray_matter | 脑灰质 | #C8C8EB |
| bone | 骨骼 | #F1D691 | | white_matter | 脑白质 | #FAFAD2 |
| skin | 皮肤 | #B17A65 | | nerve | 神经 | #F4D631 |
| connective_tissue | 结缔组织 | #6FB8D2 | | vein | 静脉 | #0097CE |
| blood | 血液 | #D8654F | | artery | 动脉 | #D8654F |
| organ | 一般器官 | #DD8265 | | ligament | 韧带 | #B7D6D3 |
| mass | 肿块/病灶 | #90EE90 | | tendon | 肌腱 | #98BDCF |
| muscle | 肌肉 | #C06858 | | cartilage | 软骨 | #6FB8D2 |
| foreign_object | 异物(植入物) | #DCF514 | | lymph_node | 淋巴结 | #44AC64 |
| teeth | 牙齿 | #FFFADC | | lymphatic_vessel | 淋巴管 | #6FC583 |
| fat | 脂肪 | #E6DC46 | | cerebrospinal_fluid | 脑脊液 | #55BCFF |
| bile | 胆汁 | #00911E | | fluid | 一般体液 | #AAFAFA |
| edema | 水肿区 | #8CE0E4 | | bleeding | 出血区 | #BC411C |
| necrosis | 坏死区 | #D8BFD8 | | target_volume | 靶区 | #FFFF00 |
| airway | 支气管/气道 | #AFD8F4 | | | | |

---

## 患者访问方式

患者无需注册账号，可通过以下三种方式查看 3D 模型：

1. **二维码扫描**（最简单）：直接扫码打开展示页面
2. **访问码**：在页面输入 5 位访问码查看
3. **姓名 + 手机号**：通过身份验证后查看该患者的所有模型列表

---

## 数据安全与审计

### 认证与授权
- **JWT Cookie 认证**：基于 jose 库实现，支持 CHIPS 技术（Partitioned Cookie），兼容 iframe 环境
- **权限控制**：API 层面验证登录状态和角色权限
- **密码加密**：使用 bcrypt 进行密码哈希存储

### 操作审计
- 所有删除操作自动记录到 `delete_logs` 表
- 记录内容：操作人、配置信息、删除的文件列表、操作时间
- 删除日志在界面上只读，无法修改或删除
- 删除配置时自动清理服务器上的 STL 文件和空目录

### 访问控制
- **管理后台 IP 白名单**：
  - 环境变量：`ADMIN_IP_WHITELIST`
  - 支持格式：单个 IP 或 CIDR（如 `192.168.1.0/24`）
  - 多个地址用逗号分隔
  - 未配置则不限制访问
  - 保护路径：`/admin/*` 和 `/api/admin/*`

- **登录频率限制**：
  - 环境变量：`LOGIN_RATE_LIMIT`（格式：`次数/秒数`）
  - 默认值：`5/60`（60 秒内最多 5 次登录尝试）
  - 超出限制返回 HTTP 429 + `Retry-After` 响应头
  - 基于 IP 地址的滑动窗口算法
  - 每 5 分钟自动清理过期记录

---

## 技术架构

| 层次 | 技术 |
|------|------|
| 前端框架 | Next.js 16 (App Router) + React 19 |
| 语言 | TypeScript 5 |
| 3D 渲染 | Three.js (TrackballControls, STLLoader, EffectComposer, SSAO, SMAA, WBOIT) |
| UI 组件 | shadcn/ui (Radix UI) |
| 样式 | Tailwind CSS 4 |
| 数据库 | PostgreSQL (pg 驱动直连) |
| 认证 | JWT Cookie (jose) |
| 密码加密 | bcrypt |
| 二维码 | qr-code-styling |
| 文件存储 | 开发环境本地存储，生产环境 S3 对象存储 |

### 数据库连接

支持多种配置方式：
1. **完整连接串**：`DATABASE_URL=postgresql://user:password@host:port/database`
2. **系统环境变量**：自动读取 `PGDATABASE_URL`（沙箱环境）
3. **分离参数**：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`

优先级：`DATABASE_URL` > `PGDATABASE_URL` > 分离参数

---

## 环境变量配置

```env
# 数据库连接（必填）
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/medical_3d

# JWT 密钥（必填，至少 32 位随机字符串）
JWT_SECRET=your-random-jwt-secret-key-at-least-32-chars

# 初始管理员账号（首次启动时自动创建）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@123456

# 初始医生账号（格式：username:password:role，多个用逗号分隔）
INITIAL_USERS=doctor1:Doctor@123:doctor

# 管理后台 IP 白名单（可选，逗号分隔，支持 CIDR）
ADMIN_IP_WHITELIST=127.0.0.1,192.168.1.0/24

# 登录频率限制（可选，格式：次数/秒数，默认 5/60）
LOGIN_RATE_LIMIT=5/60

# 公网域名（用于生成访问链接）
COZE_PROJECT_DOMAIN_DEFAULT=medical.yourhospital.com

# S3 对象存储（生产环境）
S3_ENDPOINT=your-s3-endpoint
S3_REGION=your-region
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_PUBLIC_URL=https://your-bucket.your-domain.com
```

---

## 数据库表结构

### users（用户表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| username | text | 用户名（唯一） |
| password_hash | text | bcrypt 哈希密码 |
| role | text | 角色：admin/doctor |
| status | text | 状态：active/disabled |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### patients（患者表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| name | text | 患者姓名 |
| phone | text | 手机号 |
| created_at | timestamp | 创建时间 |

### medical_configs（模型配置表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| code | text | 访问码 |
| title | text | 页面标题 |
| patient_name | text | 患者姓名 |
| patient_id | integer | 关联患者 ID |
| patient_phone | text | 患者手机号 |
| patient_gender | text | 患者性别 |
| patient_age | integer | 患者年龄 |
| hospital | text | 医院名称 |
| department | text | 科室名称 |
| creator_id | integer | 创建者用户 ID |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### medical_models（模型表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| config_id | integer | 关联配置 ID |
| name | text | 模型名称 |
| color | text | 渲染颜色 |
| opacity | integer | 透明度 |
| file_path | text | STL 文件路径 |
| visible | integer | 是否可见 |
| sort_order | integer | 排序 |
| created_at | timestamp | 创建时间 |

### delete_logs（删除日志表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| operator_id | integer | 操作人用户 ID |
| operator_name | text | 操作人用户名 |
| config_id | integer | 被删除的配置 ID |
| config_code | text | 被删除的配置访问码 |
| config_title | text | 配置标题 |
| patient_name | text | 患者姓名 |
| hospital | text | 医院名称 |
| department | text | 科室名称 |
| model_count | integer | 模型数量 |
| deleted_files | text[] | 被删除的文件路径列表 |
| deleted_at | timestamp | 删除时间 |

---

## 页面导航关系

```
首页 (/)
├── 登录 (/login)
│   ├── 医生 → 上传页 (/upload)
│   │   └── 提交成功 → 历史记录 (/history)
│   └── 管理员 → 用户管理 (/admin/users)
├── 患者验证 (/verify)
│   └── 模型列表 (/list?patient_id=xxx)
│       └── 3D展示 (/view?code=xxx)
└── 3D展示 (/view?code=xxx) ← 直接通过访问码/二维码访问
```

---

## 部署说明

### 开发环境
```bash
pnpm install
pnpm dev
```

### 生产环境
```bash
pnpm install --prod
pnpm build
pnpm start
```

### Docker 部署（推荐）

详见项目 `Dockerfile` 和 `docker-compose.yml`。

### 反向代理配置（Nginx）

```nginx
server {
    listen 443 ssl http2;
    server_name medical.yourhospital.com;

    client_max_body_size 100M;  # 支持大文件上传

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```
