<template>
  <div
    class="sop-doc-card"
    :class="[
      'variant-sop',
      {
        'is-dragging': isDragging,
        'is-completed': !!selection.completedAt,
      },
    ]"
    :style="cardStyle"
    @mousedown.stop="onMouseDown"
    @dblclick.stop="$emit('open-detail', selection.id)"
  >
    <!-- Header: layer tag + close button -->
    <div class="card-header">
      <div class="header-tags">
        <el-tag :type="layerTagType" size="small" effect="plain" class="category-tag">
          {{ layerLabel }}
        </el-tag>
      </div>
      <el-button
        :icon="Close"
        size="small"
        text
        class="remove-btn"
        @click.stop="$emit('remove', selection.id)"
      />
    </div>

    <!-- Title -->
    <div class="card-name">{{ selection.sopDocument?.title ?? '未知文档' }}</div>

    <!-- Description / project name -->
    <div class="card-desc">
      {{ selection.sopDocument?.sopProjectName || '—' }}
    </div>

    <!-- Footer: note / assignee / completion -->
    <div class="card-footer">
      <span v-if="selection.note" class="stat-chip note-chip" :title="selection.note">
        <el-icon :size="12"><ChatDotSquare /></el-icon>
      </span>
      <span class="footer-spacer"></span>
      <span
        v-if="selection.assignee"
        class="assignee-chip"
        :class="{ 'is-inherit': selection.assigneeInherit }"
        :title="`${selection.assignee.name}${selection.assigneeInherit ? '（继承 layer）' : '（手动指派）'}`"
      >
        <span class="assignee-dot"></span>
        {{ selection.assignee.name }}
      </span>
      <el-icon
        v-if="selection.completedAt"
        class="completed-icon"
        :size="14"
      ><Select /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Close, ChatDotSquare, Select } from '@element-plus/icons-vue'
import type { BoardSelection } from '@/api/board'

const props = defineProps<{
  selection: BoardSelection
}>()

const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'move', id: string, position: { x: number; y: number }): void
  (e: 'open-detail', id: string): void
}>()

const isDragging = ref(false)
let startX = 0
let startY = 0
let startPosX = 0
let startPosY = 0

const LAYER_LABELS: Record<string, string> = {
  PRODUCT_REQ: '产品需求',
  CONTENT: '内容素材',
  DESIGN_SYSTEM: '设计系统',
  FRONTEND_ARCH: '前端架构',
  BACKEND_ARCH: '后端架构',
  AI_PROMPTS: 'AI 提示词',
  ACCEPTANCE: '验收标准',
  APPENDIX: '附录',
}

const LAYER_TAG_TYPE: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  PRODUCT_REQ: 'danger',
  CONTENT: 'info',
  DESIGN_SYSTEM: 'primary',
  FRONTEND_ARCH: 'success',
  BACKEND_ARCH: 'warning',
  AI_PROMPTS: 'primary',
  ACCEPTANCE: 'danger',
  APPENDIX: 'info',
}

const layerLabel = computed(() => LAYER_LABELS[props.selection.sopDocument?.layer ?? ''] ?? props.selection.sopDocument?.layer ?? 'SOP')
const layerTagType = computed(() => LAYER_TAG_TYPE[props.selection.sopDocument?.layer ?? ''] ?? 'info')

const cardStyle = computed(() => ({
  left: `${props.selection.position.x}px`,
  top: `${props.selection.position.y}px`,
}))

function onMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.remove-btn')) return

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
/**
 * SopDocCard 与 PromptCard 共享同一套布局规范：
 *   - 固定尺寸 240 × 156
 *   - 左侧 3px 色条（SOP 文档用橙色）
 *   - Header(tag) / Title / Desc(flex:1) / Footer 四段结构
 *
 * 之所以不直接 extend PromptCard，是因为 SOP 文档卡的数据源不同
 * （selection.sopDocument 而非 selection.prompt），只能共享样式不共享模板。
 */

.sop-doc-card {
  --accent: #e6a23c;
  --accent-bg: linear-gradient(to right, rgba(230, 162, 60, 0.06), #ffffff 70%);
  --accent-shadow: rgba(230, 162, 60, 0.18);

  position: absolute;
  width: 240px;
  height: 156px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--accent-bg);
  border: 1px solid #e4e7ed;
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: grab;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
  user-select: none;
  z-index: 1;
}

.sop-doc-card:hover {
  border-color: var(--accent);
  box-shadow: 0 6px 18px var(--accent-shadow);
  transform: translateY(-1px);
}

.sop-doc-card.is-dragging {
  cursor: grabbing;
  box-shadow: 0 10px 28px var(--accent-shadow);
  transform: translateY(-2px);
  z-index: 10;
}

.sop-doc-card.is-completed {
  --accent: #67c23a;
  --accent-bg: linear-gradient(to right, rgba(103, 194, 58, 0.06), #ffffff 70%);
  --accent-shadow: rgba(103, 194, 58, 0.2);
}

/* ========== Header ========== */

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 6px;
  flex-shrink: 0;
}

.header-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.category-tag {
  flex-shrink: 0;
}

.remove-btn {
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.sop-doc-card:hover .remove-btn {
  opacity: 1;
}

/* ========== Body ========== */

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.card-desc {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  flex: 1;
  min-height: 0;
}

/* ========== Footer ========== */

.card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}

.footer-spacer {
  flex: 1;
}

.stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.note-chip {
  color: var(--accent);
}

.assignee-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 110px;
  padding: 2px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 12%, #ffffff);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assignee-chip .assignee-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.assignee-chip.is-inherit {
  background: #f4f4f5;
  color: #606266;
}

.assignee-chip.is-inherit .assignee-dot {
  background: #909399;
}

.completed-icon {
  color: #67c23a;
}
</style>
