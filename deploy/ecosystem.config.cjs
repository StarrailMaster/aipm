// pm2 进程配置 —— 被 install.sh 和 update.sh 引用
//
// 后端用 tsx 直接跑 src，避免维护 dist 的复杂度。
// 日志写到 /var/log/aipm/ 方便 journalctl/tail 查看。

const path = require('path')

// 这个文件在 aipm/deploy/，往上一级是项目根
const AIPM_ROOT = path.resolve(__dirname, '..')

module.exports = {
  apps: [
    {
      name: 'aipm-server',
      cwd: path.join(AIPM_ROOT, 'packages/server'),
      // 注意：不能直接 "script: 'npx'"，pm2 会把 npx 当成 Node 脚本
      // 改成先指定 interpreter 为 bash，然后 script 是一段命令行
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'none', // tsx 自带 shebang，不让 pm2 套 node
      env: {
        NODE_ENV: 'production',
      },
      // 进程管理
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
      // 日志
      out_file: '/var/log/aipm/aipm-server.out.log',
      error_file: '/var/log/aipm/aipm-server.err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // watch 关掉，生产环境靠手动 reload
      watch: false,
    },
  ],
}
