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

const mockSopProjectRow = (overrides?: Record<string, unknown>) => ({
  id: 'sop-project-id',
  name: 'Test SOP Project',
  version: 'v1.0.0',
  description: 'A test SOP project',
  projectId: 'test-project-id',
  visibility: 'team',
  createdById: 'test-user-id',
  createdBy: mockCreatedBy,
  documents: [],
  _count: { documents: 0 },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

const mockSopDocRow = (overrides?: Record<string, unknown>) => ({
  id: 'sop-doc-id',
  sopProjectId: 'sop-project-id',
  layer: 'FRONTEND_ARCH',
  title: 'Test Document',
  content: 'Document content',
  version: 1,
  tags: ['tag1'],
  sortOrder: 0,
  createdById: 'test-user-id',
  createdBy: mockCreatedBy,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

describe('SOP API', () => {
  // ===== SOP Projects =====
  describe('GET /api/v1/sop', () => {
    it('should list SOP projects with pagination', async () => {
      const token = createTestToken()
      mockPrisma.sopProject.findMany.mockResolvedValue([mockSopProjectRow()])
      mockPrisma.sopProject.count.mockResolvedValue(1)

      const res = await app
        .get('/api/v1/sop?page=1&pageSize=20')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('total')
    })

    it('should filter by keyword', async () => {
      const token = createTestToken()
      mockPrisma.sopProject.findMany.mockResolvedValue([])
      mockPrisma.sopProject.count.mockResolvedValue(0)

      const res = await app
        .get('/api/v1/sop?keyword=test')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/sop')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/sop', () => {
    it('should create a SOP project', async () => {
      const token = createTestToken()
      mockPrisma.sopProject.create.mockResolvedValue(mockSopProjectRow())

      const res = await app
        .post('/api/v1/sop')
        .set(authHeader(token))
        .send({ name: 'Test SOP Project', projectId: 'test-project-id' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should return 400 when name is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/sop')
        .set(authHeader(token))
        .send({ projectId: 'test-project-id' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 when projectId is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/sop')
        .set(authHeader(token))
        .send({ name: 'Test SOP' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/sop/:id', () => {
    it('should get SOP project detail', async () => {
      const token = createTestToken()
      mockPrisma.sopProject.findUnique.mockResolvedValue(mockSopProjectRow())

      const res = await app
        .get('/api/v1/sop/sop-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 404 for not found', async () => {
      const token = createTestToken()
      mockPrisma.sopProject.findUnique.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/sop/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/v1/sop/:id', () => {
    it('should update a SOP project', async () => {
      const token = createTestToken()
      mockPrisma.sopProject.findUnique.mockResolvedValue(mockSopProjectRow())
      mockPrisma.sopProject.update.mockResolvedValue(mockSopProjectRow({ name: 'Updated SOP' }))

      const res = await app
        .put('/api/v1/sop/sop-project-id')
        .set(authHeader(token))
        .send({ name: 'Updated SOP' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/sop/:id', () => {
    it('should soft delete a SOP project', async () => {
      const token = createTestToken()
      mockPrisma.sopProject.findUnique.mockResolvedValue(mockSopProjectRow())
      mockPrisma.sopProject.update.mockResolvedValue(mockSopProjectRow({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/sop/sop-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Documents =====
  describe('POST /api/v1/sop/:id/documents', () => {
    it('should create a document', async () => {
      const token = createTestToken()
      mockPrisma.sopProject.findUnique.mockResolvedValue(mockSopProjectRow())
      mockPrisma.sopDocument.findFirst.mockResolvedValue(null)
      mockPrisma.sopDocument.create.mockResolvedValue(mockSopDocRow())
      mockPrisma.sopDocumentVersion.create.mockResolvedValue({})

      const res = await app
        .post('/api/v1/sop/sop-project-id/documents')
        .set(authHeader(token))
        .send({ layer: 'FRONTEND_ARCH', title: 'Test Document', content: 'Content' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for missing layer', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/sop/sop-project-id/documents')
        .set(authHeader(token))
        .send({ title: 'Test Document' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 for invalid layer', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/sop/sop-project-id/documents')
        .set(authHeader(token))
        .send({ layer: 'INVALID_LAYER', title: 'Test Document' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20002)
    })
  })

  describe('PUT /api/v1/sop/documents/:docId', () => {
    it('should update a document with auto-versioning', async () => {
      const token = createTestToken()
      mockPrisma.sopDocument.findUnique.mockResolvedValue(mockSopDocRow())
      // $transaction returns array of results
      mockPrisma.$transaction.mockResolvedValue([
        mockSopDocRow({ version: 2, title: 'Updated Title' }),
        { id: 'version-id' },
      ])

      const res = await app
        .put('/api/v1/sop/documents/sop-doc-id')
        .set(authHeader(token))
        .send({ title: 'Updated Title', content: 'Updated content' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('GET /api/v1/sop/documents/:docId/versions', () => {
    it('should return version history', async () => {
      const token = createTestToken()
      mockPrisma.sopDocument.findUnique.mockResolvedValue(mockSopDocRow())
      mockPrisma.sopDocumentVersion.findMany.mockResolvedValue([
        { id: 'v1', documentId: 'sop-doc-id', version: 1, title: 'V1', content: 'C1', tags: [], createdBy: mockCreatedBy, createdAt: new Date() },
      ])

      const res = await app
        .get('/api/v1/sop/documents/sop-doc-id/versions')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('GET /api/v1/sop/documents/:docId/diff', () => {
    it('should return diff between two versions', async () => {
      const token = createTestToken()
      mockPrisma.sopDocument.findUnique.mockResolvedValue(mockSopDocRow())
      mockPrisma.sopDocumentVersion.findFirst
        .mockResolvedValueOnce({ version: 1, content: 'Old content' })
        .mockResolvedValueOnce({ version: 2, content: 'New content' })

      const res = await app
        .get('/api/v1/sop/documents/sop-doc-id/diff?oldVersion=1&newVersion=2')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('diff')
    })

    it('should return 400 when version params are missing', async () => {
      const token = createTestToken()

      const res = await app
        .get('/api/v1/sop/documents/sop-doc-id/diff')
        .set(authHeader(token))

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })
})
