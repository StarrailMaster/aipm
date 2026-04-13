<template>
  <div
    ref="canvasRef"
    class="board-canvas"
    @click="onCanvasClick"
    @mousemove="onCanvasMouseMove"
  >
    <!-- Grid background -->
    <div class="canvas-grid" />

    <!-- Render items by type -->
    <template v-for="sel in selections" :key="sel.id">
      <PromptCard
        v-if="sel.type === 'prompt'"
        :selection="sel"
        @remove="$emit('remove-selection', $event)"
        @move="onCardMove"
        @open-detail="onOpenDetail"
      />
      <SopDocCard
        v-else-if="sel.type === 'sop_doc'"
        :selection="sel"
        @remove="$emit('remove-selection', $event)"
        @move="onCardMove"
        @open-detail="onOpenDetail"
      />
      <StickyNoteCard
        v-else-if="sel.type === 'sticky'"
        :selection="sel"
        @remove="$emit('remove-selection', $event)"
        @move="onCardMove"
        @update-content="onUpdateContent"
        @update-color="onUpdateColor"
        @open-detail="onOpenDetail"
      />
      <TextCard
        v-else-if="sel.type === 'text'"
        :selection="sel"
        @remove="$emit('remove-selection', $event)"
        @move="onCardMove"
        @update-content="onUpdateContent"
        @open-detail="onOpenDetail"
      />
    </template>

    <!-- Remote cursors -->
    <div
      v-for="cursor in remoteCursors"
      :key="cursor.userId"
      class="remote-cursor"
      :style="{ left: `${cursor.x}px`, top: `${cursor.y}px` }"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 0l6.5 16L8.2 9.2 16 6.5z" />
      </svg>
      <span class="cursor-label">{{ cursor.userId.slice(0, 6) }}</span>
    </div>

    <!-- Empty state -->
    <div v-if="selections.length === 0" class="canvas-empty">
      <el-icon :size="48" color="#c0c4cc"><Grid /></el-icon>
      <p>从右侧面板添加提示词或 SOP 文档，或使用工具栏添加文本和便利贴</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Grid } from '@element-plus/icons-vue'
import PromptCard from './PromptCard.vue'
import SopDocCard from './SopDocCard.vue'
import StickyNoteCard from './StickyNoteCard.vue'
import TextCard from './TextCard.vue'
import type { BoardSelection } from '@/api/board'

defineProps<{
  selections: BoardSelection[]
  remoteCursors: Record<string, { userId: string; x: number; y: number }>
}>()

const emit = defineEmits<{
  (e: 'remove-selection', id: string): void
  (e: 'move-selection', id: string, position: { x: number; y: number }): void
  (e: 'update-content', id: string, content: string): void
  (e: 'update-color', id: string, color: string): void
  (e: 'cursor-move', x: number, y: number): void
  (e: 'open-card-detail', id: string): void
}>()

const canvasRef = ref<HTMLDivElement | null>(null)

function onCanvasClick(_e: MouseEvent) {
  // no-op
}

function onCanvasMouseMove(e: MouseEvent) {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left + canvasRef.value.scrollLeft
  const y = e.clientY - rect.top + canvasRef.value.scrollTop
  emit('cursor-move', x, y)
}

function onCardMove(id: string, position: { x: number; y: number }) {
  emit('move-selection', id, position)
}

function onUpdateContent(id: string, content: string) {
  emit('update-content', id, content)
}

function onUpdateColor(id: string, color: string) {
  emit('update-color', id, color)
}

function onOpenDetail(id: string) {
  emit('open-card-detail', id)
}
</script>

<style scoped>
.board-canvas {
  position: relative;
  flex: 1;
  min-height: 600px;
  overflow: auto;
  background: #fafbfc;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.canvas-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 3000px;
  height: 2000px;
  background-image:
    radial-gradient(circle, #dcdfe6 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
}

.canvas-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #909399;
  pointer-events: none;
}

.canvas-empty p {
  margin-top: 12px;
  font-size: 14px;
}

.remote-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 100;
  color: #e6a23c;
  transition: left 0.1s, top 0.1s;
}

.cursor-label {
  display: inline-block;
  background: #e6a23c;
  color: #fff;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 2px;
  white-space: nowrap;
}
</style>
