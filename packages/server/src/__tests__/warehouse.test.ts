import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, createTestToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

const mockFeedback = (overrides?: Record<string, unknown>) => ({
  id: 'feedback-id',
  rawDescription: 'Bug in code generation',
  attachments: [],
  aiSummary: {
    problemCategory: 'code_quality',
    problemSummary: 'Wrong format',
    relatedPromptId: 'prompt-id',
    suggestedConstraint: 'Validate format',
  },
  warehouseResult: null,
  status: 'PENDING_REVIEW',
  reviewedById: null,
  reviewComment: null,
  iterationId: 'iteration-id',
  feedPackageId: 'feed-package-id',
  submittedById: 'test-user-id',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

const mockWarehouseResult = {
  analysis: 'Root cause identified',
  suggestions: ['Add format validation constraint', 'Update SOP document'],
  relatedPromptIds: ['prompt-id'],
  severity: 'medium',
}

describe('Warehouse API', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'test-user-id', name: 'Test User', email: 'test@example.com', role: 'ENGINEER', avatar: null, legacyRoles: [],
    })
  })

  describe('POST /api/v1/warehouse/process/:feedbackId', () => {
    it('should process warehouse agent for feedback', async () => {
      const token = createTestToken()
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedback())
      mockPrisma.feedback.update.mockResolvedValue(
        mockFeedback({ status: 'AGENT_PROCESSED', warehouseResult: mockWarehouseResult }),
      )
      mockPrisma.prompt.findUnique.mockResolvedValue({
        id: 'prompt-id',
        name: 'Test Prompt',
        content: 'Prompt content',
      })

      const res = await app
        .post('/api/v1/warehouse/process/feedback-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should handle feedback not found', async () => {
      const token = createTestToken()
      mockPrisma.feedback.findUnique.mockResolvedValue(null)

      const res = await app
        .post('/api/v1/warehouse/process/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it('should return 401 without token', async () => {
      const res = await app.post('/api/v1/warehouse/process/feedback-id')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/v1/warehouse/result/:feedbackId', () => {
    it('should return warehouse result for a feedback', async () => {
      const token = createTestToken()
      mockPrisma.feedback.findUnique.mockResolvedValue(
        mockFeedback({ warehouseResult: mockWarehouseResult }),
      )

      const res = await app
        .get('/api/v1/warehouse/result/feedback-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should handle feedback not found', async () => {
      const token = createTestToken()
      mockPrisma.feedback.findUnique.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/warehouse/result/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/warehouse/result/feedback-id')
      expect(res.status).toBe(401)
    })
  })
})
