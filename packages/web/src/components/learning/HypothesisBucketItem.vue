<template>
  <div class="bucket-item" @click="$emit('click')">
    <div class="item-title">{{ hypothesis.statement }}</div>
    <div class="item-meta">
      <span class="item-owner">{{ hypothesis.owner.name }}</span>
      <span v-if="hypothesis.iceScore" class="item-score">
        ICE: <strong>{{ hypothesis.iceScore.toFixed(1) }}</strong>
      </span>
      <span v-else-if="hypothesis.riceScore" class="item-score">
        RICE: <strong>{{ hypothesis.riceScore.toFixed(1) }}</strong>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HypothesisBrief } from '@/api/hypothesis'

defineProps<{
  hypothesis: HypothesisBrief
}>()

defineEmits<{
  (e: 'click'): void
}>()
</script>

<style lang="scss" scoped>
.bucket-item {
  background: var(--aipm-bg-surface);
  border: 1px solid var(--aipm-border-light);
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--aipm-color-primary);
    box-shadow: 0 1px 4px var(--aipm-bg-primary-soft);
  }
}

.item-title {
  font-size: var(--aipm-font-size-sm);
  line-height: 1.4;
  color: var(--aipm-text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 4px;
}

.item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-text-secondary);
}

.item-owner {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.item-score {
  strong {
    color: var(--aipm-text-primary);
    font-weight: var(--aipm-font-weight-semibold);
  }
}
</style>
