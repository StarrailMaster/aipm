# AIPM 部署指南

本目录包含 AIPM 在单台 Ubuntu 服务器上部署的全套脚本和配置。

## 架构

```
浏览器
  │  http://server-ip:8080
  ▼
┌──────────────────────────┐
│  nginx (对外唯一端口)     │
│   /api/* /ws → 反代       │
│   /       → 静态前端      │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│  Node.js (tsx) pm2 守护   │
│  packages/server/src      │
│  监听 127.0.0.1:3100      │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│  PostgreSQL (本机)        │
│  aipm 库 / aipm 用户      │
└──────────────────────────┘
```

## 文件清单

| 文件 | 作用 |
|---|---|
| `install.sh` | **首次安装** —— 装依赖、初始化 DB、build、配 nginx、pm2 启动。幂等，可重复运行 |
| `update.sh` | **增量更新** —— git pull + rebuild + pm2 reload，适合例行上线 |
| `nginx.conf.template` | nginx 反代配置，被 install.sh 注入变量后生效 |
| `ecosystem.config.cjs` | pm2 进程配置 |
| `README.md` | 本文件 |

## 系统要求

- Ubuntu 20.04 / 22.04 / 24.04
- root 权限（脚本里有 apt install / systemctl / /etc/nginx 操作）
- 至少 1 GB 内存，5 GB 磁盘
- 已开放对外端口（脚本默认 8080，可改）

## 首次部署（3 步）

### 1. 本地把代码 rsync 到服务器

```bash
# 在本地项目根目录运行
cd ~/Documents/claude/aipm

rsync -avz -e 'ssh -p 22735' \
  --exclude node_modules \
  --exclude packages/*/node_modules \
  --exclude 'packages/*/dist' \
  --exclude 'packages/server/tsconfig.tsbuildinfo' \
  --exclude .git \
  --exclude .claude/skills/superpowers \
  ./ root@<server-ip>:/root/aipm/
```

> 也可以用 git：`git clone <your-private-remote> /root/aipm` 到服务器上，跳过这一步。

### 2. SSH 进服务器

```bash
ssh -p 22735 root@<server-ip>
```

### 3. 运行安装脚本

```bash
cd /root/aipm
bash deploy/install.sh

# 自定义对外端口（默认 8080）：
# AIPM_PORT=9000 bash deploy/install.sh
```

脚本完成后会输出访问地址和账号密码。

## 后续更新（2 种方式）

### 方式 A：git + update.sh（推荐）

如果服务器上用 git clone 部署的：

```bash
ssh -p 22735 root@<server-ip>
cd /root/aipm
bash deploy/update.sh
```

`update.sh` 会自动 `git pull` → `pnpm install` → `prisma db push` → `pnpm build` → `pm2 reload`。

### 方式 B：rsync + update.sh

本地先 rsync 覆盖过去：

```bash
rsync -avz -e 'ssh -p 22735' \
  --exclude node_modules \
  --exclude packages/*/node_modules \
  --exclude 'packages/*/dist' \
  --exclude .git \
  --exclude 'packages/server/.env' \
  ./ root@<server-ip>:/root/aipm/
```

然后：

```bash
ssh -p 22735 root@<server-ip> 'cd /root/aipm && SKIP_PULL=1 bash deploy/update.sh'
```

注意加 `SKIP_PULL=1` 让脚本跳过 git pull（因为你是 rsync 的）。
也注意 `--exclude 'packages/server/.env'`，**绝对不要**把本地的 .env 覆盖服务器的。

## 日志 / 排错

| 要看什么 | 命令 |
|---|---|
| 后端运行状态 | `pm2 list` |
| 后端实时日志 | `pm2 logs aipm-server` |
| 后端历史日志 | `tail -f /var/log/aipm/aipm-server.out.log` |
| 后端错误日志 | `tail -f /var/log/aipm/aipm-server.err.log` |
| nginx 访问日志 | `tail -f /var/log/nginx/aipm.access.log` |
| nginx 错误日志 | `tail -f /var/log/nginx/aipm.error.log` |
| 查看 DB | `sudo -u postgres psql -d aipm` |

### 常见问题

**Q: 部署后访问 `http://server-ip:8080` 白屏**
- `curl http://127.0.0.1:3100/api/v1/auth/me` 看后端是否正常
- `pm2 logs aipm-server` 看后端是否启动
- `nginx -t && systemctl status nginx`
- 检查云厂商的安全组是否开放了 8080 端口

**Q: 数据库连接失败**
- `systemctl status postgresql`
- `sudo -u postgres psql -c "\l"` 看 aipm 库是否存在
- `cat packages/server/.env` 看 DATABASE_URL 是否正确
- `sudo -u postgres psql -c "\du"` 看用户是否存在

**Q: 上传 `.md` 文件超过 20 MB 报 413**
- 改 `nginx.conf.template` 里的 `client_max_body_size` 然后 `systemctl reload nginx`

**Q: 后端一直 restart**
- `pm2 logs aipm-server --err` 看错误堆栈
- 最常见：DB 连不上、JWT_SECRET 被误删、端口被占

**Q: `prisma db push` 报 "database already exists but has drift"**
- 生产环境出现 drift 通常是手工改过 DB，不要直接 push
- 先备份：`sudo -u postgres pg_dump aipm > /tmp/aipm-backup.sql`
- 评估差异：`npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma`
- 解决方案视情况而定，别无脑 `--accept-data-loss`

## 安全清单（首次部署后立刻做）

部署完成后必须做的 5 件事：

- [ ] **修改 root SSH 密码**（因为你在对话里发过我）
- [ ] **禁用 root 密码登录**，改成 SSH key：
  ```bash
  # 在你本地：
  ssh-copy-id -p 22735 root@<server-ip>
  # 在服务器：
  sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  systemctl restart sshd
  ```
- [ ] **修改默认管理员密码**：登录 `admin@aipm.com / admin123` 和 `byron@aipm.dev / admin123` 后立即到「设置 → 用户管理」改密码
- [ ] **PostgreSQL**：默认 `pg_hba.conf` 只允许本地连接，不要改成允许外部
- [ ] **防火墙**：`ufw status` 确认只开了 22735 和 8080 两个端口

## 端口清单

| 端口 | 用途 | 是否对外 |
|---|---|---|
| 22735 | SSH | 对外 |
| 8080 | HTTP 前端 + API（nginx） | 对外 |
| 3100 | 后端 Node.js | **仅 127.0.0.1** |
| 5432 | PostgreSQL | **仅 127.0.0.1** |

## 卸载 / 清理

如果要完全清除 AIPM：

```bash
# 停止服务
pm2 delete aipm-server
pm2 save

# 删除 nginx 配置
rm /etc/nginx/sites-enabled/aipm.conf /etc/nginx/sites-available/aipm.conf
systemctl reload nginx

# 删除数据库
sudo -u postgres psql -c "DROP DATABASE aipm;"
sudo -u postgres psql -c "DROP USER aipm;"

# 删除代码目录
rm -rf /root/aipm /var/log/aipm
```

**但不会卸载** Node.js / nginx / PostgreSQL（可能还有别的服务在用）。
