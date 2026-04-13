import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from '../middleware/auth'
import prisma from '../prisma/client'

interface AuthenticatedSocket extends WebSocket {
  userId?: string
  userName?: string
  role?: string
  squadId?: string | null
  rooms: Set<string>
  isAlive: boolean
}

interface WsIncomingMessage {
  type: string
  room?: string
  payload?: unknown
}

type MessageHandler = (
  ws: AuthenticatedSocket,
  payload: unknown,
  room: string | undefined,
) => void

// Room-based message registry
const messageHandlers = new Map<string, MessageHandler>()

// Active rooms: roomId -> Set of sockets
const rooms = new Map<string, Set<AuthenticatedSocket>>()

/**
 * Register a message handler for a specific message type.
 * Other agents can call this to add their own handlers.
 */
export function registerMessageHandler(type: string, handler: MessageHandler): void {
  messageHandlers.set(type, handler)
}

/**
 * Broadcast a message to all sockets in a room.
 */
export function broadcastToRoom(room: string, message: unknown, excludeSocket?: WebSocket): void {
  const roomSockets = rooms.get(room)
  if (!roomSockets) return

  const data = JSON.stringify(message)
  for (const socket of roomSockets) {
    if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
  }
}

function joinRoom(ws: AuthenticatedSocket, room: string): void {
  if (!rooms.has(room)) {
    rooms.set(room, new Set())
  }
  rooms.get(room)!.add(ws)
  ws.rooms.add(room)
  // 广播 board 房间的 presence 更新（只对 board:* 房间做）
  if (room.startsWith('board:')) {
    broadcastBoardPresence(room)
  }
}

function leaveRoom(ws: AuthenticatedSocket, room: string): void {
  const roomSockets = rooms.get(room)
  if (roomSockets) {
    roomSockets.delete(ws)
    if (roomSockets.size === 0) {
      rooms.delete(room)
    }
  }
  ws.rooms.delete(room)
  if (room.startsWith('board:')) {
    broadcastBoardPresence(room)
  }
}

function leaveAllRooms(ws: AuthenticatedSocket): void {
  // 复制一份 —— leaveRoom 会在遍历过程中修改 ws.rooms
  const snapshot = Array.from(ws.rooms)
  for (const room of snapshot) {
    leaveRoom(ws, room)
  }
}

/**
 * 广播一个 board 房间的当前在线成员（按去重后的 userId 聚合）
 * 同一个用户多开网页只算一份，用户在不同设备看到的在线数一致。
 */
function broadcastBoardPresence(room: string): void {
  const roomSockets = rooms.get(room)
  const seen = new Map<string, { userId: string; name: string }>()
  if (roomSockets) {
    for (const s of roomSockets) {
      if (!s.userId) continue
      if (!seen.has(s.userId)) {
        seen.set(s.userId, {
          userId: s.userId,
          name: s.userName ?? '未知用户',
        })
      }
    }
  }
  const members = Array.from(seen.values())
  broadcastToRoom(room, {
    type: 'board_presence',
    payload: { room, members, count: members.length },
  })
}

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' })

  // Heartbeat check every 30s
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const authWs = ws as AuthenticatedSocket
      if (!authWs.isAlive) {
        leaveAllRooms(authWs)
        authWs.terminate()
        return
      }
      authWs.isAlive = false
      authWs.ping()
    })
  }, 30000)

  wss.on('close', () => {
    clearInterval(heartbeatInterval)
  })

  wss.on('connection', (ws: WebSocket, req) => {
    const authWs = ws as AuthenticatedSocket
    authWs.rooms = new Set()
    authWs.isAlive = true

    // Authenticate via query string token
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const token = url.searchParams.get('token')

    if (!token) {
      authWs.close(4001, 'Authentication required')
      return
    }

    try {
      const secret = process.env.JWT_SECRET || 'default-secret'
      const decoded = jwt.verify(token, secret) as JwtPayload
      authWs.userId = decoded.userId
      authWs.role = decoded.role
      authWs.squadId = decoded.squadId
    } catch {
      authWs.close(4002, 'Invalid token')
      return
    }

    // 异步回填用户名（用于 presence 广播显示）—— 失败时不阻塞连接，
    // broadcastBoardPresence 会 fallback 到 "未知用户"
    if (authWs.userId) {
      prisma.user
        .findUnique({ where: { id: authWs.userId }, select: { name: true } })
        .then((u) => {
          if (u?.name) {
            authWs.userName = u.name
            // 如果这期间已经 join 了 board 房间，补一次 presence
            for (const r of authWs.rooms) {
              if (r.startsWith('board:')) broadcastBoardPresence(r)
            }
          }
        })
        .catch(() => {
          /* ignore */
        })
    }

    console.log(`[WS] Client connected: ${authWs.userId}`)

    authWs.on('pong', () => {
      authWs.isAlive = true
    })

    authWs.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as WsIncomingMessage

        // Handle room join/leave
        if (message.type === 'join_room' && typeof message.room === 'string') {
          joinRoom(authWs, message.room)
          authWs.send(JSON.stringify({ type: 'room_joined', room: message.room }))
          return
        }

        if (message.type === 'leave_room' && typeof message.room === 'string') {
          leaveRoom(authWs, message.room)
          authWs.send(JSON.stringify({ type: 'room_left', room: message.room }))
          return
        }

        // Dispatch to registered handler
        const handler = messageHandlers.get(message.type)
        if (handler) {
          handler(authWs, message.payload, message.room)
        } else {
          authWs.send(
            JSON.stringify({ type: 'error', payload: `Unknown message type: ${message.type}` }),
          )
        }
      } catch {
        authWs.send(JSON.stringify({ type: 'error', payload: 'Invalid message format' }))
      }
    })

    authWs.on('close', () => {
      console.log(`[WS] Client disconnected: ${authWs.userId}`)
      leaveAllRooms(authWs)
    })
  })

  console.log('[WS] WebSocket server initialized')
  return wss
}
