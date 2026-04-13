<template>
  <div
    class="prompt-card-canvas"
    :class="[
      `variant-${variant}`,
      { 'is-dragging': isDragging },
    ]"
    :style="cardStyle"
    @mousedown.stop="onMouseDown"
    @dblclick.stop="$emit('open-detail', selection.id)"
  >
    <!-- Header: category + state badges + close button -->
    <div class="card-header">
      <div class="header-tags">
        <el-tag
          :type="categoryTagType"
          size="small"
          effect="plain"
          class="category-tag"
        >
          {{ categoryLabel }}
        </el-tag>
        <el-tag
          v-if="selection.hasOverride && !isSelfMade"
          type="warning"
          size="small"
          effect="plain"
          class="state-tag state-override"
          title="该卡片已被本地修改，仅在本白板生效"
        >
          已修改
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
    <div class="card-name">{{ displayTitle }}</div>

    <!-- Description (always render so card height stays fixed) -->
    <div class="card-desc">
      {{ displayDescription || '—' }}
    </div>

    <!-- Footer: stars / note / assignee / completion -->
    <div class="card-footer">
      <span v-if="!isSelfMade" class="stat-chip">
        <el-icon :size="12"><Star /></el-icon>
        {{ selection.prompt?.starCount ?? 0 }}
      </span>
      <span
        v-if="selection.note"
        class="stat-chip note-chip"
        :title="selection.note"
      >
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
import { Close, Star, ChatDotSquare, Select } from '@element-plus/icons-vue'
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

/** 自建卡：type=prompt 但没有 promptId（没绑定公共库提示词） */
const isSelfMade = computed(() => {
  return props.selection.type === 'prompt' && !props.selection.promptId
})

/**
 * 卡片状态颜色变种（优先级：完成 > 已修改 > 自建 > 默认）
 * - default：公共库原版卡
 * - selfmade：本地自建
 * - override：本地修改过
 * - completed：已完成
 */
type Variant = 'default' | 'selfmade' | 'override' | 'completed'

const variant = computed<Variant>(() => {
  if (props.selection.completedAt) return 'completed'
  if (props.selection.hasOverride && !isSelfMade.value) return 'override'
  if (isSelfMade.value) return 'selfmade'
  return 'default'
})

const displayTitle = computed(() => {
  return (
    props.selection.effectiveTitle ||
    props.selection.promptOverrideTitle ||
    props.selection.prompt?.name ||
    '未命名'
  )
})

const displayDescription = computed(() => {
  if (isSelfMade.value) {
    const content =
      props.selection.promptOverrideContent ||
      props.selection.effectiveContent ||
      ''
    return content.length > 0
      ? content.slice(0, 60) + (content.length > 60 ? '…' : '')
      : null
  }
  return props.selection.prompt?.description ?? null
})

const cardStyle = computed(() => ({
  left: `${props.selection.position.x}px`,
  top: `${props.selection.position.y}px`,
}))

const CATEGORY_LABELS: Record<string, string> = {
  DESIGN: '设计',
  FRONTEND: '前端',
  BACKEND: '后端',
  TESTING: '测试',
  INTEGRATION: '集成',
  OPTIMIZATION: '优化',
}

const categoryLabel = computed(() => {
  if (isSelfMade.value) return '自建'
  const cat = props.selection.prompt?.category
  if (!cat) return '自建'
  return CATEGORY_LABELS[cat] ?? cat
})

const categoryTagType = computed(() => {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    DESIGN: 'primary',
    FRONTEND: 'success',
    BACKEND: 'warning',
    TESTING: 'danger',
    INTEGRATION: 'info',
    OPTIMIZATION: 'primary',
  }
  return map[props.selection.prompt?.category ?? ''] ?? 'info'
})

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
    const newX = Math.max(0, startPosX + dx)
    const newY = Math.max(0, startPosY + dy)
    emit('move', props.selection.id, { x: newX, y: newY })
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
 * ========== 统一提示词卡片样式 ==========
 *
 * 所有提示词卡片共享同一布局（头部 tag + 标题 + 描述 + 底部 meta），
 * 仅通过 CSS 变量 --accent 和 --accent-bg 区分状态颜色：
 *
 *   variant-default    → 蓝  (#409eff)  公共库原版卡
 *   variant-selfmade   → 紫  (#8b5cf6)  本地自建
 *   variant-override   → 橙  (#e6a23c)  本地修改过
 *   variant-completed  → 绿  (#67c23a)  已完成
 *
 * 可视表现：
 *   - 左侧 3px 色条
 *   - 背景：从 accent 色的 6% 透明度到纯白的横向渐变
 *   - Hover：边框变 accent 色 + 阴影加强 + 轻微上浮
 */

.prompt-card-canvas {
  /* CSS 变量：默认蓝 */
  --accent: #409eff;
  --accent-bg: #ffffff;
  --accent-shadow: rgba(64, 158, 255, 0.15);

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

/* variant: 自建 → 紫 */
.prompt-card-canvas.variant-selfmade {
  --accent: #8b5cf6;
  --accent-bg: linear-gradient(to right, rgba(139, 92, 246, 0.06), #ffffff 70%);
  --accent-shadow: rgba(139, 92, 246, 0.18);
}

/* variant: 已修改 → 橙 */
.prompt-card-canvas.variant-override {
  --accent: #e6a23c;
  --accent-bg: linear-gradient(to right, rgba(230, 162, 60, 0.06), #ffffff 70%);
  --accent-shadow: rgba(230, 162, 60, 0.18);
}

/* variant: 已完成 → 绿 */
.prompt-card-canvas.variant-completed {
  --accent: #67c23a;
  --accent-bg: linear-gradient(to right, rgba(103, 194, 58, 0.06), #ffffff 70%);
  --accent-shadow: rgba(103, 194, 58, 0.2);
}

.prompt-card-canvas:hover {
  border-color: var(--accent);
  box-shadow: 0 6px 18px var(--accent-shadow);
  transform: translateY(-1px);
}

.prompt-card-canvas.is-dragging {
  cursor: grabbing;
  box-shadow: 0 10px 28px var(--accent-shadow);
  transform: translateY(-2px);
  z-index: 10;
}

/* ========== Card header ========== */

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

.state-tag {
  flex-shrink: 0;
}

.state-tag.state-local {
  --el-tag-bg-color: rgba(139, 92, 246, 0.08);
  --el-tag-border-color: rgba(139, 92, 246, 0.3);
  color: #7c3aed;
}

.remove-btn {
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.prompt-card-canvas:hover .remove-btn {
  opacity: 1;
}

/* ========== Card body ========== */

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

/* ========== Card footer ========== */

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
