import jwt from 'jsonwebtoken'
import supertest from 'supertest'
import app from '../app'
import type { JwtPayload } from '../middleware/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-for-aipm'

export function createTestToken(overrides?: Partial<JwtPayload>): string {
  const payload: JwtPayload = {
    userId: overrides?.userId ?? 'test-user-id',
    role: overrides?.role ?? 'ENGINEER',
    squadId: overrides?.squadId ?? 'test-squad-id',
  }
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' })
}

export function createAdminToken(overrides?: Partial<JwtPayload>): string {
  return createTestToken({ role: 'ADMIN', ...overrides })
}

export function createArchitectToken(overrides?: Partial<JwtPayload>): string {
  return createTestToken({ role: 'ARCHITECT', ...overrides })
}

export function createTestApp(): supertest.Agent {
  return supertest.agent(app)
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` }
}

export function mockUser(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    password: '$2a$12$hashedpassword',
    name: 'Test User',
    role: 'ENGINEER',
    avatar: null,
    legacyRoles: [],
    squadId: 'test-squad-id',
    squad: { id: 'test-squad-id', name: 'Test Squad' },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

export function mockProject(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'test-project-id',
    name: 'Test Project',
    description: 'A test project',
    ownerId: 'test-user-id',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

export function mockSquad(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'test-squad-id',
    name: 'Test Squad',
    projectId: 'test-project-id',
    members: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  }
}
