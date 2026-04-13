import { registerMessageHandler, broadcastToRoom } from './index'

interface SelectionAddPayload {
  boardId: string
  selection: {
    id: string
    promptId: string
    position: { x: number; y: number }
    note?: string
  }
}

interface SelectionMovePayload {
  boardId: string
  selectionId: string
  position: { x: number; y: number }
}

interface SelectionRemovePayload {
  boardId: string
  selectionId: string
}

interface CursorMovePayload {
  boardId: string
  x: number
  y: number
}

// board_selection_add — When someone adds a prompt to the board
registerMessageHandler('board_selection_add', (ws, payload, _room) => {
  const data = payload as SelectionAddPayload
  if (!data.boardId) return

  const room = `board:${data.boardId}`
  broadcastToRoom(
    room,
    {
      type: 'board_selection_added',
      payload: {
        ...data.selection,
        userId: ws.userId,
      },
    },
    ws,
  )
})

// board_selection_move — When someone moves a selection on canvas
registerMessageHandler('board_selection_move', (ws, payload, _room) => {
  const data = payload as SelectionMovePayload
  if (!data.boardId || !data.selectionId) return

  const room = `board:${data.boardId}`
  broadcastToRoom(
    room,
    {
      type: 'board_selection_moved',
      payload: {
        selectionId: data.selectionId,
        position: data.position,
        userId: ws.userId,
      },
    },
    ws,
  )
})

// board_selection_remove — When someone removes a selection
registerMessageHandler('board_selection_remove', (ws, payload, _room) => {
  const data = payload as SelectionRemovePayload
  if (!data.boardId || !data.selectionId) return

  const room = `board:${data.boardId}`
  broadcastToRoom(
    room,
    {
      type: 'board_selection_removed',
      payload: {
        selectionId: data.selectionId,
        userId: ws.userId,
      },
    },
    ws,
  )
})

// board_cursor_move — Share cursor positions for presence awareness
registerMessageHandler('board_cursor_move', (ws, payload, _room) => {
  const data = payload as CursorMovePayload
  if (!data.boardId) return

  const room = `board:${data.boardId}`
  broadcastToRoom(
    room,
    {
      type: 'board_cursor_moved',
      payload: {
        userId: ws.userId,
        x: data.x,
        y: data.y,
      },
    },
    ws,
  )
})
