/**
 * BullMQ Queue Registry — Learning Copilot v2.0
 *
 * 单一 Redis 连接 + 多个队列：
 *   - copilot: AI Copilot 异步调用（hypothesis close / daily digest / manual trigger）
 *
 * 决策（PRD §Eng Review Issue 1 + CG1）：
 *   - BullMQ + Redis + 前端轮询（而非 SSE / WebSocket）
 *   - 3 次 exponential backoff retry + 条件性（Zod/4xx 不重试 → 手动 throw UnrecoverableError）
 *   - Redis SETNX 分布式锁 for daily cron（在 jobs/ 层实现）
 *   - Fallback (CG1): 如果 Redis 宕机，enqueue 抛错被 hypothesis close service 捕获，
 *     returning copilotStatus='unavailable'，close 本身仍成功
 */
import { Queue, Worker } from 'bullmq'
import type { ConnectionOptions, JobsOptions } from 'bullmq'
import { Redis } from 'ioredis'

// ============================================================
// Shared Redis connection (BullMQ 推荐单例)
// ============================================================

const REDIS_URL =
  process.env.REDIS_URL ??
  `redis://${process.env.REDIS_HOST ?? '127.0.0.1'}:${process.env.REDIS_PORT ?? '6379'}`

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // BullMQ requirement
      enableReadyCheck: false,
    })
    _redis.on('error', (err: Error) => {
      console.error('[redis] connection error:', err.message)
    })
  }
  return _redis
}

/** 优雅关闭（tests / graceful shutdown） */
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit()
    _redis = null
  }
}

/** 健康检查：Redis 是否可连 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const r = getRedis()
    const pong = await r.ping()
    return pong === 'PONG'
  } catch {
    return false
  }
}

// ============================================================
// Queue: copilot
// ============================================================

export type CopilotJobName =
  | 'run-on-close'   // 某 hypothesis 刚 close，生成本次 learning
  | 'run-daily-digest'  // 每日 digest
  | 'run-manual-digest' // admin/kr_owner 手动触发

export interface CopilotRunOnCloseData {
  hypothesisId: string
  triggeredBy: string // userId
}

export interface CopilotRunDigestData {
  scope: string // "global" | "project:{id}" | "kr:{id}"
  triggeredBy: string
}

export type CopilotJobData = CopilotRunOnCloseData | CopilotRunDigestData

let _copilotQueue: Queue<CopilotJobData> | null = null

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s → 4s → 8s
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // 24 小时后清理成功任务
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 1 周后清理失败任务（保留供 debug）
  },
}

export function getCopilotQueue(): Queue<CopilotJobData> {
  if (!_copilotQueue) {
    const connection: ConnectionOptions = getRedis() as unknown as ConnectionOptions
    _copilotQueue = new Queue<CopilotJobData>('copilot', {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }
  return _copilotQueue
}

/**
 * Enqueue Copilot run 的 safe wrapper。
 *
 * CG1 Fallback：如果 Redis 不可达，不让 enqueue 失败污染主事务。
 * 返回 null 表示 enqueue 失败，调用方应设置 copilotStatus='unavailable'。
 */
export async function enqueueCopilotJob(
  name: CopilotJobName,
  data: CopilotJobData,
): Promise<string | null> {
  try {
    const queue = getCopilotQueue()
    const job = await queue.add(name, data, {
      // Dedup: 相同 hypothesis 在短时间内重复 close 不重复入队
      jobId:
        name === 'run-on-close' && 'hypothesisId' in data
          ? `run-on-close:${data.hypothesisId}:${Date.now() - (Date.now() % 300_000)}` // 5 分钟桶
          : undefined,
    })
    return job.id ?? null
  } catch (err) {
    console.error(
      '[copilot-queue] enqueue failed, falling back to unavailable:',
      (err as Error).message,
    )
    return null
  }
}

/**
 * UnrecoverableError：抛给 BullMQ 信号"别再重试"。
 * 场景：4xx 来自 AI / Zod schema 非法 / quota 超限。
 */
export class UnrecoverableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnrecoverableError'
  }
}

// ============================================================
// Worker factory (真正消费任务，Day 5 填充)
// ============================================================

export interface CopilotWorkerHandlers {
  runOnClose: (data: CopilotRunOnCloseData) => Promise<void>
  runDailyDigest: (data: CopilotRunDigestData) => Promise<void>
  runManualDigest: (data: CopilotRunDigestData) => Promise<void>
}

/**
 * 创建 copilot worker 进程。
 * 通常由 `packages/server/src/workers/copilot-worker.ts` 启动为独立进程，
 * 或者从主进程直接 import 再调用 start()。
 */
export function createCopilotWorker(
  handlers: CopilotWorkerHandlers,
): Worker<CopilotJobData> {
  const connection: ConnectionOptions = getRedis() as unknown as ConnectionOptions
  return new Worker<CopilotJobData>(
    'copilot',
    async (job) => {
      const name = job.name as CopilotJobName
      if (name === 'run-on-close') {
        await handlers.runOnClose(job.data as CopilotRunOnCloseData)
      } else if (name === 'run-daily-digest') {
        await handlers.runDailyDigest(job.data as CopilotRunDigestData)
      } else if (name === 'run-manual-digest') {
        await handlers.runManualDigest(job.data as CopilotRunDigestData)
      } else {
        throw new UnrecoverableError(`Unknown copilot job name: ${name}`)
      }
    },
    { connection, concurrency: 2 },
  )
}
