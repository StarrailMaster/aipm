<template>
  <div
    class="text-card"
    :class="{
      'is-dragging': isDragging,
      'is-completed': !!selection.completedAt,
    }"
    :style="cardStyle"
    @mousedown.stop="onMouseDown"
    @dblclick.stop="$emit('open-detail', selection.id)"
  >
    <el-button
      :icon="Close"
      size="small"
      text
      class="remove-btn"
      @click.stop="$emit('remove', selection.id)"
    />
    <textarea
      ref="textareaRef"
      class="text-textarea"
      :value="selection.content ?? ''"
      placeholder="输入文本..."
      @blur="onContentBlur"
      @mousedown.stop
    />
    <div class="text-card-footer">
      <span
        v-if="selection.assignee"
        class="assignee-badge"
        :class="{ 'is-inherit': selection.assigneeInherit }"
        :title="`${selection.assignee.name}${selection.assigneeInherit ? '（继承 layer）' : '（手动指派）'}`"
      >
        {{ selection.assignee.name.charAt(0) }}
      </span>
      <el-icon
        v-if="selection.completedAt"
        class="completed-icon"
        :size="14"
        color="#67c23a"
      ><Select /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Close, Select } from '@element-plus/icons-vue'
import type { BoardSelection } from '@/api/board'

const props = defineProps<{
  selection: BoardSelection
}>()

const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'move', id: string, position: { x: number; y: number }): void
  (e: 'update-content', id: string, content: string): void
  (e: 'open-detail', id: string): void
}>()

const isDragging = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
let startX = 0
let startY = 0
let startPosX = 0
let startPosY = 0

const cardStyle = computed(() => ({
  left: `${props.selection.position.x}px`,
  top: `${props.selection.position.y}px`,
  width: `${props.selection.size?.width ?? 240}px`,
}))

function onContentBlur(e: FocusEvent) {
  const val = (e.target as HTMLTextAreaElement).value
  if (val !== (props.selection.content ?? '')) {
    emit('update-content', props.selection.id, val)
  }
}

function onMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.remove-btn') || (e.target as HTMLElement).tagName === 'TEXTAREA') return

  isDragging.value = true
  startX = e.clientX
  startY = e.clientY
  startPosX = props.selection.position.x
  startPosY = props.selection.position.y

  const onMouseMove = (moveEvent: MouseEvent) => {
    const dx = moveEvent.clientX - startX
    const dy = moveEvent.clientY - startY
    emit('move', props.selection.id, { x: Math.max(0, startPosX + dx), y: Math.max(0, startPosY + dy) })
  }

  const onMouseUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
.text-card {
  position: absolute;
  background: transparent;
  padding: 8px;
  cursor: grab;
  user-select: none;
  z-index: 1;
  border: 1px dashed transparent;
  border-radius: 4px;
  transition: border-color 0.2s;
}

.text-card:hover {
  border-color: #c0c4cc;
}

.text-card.is-dragging {
  cursor: grabbing;
  z-index: 10;
}

.remove-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.text-card:hover .remove-btn {
  opacity: 1;
}

.text-textarea {
  width: 100%;
  border: none;
  background: transparent;
  resize: vertical;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: #303133;
  min-height: 32px;
  cursor: text;
  font-family: inherit;
}

.text-card.is-completed .text-textarea {
  color: #67c23a;
  text-decoration: line-through;
}

.text-card-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.assignee-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
}

.assignee-badge.is-inherit {
  background: #909399;
}

.completed-icon {
  display: inline-flex;
}
</style>
