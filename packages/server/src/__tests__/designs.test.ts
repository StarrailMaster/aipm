import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, createTestToken, createArchitectToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

const mockDesign = (overrides?: Record<string, unknown>) => ({
  id: 'design-id',
  iterationId: 'iteration-id',
  name: 'Test Design',
  status: 'AI_GENERATED',
  figmaUrl: 'https://figma.com/test',
  thumbnailUrl: null,
  assigneeId: null,
  changeLog: null,
  lockedAt: null,
  lockedById: null,
  createdById: 'test-user-id',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

const mockHistoryEntry = (overrides?: Record<string, unknown>) => ({
  id: 'history-id',
  draftId: 'design-id',
  fromStatus: 'AI_GENERATED',
  toStatus: 'PENDING_REFINE',
  changeLog: 'Status changed',
  changedById: 'test-user-id',
  createdAt: new Date('2025-01-01'),
  ...overrides,
})

const mockUserBrief = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  role: 'ENGINEER',
  avatar: null,
  legacyRoles: [],
}

describe('Designs API', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserBrief)
    mockPrisma.user.findMany.mockResolvedValue([mockUserBrief])
  })

  describe('GET /api/v1/designs', () => {
    it('should list designs with pagination', async () => {
      const token = createTestToken()
      mockPrisma.designDraft.findMany.mockResolvedValue([mockDesign()])
      mockPrisma.designDraft.count.mockResolvedValue(1)

      const res = await app
        .get('/api/v1/designs?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
    })

    it('should filter by iterationId and status', async () => {
      const token = createTestToken()
      mockPrisma.designDraft.findMany.mockResolvedValue([])
      mockPrisma.designDraft.count.mockResolvedValue(0)

      const res = await app
        .get('/api/v1/designs?iterationId=iter-id&status=AI_GENERATED')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/designs')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/designs', () => {
    it('should create a design draft', async () => {
      const token = createTestToken()
      mockPrisma.designDraft.create.mockResolvedValue(mockDesign())

      const res = await app
        .post('/api/v1/designs')
        .set(authHeader(token))
        .send({ iterationId: 'iteration-id', name: 'Test Design', figmaUrl: 'https://figma.com/test' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should return 400 when iterationId is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/designs')
        .set(authHeader(token))
        .send({ name: 'Test Design' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 when name is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/designs')
        .set(authHeader(token))
        .send({ iterationId: 'iteration-id' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/designs/:id', () => {
    it('should get design detail', async () => {
      const token = createTestToken()
      mockPrisma.designDraft.findUnique.mockResolvedValue(mockDesign())

      const res = await app
        .get('/api/v1/designs/design-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should handle not found', async () => {
      const token = createTestToken()
      mockPrisma.designDraft.findUnique.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/designs/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('PUT /api/v1/designs/:id', () => {
    it('should update a design draft', async () => {
      const token = createTestToken()
      const updated = mockDesign({ name: 'Updated Design', figmaUrl: 'https://figma.com/updated' })
      mockPrisma.designDraft.findUnique.mockResolvedValue(mockDesign())
      mockPrisma.designDraft.update.mockResolvedValue(updated)

      const res = await app
        .put('/api/v1/designs/design-id')
        .set(authHeader(token))
        .send({ name: 'Updated Design', figmaUrl: 'https://figma.com/updated' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/designs/:id', () => {
    it('should soft delete a design', async () => {
      const token = createTestToken()
      // deleteDesignDraft first calls findUnique for existence check
      mockPrisma.designDraft.findUnique.mockResolvedValue(mockDesign())
      mockPrisma.designDraft.update.mockResolvedValue(mockDesign({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/designs/design-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Status Flow =====
  describe('POST /api/v1/designs/:id/status', () => {
    it('should change status with valid transition', async () => {
      const token = createTestToken()
      const updated = mockDesign({ status: 'PENDING_REFINE' })
      // changeDesignStatus: findUnique for existence, then $transaction([update, historyCreate])
      mockPrisma.designDraft.findUnique.mockResolvedValue(mockDesign({ status: 'AI_GENERATED' }))
      mockPrisma.designDraft.update.mockResolvedValue(updated)
      mockPrisma.designHistory.create.mockResolvedValue(mockHistoryEntry())

      const res = await app
        .post('/api/v1/designs/design-id/status')
        .set(authHeader(token))
        .send({ status: 'PENDING_REFINE', changeLog: 'Ready for refinement' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for missing status', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/designs/design-id/status')
        .set(authHeader(token))
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  // ===== Lock/Unlock =====
  describe('POST /api/v1/designs/:id/lock', () => {
    it('should lock a design', async () => {
      const token = createArchitectToken()
      const locked = mockDesign({ status: 'LOCKED', lockedAt: new Date(), lockedById: 'test-user-id' })
      // lockDesign: findUnique, then $transaction([update, historyCreate])
      mockPrisma.designDraft.findUnique.mockResolvedValue(mockDesign({ status: 'CONFIRMED' }))
      mockPrisma.designDraft.update.mockResolvedValue(locked)
      mockPrisma.designHistory.create.mockResolvedValue(mockHistoryEntry({ toStatus: 'LOCKED' }))

      const res = await app
        .post('/api/v1/designs/design-id/lock')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('POST /api/v1/designs/:id/unlock', () => {
    it('should unlock a design with reason', async () => {
      const token = createArchitectToken()
      const unlocked = mockDesign({ status: 'PENDING_REFINE', lockedAt: null, lockedById: null })
      // unlockDesign: findUnique, then $transaction([update, historyCreate])
      mockPrisma.designDraft.findUnique.mockResolvedValue(
        mockDesign({ status: 'LOCKED', lockedAt: new Date(), lockedById: 'test-user-id' }),
      )
      mockPrisma.designDraft.update.mockResolvedValue(unlocked)
      mockPrisma.designHistory.create.mockResolvedValue(mockHistoryEntry({ fromStatus: 'LOCKED', toStatus: 'PENDING_REFINE' }))

      const res = await app
        .post('/api/v1/designs/design-id/unlock')
        .set(authHeader(token))
        .send({ reason: 'Need to make changes' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 when reason is missing', async () => {
      const token = createArchitectToken()

      const res = await app
        .post('/api/v1/designs/design-id/unlock')
        .set(authHeader(token))
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  // ===== History =====
  describe('GET /api/v1/designs/:id/history', () => {
    it('should return status change history', async () => {
      const token = createTestToken()
      // getDesignHistory first checks the draft exists
      mockPrisma.designDraft.findUnique.mockResolvedValue(mockDesign())
      mockPrisma.designHistory.findMany.mockResolvedValue([
        mockHistoryEntry(),
        mockHistoryEntry({ id: 'h2', fromStatus: 'PENDING_REFINE', toStatus: 'REFINING' }),
      ])

      const res = await app
        .get('/api/v1/designs/design-id/history')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })
})
