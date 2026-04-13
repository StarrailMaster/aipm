import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, createTestToken, authHeader } from '../test-utils/helpers'
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

const mockFeedPackage = (overrides?: Record<string, unknown>) => ({
  id: 'feed-id',
  iterationId: 'iteration-id',
  name: 'Test Feed Package',
  phase: 'IMPLEMENT',
  status: 'PENDING',
  promptId: 'prompt-id',
  dependsOn: [],
  canParallel: true,
  assigneeId: null,
  sortOrder: 0,
  createdById: 'test-user-id',
  files: [],
  executions: [],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

const mockFeedFile = (overrides?: Record<string, unknown>) => ({
  id: 'file-id',
  feedPackageId: 'feed-id',
  name: 'test-file.ts',
  content: 'file content',
  layer: 'core',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
})

const mockExecution = (overrides?: Record<string, unknown>) => ({
  id: 'exec-id',
  feedPackageId: 'feed-id',
  executedById: 'test-user-id',
  aiTool: 'claude',
  outputSummary: 'Execution summary',
  issues: null,
  executedAt: new Date('2025-01-01'),
  ...overrides,
})

describe('Feeds API', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserBrief)
    mockPrisma.user.findMany.mockResolvedValue([mockUserBrief])
  })

  describe('GET /api/v1/feeds', () => {
    it('should list feed packages with pagination', async () => {
      const token = createTestToken()
      mockPrisma.feedPackage.findMany.mockResolvedValue([mockFeedPackage({ files: [] })])
      mockPrisma.feedPackage.count.mockResolvedValue(1)

      const res = await app
        .get('/api/v1/feeds?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
    })

    it('should filter by iterationId and phase', async () => {
      const token = createTestToken()
      mockPrisma.feedPackage.findMany.mockResolvedValue([])
      mockPrisma.feedPackage.count.mockResolvedValue(0)

      const res = await app
        .get('/api/v1/feeds?iterationId=iter-id&phase=IMPLEMENT')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/feeds')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/feeds', () => {
    it('should create a feed package', async () => {
      const token = createTestToken()
      // createFeedPackage: aggregate for max sortOrder, then create with include: { files }
      mockPrisma.feedPackage.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } })
      mockPrisma.feedPackage.create.mockResolvedValue(mockFeedPackage({ files: [] }))

      const res = await app
        .post('/api/v1/feeds')
        .set(authHeader(token))
        .send({ iterationId: 'iteration-id', name: 'Test Feed', phase: 'IMPLEMENT' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should create with dependencies', async () => {
      const token = createTestToken()
      // When deps provided, service calls findMany to check dep status
      mockPrisma.feedPackage.findMany.mockResolvedValue([
        { id: 'dep-1', status: 'DONE' },
        { id: 'dep-2', status: 'DONE' },
      ])
      mockPrisma.feedPackage.aggregate.mockResolvedValue({ _max: { sortOrder: 1 } })
      mockPrisma.feedPackage.create.mockResolvedValue(
        mockFeedPackage({ dependsOn: ['dep-1', 'dep-2'], files: [] }),
      )

      const res = await app
        .post('/api/v1/feeds')
        .set(authHeader(token))
        .send({
          iterationId: 'iteration-id',
          name: 'Dependent Feed',
          phase: 'IMPLEMENT',
          dependsOn: ['dep-1', 'dep-2'],
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for missing required fields', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/feeds')
        .set(authHeader(token))
        .send({ name: 'Test Feed' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/feeds/:id', () => {
    it('should get feed package detail', async () => {
      const token = createTestToken()
      mockPrisma.feedPackage.findUnique.mockResolvedValue(
        mockFeedPackage({ files: [mockFeedFile()], executions: [mockExecution()] }),
      )

      const res = await app
        .get('/api/v1/feeds/feed-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should handle not found', async () => {
      const token = createTestToken()
      mockPrisma.feedPackage.findUnique.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/feeds/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('PUT /api/v1/feeds/:id', () => {
    it('should update a feed package', async () => {
      const token = createTestToken()
      const updated = mockFeedPackage({ name: 'Updated Feed', files: [] })
      mockPrisma.feedPackage.findUnique
        .mockResolvedValueOnce(mockFeedPackage())  // existence check
        .mockResolvedValueOnce(updated)              // re-fetch after update
      mockPrisma.feedPackage.update.mockResolvedValue(updated)

      const res = await app
        .put('/api/v1/feeds/feed-id')
        .set(authHeader(token))
        .send({ name: 'Updated Feed' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/feeds/:id', () => {
    it('should soft delete a feed package', async () => {
      const token = createTestToken()
      // deleteFeedPackage first calls findUnique for existence check
      mockPrisma.feedPackage.findUnique.mockResolvedValue(mockFeedPackage())
      mockPrisma.feedPackage.update.mockResolvedValue(mockFeedPackage({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/feeds/feed-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Files =====
  describe('POST /api/v1/feeds/:id/files', () => {
    it('should add a file to a feed package', async () => {
      const token = createTestToken()
      mockPrisma.feedPackage.findUnique.mockResolvedValue(mockFeedPackage())
      mockPrisma.feedFile.create.mockResolvedValue(mockFeedFile())

      const res = await app
        .post('/api/v1/feeds/feed-id/files')
        .set(authHeader(token))
        .send({ name: 'test-file.ts', content: 'file content', layer: 'core' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for missing required fields', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/feeds/feed-id/files')
        .set(authHeader(token))
        .send({ name: 'test-file.ts' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 for invalid layer', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/feeds/feed-id/files')
        .set(authHeader(token))
        .send({ name: 'test-file.ts', content: 'content', layer: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20002)
    })
  })

  describe('PUT /api/v1/feeds/:id/files/:fileId', () => {
    it('should update a file', async () => {
      const token = createTestToken()
      const updated = mockFeedFile({ content: 'updated content' })
      mockPrisma.feedFile.findUnique.mockResolvedValue(mockFeedFile())
      mockPrisma.feedFile.update.mockResolvedValue(updated)

      const res = await app
        .put('/api/v1/feeds/feed-id/files/file-id')
        .set(authHeader(token))
        .send({ content: 'updated content' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/feeds/:id/files/:fileId', () => {
    it('should delete a file', async () => {
      const token = createTestToken()
      mockPrisma.feedFile.findUnique.mockResolvedValue(mockFeedFile())
      mockPrisma.feedFile.delete.mockResolvedValue(mockFeedFile())

      const res = await app
        .delete('/api/v1/feeds/feed-id/files/file-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Status =====
  describe('POST /api/v1/feeds/:id/status', () => {
    it('should update status to IN_PROGRESS', async () => {
      const token = createTestToken()
      const updated = mockFeedPackage({ status: 'IN_PROGRESS', files: [] })
      mockPrisma.feedPackage.findUnique.mockResolvedValue(mockFeedPackage())
      mockPrisma.feedPackage.update.mockResolvedValue(updated)

      const res = await app
        .post('/api/v1/feeds/feed-id/status')
        .set(authHeader(token))
        .send({ status: 'IN_PROGRESS' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for missing status', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/feeds/feed-id/status')
        .set(authHeader(token))
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 for invalid status value', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/feeds/feed-id/status')
        .set(authHeader(token))
        .send({ status: 'INVALID_STATUS' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20002)
    })
  })

  // ===== Execution =====
  describe('POST /api/v1/feeds/:id/execute', () => {
    it('should record an execution', async () => {
      const token = createTestToken()
      mockPrisma.feedPackage.findUnique.mockResolvedValue(mockFeedPackage())
      mockPrisma.executionRecord.create.mockResolvedValue(mockExecution())

      const res = await app
        .post('/api/v1/feeds/feed-id/execute')
        .set(authHeader(token))
        .send({ aiTool: 'claude', outputSummary: 'Execution summary' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 when aiTool is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/feeds/feed-id/execute')
        .set(authHeader(token))
        .send({ outputSummary: 'Summary' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 when outputSummary is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/feeds/feed-id/execute')
        .set(authHeader(token))
        .send({ aiTool: 'claude' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  // ===== Assembly =====
  describe('GET /api/v1/feeds/:id/assemble', () => {
    it('should assemble the full feed package content', async () => {
      const token = createTestToken()
      const pkg = mockFeedPackage({ files: [mockFeedFile()] })
      mockPrisma.feedPackage.findUnique.mockResolvedValue(pkg)

      const res = await app
        .get('/api/v1/feeds/feed-id/assemble')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Dependency Graph =====
  describe('GET /api/v1/feeds/graph', () => {
    it('should return dependency graph for an iteration', async () => {
      const token = createTestToken()
      mockPrisma.feedPackage.findMany.mockResolvedValue([
        mockFeedPackage({ id: 'pkg-1', dependsOn: [] }),
        mockFeedPackage({ id: 'pkg-2', dependsOn: ['pkg-1'] }),
      ])

      const res = await app
        .get('/api/v1/feeds/graph?iterationId=iteration-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 when iterationId is missing', async () => {
      const token = createTestToken()

      const res = await app
        .get('/api/v1/feeds/graph')
        .set(authHeader(token))

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })
})
