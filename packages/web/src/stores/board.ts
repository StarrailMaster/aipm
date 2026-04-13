import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  listBoardsApi,
  getBoardDetailApi,
  createBoardApi,
  updateBoardApi,
  deleteBoardApi,
  addSelectionApi,
  updateSelectionApi,
  removeSelectionApi,
  exportBoardApi,
  completeSelectionApi,
  reopenSelectionApi,
  upsertLayerAssignmentApi,
  forkSelectionToLibraryApi,
} from '@/api/board'
import type {
  BoardItem,
  BoardDetail,
  BoardSelection,
  ExportResult,
  SelectionType,
  SopLayerType,
} from '@/api/board'
import { getToken } from '@/api/request'

export const useBoardStore = defineStore('board', () => {
  // ========== List State ==========
  const boards = ref<BoardItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const listParams = reactive({
    page: 1,
    pageSize: 20,
    projectId: '',
  })

  // ========== Detail State ==========
  const currentBoard = ref<BoardDetail | null>(null)
  const detailLoading = ref(false)

  // ========== WebSocket State ==========
  const wsConnected = ref(false)
  const cursors = ref<Record<string, { userId: string; x: number; y: number }>>({})
  /** 当前 board 房间在线成员（由后端 board_presence 广播驱动，自己也在内） */
  const presenceMembers = ref<Array<{ userId: string; name: string }>>([])
  let ws: WebSocket | null = null

  // ========== List Actions ==========

  async function fetchBoards() {
    if (!listParams.projectId) return
    loading.value = true
    try {
      const res = await listBoardsApi({
        projectId: listParams.projectId,
        page: listParams.page,
        pageSize: listParams.pageSize,
      })
      const data = res.data.data!
      boards.value = data.items
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  // ========== Detail Actions ==========

  async function fetchBoardDetail(id: string) {
    detailLoading.value = true
    try {
      const res = await getBoardDetailApi(id)
      currentBoard.value = res.data.data!
    } finally {
      detailLoading.value = false
    }
  }

  // ========== CRUD Actions ==========

  async function createBoard(data: {
    projectId: string
    name: string
    description?: string
  }) {
    const res = await createBoardApi(data)
    return res.data.data!
  }

  async function updateBoard(id: string, data: { name?: string; description?: string }) {
    const res = await updateBoardApi(id, data)
    const idx = boards.value.findIndex((b) => b.id === id)
    if (idx !== -1) {
      boards.value[idx] = res.data.data!
    }
    return res.data.data!
  }

  async function deleteBoard(id: string) {
    await deleteBoardApi(id)
    boards.value = boards.value.filter((b) => b.id !== id)
  }

  // ========== Selection Actions ==========

  async function addSelection(data: {
    type?: SelectionType
    promptId?: string
    sopDocumentId?: string
    content?: string
    color?: string
    size?: { width: number; height: number }
    position: { x: number; y: number }
    note?: string
    assigneeId?: string
    layer?: SopLayerType
    /** Req 1: 自建卡的 override 字段 */
    promptOverrideTitle?: string
    promptOverrideContent?: string
    promptOverrideTags?: string[]
  }) {
    if (!currentBoard.value) return null
    const res = await addSelectionApi(currentBoard.value.id, data)
    const selection = res.data.data!
    currentBoard.value.selections.push(selection)

    // Broadcast via WS
    sendWsMessage('board_selection_add', {
      boardId: currentBoard.value.id,
      selection: {
        id: selection.id,
        type: selection.type,
        promptId: selection.promptId,
        sopDocumentId: selection.sopDocumentId,
        position: selection.position,
        note: selection.note,
      },
    })

    return selection
  }

  async function updateSelection(
    selId: string,
    data: {
      position?: { x: number; y: number }
      note?: string
      content?: string
      color?: string
      size?: { width: number; height: number }
      assigneeId?: string | null
      layer?: SopLayerType
      assigneeInherit?: boolean
      /** Req 1: 本地 override 字段 */
      promptOverrideTitle?: string | null
      promptOverrideContent?: string | null
      promptOverrideTags?: string[]
    },
  ) {
    if (!currentBoard.value) return null
    const res = await updateSelectionApi(currentBoard.value.id, selId, data)
    const updated = res.data.data!
    const idx = currentBoard.value.selections.findIndex((s) => s.id === selId)
    if (idx !== -1) {
      currentBoard.value.selections[idx] = updated
    }

    // Broadcast position change via WS
    if (data.position) {
      sendWsMessage('board_selection_move', {
        boardId: currentBoard.value.id,
        selectionId: selId,
        position: data.position,
      })
    }

    return updated
  }

  // ========== Req 1: Fork 本地修改到公共提示词库 ==========

  async function forkSelectionToLibrary(
    selId: string,
    data: {
      name?: string
      visibility?: 'private' | 'team' | 'public'
      category?: string
    },
  ) {
    if (!currentBoard.value) return null
    const res = await forkSelectionToLibraryApi(currentBoard.value.id, selId, data)
    const result = res.data.data!
    // 用返回的 selection 覆盖本地，因为 promptId/effectiveTitle 都变了
    const idx = currentBoard.value.selections.findIndex((s) => s.id === selId)
    if (idx !== -1) {
      currentBoard.value.selections[idx] = result.selection
    }
    return result
  }

  // ========== Phase 5.3: 卡片完成/撤回 ==========

  async function completeSelection(selId: string) {
    if (!currentBoard.value) return null
    const res = await completeSelectionApi(currentBoard.value.id, selId)
    const updated = res.data.data!
    const idx = currentBoard.value.selections.findIndex((s) => s.id === selId)
    if (idx !== -1) {
      currentBoard.value.selections[idx] = updated
    }
    return updated
  }

  async function reopenSelection(selId: string, note?: string) {
    if (!currentBoard.value) return null
    const res = await reopenSelectionApi(currentBoard.value.id, selId, note)
    const updated = res.data.data!
    const idx = currentBoard.value.selections.findIndex((s) => s.id === selId)
    if (idx !== -1) {
      currentBoard.value.selections[idx] = updated
    }
    return updated
  }

  // ========== Phase 5.3: Layer 负责人管理 ==========

  async function upsertLayerAssignment(layer: SopLayerType, assigneeId: string | null) {
    if (!currentBoard.value) return null
    const res = await upsertLayerAssignmentApi(currentBoard.value.id, { layer, assigneeId })
    const updated = res.data.data!
    // 本地同步：layerAssignments
    const laIdx = currentBoard.value.layerAssignments.findIndex((la) => la.layer === layer)
    if (laIdx !== -1) {
      currentBoard.value.layerAssignments[laIdx] = updated
    } else {
      currentBoard.value.layerAssignments.push(updated)
    }
    // 后端会自动批量更新继承卡片，为了拿最新状态重新拉详情
    await fetchBoardDetail(currentBoard.value.id)
    return updated
  }

  async function removeSelection(selId: string) {
    if (!currentBoard.value) return
    await removeSelectionApi(currentBoard.value.id, selId)
    currentBoard.value.selections = currentBoard.value.selections.filter((s) => s.id !== selId)

    // Broadcast via WS
    sendWsMessage('board_selection_remove', {
      boardId: currentBoard.value.id,
      selectionId: selId,
    })
  }

  // ========== Export ==========

  async function exportBoard(): Promise<ExportResult | null> {
    if (!currentBoard.value) return null
    const res = await exportBoardApi(currentBoard.value.id)
    return res.data.data!
  }

  // ========== WebSocket ==========

  function connectWs(boardId: string) {
    if (ws) {
      disconnectWs()
    }

    const token = getToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    ws = new WebSocket(`${protocol}//${host}/ws?token=${encodeURIComponent(token)}`)

    ws.onopen = () => {
      wsConnected.value = true
      sendWsMessage('join_room', undefined, `board:${boardId}`)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type: string
          payload?: Record<string, unknown>
        }
        handleWsMessage(message)
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      wsConnected.value = false
      ws = null
    }

    ws.onerror = () => {
      wsConnected.value = false
    }
  }

  function disconnectWs() {
    if (ws) {
      ws.close()
      ws = null
    }
    wsConnected.value = false
    cursors.value = {}
    presenceMembers.value = []
  }

  function sendWsMessage(type: string, payload?: unknown, room?: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const message: Record<string, unknown> = { type }
    if (payload !== undefined) message.payload = payload
    if (room) message.room = room
    ws.send(JSON.stringify(message))
  }

  function sendCursorMove(boardId: string, x: number, y: number) {
    sendWsMessage('board_cursor_move', { boardId, x, y })
  }

  function handleWsMessage(message: { type: string; payload?: Record<string, unknown> }) {
    if (!currentBoard.value) return

    switch (message.type) {
      case 'board_selection_added': {
        fetchBoardDetail(currentBoard.value.id)
        break
      }
      case 'board_selection_moved': {
        const p = message.payload as { selectionId: string; position: { x: number; y: number } } | undefined
        if (p) {
          const sel = currentBoard.value.selections.find((s) => s.id === p.selectionId)
          if (sel) {
            sel.position = p.position
          }
        }
        break
      }
      case 'board_selection_removed': {
        const p = message.payload as { selectionId: string } | undefined
        if (p) {
          currentBoard.value.selections = currentBoard.value.selections.filter(
            (s) => s.id !== p.selectionId,
          )
        }
        break
      }
      case 'board_cursor_moved': {
        const p = message.payload as { userId: string; x: number; y: number } | undefined
        if (p) {
          cursors.value[p.userId] = { userId: p.userId, x: p.x, y: p.y }
        }
        break
      }
      case 'board_presence': {
        const p = message.payload as
          | { members?: Array<{ userId: string; name: string }>; count?: number }
          | undefined
        if (p && Array.isArray(p.members)) {
          presenceMembers.value = p.members
        }
        break
      }
    }
  }

  return {
    // State
    boards,
    total,
    loading,
    listParams,
    currentBoard,
    detailLoading,
    wsConnected,
    cursors,
    presenceMembers,
    // Actions
    fetchBoards,
    fetchBoardDetail,
    createBoard,
    updateBoard,
    deleteBoard,
    addSelection,
    updateSelection,
    removeSelection,
    completeSelection,
    reopenSelection,
    upsertLayerAssignment,
    forkSelectionToLibrary,
    exportBoard,
    connectWs,
    disconnectWs,
    sendCursorMove,
  }
})
