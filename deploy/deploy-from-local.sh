#!/usr/bin/env bash
#
# AIPM 本地一键部署脚本（从 Mac 推送到远程 Ubuntu 服务器）
#
# 这个脚本做 4 件事：
#   1. 临时为 SERVER_IP 加一条主机路由，让它走真实网卡 en0，绕开 Shadowrocket TUN
#      （不影响 Claude 的代理，只对这一个 IP 生效）
#   2. rsync 代码到服务器 /root/aipm
#   3. SSH 进服务器跑 deploy/install.sh
#   4. 退出时自动清理临时路由
#
# 用法：
#   cd ~/Documents/claude/aipm
#   bash deploy/deploy-from-local.sh
#
# 会提示 2 次密码：
#   - Mac 本机的 sudo 密码（给 route add 用）
#   - 远程服务器 root 密码
#
# 重复执行完全安全：rsync 是增量的，install.sh 是幂等的。

set -euo pipefail

# ======================== 配置（按需改） ========================

SERVER_IP="124.221.224.122"
SERVER_PORT="22735"
SERVER_USER="root"
REMOTE_PATH="/root/aipm"
AIPM_PUBLIC_PORT="${AIPM_PORT:-8080}"

# ======================== 彩色输出 ========================

C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[0;31m'
C_CYAN='\033[0;36m'
C_NC='\033[0m'

step() { echo -e "\n${C_GREEN}==>${C_NC} $*"; }
info() { echo -e "${C_CYAN}  ·${C_NC} $*"; }
warn() { echo -e "${C_YELLOW}!!${C_NC} $*"; }
err()  { echo -e "${C_RED}xx${C_NC} $*" >&2; }

# ======================== 0. 预检 ========================

step "0/5 预检本地环境"

if [[ ! -f "pnpm-workspace.yaml" ]]; then
  err "必须在 aipm 项目根目录下运行（找不到 pnpm-workspace.yaml）"
  err "请先执行： cd ~/Documents/claude/aipm"
  exit 1
fi

for tool in rsync ssh sshpass route sudo; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    err "缺少 $tool"
    if [[ "$tool" == "sshpass" ]]; then
      err "安装：brew install esolitos/ipa/sshpass"
    fi
    exit 1
  fi
done
info "rsync / ssh / sshpass / route 都在"

# 找出真实默认网关（非 utun）
REAL_GW=$(netstat -rn -f inet 2>/dev/null | awk '$1=="default" && $NF~/^en[0-9]/{print $2; exit}')
if [[ -z "$REAL_GW" ]]; then
  err "找不到真实网关（没有 en* 接口的 default 路由）"
  err "你可能现在没连真实网络，或者 Shadowrocket 把所有 default 都劫持了"
  exit 1
fi
info "真实网关：${REAL_GW}"

# 检查 SERVER_IP 当前的路由出口
CURRENT_IF=$(route -n get "$SERVER_IP" 2>/dev/null | awk '/interface:/ {print $2}')
info "当前 $SERVER_IP 路由出口：${CURRENT_IF}"

# ======================== 1. 询问密码 ========================

step "1/5 收集密码"
echo -n "请输入远程服务器 ${SERVER_USER}@${SERVER_IP} 的密码: "
read -rs SERVER_PASS
echo
if [[ -z "$SERVER_PASS" ]]; then
  err "密码不能为空"
  exit 1
fi
export SSHPASS="$SERVER_PASS"

# ======================== 2. 添加主机路由 ========================

step "2/5 添加临时主机路由（绕过 Shadowrocket TUN）"

ROUTE_ADDED=0
cleanup() {
  if [[ "$ROUTE_ADDED" == "1" ]]; then
    echo ""
    info "清理临时路由 $SERVER_IP ..."
    sudo route -n delete -host "$SERVER_IP" >/dev/null 2>&1 || true
    info "✓ 路由已清理，网络恢复到原状态"
  fi
  # 清密码
  unset SSHPASS
}
trap cleanup EXIT INT TERM

if [[ "$CURRENT_IF" =~ ^en[0-9] ]]; then
  info "$SERVER_IP 已经走 $CURRENT_IF（非 TUN），不需要加路由"
else
  info "需要 sudo 权限添加主机路由 —— 会提示你输入 Mac 密码"
  sudo route -n add -host "$SERVER_IP" "$REAL_GW"
  ROUTE_ADDED=1
  sleep 1
  # 验证路由生效
  NEW_IF=$(route -n get "$SERVER_IP" 2>/dev/null | awk '/interface:/ {print $2}')
  if [[ ! "$NEW_IF" =~ ^en[0-9] ]]; then
    err "路由添加后出口仍是 $NEW_IF，没生效"
    err "可能 Shadowrocket 用的是 utun 而不是显式路由，这种情况脚本搞不定"
    exit 1
  fi
  info "✓ 路由已切到 $NEW_IF"
fi

# ======================== 3. 连通性测试 ========================

step "3/5 SSH 连通性测试"

SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 -p $SERVER_PORT"

if ! sshpass -e ssh $SSH_OPTS "${SERVER_USER}@${SERVER_IP}" "echo ok && uname -a" 2>&1; then
  err "SSH 连不上，可能是："
  err "  1. 密码错了"
  err "  2. 服务器 SSH 没在 22735 端口上"
  err "  3. 云厂商安全组没开 22735"
  exit 1
fi
info "✓ SSH 正常"

# ======================== 4. rsync ========================

step "4/5 rsync 推送代码到 ${REMOTE_PATH}"

rsync -avz --progress \
  -e "sshpass -e ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude 'packages/*/node_modules' \
  --exclude 'packages/*/dist' \
  --exclude 'packages/server/tsconfig.tsbuildinfo' \
  --exclude .git \
  --exclude '.claude/skills/superpowers' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude '/tmp/' \
  --exclude 'packages/web/vite.config.d.ts' \
  --exclude 'packages/web/vite.config.d.ts.map' \
  --exclude 'packages/web/vite.config.js' \
  --exclude 'packages/web/vite.config.js.map' \
  ./ "${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/"

info "✓ 代码同步完成"

# ======================== 5. 远程执行 install.sh ========================

step "5/5 远程执行 install.sh（首次 5-10 分钟，后续快）"
echo ""
warn "从这里开始是 install.sh 的实时输出，出错不要慌，整段贴给 Claude 帮你定位"
echo ""

sshpass -e ssh $SSH_OPTS "${SERVER_USER}@${SERVER_IP}" \
  "cd ${REMOTE_PATH} && AIPM_PORT=${AIPM_PUBLIC_PORT} bash deploy/install.sh 2>&1 | tee /tmp/aipm-install.log"

# ======================== 完成 ========================

step "✅ 全部完成"
cat <<EOF

========================================
🎉 AIPM 已部署

访问地址：  http://${SERVER_IP}:${AIPM_PUBLIC_PORT}

如果浏览器打不开：
  1. 云厂商控制台 → 安全组 → 开放 ${AIPM_PUBLIC_PORT}/tcp 入站
  2. 服务器上跑： ss -tlnp | grep ${AIPM_PUBLIC_PORT}  看 nginx 是否在监听

后续更新：
  cd ~/Documents/claude/aipm
  bash deploy/deploy-from-local.sh     # 再跑一遍这个脚本即可

⚠️  部署完后立刻做：
  1. 改 root SSH 密码（你贴给我的那个已经泄露在对话历史里）
  2. 登录 admin@aipm.com / admin123 后改默认密码
  3. 禁用 root 密码登录，改成 ssh key
========================================
EOF
