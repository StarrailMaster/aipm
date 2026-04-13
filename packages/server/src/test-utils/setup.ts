import { beforeEach } from 'vitest'

// Set test environment variables before any imports
process.env.JWT_SECRET = 'test-jwt-secret-for-aipm'
process.env.NODE_ENV = 'test'

// Import mock-prisma to register the vi.mock calls
import { resetAllMocks } from './mock-prisma'

// Reset all mocks between tests
beforeEach(() => {
  resetAllMocks()
})
