import { vi } from 'vitest'

function createModelMock() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  }
}

const mockPrisma = {
  user: createModelMock(),
  project: createModelMock(),
  squad: createModelMock(),
  iteration: createModelMock(),
  prompt: createModelMock(),
  promptVersion: createModelMock(),
  promptPr: createModelMock(),
  skill: createModelMock(),
  star: createModelMock(),
  fork: createModelMock(),
  sopProject: createModelMock(),
  sopDocument: createModelMock(),
  sopDocumentVersion: createModelMock(),
  board: createModelMock(),
  boardSelection: createModelMock(),
  feedPackage: createModelMock(),
  feedFile: createModelMock(),
  executionRecord: createModelMock(),
  designDraft: createModelMock(),
  designHistory: createModelMock(),
  objective: createModelMock(),
  keyResult: createModelMock(),
  krIteration: createModelMock(),
  feedback: createModelMock(),
  $transaction: vi.fn((fnOrArray: unknown) => {
    // Support both callback form and array form of $transaction
    if (typeof fnOrArray === 'function') {
      return (fnOrArray as (prisma: typeof mockPrisma) => Promise<unknown>)(mockPrisma)
    }
    // Array form: resolve all promises in the array
    if (Array.isArray(fnOrArray)) {
      return Promise.all(fnOrArray)
    }
    return Promise.resolve(fnOrArray)
  }),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
}

vi.mock('../prisma/client', () => ({
  default: mockPrisma,
}))

export function resetAllMocks(): void {
  const resetModel = (model: ReturnType<typeof createModelMock>) => {
    Object.values(model).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset()
      }
    })
  }

  Object.entries(mockPrisma).forEach(([key, value]) => {
    if (key.startsWith('$')) {
      if (typeof value === 'function' && 'mockReset' in value) {
        (value as ReturnType<typeof vi.fn>).mockReset()
      }
      if (key === '$transaction') {
        ;(mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
          (fnOrArray: unknown) => {
            if (typeof fnOrArray === 'function') {
              return (fnOrArray as (prisma: typeof mockPrisma) => Promise<unknown>)(mockPrisma)
            }
            if (Array.isArray(fnOrArray)) {
              return Promise.all(fnOrArray)
            }
            return Promise.resolve(fnOrArray)
          },
        )
      }
    } else {
      resetModel(value as ReturnType<typeof createModelMock>)
    }
  })
}

export default mockPrisma
