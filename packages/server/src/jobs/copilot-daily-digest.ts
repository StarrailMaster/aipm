/**
 * Copilot Daily Digest Cron
 *
 * 每日 09:00 local time (Asia/Shanghai) 触发一次全量 digest 生成。
 *
 * 决策（D28）：
 *   - Redis SETNX 分布式锁（5 分钟 TTL）：防 pm2 重启时 cron 并发
 *   - 只调度到 BullMQ 队列，实际执行由 copilot worker 消费
 *   - 异常不崩主进程，写 log 即可
 *
 * 使用：
 *   import { startDailyDigestCron } from './jobs/copilot-daily-digest'
 *   startDailyDigestCron() // 在 app 启动时调用
 */
import { getRedis, enqueueCopilotJob } from '../queues'
import prisma from '../prisma/client'

const LOCK_KEY = 'copilot:digest:daily:lock'
const LOCK_TTL_SECONDS = 300 // 5 分钟

/**
 * 检查 Redis 锁 + 入队 daily digest job。
 * 返回是否成功入队。
 */
export async function runDailyDigestIfNotRunning(): Promise<{
  enqueued: boolean
  reason?: string
  jobIds: string[]
}> {
  const redis = getRedis()
  // SETNX with TTL
  const acquired = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_SECONDS, 'NX')
  if (acquired !== 'OK') {
    return { enqueued: false, reason: '另一实例正在跑，跳过', jobIds: [] }
  }

  try {
    // 全量 scope: 每个活跃 project 一份 digest + 一份 global
    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true },
    })

    const jobIds: string[] = []

    // Global digest
    const globalJobId = await enqueueCopilotJob('run-daily-digest', {
      scope: 'global',
      triggeredBy: 'cron:daily',
    })
    if (globalJobId) jobIds.push(globalJobId)

    // Per-project digests
    for (const p of projects) {
      const jobId = await enqueueCopilotJob('run-daily-digest', {
        scope: `project:${p.id}`,
        triggeredBy: 'cron:daily',
      })
      if (jobId) jobIds.push(jobId)
    }

    return { enqueued: jobIds.length > 0, jobIds }
  } catch (err) {
    console.error(
      '[copilot-daily-digest] enqueue failed:',
      (err as Error).message,
    )
    // 失败时释放锁，让下次重试
    await redis.del(LOCK_KEY)
    return { enqueued: false, reason: (err as Error).message, jobIds: [] }
  }
}

// ============================================================
// Simple cron (no external dep)
// ============================================================
//
// Why not node-cron: 想轻量。简单 setInterval 每分钟检查一次是否是 09:00。
// 生产部署时 pm2 会自动 restart，锁防止重复触发。

let _cronTimer: NodeJS.Timeout | null = null
let _lastFiredAt: number = 0

function currentHourMinute(): { hour: number; minute: number } {
  const now = new Date()
  return { hour: now.getHours(), minute: now.getMinutes() }
}

export function startDailyDigestCron(): void {
  if (_cronTimer) {
    console.log('[copilot-daily-digest] cron already running')
    return
  }

  const TARGET_HOUR = 9
  const TARGET_MINUTE = 0
  const CHECK_INTERVAL_MS = 60_000 // 1 min

  const tick = async () => {
    try {
      const { hour, minute } = currentHourMinute()
      const isTargetTime = hour === TARGET_HOUR && minute === TARGET_MINUTE
      if (!isTargetTime) return

      // Dedup: 同一分钟内不重复触发
      const now = Date.now()
      if (now - _lastFiredAt < 2 * 60_000) return
      _lastFiredAt = now

      console.log('[copilot-daily-digest] firing scheduled run')
      const result = await runDailyDigestIfNotRunning()
      if (result.enqueued) {
        console.log(
          `[copilot-daily-digest] enqueued ${result.jobIds.length} jobs`,
        )
      } else {
        console.log(
          `[copilot-daily-digest] skipped: ${result.reason ?? 'unknown'}`,
        )
      }

      // Fix 9 / SF2: 同步跑 orphan learning 扫描（1x/day，与 cron 同步）
      const orphan = await scanOrphanLearnings()
      if (orphan.orphanCount > 0) {
        console.warn(
          `[copilot-daily-digest] SF2 summary: ${orphan.orphanCount} orphan learnings in DB`,
        )
      }
    } catch (err) {
      console.error('[copilot-daily-digest] tick error:', (err as Error).message)
    }
  }

  _cronTimer = setInterval(tick, CHECK_INTERVAL_MS)
  console.log(
    `[copilot-daily-digest] cron scheduled for ${TARGET_HOUR}:${String(TARGET_MINUTE).padStart(2, '0')} local`,
  )
}

export function stopDailyDigestCron(): void {
  if (_cronTimer) {
    clearInterval(_cronTimer)
    _cronTimer = null
    console.log('[copilot-daily-digest] cron stopped')
  }
}

// ============================================================
// Fix 9 / SF1: Startup compensation for missed daily digest
// ============================================================
//
// 当 pm2 / docker 重启跨过 09:00 窗口时，会错过当天的 digest。
// 启动时检查：昨天（过去 24 小时内）是否有 triggerType='scheduled_daily' 的 global digest？
// 没有则补跑一次（入队 global 即可，不补齐 per-project 以减少噪音）。

/**
 * 启动时检测昨日 daily digest 是否缺失。缺失则补跑一次（入队 global）。
 */
export async function compensateMissedDailyDigest(): Promise<{
  compensated: boolean
  reason: string
}> {
  try {
    // 仅在工作时段之后才补跑（>= 9:00），避免半夜启动时补跑无意义
    const { hour } = currentHourMinute()
    if (hour < 9) {
      return { compensated: false, reason: `current hour ${hour} < 9, skip` }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recent = await prisma.copilotDigest.findFirst({
      where: {
        scope: 'global',
        triggerType: 'scheduled_daily',
        createdAt: { gte: since },
      },
      select: { id: true },
    })

    if (recent) {
      return { compensated: false, reason: 'daily digest already ran within 24h' }
    }

    // 缺失：补跑一次
    console.log(
      '[copilot-daily-digest] SF1 compensation: no scheduled_daily in last 24h, enqueuing now',
    )
    const jobId = await enqueueCopilotJob('run-daily-digest', {
      scope: 'global',
      triggeredBy: 'startup:compensate',
    })
    return {
      compensated: !!jobId,
      reason: jobId ? `enqueued ${jobId}` : 'enqueue failed (redis down?)',
    }
  } catch (err) {
    return { compensated: false, reason: (err as Error).message }
  }
}

// ============================================================
// Fix 9 / SF2: Orphan Learning alert
// ============================================================
//
// 扫 Learning.hypothesisId 指向的 hypothesis 是否 deletedAt != null。
// 每日跑一次，把 count 写到 stdout 供 admin log 聚合。
//
// Scheduled from the same daily cron tick to avoid adding another interval.

export async function scanOrphanLearnings(): Promise<{
  orphanCount: number
  sampleIds: string[]
}> {
  try {
    // 找出所有指向已软删 hypothesis 的 learnings
    // 用 raw query 避免 Prisma include 开销
    const rows = await prisma.$queryRawUnsafe<
      { id: string; hypothesisId: string }[]
    >(`
      SELECT l.id, l."hypothesisId"
      FROM "Learning" l
      INNER JOIN "Hypothesis" h ON h.id = l."hypothesisId"
      WHERE l."hypothesisId" IS NOT NULL
        AND h."deletedAt" IS NOT NULL
      LIMIT 100
    `)
    const count = rows?.length ?? 0
    if (count > 0) {
      console.warn(
        `[copilot-daily-digest] SF2: ${count} orphan learnings detected (learning pointing to soft-deleted hypothesis). Sample IDs: ${rows
          .slice(0, 5)
          .map((r) => r.id)
          .join(', ')}`,
      )
    }
    return {
      orphanCount: count,
      sampleIds: rows.slice(0, 5).map((r) => r.id),
    }
  } catch (err) {
    console.warn('[copilot-daily-digest] SF2 scan failed:', (err as Error).message)
    return { orphanCount: 0, sampleIds: [] }
  }
}
