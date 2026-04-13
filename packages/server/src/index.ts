import dotenv from 'dotenv'
dotenv.config({ path: '../../.env' })
dotenv.config() // Also load local .env if exists

import http from 'http'
import app from './app'
import { setupWebSocket } from './ws'
import { startCopilotWorker, stopCopilotWorker } from './workers/copilot-worker'
import {
  startDailyDigestCron,
  stopDailyDigestCron,
  compensateMissedDailyDigest,
} from './jobs/copilot-daily-digest'
import { checkRedisHealth, closeRedis } from './queues'
import { seedSystemDefaultTemplates } from './services/hypothesis-template'
import { ensureCheckConstraints } from './prisma/constraints'

const PORT = Number(process.env.SERVER_PORT) || 3000

const server = http.createServer(app)

// Initialize WebSocket
setupWebSocket(server)

// Register board WebSocket handlers
import './ws/board'

async function bootstrap() {
  // Redis health check
  const redisUp = await checkRedisHealth()
  if (redisUp) {
    console.log('[Server] Redis: reachable')
    // Start BullMQ worker (Learning Copilot)
    try {
      startCopilotWorker()
    } catch (err) {
      console.error('[Server] Copilot worker start failed:', (err as Error).message)
    }
    // Start daily digest cron
    try {
      startDailyDigestCron()
    } catch (err) {
      console.error('[Server] Daily digest cron start failed:', (err as Error).message)
    }
    // Fix 9 / SF1: compensation if startup crossed the 9:00 window
    try {
      const sf1 = await compensateMissedDailyDigest()
      if (sf1.compensated) {
        console.log(`[Server] SF1 compensation ran: ${sf1.reason}`)
      }
    } catch (err) {
      console.warn(
        '[Server] SF1 compensation skipped:',
        (err as Error).message,
      )
    }
  } else {
    console.warn(
      '[Server] Redis: UNREACHABLE — Copilot async features disabled (fallback: copilotStatus=unavailable)',
    )
  }

  // Seed system default hypothesis templates (idempotent)
  try {
    const result = await seedSystemDefaultTemplates()
    if (result.created > 0) {
      console.log(
        `[Server] Seeded ${result.created} system default hypothesis templates (${result.skipped} already existed)`,
      )
    }
  } catch (err) {
    console.warn(
      '[Server] Template seed skipped:',
      (err as Error).message,
    )
  }

  // Fix 5: Ensure DB CHECK constraints (closedAt, variant sample/conversion)
  try {
    const result = await ensureCheckConstraints()
    if (result.created.length > 0) {
      console.log(
        `[Server] Created ${result.created.length} DB CHECK constraints: ${result.created.join(', ')}`,
      )
    }
    if (result.failed.length > 0) {
      console.warn(
        `[Server] DB CHECK constraints failed: ${result.failed.join(', ')} — data may be in inconsistent state`,
      )
    }
  } catch (err) {
    console.warn(
      '[Server] DB CHECK constraints skipped:',
      (err as Error).message,
    )
  }

  server.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`)
    console.log(`[Server] WebSocket available at ws://localhost:${PORT}/ws`)
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[Server] ${signal} received, shutting down gracefully`)
  try {
    stopDailyDigestCron()
    await stopCopilotWorker()
    await closeRedis()
    server.close(() => {
      console.log('[Server] HTTP server closed')
      process.exit(0)
    })
  } catch (err) {
    console.error('[Server] Shutdown error:', (err as Error).message)
    process.exit(1)
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

bootstrap().catch((err) => {
  console.error('[Server] Bootstrap failed:', err)
  process.exit(1)
})
