import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, createTestToken, createArchitectToken, createAdminToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

const mockUserBrief = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  role: 'ENGINEER',
  avatar: null,
  legacyRoles: [],
}

const mockFeedback = (overrides?: Record<string, unknown>) => ({
  id: 'feedback-id',
  rawDescription: 'The AI generated wrong code format',
  attachments: ['screenshot.png'],
  aiSummary: null,
  warehouseResult: null,
  status: 'SUBMITTED',
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

describe('Feedback API', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserBrief)
    mockPrisma.user.findMany.mockResolvedValue([mockUserBrief])
  })

  describe('GET /api/v1/feedback', () => {
    it('should list feedbacks with pagination', async () => {
      const token = createTestToken()
      mockPrisma.feedback.findMany.mockResolvedValue([mockFeedback()])
      mockPrisma.feedback.count.mockResolvedValue(1)

      const res = await app
        .get('/api/v1/feedback?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('total')
    })

    it('should filter by status', async () => {
      const token = createTestToken()
      mockPrisma.feedback.findMany.mockResolvedValue([])
      mockPrisma.feedback.count.mockResolvedValue(0)

      const res = await app
        .get('/api/v1/feedback?status=SUBMITTED')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/feedback')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/feedback', () => {
    it('should submit feedback', async () => {
      const token = createTestToken()
      mockPrisma.feedback.create.mockResolvedValue(mockFeedback())

      const res = await app
        .post('/api/v1/feedback')
        .set(authHeader(token))
        .send({
          rawDescription: 'The AI generated wrong code format',
          attachments: ['screenshot.png'],
          iterationId: 'iteration-id',
          feedPackageId: 'feed-package-id',
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should submit feedback without optional fields', async () => {
      const token = createTestToken()
      mockPrisma.feedback.create.mockResolvedValue(
        mockFeedback({ attachments: [], iterationId: null, feedPackageId: null }),
      )

      const res = await app
        .post('/api/v1/feedback')
        .set(authHeader(token))
        .send({ rawDescription: 'Bug report' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 when rawDescription is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/feedback')
        .set(authHeader(token))
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/feedback/:id', () => {
    it('should get feedback detail', async () => {
      const token = createTestToken()
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedback())

      const res = await app
        .get('/api/v1/feedback/feedback-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should handle not found', async () => {
      const token = createTestToken()
      mockPrisma.feedback.findUnique.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/feedback/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('DELETE /api/v1/feedback/:id', () => {
    it('should soft delete feedback', async () => {
      const token = createTestToken()
      // deleteFeedback first calls findUnique for existence check
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedback())
      mockPrisma.feedback.update.mockResolvedValue(mockFeedback({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/feedback/feedback-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== AI Summary =====
  describe('POST /api/v1/feedback/:id/ai-summary', () => {
    it('should trigger AI summary generation', async () => {
      const token = createTestToken()
      const summarized = mockFeedback({
        status: 'AI_SUMMARIZED',
        aiSummary: {
          problemCategory: 'code_quality',
          problemSummary: 'Wrong code format',
          relatedPromptId: 'prompt-id',
          suggestedConstraint: 'Always validate format',
        },
      })
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedback())
      mockPrisma.feedback.update.mockResolvedValue(summarized)

      const res = await app
        .post('/api/v1/feedback/feedback-id/ai-summary')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Confirm AI Summary =====
  describe('POST /api/v1/feedback/:id/confirm', () => {
    it('should confirm AI summary', async () => {
      const token = createTestToken()
      const confirmed = mockFeedback({ status: 'PENDING_REVIEW' })
      mockPrisma.feedback.findUnique.mockResolvedValue(
        mockFeedback({ status: 'AI_SUMMARIZED', aiSummary: { problemCategory: 'code_quality' } }),
      )
      mockPrisma.feedback.update.mockResolvedValue(confirmed)

      const res = await app
        .post('/api/v1/feedback/feedback-id/confirm')
        .set(authHeader(token))
        .send({ problemCategory: 'code_quality', problemSummary: 'Fixed summary' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should confirm with optional overrides', async () => {
      const token = createTestToken()
      const confirmed = mockFeedback({ status: 'PENDING_REVIEW' })
      mockPrisma.feedback.findUnique.mockResolvedValue(
        mockFeedback({ status: 'AI_SUMMARIZED', aiSummary: { problemCategory: 'code_quality' } }),
      )
      mockPrisma.feedback.update.mockResolvedValue(confirmed)

      const res = await app
        .post('/api/v1/feedback/feedback-id/confirm')
        .set(authHeader(token))
        .send({
          problemCategory: 'performance',
          relatedPromptId: 'new-prompt-id',
          problemSummary: 'Overridden summary',
          suggestedConstraint: 'Overridden constraint',
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Architect Review =====
  describe('POST /api/v1/feedback/:id/review', () => {
    it('should merge feedback (ARCHITECT)', async () => {
      const token = createArchitectToken()
      const merged = mockFeedback({ status: 'MERGED', reviewedById: 'test-user-id' })
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedback({ status: 'PENDING_REVIEW' }))
      mockPrisma.feedback.update.mockResolvedValue(merged)

      const res = await app
        .post('/api/v1/feedback/feedback-id/review')
        .set(authHeader(token))
        .send({ action: 'merge', comment: 'Good catch' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should merge feedback (ADMIN)', async () => {
      const token = createAdminToken()
      const merged = mockFeedback({ status: 'MERGED', reviewedById: 'test-user-id' })
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedback({ status: 'PENDING_REVIEW' }))
      mockPrisma.feedback.update.mockResolvedValue(merged)

      const res = await app
        .post('/api/v1/feedback/feedback-id/review')
        .set(authHeader(token))
        .send({ action: 'merge' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should reject feedback', async () => {
      const token = createArchitectToken()
      const rejected = mockFeedback({ status: 'REJECTED', reviewedById: 'test-user-id', reviewComment: 'Not valid' })
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedback({ status: 'PENDING_REVIEW' }))
      mockPrisma.feedback.update.mockResolvedValue(rejected)

      const res = await app
        .post('/api/v1/feedback/feedback-id/review')
        .set(authHeader(token))
        .send({ action: 'reject', comment: 'Not valid' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 403 for ENGINEER role', async () => {
      const token = createTestToken({ role: 'ENGINEER' })

      const res = await app
        .post('/api/v1/feedback/feedback-id/review')
        .set(authHeader(token))
        .send({ action: 'merge' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe(10003)
    })

    it('should return 403 for DESIGNER role', async () => {
      const token = createTestToken({ role: 'DESIGNER' })

      const res = await app
        .post('/api/v1/feedback/feedback-id/review')
        .set(authHeader(token))
        .send({ action: 'merge' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe(10003)
    })

    it('should return 400 for invalid action', async () => {
      const token = createArchitectToken()

      const res = await app
        .post('/api/v1/feedback/feedback-id/review')
        .set(authHeader(token))
        .send({ action: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20002)
    })
  })
})
