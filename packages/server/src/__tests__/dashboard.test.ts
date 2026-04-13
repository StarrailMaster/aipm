import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, createTestToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

describe('Dashboard API', () => {
  beforeEach(() => {
    // Default mocks for the complex dashboard queries
    mockPrisma.iteration.findFirst.mockResolvedValue(null)
    mockPrisma.iteration.findMany.mockResolvedValue([])
  })

  describe('GET /api/v1/dashboard', () => {
    it('should return company-level dashboard (no projectId)', async () => {
      const token = createTestToken()
      mockPrisma.project.findMany.mockResolvedValue([
        {
          id: 'proj-1',
          name: 'Project 1',
          deletedAt: null,
          squads: [{ id: 'squad-1', name: 'Squad A', projectId: 'proj-1' }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      mockPrisma.keyResult.findMany.mockResolvedValue([])

      const res = await app
        .get('/api/v1/dashboard')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('projects')
      expect(res.body.data).toHaveProperty('okrSnapshot')
    })

    it('should return project-level dashboard with projectId', async () => {
      const token = createTestToken()
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-id',
        name: 'Test Project',
        deletedAt: null,
        squads: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mockPrisma.keyResult.findMany.mockResolvedValue([])

      const res = await app
        .get('/api/v1/dashboard?projectId=test-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('projects')
    })

    it('should accept month query parameter', async () => {
      const token = createTestToken()
      mockPrisma.project.findMany.mockResolvedValue([])
      mockPrisma.keyResult.findMany.mockResolvedValue([])

      const res = await app
        .get('/api/v1/dashboard?month=2025-06')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/dashboard')
      expect(res.status).toBe(401)
    })
  })
})
