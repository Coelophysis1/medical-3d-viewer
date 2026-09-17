#!/bin/bash
# ============================================================
# 医学3D平台一键部署脚本（Ubuntu 22.04）
# 用法：代码上传到服务器后，在项目根目录以 root 运行：
#   bash deploy.sh
# ============================================================
set -euo pipefail

APP_DIR="/opt/medical-3d"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== 1/9 安装基础工具 ===${NC}"
apt-get update -y
apt-get install -y curl git build-essential python3 openssl

echo -e "${GREEN}=== 2/9 安装 Node.js 22 ===${NC}"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v)"

echo -e "${GREEN}=== 3/9 安装 pnpm 9 ===${NC}"
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9
fi
echo "pnpm: $(pnpm -v)"

echo -e "${GREEN}=== 4/9 安装 PM2 ===${NC}"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo -e "${GREEN}=== 5/9 配置环境变量 ===${NC}"
if [ ! -f .env ]; then
  # 自动生成随机密钥和密码
  JWT_SECRET="$(openssl rand -hex 32)"
  ADMIN_PASS="$(openssl rand -base64 12 | tr '+/' 'Ab')"
  cat > .env <<EOF
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:5000
PORT=5000
HOSTNAME=0.0.0.0
JWT_SECRET=${JWT_SECRET}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASS}
SQLITE_PATH=${APP_DIR}/data/medical3d.db
EOF
  echo -e "${YELLOW}已自动生成 .env，请记录以下初始管理员密码（登录后请立即修改）：${NC}"
  echo -e "${YELLOW}  用户名: admin${NC}"
  echo -e "${YELLOW}  密码:   ${ADMIN_PASS}${NC}"
  echo -e "${YELLOW}同时请编辑 .env 中的 NEXT_PUBLIC_SITE_URL 为你的域名或公网IP。${NC}"
else
  echo ".env 已存在，跳过生成"
fi

echo -e "${GREEN}=== 6/9 安装项目依赖 ===${NC}"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo -e "${GREEN}=== 7/9 构建项目 ===${NC}"
pnpm next build
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo -e "${GREEN}=== 8/9 创建数据目录 ===${NC}"
mkdir -p data public/uploads/stl

echo -e "${GREEN}=== 9/9 启动服务 ===${NC}"
# 停止旧进程（如果存在）
pm2 delete medical-3d 2>/dev/null || true
pm2 start dist/server.js --name medical-3d --max-memory-restart 500M
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo "查看状态: pm2 status"
echo "查看日志: pm2 logs medical-3d"
echo "重启服务: pm2 restart medical-3d"
echo ""
echo "访问地址: http://你的IP:5000"
echo ""
echo "如需域名和 HTTPS，请参考 DEPLOY.md 的「域名备案与 HTTPS」章节。"
