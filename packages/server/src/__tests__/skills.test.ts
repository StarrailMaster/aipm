import { describe, it, expect } from 'vitest'
import { createTestApp, createTestToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

const mockSkill = (overrides?: Record<string, unknown>) => ({
  id: 'skill-id',
  name: 'Test Skill',
  description: 'A test skill',
  category: 'GENERAL_TOOL',
  tags: ['automation'],
  content: 'Skill definition content',
  gitRepoUrl: 'https://github.com/test/repo',
  visibility: 'team',
  starCount: 0,
  forkCount: 0,
  sourceId: null,
  createdById: 'test-user-id',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

describe('Skills API', () => {
  describe('GET /api/v1/skills', () => {
    it('should list skills with pagination', async () => {
      const token = createTestToken()
      mockPrisma.skill.findMany.mockResolvedValue([mockSkill()])
      mockPrisma.skill.count.mockResolvedValue(1)
      mockPrisma.star.findMany.mockResolvedValue([])
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'test-user-id', name: 'Test User', email: 'test@example.com', role: 'ENGINEER', avatar: null, legacyRoles: [] },
      ])

      const res = await app
        .get('/api/v1/skills?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('total')
    })

    it('should filter by category', async () => {
      const token = createTestToken()
      mockPrisma.skill.findMany.mockResolvedValue([])
      mockPrisma.skill.count.mockResolvedValue(0)
      mockPrisma.star.findMany.mockResolvedValue([])
      mockPrisma.user.findMany.mockResolvedValue([])

      const res = await app
        .get('/api/v1/skills?category=GENERAL_TOOL')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/skills')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/skills', () => {
    it('should create a skill', async () => {
      const token = createTestToken()
      mockPrisma.skill.create.mockResolvedValue(mockSkill())
      mockPrisma.user.findUnique.mockResolvedValue(
        { id: 'test-user-id', name: 'Test User', email: 'test@example.com', role: 'ENGINEER', avatar: null, legacyRoles: [] },
      )

      const res = await app
        .post('/api/v1/skills')
        .set(authHeader(token))
        .send({
          name: 'Test Skill',
          category: 'GENERAL_TOOL',
          content: 'Skill content',
          gitRepoUrl: 'https://github.com/test/repo',
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should create a skill without gitRepoUrl', async () => {
      const token = createTestToken()
      mockPrisma.skill.create.mockResolvedValue(mockSkill({ gitRepoUrl: null }))
      mockPrisma.user.findUnique.mockResolvedValue(
        { id: 'test-user-id', name: 'Test User', email: 'test@example.com', role: 'ENGINEER', avatar: null, legacyRoles: [] },
      )

      const res = await app
        .post('/api/v1/skills')
        .set(authHeader(token))
        .send({ name: 'Test Skill', category: 'GENERAL_TOOL', content: 'Skill content' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for missing required fields', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/skills')
        .set(authHeader(token))
        .send({ name: 'Test Skill' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/skills/:id', () => {
    it('should get skill detail', async () => {
      const token = createTestToken()
      mockPrisma.skill.findUnique.mockResolvedValue(mockSkill())
      mockPrisma.star.findFirst.mockResolvedValue(null)
      mockPrisma.user.findUnique.mockResolvedValue(
        { id: 'test-user-id', name: 'Test User', email: 'test@example.com', role: 'ENGINEER', avatar: null, legacyRoles: [] },
      )

      const res = await app
        .get('/api/v1/skills/skill-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should handle not found', async () => {
      const token = createTestToken()
      mockPrisma.skill.findUnique.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/skills/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('PUT /api/v1/skills/:id', () => {
    it('should update a skill', async () => {
      const token = createTestToken()
      const updated = mockSkill({ name: 'Updated Skill' })
      mockPrisma.skill.findUnique.mockResolvedValue(mockSkill())
      mockPrisma.skill.update.mockResolvedValue(updated)

      const res = await app
        .put('/api/v1/skills/skill-id')
        .set(authHeader(token))
        .send({ name: 'Updated Skill' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should update gitRepoUrl', async () => {
      const token = createTestToken()
      const updated = mockSkill({ gitRepoUrl: 'https://github.com/new/repo' })
      mockPrisma.skill.findUnique.mockResolvedValue(mockSkill())
      mockPrisma.skill.update.mockResolvedValue(updated)

      const res = await app
        .put('/api/v1/skills/skill-id')
        .set(authHeader(token))
        .send({ gitRepoUrl: 'https://github.com/new/repo' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/skills/:id', () => {
    it('should soft delete a skill', async () => {
      const token = createTestToken()
      mockPrisma.skill.findUnique.mockResolvedValue(mockSkill())
      mockPrisma.skill.update.mockResolvedValue(mockSkill({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/skills/skill-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('POST /api/v1/skills/:id/star', () => {
    it('should toggle star on a skill', async () => {
      const token = createTestToken()
      mockPrisma.skill.findUnique.mockResolvedValue(mockSkill())
      mockPrisma.star.findFirst.mockResolvedValue(null)
      mockPrisma.star.create.mockResolvedValue({ id: 'star-id' })
      mockPrisma.skill.update.mockResolvedValue(mockSkill({ starCount: 1 }))

      const res = await app
        .post('/api/v1/skills/skill-id/star')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('POST /api/v1/skills/:id/fork', () => {
    it('should fork a skill', async () => {
      const token = createTestToken()
      const forked = mockSkill({ id: 'forked-id', sourceId: 'skill-id', visibility: 'private' })
      mockPrisma.skill.findUnique.mockResolvedValue(mockSkill())
      mockPrisma.skill.create.mockResolvedValue(forked)
      mockPrisma.skill.update.mockResolvedValue(mockSkill({ forkCount: 1 }))
      mockPrisma.fork.create.mockResolvedValue({})

      const res = await app
        .post('/api/v1/skills/skill-id/fork')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })
})
