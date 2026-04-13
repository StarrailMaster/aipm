import { describe, it, expect, vi } from 'vitest'
import { createTestApp, createTestToken, authHeader, mockUser } from '../test-utils/helpers'
import mockPrisma from '../test-utils/mock-prisma'

const app = createTestApp()

describe('Auth API', () => {
  // ===== POST /api/v1/auth/register =====
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUser = mockUser({ id: 'new-user-id', email: 'new@example.com', name: 'New User' })
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.user.create.mockResolvedValue(newUser)

      const res = await app
        .post('/api/v1/auth/register')
        .send({ email: 'new@example.com', password: 'password123', name: 'New User' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('token')
      expect(res.body.data).toHaveProperty('user')
      expect(res.body.data.user.email).toBe('new@example.com')
    })

    it('should return error for duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser())

      const res = await app
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com', password: 'password123', name: 'Test' })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe(10004)
    })

    it('should return 400 for missing required fields', async () => {
      const res = await app
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 400 for invalid email format', async () => {
      const res = await app
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'password123', name: 'Test' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20002)
    })

    it('should return 400 for short password', async () => {
      const res = await app
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com', password: '12345', name: 'Test' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20002)
    })
  })

  // ===== POST /api/v1/auth/login =====
  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      // bcrypt hash of "password123" with 12 rounds
      const bcrypt = await import('bcryptjs')
      const hashed = await bcrypt.hash('password123', 12)
      const user = mockUser({ password: hashed })
      mockPrisma.user.findUnique.mockResolvedValue(user)

      const res = await app
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('token')
      expect(res.body.data.user).toHaveProperty('id')
    })

    it('should return 401 for invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      const res = await app
        .post('/api/v1/auth/login')
        .send({ email: 'wrong@example.com', password: 'password123' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe(10005)
    })

    it('should return 400 for missing fields', async () => {
      const res = await app
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe(20001)
    })

    it('should return 401 for wrong password', async () => {
      const bcrypt = await import('bcryptjs')
      const hashed = await bcrypt.hash('correct-password', 12)
      const user = mockUser({ password: hashed })
      mockPrisma.user.findUnique.mockResolvedValue(user)

      const res = await app
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'wrong-password' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe(10005)
    })
  })

  // ===== GET /api/v1/auth/me =====
  describe('GET /api/v1/auth/me', () => {
    it('should return current user profile', async () => {
      const token = createTestToken()
      const user = mockUser()
      mockPrisma.user.findUnique.mockResolvedValue(user)

      const res = await app
        .get('/api/v1/auth/me')
        .set(authHeader(token))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data).toHaveProperty('id')
      expect(res.body.data).toHaveProperty('email')
    })

    it('should return 401 without token', async () => {
      const res = await app.get('/api/v1/auth/me')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe(10001)
    })

    it('should return 401 with invalid token', async () => {
      const res = await app
        .get('/api/v1/auth/me')
        .set({ Authorization: 'Bearer invalid-token' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe(10001)
    })
  })

  // ===== PUT /api/v1/auth/me =====
  describe('PUT /api/v1/auth/me', () => {
    it('should update user profile', async () => {
      const token = createTestToken()
      const updatedUser = mockUser({ name: 'Updated Name' })
      mockPrisma.user.update.mockResolvedValue(updatedUser)

      const res = await app
        .put('/api/v1/auth/me')
        .set(authHeader(token))
        .send({ name: 'Updated Name' })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data.name).toBe('Updated Name')
    })

    it('should return 401 without token', async () => {
      const res = await app
        .put('/api/v1/auth/me')
        .send({ name: 'Updated Name' })

      expect(res.status).toBe(401)
    })
  })
})
