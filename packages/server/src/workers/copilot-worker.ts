/**
 * Copilot Worker — BullMQ consumer for copilot jobs
 *
 * 职责：
 *   - run-on-close: 单 hypothesis close 事件，生成 learning + digest
 *   - run-daily-digest: 定时任务触发的全量 digest
 *   - run-manual-digest: ADMIN 手动触发
 *
 * 启动方式（2 种）：
 *   1. In-process: 主进程启动时调用 startCopilotWorker()
 *      适合单进程部署（pm2 不分 worker process）
 *   2. Standalone process: 运行 `tsx packages/server/src/workers/copilot-worker.ts`
 *      适合多进程部署（推荐生产）
 *
 * 两种模式共用一个 Redis 连接，BullMQ 的 job 抢占保证只一个 worker 消费同一任务。
 */
import type { Worker } from 'bullmq'
import {
  createCopilotWorker,
  type CopilotJobData,
  type CopilotRunOnCloseData,
  type CopilotRunDigestData,
} from '../queues'
import { runCopilotAgent } from '../services/copilot/agent'
import { buildContext } from '../services/copilot/context'

let _worker: Worker<CopilotJobData> | null = null

export function startCopilotWorker(): Worker<CopilotJobData> {
  if (_worker) {
    console.log('[copilot-worker] already started, reusing')
    return _worker
  }

  _worker = createCopilotWorker({
    runOnClose: async (data: CopilotRunOnCloseData) => {
      console.log(
        `[copilot-worker] run-on-close hypothesis=${data.hypothesisId}`,
      )
      // 先 resolve project scope（通过 hypothesis.kr.objective.projectId）
      const scope = await resolveProjectScope(data.hypothesisId)
      const result = await runCopilotAgent({
        scope,
        triggerHypothesisId: data.hypothesisId,
        triggerType: 'hypothesis_close',
        triggeredBy: data.triggeredBy,
      })
      if (!result.success) {
        // UnrecoverableError 已在 agent 内被捕获并返回 success=false
        // 这里不抛，让 BullMQ 视为 completed（进 copilot_cost_logs 即可审计）
        console.warn(
          `[copilot-worker] run-on-close failed (non-retryable): ${result.error}`,
        )
      } else {
        console.log(
          `[copilot-worker] run-on-close ok in ${result.durationMs}ms, tokens ${result.tokensIn}/${result.tokensOut}`,
        )
      }
    },
    runDailyDigest: async (data: CopilotRunDigestData) => {
      console.log(
        `[copilot-worker] run-daily-digest scope=${data.scope}`,
      )
      const result = await runCopilotAgent({
        scope: data.scope,
        triggerType: 'scheduled_daily',
        triggeredBy: data.triggeredBy,
      })
      if (!result.success) {
        console.warn(
          `[copilot-worker] daily digest failed: ${result.error}`,
        )
      } else {
        console.log(
          `[copilot-worker] daily digest ok in ${result.durationMs}ms`,
        )
      }
    },
    runManualDigest: async (data: CopilotRunDigestData) => {
      console.log(
        `[copilot-worker] run-manual-digest scope=${data.scope}`,
      )
      const result = await runCopilotAgent({
        scope: data.scope,
        triggerType: 'manual',
        triggeredBy: data.triggeredBy,
      })
      if (!result.success) {
        console.warn(`[copilot-worker] manual digest failed: ${result.error}`)
      }
    },
  })

  _worker.on('completed', (job) => {
    console.log(`[copilot-worker] completed job=${job.id} name=${job.name}`)
  })
  _worker.on('failed', (job, err) => {
    console.error(
      `[copilot-worker] failed job=${job?.id} name=${job?.name}:`,
      err.message,
    )
  })
  _worker.on('error', (err) => {
    console.error('[copilot-worker] worker error:', err.message)
  })

  console.log('[copilot-worker] started')
  return _worker
}

export async function stopCopilotWorker(): Promise<void> {
  if (_worker) {
    await _worker.close()
    _worker = null
  }
}

async function resolveProjectScope(hypothesisId: string): Promise<string> {
  // 通过 hypothesis.kr.objective.projectId 找到 project scope
  const { default: prisma } = await import('../prisma/client')
  const h = await prisma.hypothesis.findUnique({
    where: { id: hypothesisId },
    select: {
      keyResult: {
        select: {
          objective: { select: { projectId: true } },
        },
      },
    },
  })
  if (!h) return 'global'
  return `project:${h.keyResult.objective.projectId}`
}

// Standalone mode: 如果直接被运行（不是被 import），启动 worker 并保持进程
if (require.main === module) {
  startCopilotWorker()
  console.log('[copilot-worker] standalone mode, process alive')

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[copilot-worker] SIGTERM received, shutting down')
    await stopCopilotWorker()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    console.log('[copilot-worker] SIGINT received, shutting down')
    await stopCopilotWorker()
    process.exit(0)
  })
}
