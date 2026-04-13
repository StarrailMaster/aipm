import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, createTestToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

const mockBoard = (overrides?: Record<string, unknown>) => ({
  id: 'board-id',
  projectId: 'test-project-id',
  name: 'Test Board',
  description: 'A test board',
  createdById: 'test-user-id',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  selections: [],
  _count: { selections: 0 },
  ...overrides,
})

const mockSelection = (overrides?: Record<string, unknown>) => ({
  id: 'selection-id',
  boardId: 'board-id',
  userId: 'test-user-id',
  promptId: 'prompt-id',
  position: { x: 100, y: 200 },
  note: 'Test note',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
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

const mockPromptBrief = {
  id: 'prompt-id',
  name: 'Test Prompt',
  category: 'FRONTEND',
  starCount: 0,
  description: 'A prompt',
  content: 'Prompt content',
}

describe('Boards API', () => {
  beforeEach(() => {
    // Default user mock for getUserBrief calls
    mockPrisma.user.findUnique.mockResolvedValue(mockUserBrief)
    mockPrisma.prompt.findUnique.mockResolvedValue(mockPromptBrief)
    mockPrisma.prompt.findMany.mockResolvedValue([mockPromptBrief])
  })

  describe('GET /api/v1/boards', () => {
    it('should list boards for a project', async () => {
      const token = createTestToken()
      mockPrisma.board.findMany.mockResolvedValue([mockBoard()])
      mockPrisma.board.count.mockResolvedValue(1)

      const res = await app
        .get('/api/v1/boards?projectId=test-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('items')
    })

    it('should return 400 when projectId is missing', async () => {
      const token = createTestToken()

      const res = await app
        .get('/api/v1/boards')
        .set(authHeader(token))

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/boards?projectId=test')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/v1/boards', () => {
    it('should create a board', async () => {
      const token = createTestToken()
      mockPrisma.board.create.mockResolvedValue(mockBoard())

      const res = await app
        .post('/api/v1/boards')
        .set(authHeader(token))
        .send({ projectId: 'test-project-id', name: 'Test Board' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should return 400 when projectId is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/boards')
        .set(authHeader(token))
        .send({ name: 'Test Board' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 when name is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/boards')
        .set(authHeader(token))
        .send({ projectId: 'test-project-id' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/boards/:id', () => {
    it('should get board with selections', async () => {
      const token = createTestToken()
      const board = mockBoard({ selections: [mockSelection()] })
      // getBoardDetail uses findFirst, not findUnique
      mockPrisma.board.findFirst.mockResolvedValue(board)

      const res = await app
        .get('/api/v1/boards/board-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should handle not found', async () => {
      const token = createTestToken()
      mockPrisma.board.findFirst.mockResolvedValue(null)

      const res = await app
        .get('/api/v1/boards/nonexistent')
        .set(authHeader(token))

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('PUT /api/v1/boards/:id', () => {
    it('should update board name and description', async () => {
      const token = createTestToken()
      // updateBoard uses findFirst for existence check
      mockPrisma.board.findFirst.mockResolvedValue(mockBoard())
      mockPrisma.board.update.mockResolvedValue(
        mockBoard({ name: 'Updated Board', _count: { selections: 0 } }),
      )

      const res = await app
        .put('/api/v1/boards/board-id')
        .set(authHeader(token))
        .send({ name: 'Updated Board', description: 'Updated description' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/boards/:id', () => {
    it('should soft delete a board', async () => {
      const token = createTestToken()
      // deleteBoard uses findFirst for existence check
      mockPrisma.board.findFirst.mockResolvedValue(mockBoard())
      mockPrisma.board.update.mockResolvedValue(mockBoard({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/boards/board-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Selections =====
  describe('POST /api/v1/boards/:id/selections', () => {
    it('should add a selection', async () => {
      const token = createTestToken()
      // addSelection uses findFirst for board existence
      mockPrisma.board.findFirst.mockResolvedValue(mockBoard())
      mockPrisma.boardSelection.create.mockResolvedValue(mockSelection())

      const res = await app
        .post('/api/v1/boards/board-id/selections')
        .set(authHeader(token))
        .send({ promptId: 'prompt-id', position: { x: 100, y: 200 }, note: 'Test note' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 when promptId is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/boards/board-id/selections')
        .set(authHeader(token))
        .send({ position: { x: 100, y: 200 } })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 when position is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/boards/board-id/selections')
        .set(authHeader(token))
        .send({ promptId: 'prompt-id' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('PUT /api/v1/boards/:id/selections/:selId', () => {
    it('should update selection position and note', async () => {
      const token = createTestToken()
      const updated = mockSelection({ position: { x: 300, y: 400 }, note: 'Updated note' })
      // updateSelection uses findFirst for existence check
      mockPrisma.boardSelection.findFirst.mockResolvedValue(mockSelection())
      mockPrisma.boardSelection.update.mockResolvedValue(updated)

      const res = await app
        .put('/api/v1/boards/board-id/selections/selection-id')
        .set(authHeader(token))
        .send({ position: { x: 300, y: 400 }, note: 'Updated note' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/boards/:id/selections/:selId', () => {
    it('should remove a selection', async () => {
      const token = createTestToken()
      // removeSelection uses findFirst for existence check
      mockPrisma.boardSelection.findFirst.mockResolvedValue(mockSelection())
      mockPrisma.boardSelection.delete.mockResolvedValue(mockSelection())

      const res = await app
        .delete('/api/v1/boards/board-id/selections/selection-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('POST /api/v1/boards/:id/export', () => {
    it('should export board as feed package config', async () => {
      const token = createTestToken()
      // exportBoard uses findFirst with include: { selections: true }
      const board = mockBoard({ selections: [mockSelection()] })
      mockPrisma.board.findFirst.mockResolvedValue(board)

      const res = await app
        .post('/api/v1/boards/board-id/export')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })
})
