import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import * as settingsService from '../services/settings.service'
import {
  fetchAvailableModels,
  normalizeBaseUrl,
  sanitizeApiKey,
} from '../services/ai-config.service'
import { success } from '../utils/response'
import { AppError, ErrorCodes } from '../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

function requireAdmin(req: Request) {
  if (req.user?.role !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅管理员可操作 AI 配置', 403)
  }
}

// GET /api/v1/settings/ai — 获取 AI 配置
router.get(
  '/ai',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req)
      const config = await settingsService.getAiConfig()
      success(res, config)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/settings/ai — 更新 AI 配置（含校验）
router.put(
  '/ai',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req)
      const updates = req.body as Record<string, string>
      const skipValidation = req.query.skipValidation === 'true'
      const result = await settingsService.updateAiConfig(updates, { skipValidation })
      const msg = result.validation?.modelWasReplaced
        ? `配置已保存。默认模型「${result.validation.originalModel}」不在可用列表中，已自动切换为推荐模型「${result.validation.finalModel}」`
        : '配置已更新'
      success(res, result, msg)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/settings/ai/test-connection — 检测连接（不保存）
// 入参：{ ai_api_key?, ai_base_url?, ai_model? } 留空则用数据库已存值
router.post(
  '/ai/test-connection',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req)
      const body = (req.body ?? {}) as {
        ai_api_key?: string
        ai_base_url?: string
        ai_organization?: string
        ai_model?: string
      }

      // 留空的字段回落到已存值
      const storedKey = await settingsService.getAiApiKey()
      const storedBaseUrl = await settingsService.getAiBaseUrl()
      const storedOrg = await settingsService.getAiOrganization()

      // 清洗 key：剥离嵌入的 org、空白
      const rawKey = body.ai_api_key?.trim() || storedKey
      const sanitized = sanitizeApiKey(rawKey)
      const apiKey = sanitized.apiKey
      const baseUrl = normalizeBaseUrl(body.ai_base_url?.trim() || storedBaseUrl)
      const organization =
        body.ai_organization?.trim() || sanitized.embeddedOrg || storedOrg || undefined

      if (!apiKey) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'API Key 未配置')
      }

      const result = await fetchAvailableModels({ apiKey, baseUrl, organization })

      if (!result.success) {
        success(res, {
          ok: false,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          httpStatus: result.httpStatus ?? null,
          normalizedBaseUrl: baseUrl,
          detectedOrganization: sanitized.embeddedOrg,
        })
        return
      }

      // 校验当前默认模型是否仍然有效
      const currentModel = body.ai_model?.trim() || (await settingsService.getAiModel())
      const availableIds = result.models.map((m) => m.id)
      const currentModelValid = availableIds.includes(currentModel)

      success(res, {
        ok: true,
        normalizedBaseUrl: baseUrl,
        detectedOrganization: sanitized.embeddedOrg,
        models: result.models,
        modelCount: result.models.length,
        recommendedModel: result.recommendedModel,
        currentModel,
        currentModelValid,
      })
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/settings/ai/models — 获取可用模型列表（使用已存的配置）
router.get(
  '/ai/models',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req)
      const apiKey = await settingsService.getAiApiKey()
      const baseUrl = await settingsService.getAiBaseUrl()

      if (!apiKey) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'API Key 未配置')
      }

      const result = await fetchAvailableModels({ apiKey, baseUrl })

      if (!result.success) {
        throw new AppError(
          ErrorCodes.INVALID_FORMAT,
          `${result.errorMessage}（${result.errorCode}）`,
          result.httpStatus ?? 500,
        )
      }

      const currentModel = await settingsService.getAiModel()
      success(res, {
        models: result.models,
        recommendedModel: result.recommendedModel,
        currentModel,
        currentModelValid: result.models.some((m) => m.id === currentModel),
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
