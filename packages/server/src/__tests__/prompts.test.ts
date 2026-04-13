import { describe, it, expect } from 'vitest'
import { createTestApp, createTestToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

const mockCreatedBy = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  role: 'ENGINEER',
  avatar: null,
  legacyRoles: [],
}

const mockPromptRow = (overrides?: Record<string, unknown>) => ({
  id: 'prompt-id',
  name: 'Test Prompt',
  description: 'A test prompt',
  category: 'FRONTEND',
  tags: ['tag1'],
  content: 'Prompt content here',
  visibility: 'team',
  starCount: 0,
  forkCount: 0,
  sourceId: null,
  dependsOn: [],
  requiredSopLayers: [],
  version: 1,
  createdById: 'test-user-id',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

const mockPrRow = (overrides?: Record<string, unknown>) => ({
  id: 'pr-id',
  promptId: 'prompt-id',
  title: 'Test PR',
  description: 'PR description',
  newContent: 'New content',
  diff: '- old\n+ new',
  status: 'OPEN',
  submittedById: 'test-user-id',
  reviewedById: null,
  reviewComment: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
})

describe('Prompts API', () => {
  describe('GET /api/v1/prompts', () => {
    it('should list prompts with pagination', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findMany.mockResolvedValue([mockPromptRow()])
      mockPrisma.prompt.count.mockResolvedValue(1)
      mockPrisma.star.findMany.mockResolvedValue([])
      mockPrisma.user.findMany.mockResolvedValue([mockCreatedBy])

      const res = await app
        .get('/api/v1/prompts?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('total')
    })

    it('should filter by category and tags', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findMany.mockResolvedValue([])
      mockPrisma.prompt.count.mockResolvedValue(0)
      mockPrisma.star.findMany.mockResolvedValue([])
      mockPrisma.user.findMany.mockResolvedValue([])

      const res = await app
        .get('/api/v1/prompts?category=FRONTEND&tags=tag1,tag2')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/prompts')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/prompts', () => {
    it('should create a prompt', async () => {
      const token = createTestToken()
      mockPrisma.prompt.create.mockResolvedValue(mockPromptRow())
      mockPrisma.user.findUnique.mockResolvedValue(mockCreatedBy)
      mockPrisma.promptVersion.create.mockResolvedValue({})

      const res = await app
        .post('/api/v1/prompts')
        .set(authHeader(token))
        .send({ name: 'Test Prompt', category: 'FRONTEND', content: 'Prompt content' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should return 400 for missing required fields', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/prompts')
        .set(authHeader(token))
        .send({ name: 'Test Prompt' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 when content is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/prompts')
        .set(authHeader(token))
        .send({ name: 'Test', category: 'FRONTEND' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/prompts/:id', () => {
    it('should get prompt detail', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.user.findUnique.mockResolvedValue(mockCreatedBy)
      mockPrisma.star.findFirst.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/prompts/prompt-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should handle not found', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/prompts/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('PUT /api/v1/prompts/:id', () => {
    it('should update a prompt', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.prompt.update.mockResolvedValue(mockPromptRow({ name: 'Updated', version: 2 }))
      mockPrisma.promptVersion.create.mockResolvedValue({})
      mockPrisma.user.findUnique.mockResolvedValue(mockCreatedBy)

      const res = await app
        .put('/api/v1/prompts/prompt-id')
        .set(authHeader(token))
        .send({ name: 'Updated Prompt', content: 'Updated content' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/prompts/:id', () => {
    it('should soft delete a prompt', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.prompt.update.mockResolvedValue(mockPromptRow({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/prompts/prompt-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('POST /api/v1/prompts/:id/star', () => {
    it('should toggle star on a prompt', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.star.findFirst.mockResolvedValue(null)
      mockPrisma.star.create.mockResolvedValue({ id: 'star-id' })
      mockPrisma.prompt.update.mockResolvedValue(mockPromptRow({ starCount: 1 }))

      const res = await app
        .post('/api/v1/prompts/prompt-id/star')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('POST /api/v1/prompts/:id/fork', () => {
    it('should fork a prompt', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.prompt.create.mockResolvedValue(mockPromptRow({ id: 'forked-id', sourceId: 'prompt-id' }))
      mockPrisma.prompt.update.mockResolvedValue(mockPromptRow({ forkCount: 1 }))
      mockPrisma.fork.create.mockResolvedValue({})
      mockPrisma.user.findUnique.mockResolvedValue(mockCreatedBy)
      mockPrisma.promptVersion.create.mockResolvedValue({})

      const res = await app
        .post('/api/v1/prompts/prompt-id/fork')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('GET /api/v1/prompts/:id/versions', () => {
    it('should return version history', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.promptVersion.findMany.mockResolvedValue([
        { id: 'v1', promptId: 'prompt-id', version: 1, name: 'V1', content: 'C1', changelog: null, createdById: 'test-user-id', createdAt: new Date() },
      ])
      mockPrisma.user.findMany.mockResolvedValue([mockCreatedBy])

      const res = await app
        .get('/api/v1/prompts/prompt-id/versions')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== PR Workflow =====
  describe('POST /api/v1/prompts/:id/pr', () => {
    it('should submit a PR', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.promptPr.create.mockResolvedValue(mockPrRow())
      mockPrisma.user.findUnique.mockResolvedValue(mockCreatedBy)

      const res = await app
        .post('/api/v1/prompts/prompt-id/pr')
        .set(authHeader(token))
        .send({ title: 'Test PR', description: 'PR description', newContent: 'New content' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for missing required fields', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/prompts/prompt-id/pr')
        .set(authHeader(token))
        .send({ title: 'Test PR' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/prompts/:id/prs', () => {
    it('should list PRs for a prompt', async () => {
      const token = createTestToken()
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.promptPr.findMany.mockResolvedValue([mockPrRow()])
      mockPrisma.user.findMany.mockResolvedValue([mockCreatedBy])

      const res = await app
        .get('/api/v1/prompts/prompt-id/prs')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('GET /api/v1/prompts/prs/:prId', () => {
    it('should get PR detail', async () => {
      const token = createTestToken()
      mockPrisma.promptPr.findUnique.mockResolvedValue(mockPrRow())
      mockPrisma.user.findUnique.mockResolvedValue(mockCreatedBy)

      const res = await app
        .get('/api/v1/prompts/prs/pr-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('PUT /api/v1/prompts/prs/:prId/review', () => {
    it('should merge a PR', async () => {
      const token = createTestToken()
      mockPrisma.promptPr.findUnique.mockResolvedValue(mockPrRow())
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.promptPr.update.mockResolvedValue(mockPrRow({ status: 'MERGED' }))
      mockPrisma.prompt.update.mockResolvedValue(mockPromptRow({ version: 2 }))
      mockPrisma.promptVersion.create.mockResolvedValue({})
      mockPrisma.user.findUnique.mockResolvedValue(mockCreatedBy)

      const res = await app
        .put('/api/v1/prompts/prs/pr-id/review')
        .set(authHeader(token))
        .send({ action: 'merge' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should reject a PR', async () => {
      const token = createTestToken()
      mockPrisma.promptPr.findUnique.mockResolvedValue(mockPrRow())
      mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptRow())
      mockPrisma.promptPr.update.mockResolvedValue(mockPrRow({ status: 'REJECTED' }))
      mockPrisma.user.findUnique.mockResolvedValue(mockCreatedBy)

      const res = await app
        .put('/api/v1/prompts/prs/pr-id/review')
        .set(authHeader(token))
        .send({ action: 'reject', comment: 'Not good' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for invalid action', async () => {
      const token = createTestToken()

      const res = await app
        .put('/api/v1/prompts/prs/pr-id/review')
        .set(authHeader(token))
        .send({ action: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })
})
