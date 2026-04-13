import { describe, it, expect } from 'vitest'
import { createTestApp, createTestToken, createAdminToken, createArchitectToken, authHeader, mockUser } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

// Project mock matching what Prisma returns with include: { owner, squads, _count }
const mockProjectRow = (overrides?: Record<string, unknown>) => ({
  id: 'test-project-id',
  name: 'Test Project',
  description: 'A test project',
  ownerId: 'test-user-id',
  owner: { id: 'test-user-id', name: 'Test User' },
  squads: [],
  _count: { squads: 0 },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

describe('Org API', () => {
  // ===== Projects =====
  describe('GET /api/v1/projects', () => {
    it('should list projects with pagination', async () => {
      const token = createTestToken()
      mockPrisma.project.findMany.mockResolvedValue([
        mockProjectRow(),
        mockProjectRow({ id: 'project-2', name: 'Project 2' }),
      ])
      mockPrisma.project.count.mockResolvedValue(2)
      mockPrisma.user.count.mockResolvedValue(0)

      const res = await app
        .get('/api/v1/projects?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('total')
      expect(res.body.data).toHaveProperty('page')
      expect(res.body.data).toHaveProperty('pageSize')
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/projects')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/projects', () => {
    it('should create a project (ADMIN)', async () => {
      const token = createAdminToken()
      mockPrisma.project.findFirst.mockResolvedValue(null)
      mockPrisma.project.create.mockResolvedValue(mockProjectRow())

      const res = await app
        .post('/api/v1/projects')
        .set(authHeader(token))
        .send({ name: 'Test Project', description: 'A test project' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should create a project (ARCHITECT)', async () => {
      const token = createArchitectToken()
      mockPrisma.project.findFirst.mockResolvedValue(null)
      mockPrisma.project.create.mockResolvedValue(mockProjectRow())

      const res = await app
        .post('/api/v1/projects')
        .set(authHeader(token))
        .send({ name: 'Test Project' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 403 for ENGINEER role', async () => {
      const token = createTestToken({ role: 'ENGINEER' })

      const res = await app
        .post('/api/v1/projects')
        .set(authHeader(token))
        .send({ name: 'Test Project' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe(10003)
    })

    it('should return 400 when name is missing', async () => {
      const token = createAdminToken()

      const res = await app
        .post('/api/v1/projects')
        .set(authHeader(token))
        .send({ description: 'No name' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/projects/:id', () => {
    it('should get a project by id', async () => {
      const token = createTestToken()
      mockPrisma.project.findFirst.mockResolvedValue(mockProjectRow())

      const res = await app
        .get('/api/v1/projects/test-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data.id).toBe('test-project-id')
    })

    it('should return 404 for not found project', async () => {
      const token = createTestToken()
      mockPrisma.project.findFirst.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/projects/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBe(404)
      expect(res.body.code).toBe(39001)
    })
  })

  describe('PUT /api/v1/projects/:id', () => {
    it('should update a project (ADMIN)', async () => {
      const token = createAdminToken()
      // First findFirst: existence check (returns project)
      // Second findFirst: duplicate name check (returns null = no duplicate)
      mockPrisma.project.findFirst
        .mockResolvedValueOnce(mockProjectRow())
        .mockResolvedValueOnce(null)
      mockPrisma.project.update.mockResolvedValue(
        mockProjectRow({ name: 'Updated', _count: { squads: 0 }, owner: { id: 'test-user-id', name: 'Test User' } }),
      )
      mockPrisma.user.count.mockResolvedValue(0)

      const res = await app
        .put('/api/v1/projects/test-project-id')
        .set(authHeader(token))
        .send({ name: 'Updated' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 403 for DESIGNER role', async () => {
      const token = createTestToken({ role: 'DESIGNER' })

      const res = await app
        .put('/api/v1/projects/test-project-id')
        .set(authHeader(token))
        .send({ name: 'Updated' })

      expect(res.status).toBe(403)
    })
  })

  describe('DELETE /api/v1/projects/:id', () => {
    it('should soft delete a project (ADMIN only)', async () => {
      const token = createAdminToken()
      mockPrisma.project.findFirst.mockResolvedValue(mockProjectRow())
      mockPrisma.project.update.mockResolvedValue(mockProjectRow({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/projects/test-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 403 for ARCHITECT role', async () => {
      const token = createArchitectToken()

      const res = await app
        .delete('/api/v1/projects/test-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(403)
    })
  })

  // ===== Users =====
  describe('GET /api/v1/users', () => {
    it('should list users with pagination', async () => {
      const token = createTestToken()
      mockPrisma.user.findMany.mockResolvedValue([mockUser(), mockUser({ id: 'user-2', name: 'User 2' })])
      mockPrisma.user.count.mockResolvedValue(2)

      const res = await app
        .get('/api/v1/users?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
    })
  })

  describe('GET /api/v1/users/:id', () => {
    it('should get a user by id', async () => {
      const token = createTestToken()
      mockPrisma.user.findFirst.mockResolvedValue(mockUser())

      const res = await app
        .get('/api/v1/users/test-user-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 404 for not found user', async () => {
      const token = createTestToken()
      mockPrisma.user.findFirst.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/users/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/v1/users/:id', () => {
    it('should update a user (ADMIN only)', async () => {
      const token = createAdminToken()
      mockPrisma.user.findFirst.mockResolvedValue(mockUser())
      mockPrisma.user.update.mockResolvedValue(mockUser({ name: 'Updated Name' }))

      const res = await app
        .put('/api/v1/users/test-user-id')
        .set(authHeader(token))
        .send({ name: 'Updated Name' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 403 for non-ADMIN', async () => {
      const token = createTestToken({ role: 'ENGINEER' })

      const res = await app
        .put('/api/v1/users/test-user-id')
        .set(authHeader(token))
        .send({ name: 'Updated Name' })

      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/v1/users/:id/legacy-roles', () => {
    it('should update legacy roles', async () => {
      const token = createTestToken()
      mockPrisma.user.findFirst.mockResolvedValue(mockUser())
      mockPrisma.user.update.mockResolvedValue(mockUser({ legacyRoles: ['role1', 'role2'] }))

      const res = await app
        .put('/api/v1/users/test-user-id/legacy-roles')
        .set(authHeader(token))
        .send({ legacyRoles: ['role1', 'role2'] })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 when legacyRoles is not an array', async () => {
      const token = createTestToken()

      const res = await app
        .put('/api/v1/users/test-user-id/legacy-roles')
        .set(authHeader(token))
        .send({ legacyRoles: 'not-an-array' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })
})
