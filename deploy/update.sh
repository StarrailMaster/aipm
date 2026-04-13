#!/usr/bin/env bash
#
# AIPM 增量更新脚本 —— 适合已经跑过 install.sh 一次后的例行更新
#
# 做这些事：
#   1. （可选）git pull
#   2. pnpm install --frozen-lockfile
#   3. prisma generate + db push（schema 有变更时才有实际写入）
#   4. web 重新 build
#   5. pm2 reload aipm-server
#
# 如果 install.sh 从未跑过，请先跑 install.sh。

set -euo pipefail

AIPM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_NC='\033[0m'
step() { echo -e "\n${C_GREEN}==>${C_NC} $*"; }
warn() { echo -e "${C_YELLOW}!!${C_NC} $*"; }

# ======================== 预检 ========================

if [[ ! -f "${AIPM_ROOT}/packages/server/.env" ]]; then
  warn "找不到 packages/server/.env，这看起来像是没跑过 install.sh"
  warn "请先执行：bash deploy/install.sh"
  exit 1
fi

if ! command -v pm2 >/dev/null; then
  warn "pm2 未安装，这看起来像是没跑过 install.sh"
  exit 1
fi

cd "${AIPM_ROOT}"

# ======================== 1. git pull（可选） ========================

if [[ "${SKIP_PULL:-0}" != "1" ]] && [[ -d .git ]]; then
  step "1/5 git pull"
  git pull --ff-only || warn "git pull 失败（可能有本地改动），继续执行后续步骤"
else
  step "1/5 跳过 git pull（SKIP_PULL=1 或非 git 仓库）"
fi

# ======================== 2. pnpm install ========================

step "2/5 pnpm install"
pnpm install --frozen-lockfile

# ======================== 3. Prisma ========================

step "3/5 prisma generate + db push"
cd "${AIPM_ROOT}/packages/server"
npx prisma generate >/dev/null
# 如果 schema 没变，db push 会很快
npx prisma db push --skip-generate

# ======================== 4. web build ========================

step "4/5 build 前端"
cd "${AIPM_ROOT}/packages/web"
pnpm build

# ======================== 5. pm2 reload ========================

step "5/5 pm2 reload aipm-server"
cd "${AIPM_ROOT}"
pm2 reload deploy/ecosystem.config.cjs

sleep 2
pm2 list | grep aipm-server || warn "pm2 list 没看到 aipm-server，请检查 pm2 logs aipm-server"

step "✅ 更新完成"
echo ""
echo "验证："
echo "  curl -sS http://127.0.0.1:3100/api/v1/health || curl -sS http://127.0.0.1:3100/"
echo "  pm2 logs aipm-server --lines 20"
