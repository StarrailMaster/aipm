import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, createTestToken, authHeader } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

const mockObjective = (overrides?: Record<string, unknown>) => ({
  id: 'objective-id',
  projectId: 'test-project-id',
  name: 'Test Objective',
  description: 'Improve platform quality',
  squadId: 'test-squad-id',
  keyResults: [],
  createdById: 'test-user-id',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  ...overrides,
})

const mockKeyResult = (overrides?: Record<string, unknown>) => ({
  id: 'kr-id',
  objectiveId: 'objective-id',
  name: 'Test Key Result',
  targetValue: 100,
  currentValue: 0,
  unit: 'percent',
  iterations: [],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
})

const mockKrIteration = (overrides?: Record<string, unknown>) => ({
  id: 'kr-iter-id',
  keyResultId: 'kr-id',
  roundNumber: 1,
  changes: 'Implemented feature X',
  dataFeedback: 25,
  isAchieved: false,
  recordedById: 'test-user-id',
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

describe('OKR API', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserBrief)
    mockPrisma.user.findMany.mockResolvedValue([mockUserBrief])
  })

  describe('GET /api/v1/okr', () => {
    it('should list objectives with key results', async () => {
      const token = createTestToken()
      mockPrisma.objective.findMany.mockResolvedValue([
        mockObjective({ keyResults: [mockKeyResult({ iterations: [] })] }),
      ])
      // listObjectives also calls squad.findMany for squad name resolution
      mockPrisma.squad.findMany.mockResolvedValue([
        { id: 'test-squad-id', name: 'Test Squad' },
      ])

      const res = await app
        .get('/api/v1/okr?projectId=test-project-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 when projectId is missing', async () => {
      const token = createTestToken()

      const res = await app
        .get('/api/v1/okr')
        .set(authHeader(token))

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/okr?projectId=test')
      expect(res.status).toBe(401)
    })
  })

  // ===== Objectives =====
  describe('POST /api/v1/okr/objectives', () => {
    it('should create an objective', async () => {
      const token = createTestToken()
      mockPrisma.objective.create.mockResolvedValue(mockObjective())

      const res = await app
        .post('/api/v1/okr/objectives')
        .set(authHeader(token))
        .send({ projectId: 'test-project-id', name: 'Test Objective', description: 'Description' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should return 400 when projectId is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/okr/objectives')
        .set(authHeader(token))
        .send({ name: 'Test Objective' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 when name is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/okr/objectives')
        .set(authHeader(token))
        .send({ projectId: 'test-project-id' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('PUT /api/v1/okr/objectives/:id', () => {
    it('should update an objective', async () => {
      const token = createTestToken()
      const updated = mockObjective({ name: 'Updated Objective' })
      mockPrisma.objective.findUnique.mockResolvedValue(mockObjective())
      mockPrisma.objective.update.mockResolvedValue(updated)

      const res = await app
        .put('/api/v1/okr/objectives/objective-id')
        .set(authHeader(token))
        .send({ name: 'Updated Objective' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/okr/objectives/:id', () => {
    it('should soft delete an objective', async () => {
      const token = createTestToken()
      // deleteObjective first calls findUnique for existence check
      mockPrisma.objective.findUnique.mockResolvedValue(mockObjective())
      mockPrisma.objective.update.mockResolvedValue(mockObjective({ deletedAt: new Date() }))

      const res = await app
        .delete('/api/v1/okr/objectives/objective-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Key Results =====
  describe('POST /api/v1/okr/key-results', () => {
    it('should create a key result', async () => {
      const token = createTestToken()
      mockPrisma.objective.findUnique.mockResolvedValue(mockObjective())
      mockPrisma.keyResult.create.mockResolvedValue(mockKeyResult())

      const res = await app
        .post('/api/v1/okr/key-results')
        .set(authHeader(token))
        .send({
          objectiveId: 'objective-id',
          name: 'Test Key Result',
          targetValue: 100,
          unit: 'percent',
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
    })

    it('should return 400 for missing required fields', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/okr/key-results')
        .set(authHeader(token))
        .send({ objectiveId: 'objective-id', name: 'Test KR' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 when targetValue is missing', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/okr/key-results')
        .set(authHeader(token))
        .send({ objectiveId: 'objective-id', name: 'KR', unit: 'percent' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('PUT /api/v1/okr/key-results/:id', () => {
    it('should update a key result', async () => {
      const token = createTestToken()
      const updated = mockKeyResult({ targetValue: 200 })
      mockPrisma.keyResult.findUnique.mockResolvedValue(mockKeyResult())
      mockPrisma.keyResult.update.mockResolvedValue(updated)

      const res = await app
        .put('/api/v1/okr/key-results/kr-id')
        .set(authHeader(token))
        .send({ targetValue: 200 })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('DELETE /api/v1/okr/key-results/:id', () => {
    it('should delete a key result', async () => {
      const token = createTestToken()
      mockPrisma.keyResult.findUnique.mockResolvedValue(mockKeyResult())
      mockPrisma.krIteration.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.keyResult.delete.mockResolvedValue(mockKeyResult())

      const res = await app
        .delete('/api/v1/okr/key-results/kr-id')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  // ===== Iteration Recording =====
  describe('POST /api/v1/okr/key-results/:id/record', () => {
    it('should record an iteration', async () => {
      const token = createTestToken()
      mockPrisma.keyResult.findUnique.mockResolvedValue(mockKeyResult())
      // recordIteration: aggregate for max roundNumber, then $transaction([create, update])
      mockPrisma.krIteration.aggregate.mockResolvedValue({ _max: { roundNumber: 0 } })
      mockPrisma.krIteration.create.mockResolvedValue(mockKrIteration())
      mockPrisma.keyResult.update.mockResolvedValue(mockKeyResult({ currentValue: 25 }))

      const res = await app
        .post('/api/v1/okr/key-results/kr-id/record')
        .set(authHeader(token))
        .send({ changes: 'Implemented feature X', dataFeedback: 25 })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('should return 400 for missing changes', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/okr/key-results/kr-id/record')
        .set(authHeader(token))
        .send({ dataFeedback: 25 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 for missing dataFeedback', async () => {
      const token = createTestToken()

      const res = await app
        .post('/api/v1/okr/key-results/kr-id/record')
        .set(authHeader(token))
        .send({ changes: 'Some changes' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })
  })

  describe('GET /api/v1/okr/key-results/:id/iterations', () => {
    it('should return iteration history', async () => {
      const token = createTestToken()
      // getIterationHistory: first checks keyResult exists, then fetches iterations
      mockPrisma.keyResult.findUnique.mockResolvedValue(mockKeyResult())
      mockPrisma.krIteration.findMany.mockResolvedValue([
        mockKrIteration(),
        mockKrIteration({ id: 'iter-2', roundNumber: 2, dataFeedback: 50 }),
      ])

      const res = await app
        .get('/api/v1/okr/key-results/kr-id/iterations')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })
})
