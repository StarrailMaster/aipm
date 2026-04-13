#!/usr/bin/env bash
#
# AIPM 首次安装脚本 —— 幂等，Ubuntu 20.04 / 22.04 / 24.04 通用
#
# 会做这些事：
#   1. apt 装：nginx、postgresql、build-essential、curl、git
#   2. 装 Node.js 22 LTS (via NodeSource) + 全局 pnpm + 全局 pm2
#   3. 初始化 PostgreSQL：创建 aipm 库 + aipm 用户（随机强密码）
#   4. 生成 packages/server/.env（DATABASE_URL / JWT_SECRET 自动填）
#   5. pnpm install --frozen-lockfile
#   6. prisma generate + db push（首次用 push，不走 migrate）
#   7. 跑 seed 脚本（admin@aipm.com / admin123 + byron@aipm.dev / admin123 + 3 个测试账户）
#   8. pnpm build 前端 + tsc 编译后端
#   9. 用 pm2 启动 server（单进程、watch 关闭、日志落 /var/log/aipm）
#  10. 配置 nginx 反代：
#        外部访问 http://<server-ip>:${AIPM_PORT} → 静态前端 + /api /ws 反代到 127.0.0.1:3100
#
# 使用方式：
#   cd /root/aipm
#   bash deploy/install.sh                 # 默认端口 8080
#   AIPM_PORT=9000 bash deploy/install.sh  # 自定义对外端口
#
# 重复执行完全安全：每一步都有存在性检查，已完成的步骤会跳过。

set -euo pipefail

# ======================== 配置 ========================

# 项目根目录（脚本所在位置的上一级）
AIPM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 对外暴露的 HTTP 端口（nginx 监听），默认 8080
AIPM_PUBLIC_PORT="${AIPM_PORT:-8080}"

# 后端内部监听端口（不对外，只 nginx 反代）
AIPM_SERVER_PORT=3100

# 数据库
PG_DB="aipm"
PG_USER="aipm"
PG_ENV_FILE="${AIPM_ROOT}/packages/server/.env"

# 日志目录
LOG_DIR="/var/log/aipm"

# ======================== 工具 ========================

C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[0;31m'
C_NC='\033[0m'

step() { echo -e "\n${C_GREEN}==>${C_NC} $*"; }
warn() { echo -e "${C_YELLOW}!!${C_NC} $*"; }
err()  { echo -e "${C_RED}xx${C_NC} $*" >&2; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "必须以 root 运行：sudo bash deploy/install.sh"
    exit 1
  fi
}

randhex() {
  # 生成 N 字节的随机 hex 字符串（用于密码 / JWT）
  head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
}

# ======================== Step 0: 环境检查 ========================

require_root

step "项目根目录：${AIPM_ROOT}"
step "对外端口：${AIPM_PUBLIC_PORT}"
step "后端端口（内部）：${AIPM_SERVER_PORT}"

if [[ ! -f "${AIPM_ROOT}/pnpm-workspace.yaml" ]]; then
  err "在 ${AIPM_ROOT} 下找不到 pnpm-workspace.yaml，确认你是在 aipm 项目根目录下调用的这个脚本"
  exit 1
fi

# ======================== Step 1: apt 基础包 ========================

step "1/10 安装系统基础依赖（apt）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl git build-essential pkg-config \
  nginx postgresql postgresql-contrib \
  ufw

# ======================== Step 2: Node.js 22 + pnpm + pm2 ========================

step "2/10 安装 Node.js 22 LTS"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1)" != "v22" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
else
  echo "   node $(node -v) 已存在，跳过"
fi

step "   安装 pnpm (corepack)"
corepack enable
corepack prepare pnpm@latest --activate

step "   安装全局 pm2"
if ! command -v pm2 >/dev/null; then
  npm install -g pm2
else
  echo "   pm2 $(pm2 -v) 已存在，跳过"
fi

# ======================== Step 3: PostgreSQL 初始化 ========================

step "3/10 初始化 PostgreSQL"
systemctl enable --now postgresql

# 只在第一次创建用户 + 数据库，之后幂等跳过
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1; then
  echo "   用户 ${PG_USER} 已存在，跳过"
  # 如果 .env 已有 DATABASE_URL，后面步骤会复用；如果没有，会在这里提示
  if [[ ! -f "${PG_ENV_FILE}" ]] || ! grep -q "^DATABASE_URL=" "${PG_ENV_FILE}"; then
    warn "${PG_ENV_FILE} 缺 DATABASE_URL，但用户已存在 —— 可能是上次装了一半，重新生成密码"
    PG_PASS="$(randhex 16)"
    sudo -u postgres psql -c "ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASS}';" >/dev/null
    NEED_REWRITE_DB_URL=1
  else
    PG_PASS=""
    NEED_REWRITE_DB_URL=0
  fi
else
  PG_PASS="$(randhex 16)"
  sudo -u postgres psql -c "CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';" >/dev/null
  echo "   已创建用户 ${PG_USER}"
  NEED_REWRITE_DB_URL=1
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1; then
  echo "   数据库 ${PG_DB} 已存在，跳过"
else
  sudo -u postgres psql -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};" >/dev/null
  echo "   已创建数据库 ${PG_DB}"
fi

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};" >/dev/null
sudo -u postgres psql -d "${PG_DB}" -c "GRANT ALL ON SCHEMA public TO ${PG_USER};" >/dev/null

# ======================== Step 4: .env ========================

step "4/10 生成 packages/server/.env"
mkdir -p "$(dirname "${PG_ENV_FILE}")"

# 检测本机公网 IP（给 CORS 白名单 + 最终访问地址用）
# 多条兜底：api.ipify.org → ifconfig.me → 第一个非 loopback 网卡地址
detect_public_ip() {
  local ip
  ip=$(curl -sS --max-time 3 https://api.ipify.org 2>/dev/null) && [[ -n "$ip" ]] && { echo "$ip"; return; }
  ip=$(curl -sS --max-time 3 https://ifconfig.me 2>/dev/null) && [[ -n "$ip" ]] && { echo "$ip"; return; }
  ip=$(hostname -I 2>/dev/null | awk '{print $1}') && [[ -n "$ip" ]] && { echo "$ip"; return; }
  echo ""
}

PUBLIC_IP="${DETECTED_PUBLIC_IP:-$(detect_public_ip)}"
# 允许用 AIPM_HOST 环境变量手动覆盖（绑域名场景）
CORS_HOST="${AIPM_HOST:-${PUBLIC_IP}}"

# 构造 CORS 白名单：包含公网 IP、127.0.0.1、localhost 的 AIPM_PUBLIC_PORT 端口
# axios 走相对路径后其实用不到 CORS，但留一条正确的兜底以防被外部页面调用
CORS_ENTRIES=""
if [[ -n "${CORS_HOST}" ]]; then
  CORS_ENTRIES="http://${CORS_HOST}:${AIPM_PUBLIC_PORT}"
fi
CORS_ENTRIES="${CORS_ENTRIES:+${CORS_ENTRIES},}http://127.0.0.1:${AIPM_PUBLIC_PORT},http://localhost:${AIPM_PUBLIC_PORT}"

if [[ ! -f "${PG_ENV_FILE}" ]] || [[ "${NEED_REWRITE_DB_URL}" == "1" ]]; then
  JWT_SECRET="$(randhex 32)"
  cat > "${PG_ENV_FILE}" <<EOF
# AIPM server 环境变量 —— 自动生成，请勿提交到 git
NODE_ENV=production
SERVER_PORT=${AIPM_SERVER_PORT}

# PostgreSQL
DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}?schema=public

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# CORS allowlist（生产环境）；多个用逗号分隔
# 想改成域名时，重跑脚本并设 AIPM_HOST 环境变量，例如：
#   AIPM_HOST=aipm.example.com AIPM_PORT=80 bash deploy/install.sh
CORS_ALLOWED_ORIGINS=${CORS_ENTRIES}

# ========== OpenAI 代理（仅国内服务器需要）==========
# 如果部署在国内且 agent 用的 OpenAI API，必须配一个能访问 api.openai.com 的代理。
# 配置后会让后端所有对 OpenAI 的 HTTPS 请求走这个代理。
# 两种方式任选一：
#
# 方式 A：传统 HTTP 代理（需要你有海外 VPS 跑 tinyproxy/squid/3proxy）
#   HTTPS_PROXY=http://proxy-host:proxy-port
#
# 方式 B：用 OpenAI 兼容镜像服务（更简单，不用自己搭代理）
#   不用设置 HTTPS_PROXY，直接登录 AIPM → 设置 → AI 配置 →
#   把"Base URL"填成镜像地址（如 https://api.openai-proxy.com/v1）
#
# 默认留空：HTTPS_PROXY=
# HTTPS_PROXY=
EOF
  chmod 600 "${PG_ENV_FILE}"
  echo "   已写入 ${PG_ENV_FILE}（权限 600）"
  echo "   检测到公网 IP：${PUBLIC_IP:-未检测到，CORS 回退到 localhost}"
else
  echo "   ${PG_ENV_FILE} 已存在且 DATABASE_URL 保持不变，跳过"
  echo "   （若要刷新 CORS_ALLOWED_ORIGINS，请手动编辑 ${PG_ENV_FILE}）"
fi

# ======================== Step 5: pnpm install ========================

step "5/10 pnpm install（可能要 2-5 分钟）"
cd "${AIPM_ROOT}"
pnpm install --frozen-lockfile

# ======================== Step 6: Prisma ========================

step "6/10 prisma generate + db push"
cd "${AIPM_ROOT}/packages/server"
npx prisma generate >/dev/null
npx prisma db push --skip-generate

# ======================== Step 7: seed 数据 ========================

step "7/10 seed 管理员账户和默认项目/小组"
# seed 脚本是幂等的（用 findUnique 检查）
npx tsx scripts/seed-admin.ts || warn "seed 失败，不阻塞部署"

# ======================== Step 8: build ========================

step "8/10 build 前端 + 编译后端"
cd "${AIPM_ROOT}/packages/web"
pnpm build

cd "${AIPM_ROOT}/packages/server"
# server 用 tsx 直接跑 src，不需要 tsc 编译；生产也是 tsx 跑
echo "   server 使用 tsx 运行，跳过 tsc build"

# ======================== Step 9: pm2 ========================

step "9/10 pm2 启动后端服务"
mkdir -p "${LOG_DIR}"
cd "${AIPM_ROOT}"

# 用仓库里的 ecosystem.config.cjs
if pm2 describe aipm-server >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs
  echo "   pm2 已 reload"
else
  pm2 start deploy/ecosystem.config.cjs
  echo "   pm2 已 start"
fi

pm2 save

# 开机自启
if [[ ! -f /etc/systemd/system/pm2-root.service ]]; then
  pm2 startup systemd -u root --hp /root >/dev/null || true
  systemctl enable pm2-root 2>/dev/null || true
fi

# ======================== Step 10: nginx 反代 ========================

step "10/10 配置 nginx 反代（端口 ${AIPM_PUBLIC_PORT} → 静态前端 + 后端 API/WS）"

# 修复权限：如果项目放在 /root/aipm（home 目录默认 700），nginx 的 www-data
# 用户无法 traverse 到 dist。给 /root 加 o+x（可进入不可列表），给 dist 加 o+rX。
# .env 保持 600 不受影响。
AIPM_PARENT="$(dirname "${AIPM_ROOT}")"
if [[ "${AIPM_PARENT}" == "/root" ]]; then
  step "   修复 /root 权限以便 nginx 能访问静态文件"
  chmod o+x /root
  chmod -R o+rX "${AIPM_ROOT}/packages/web/dist"
  # rsync 带过来的 uid/gid 可能是本地 Mac 的，修正为 root
  chown -R root:root "${AIPM_ROOT}"
  # .env 必须保持 600（chown -R 不会改 mode，但保险起见再 chmod 一次）
  chmod 600 "${PG_ENV_FILE}"
fi

NGINX_CONF="/etc/nginx/sites-available/aipm.conf"
NGINX_LINK="/etc/nginx/sites-enabled/aipm.conf"

# 根据模板生成（变量替换）
sed \
  -e "s|__AIPM_PUBLIC_PORT__|${AIPM_PUBLIC_PORT}|g" \
  -e "s|__AIPM_SERVER_PORT__|${AIPM_SERVER_PORT}|g" \
  -e "s|__AIPM_WEB_DIST__|${AIPM_ROOT}/packages/web/dist|g" \
  "${AIPM_ROOT}/deploy/nginx.conf.template" > "${NGINX_CONF}"

# 默认 site 如果占用了这个端口要让路
if [[ -L "${NGINX_LINK}" ]]; then
  rm "${NGINX_LINK}"
fi
ln -sf "${NGINX_CONF}" "${NGINX_LINK}"

# 禁用默认 site 避免 80 端口冲突（如果我们用 8080 无所谓）
# rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# 防火墙开端口
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "${AIPM_PUBLIC_PORT}/tcp" >/dev/null || true
fi

# ======================== 完成 ========================

# Step 4 已经检测过 PUBLIC_IP，这里复用；都没拿到的兜底显示占位
SHOW_HOST="${AIPM_HOST:-${PUBLIC_IP:-<server-ip>}}"

step "✅ 安装完成"
cat <<EOF

========================================
🎉 AIPM 已启动

访问地址：  http://${SHOW_HOST}:${AIPM_PUBLIC_PORT}

登录账号：
  admin@aipm.com      / admin123    （ADMIN）
  byron@aipm.dev      / admin123    （ADMIN）
  arch@aipm.dev       / test123     （需求架构师）
  eng@aipm.dev        / test123     （实施工程师）
  designer@aipm.dev   / test123     （设计师）

后续更新：
  cd /root/aipm && git pull && bash deploy/update.sh

查看后端日志：
  pm2 logs aipm-server
  tail -f ${LOG_DIR}/aipm-server.log

查看 nginx 日志：
  tail -f /var/log/nginx/aipm.access.log
  tail -f /var/log/nginx/aipm.error.log

⚠️  请立即修改 admin / byron 等账号的密码，并考虑：
     1. 禁用 root 密码登录 → 改成 SSH key
     2. 给前端配置 HTTPS（需要域名 + certbot）
     3. pg_hba.conf 保持 local only（已默认如此）

========================================
EOF
