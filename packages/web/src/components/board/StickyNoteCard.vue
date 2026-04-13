<template>
  <div
    class="sticky-card"
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
      class="sticky-textarea"
      :value="selection.content ?? ''"
      placeholder="输入内容..."
      @blur="onContentBlur"
      @mousedown.stop
    />
    <div class="sticky-footer">
      <div class="color-dots">
        <span
          v-for="c in colors"
          :key="c"
          class="color-dot"
          :class="{ active: (selection.color ?? '#fef3cd') === c }"
          :style="{ background: c }"
          @click.stop="$emit('update-color', selection.id, c)"
        />
      </div>
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
  (e: 'update-color', id: string, color: string): void
  (e: 'open-detail', id: string): void
}>()

const isDragging = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
let startX = 0
let startY = 0
let startPosX = 0
let startPosY = 0

const colors = ['#fef3cd', '#d1ecf1', '#d4edda', '#f8d7da', '#e2d5f1']

const cardStyle = computed(() => ({
  left: `${props.selection.position.x}px`,
  top: `${props.selection.position.y}px`,
  background: props.selection.color ?? '#fef3cd',
  width: `${props.selection.size?.width ?? 200}px`,
  minHeight: `${props.selection.size?.height ?? 160}px`,
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
.sticky-card {
  position: absolute;
  border-radius: 4px;
  padding: 12px;
  cursor: grab;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1);
  user-select: none;
  z-index: 1;
  display: flex;
  flex-direction: column;
}

.sticky-card:hover {
  box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.15);
}

.sticky-card.is-dragging {
  cursor: grabbing;
  box-shadow: 4px 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

.sticky-card.is-completed {
  border-left: 4px solid #67c23a;
}

.assignee-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  margin-left: 4px;
}

.assignee-badge.is-inherit {
  background: #909399;
}

.completed-icon {
  margin-left: 4px;
}

.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.sticky-card:hover .remove-btn {
  opacity: 1;
}

.sticky-textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  outline: none;
  font-size: 13px;
  line-height: 1.5;
  color: #303133;
  min-height: 80px;
  cursor: text;
  font-family: inherit;
}

.sticky-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 6px;
}

.color-dots {
  display: flex;
  gap: 4px;
}

.color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}

.color-dot:hover,
.color-dot.active {
  border-color: #606266;
}

.sticky-user {
  font-size: 11px;
  color: #909399;
}
</style>
