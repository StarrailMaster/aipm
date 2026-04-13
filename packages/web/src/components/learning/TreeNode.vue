<template>
  <div class="tree-node" :class="{ 'is-root': isRoot }">
    <div class="node-card" :class="`status-${statusClass}`" @click="$emit('select', node.id)">
      <div class="node-statement">{{ node.statement }}</div>
      <div class="node-meta">
        <el-tag size="small" :type="tagType">
          {{ node.status }}
        </el-tag>
        <span v-if="node.delta !== null" class="node-delta">
          Δ {{ node.delta > 0 ? '+' : '' }}{{ node.delta.toFixed(2) }}
        </span>
      </div>
    </div>
    <div v-if="node.children.length > 0" class="node-children">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :is-root="false"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HypothesisTreeNode } from '@/api/hypothesis'

const props = defineProps<{
  node: HypothesisTreeNode
  isRoot: boolean
}>()

defineEmits<{
  (e: 'select', id: string): void
}>()

const statusClass = computed(() => {
  const s = props.node.status
  if (s === 'CLOSED_WIN') return 'won'
  if (s === 'CLOSED_LOSS') return 'lost'
  if (s === 'ABANDONED') return 'abandoned'
  if (s === 'RUNNING') return 'running'
  return 'backlog'
})

const tagType = computed<'success' | 'danger' | 'warning' | 'info' | ''>(() => {
  const s = props.node.status
  if (s === 'CLOSED_WIN') return 'success'
  if (s === 'CLOSED_LOSS') return 'danger'
  if (s === 'RUNNING') return 'warning'
  return 'info'
})
</script>

<style lang="scss" scoped>
.tree-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--aipm-spacing-sm);
  position: relative;

  &:not(.is-root)::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    width: 2px;
    height: var(--aipm-spacing-sm);
    background: var(--aipm-border-base);
  }
}

.node-card {
  background: var(--aipm-bg-surface);
  border: 2px solid var(--aipm-border-base);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-sm) var(--aipm-spacing-md);
  cursor: pointer;
  transition: all 0.15s;
  min-width: 200px;
  max-width: 260px;

  &:hover {
    box-shadow: var(--aipm-shadow-md);
    transform: translateY(-1px);
  }

  &.status-won {
    border-color: var(--aipm-color-success);
  }
  &.status-lost {
    border-color: var(--aipm-color-danger);
  }
  &.status-abandoned {
    border-color: var(--aipm-text-placeholder);
    opacity: 0.6;
  }
  &.status-running {
    border-color: var(--aipm-color-primary);
  }
}

.node-statement {
  font-size: var(--aipm-font-size-base);
  line-height: 1.4;
  color: var(--aipm-text-primary);
  margin-bottom: var(--aipm-spacing-xs);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.node-meta {
  display: flex;
  align-items: center;
  gap: var(--aipm-spacing-sm);
}

.node-delta {
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-text-regular);
}

.node-children {
  display: flex;
  gap: var(--aipm-spacing-md);
  margin-top: var(--aipm-spacing-sm);
  padding-top: var(--aipm-spacing-sm);
  position: relative;
  border-top: 2px solid var(--aipm-border-base);
}
</style>
