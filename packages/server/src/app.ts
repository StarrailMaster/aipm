import express from 'express'
import type { Express } from 'express'
import cors from 'cors'
import { requestLogger } from './middleware/request-logger'
import { errorHandler } from './middleware/error-handler'
import authRoutes from './routes/auth'
import orgRoutes from './routes/org'
import squadRoutes from './routes/squads'
import sopRoutes from './routes/sop'
import promptRoutes from './routes/prompts'
import skillRoutes from './routes/skills'
import boardRoutes from './routes/boards'
import feedRoutes from './routes/feeds'
import designRoutes from './routes/designs'
import dashboardRoutes from './routes/dashboard'
import okrRoutes from './routes/okr'
import feedbackRoutes from './routes/feedback'
import experienceRoutes from './routes/experience'
import warehouseRoutes from './routes/warehouse'
import iterationRoutes from './routes/iterations'
import settingsRoutes from './routes/settings'
import contributionRoutes from './routes/contribution'
// Learning Copilot v2.0
import hypothesesRoutes from './routes/hypotheses'
import hypothesisTemplatesRoutes from './routes/hypothesis-templates'
import learningsRoutes from './routes/learnings'

const app: Express = express()

// --- Global middleware ---
// CORS：使用 origin 反射以支持 credentials（不能同时用 '*' 和 credentials:true）
app.use(
  cors({
    origin: (origin, callback) => {
      // 没有 origin（比如 curl、同源请求）直接放行
      if (!origin) return callback(null, true)
      // 开发环境反射 origin；生产环境自己加白名单
      if (process.env.NODE_ENV !== 'production') return callback(null, origin)
      // 生产：按白名单放行，未配置则拒绝所有 cross-origin
      const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (allowed.includes(origin)) return callback(null, origin)
      callback(null, false)
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)

// --- Health check ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// --- API routes ---
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1', orgRoutes)
app.use('/api/v1/squads', squadRoutes)
app.use('/api/v1/sop', sopRoutes)
app.use('/api/v1/prompts', promptRoutes)
app.use('/api/v1/skills', skillRoutes)
app.use('/api/v1/boards', boardRoutes)
app.use('/api/v1/feeds', feedRoutes)
app.use('/api/v1/designs', designRoutes)
app.use('/api/v1/dashboard', dashboardRoutes)
app.use('/api/v1/okr', okrRoutes)
app.use('/api/v1/feedback', feedbackRoutes)
app.use('/api/v1/experience', experienceRoutes)
app.use('/api/v1/warehouse', warehouseRoutes)
app.use('/api/v1/iterations', iterationRoutes)
app.use('/api/v1/settings', settingsRoutes)
app.use('/api/v1/contribution', contributionRoutes)
// Learning Copilot v2.0
app.use('/api/v1/hypotheses', hypothesesRoutes)
app.use('/api/v1/hypothesis-templates', hypothesisTemplatesRoutes)
app.use('/api/v1/learnings', learningsRoutes)

// A-1: 兜底 /api/v1/* 未知路径，返回 JSON 而不是 Express 默认 HTML 错误页。
// 这样 axios 调用者永远拿到可解析的 code/message，不需要自己解析 HTML。
app.use('/api/v1', (req, res) => {
  res.status(404).json({
    code: 40400,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
    data: null,
    timestamp: Date.now(),
  })
})

// --- Error handler (must be last) ---
app.use(errorHandler)

export default app
