# 医学三维重建可视化平台 — 腾讯云部署完整操作流程

> 面向开发新手，从零到上线，全程约 1-4 周（主要耗时在 ICP 备案）。
> 本文档配套文件：`deploy.sh`（一键部署脚本）、`.env.production.example`（环境变量模板）。

---

## 目录

1. [整体流程概览](#一整体流程概览)
2. [第一步：购买云服务器](#二第一步购买云服务器)
3. [第二步：购买域名 + ICP 备案](#三第二步购买域名--icp-备案)
4. [第三步：上传代码到服务器](#四第三步上传代码到服务器)
5. [第四步：运行一键部署脚本](#五第四步运行一键部署脚本)
6. [第五步：配置域名与 HTTPS](#六第五步配置域名与-https)
7. [第六步：接入微信公众号](#七第六步接入微信公众号)
8. [第七步：数据库备份与日常维护](#八第七步数据库备份与日常维护)

---

## 一、整体流程概览

```
买服务器 ──┐
           ├──→ 上传代码 → 运行部署脚本 → 服务上线(IP:5000)
买域名 ────┤                        ↓
   │                               配置 Nginx 反向代理
   ↓                               + HTTPS 证书
ICP 备案(2-4周) ────────────────────→ 用域名访问
                                       ↓
                                    接入公众号菜单
```

- **最快路径**：不配域名，直接用 `IP:5000` 访问，1 天可上线（适合内部测试）
- **完整路径**：加域名 + HTTPS + 公众号，约 2-4 周（备案占大头）

---

## 二、第一步：购买云服务器

### 2.1 选购

打开 [腾讯云轻量应用服务器](https://cloud.tencent.com/product/lighthouse)：

| 配置项 | 推荐值 |
|--------|--------|
| 地域 | 上海 或 广州（离苏州近） |
| 镜像 | **Ubuntu 22.04 LTS**（千万别选"应用镜像"） |
| 套餐 | 2核4G 5M 60GB SSD（约 ¥208/15个月） |
| 时长 | 先买 1 年（新用户优惠，买1年送3个月） |

### 2.2 初始化

1. 购买完成后，进入控制台 → 轻量应用服务器 → 你的实例
2. 点「重置密码」，设置一个强 root 密码（**记下来，后面 SSH 要用**）
3. 在「防火墙」页面确认已放行 **22 端口**（SSH）和 **5000 端口**（应用），没有就点「添加规则」加上

### 2.3 测试 SSH 连接

在你自己电脑上（Win + R 输入 `cmd`）：

```bash
ssh root@你的服务器公网IP
# 首次会提示确认指纹，输入 yes
# 然后输入你设置的 root 密码
```

看到 `root@xxx:~#` 提示符就说明连接成功。退出输入 `exit`。

> 公网 IP 在控制台的实例列表里能看到，形如 `43.xx.xx.xx`。

---

## 三、第二步：购买域名 + ICP 备案

> **这一步是为了让微信内能打开你的网页**（微信强制要求备案域名 + HTTPS）。如果暂时只想用 IP 测试，可跳过，之后补办。

### 3.1 买域名

在腾讯云 [域名注册](https://cloud.tencent.com/product/domain) 买一个域名（如 `medical3d.cn`，约 ¥50-70/年）。

### 3.2 ICP 备案

1. 腾讯云控制台 → 「ICP 备案」→ 开始备案
2. 需要准备：身份证、手机号、人脸核验
3. 用腾讯云服务器可免费备案，周期 **2-4 周**
4. 备案通过后，把域名解析到你的服务器 IP（控制台 → DNS 解析 → 添加 A 记录指向服务器 IP）

> ⚠️ 医疗健康类网站备案可能需要额外材料（如单位资质），建议用**个人主体**备案一个普通域名，网站内容描述成"个人技术展示"，避免触发医疗前置审批。

---

## 四、第三步：上传代码到服务器

### 4.1 本地打包

在你电脑的项目根目录（`project_20260707_094039/projects`）执行：

```bash
# 打包前先删除本地 node_modules 和 .next（这些不用上传，服务器会重新安装）
# 在项目目录下：
tar -czf medical3d.tar.gz \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=data \
  --exclude=.git \
  .
```

会生成 `medical3d.tar.gz` 压缩包。

### 4.2 上传到服务器

用 `scp` 命令上传（在本地 cmd 里执行）：

```bash
scp medical3d.tar.gz root@你的服务器IP:/opt/
```

### 4.3 服务器上解压

SSH 登录服务器后：

```bash
mkdir -p /opt/medical-3d
cd /opt/medical-3d
tar -xzf /opt/medical3d.tar.gz
```

解压完成后，`deploy.sh` 应该就在 `/opt/medical-3d/` 目录下。

---

## 五、第四步：运行一键部署脚本

SSH 登录服务器，执行：

```bash
cd /opt/medical-3d
bash deploy.sh
```

脚本会自动完成 9 件事：

1. 安装基础工具（git、编译工具链）
2. 安装 Node.js 22
3. 安装 pnpm 9
4. 安装 PM2
5. 生成 `.env`（自动生成随机 JWT 密钥和管理员密码）
6. 安装项目依赖
7. 构建项目（next build + tsup 打包）
8. 创建数据目录
9. PM2 启动服务 + 开机自启

### 4.1 重要：记录初始管理员密码

脚本运行时会打印类似：

```
已自动生成 .env，请记录以下初始管理员密码：
  用户名: admin
  密码:   xxxxxxxx
```

**务必记下这个密码**，这是首次登录的凭证。

### 4.2 修改站点 URL

编辑 `.env`，把 `NEXT_PUBLIC_SITE_URL` 改成你的实际地址：

```bash
nano /opt/medical-3d/.env
```

- 用 IP：`http://43.xx.xx.xx:5000`
- 用域名（备案后）：`https://你的域名`

改完后**必须重新构建**（因为 NEXT_PUBLIC 变量在构建时内联）：

```bash
cd /opt/medical-3d
pnpm next build
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
pm2 restart medical-3d
```

### 4.3 验证

浏览器访问 `http://你的IP:5000`，能看到首页就成功了。

用记录的 `admin / 密码` 登录测试。

---

## 六、第五步：配置域名与 HTTPS

> 前提：域名已备案、已解析到服务器 IP。

### 6.1 安装 Nginx

```bash
apt-get install -y nginx
```

### 6.2 配置反向代理

```bash
nano /etc/nginx/sites-available/medical3d
```

写入：

```nginx
server {
    listen 80;
    server_name 你的域名;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # 大文件上传
        client_max_body_size 500m;
    }
}
```

启用配置：

```bash
ln -s /etc/nginx/sites-available/medical3d /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 6.3 配置 HTTPS（免费 SSL 证书）

```bash
# 安装 certbot
apt-get install -y certbot python3-certbot-nginx

# 一键签发并配置 HTTPS
certbot --nginx -d 你的域名
```

按提示输入邮箱、同意条款，certbot 会自动签发证书并配置 HTTPS，**证书会自动续期**。

完成后访问 `https://你的域名` 即可。

---

## 七、第六步：接入微信公众号

### 7.1 前提

- 已有一个认证的公众号（订阅号即可，服务号更好）
- 域名已备案 + HTTPS（微信强制）

### 7.2 配置入口

1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 在「内容与互动 → 自定义菜单」添加菜单，类型选「跳转网页」，URL 填 `https://你的域名`
3. 在「自动回复」里设置关键词回复，回复内容里放网页链接

### 7.3 引流闭环设计

```
医生门诊/病房 → 给患者发二维码（或纸质卡片）
      ↓
患者微信扫码 → 打开 3D 模型查看页
      ↓
页面顶部引导「关注公众号获取更多服务」
      ↓
患者关注公众号 → 沉淀为粉丝
```

> 二维码可以用 `https://你的域名/view?code=访问码` 生成，或直接在页面详情里点「复制链接」。

---

## 八、第七步：数据库备份与日常维护

### 8.1 自动备份脚本

```bash
nano /opt/medical-3d/backup.sh
```

写入：

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
mkdir -p $BACKUP_DIR
# 备份数据库
cp /opt/medical-3d/data/medical3d.db "$BACKUP_DIR/medical3d_$(date +%Y%m%d).db"
# 备份上传的文件（可选，文件大时注释掉）
tar -czf "$BACKUP_DIR/uploads_$(date +%Y%m%d).tar.gz" /opt/medical-3d/public/uploads/stl/
# 保留最近 14 天
find $BACKUP_DIR -mtime +14 -delete
```

```bash
chmod +x /opt/medical-3d/backup.sh
# 每天凌晨 3 点自动备份
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/medical-3d/backup.sh") | crontab -
```

### 8.2 常用维护命令

| 操作 | 命令 |
|------|------|
| 查看服务状态 | `pm2 status` |
| 查看日志 | `pm2 logs medical-3d` |
| 重启服务 | `pm2 restart medical-3d` |
| 停止服务 | `pm2 stop medical-3d` |
| 查看磁盘占用 | `df -h` |

### 8.3 更新代码

以后改了代码要更新：

```bash
# 本地重新打包上传后，服务器上：
cd /opt/medical-3d
# 解压覆盖（保留 data 和 .env）
tar -xzf /opt/medical3d.tar.gz
pnpm install
pnpm next build
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
pm2 restart medical-3d
```

---

## 附录：踩坑提醒

| 坑 | 说明 |
|----|------|
| 镜像选错 | 一定要选 **Ubuntu 22.04 LTS** 系统镜像，不要选带宝塔/WordPress 的应用镜像 |
| 端口没放行 | 轻量服务器的防火墙和系统防火墙是两套，都要放行 5000 |
| NEXT_PUBLIC 变量 | 改了 `NEXT_PUBLIC_SITE_URL` 必须重新 build，否则前端还是旧地址 |
| better-sqlite3 编译 | 脚本已自动装 `build-essential` 和 `python3`，若仍报错看 `pm2 logs` |
| 备案描述 | 用个人主体备案，网站内容别写"医疗"，写"技术展示"更稳妥 |
| 微信白屏 | 先在自己手机微信里打开 IP 地址测试 3D 渲染，确认 WebGL 兼容性 |
