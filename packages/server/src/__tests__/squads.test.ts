import { describe, it, expect } from 'vitest'
import { createTestApp, createTestToken, createAdminToken, createArchitectToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

// Squad mock matching Prisma include: { project: { select: { name } }, members }
const mockSquadRow = (overrides?: Record<string, unknown>) => ({
  id: 'test-squad-id',
  name: 'Test Squad',
  projectId: 'test-project-id',
  project: { name: 'Test Project' },
  members: [
    { id: 'arch-id', name: 'Architect', email: 'arch@test.com', role: 'ARCHITECT', avatar: null, legacyRoles: [] },
    { id: 'eng-id', name: 'Engineer', email: 'eng@test.com', role: 'ENGINEER', avatar: null, legacyRoles: [] },
  ],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
})

describe('Squads API', () => {
  describe('GET /api/v1/squads', () => {
    it('should list squads with pagination', async () => {
      const token = createTestToken()
      mockPrisma.squad.findMany.mockResolvedValue([mockSquadRow()])
      mockPrisma.squad.count.mockResolvedValue(1)

      const res = await app
        .get('/api/v1/squads?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('total')
    })

    it('should filter by projectId', async () => {
      const token = createTestToken()
      mockPrisma.squad.findMany.mockResolvedValue([mockSquadRow()])
      mockPrisma.squad.count.mockResolvedValue(1)

      const res = await app
        .get('/api/v1/squads?projectId=test-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/squads')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/squads', () => {
    it('should create a squad (ADMIN)', async () => {
      const token = createAdminToken()
      mockPrisma.project.findFirst.mockResolvedValue({ id: 'test-project-id', deletedAt: null })
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({ id: 'arch-id', name: 'Architect', deletedAt: null, squadId: null })
        .mockResolvedValueOnce({ id: 'eng-id', name: 'Engineer', deletedAt: null, squadId: null })
      mockPrisma.squad.create.mockResolvedValue(mockSquadRow())

      const res = await app
        .post('/api/v1/squads')
        .set(authHeader(token))
        .send({
          name: 'Test Squad',
          projectId: 'test-project-id',
          architectId: 'arch-id',
          engineerId: 'eng-id',
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 403 for ENGINEER role', async () => {
      const token = createTestToken({ role: 'ENGINEER' })

      const res = await app
        .post('/api/v1/squads')
        .set(authHeader(token))
        .send({
          name: 'Test Squad',
          projectId: 'test-project-id',
          architectId: 'arch-id',
          engineerId: 'eng-id',
        })

      expect(res.status).toBe(403)
    })

    it('should return 400 for missing required fields', async () => {
      const token = createAdminToken()

      const res = await app
        .post('/api/v1/squads')
        .set(authHeader(token))
        .send({ name: 'Test Squad' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/squads/:id', () => {
    it('should get a squad by id', async () => {
      const token = createTestToken()
      mockPrisma.squad.findUnique.mockResolvedValue(mockSquadRow())

      const res = await app
        .get('/api/v1/squads/test-squad-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 404 for not found', async () => {
      const token = createTestToken()
      mockPrisma.squad.findUnique.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/squads/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/v1/squads/:id', () => {
    it('should update a squad (ADMIN)', async () => {
      const token = createAdminToken()
      mockPrisma.squad.findUnique.mockResolvedValue(mockSquadRow())
      mockPrisma.squad.update.mockResolvedValue(mockSquadRow({ name: 'Updated Squad' }))

      const res = await app
        .put('/api/v1/squads/test-squad-id')
        .set(authHeader(token))
        .send({ name: 'Updated Squad' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 403 for DESIGNER role', async () => {
      const token = createTestToken({ role: 'DESIGNER' })

      const res = await app
        .put('/api/v1/squads/test-squad-id')
        .set(authHeader(token))
        .send({ name: 'Updated Squad' })

      expect(res.status).toBe(403)
    })
  })

  describe('DELETE /api/v1/squads/:id', () => {
    it('should delete a squad (ADMIN only)', async () => {
      const token = createAdminToken()
      mockPrisma.squad.findUnique.mockResolvedValue(mockSquadRow())
      mockPrisma.squad.update.mockResolvedValue(mockSquadRow())
      mockPrisma.squad.delete.mockResolvedValue(mockSquadRow())

      const res = await app
        .delete('/api/v1/squads/test-squad-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 403 for ARCHITECT role', async () => {
      const token = createArchitectToken()

      const res = await app
        .delete('/api/v1/squads/test-squad-id')
        .set(authHeader(token))

      expect(res.status).toBe(403)
    })
  })
})
