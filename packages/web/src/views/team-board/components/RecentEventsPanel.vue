<template>
  <el-card
    v-loading="loading"
    class="events-card"
    shadow="never"
  >
    <template #header>
      <div class="events-header">
        <div class="header-title-row">
          <el-icon :size="18" class="header-icon"><ChatLineRound /></el-icon>
          <span class="header-title">最近动态</span>
        </div>
        <span class="header-sub">团队最新贡献事件</span>
      </div>
    </template>

    <div v-if="events.length > 0" class="events-body">
      <el-timeline class="events-timeline">
        <el-timeline-item
          v-for="evt in events"
          :key="evt.id"
          :color="colorOfEventType(evt.eventType)"
          size="normal"
          placement="top"
          :hollow="false"
        >
          <div class="event-item">
            <div class="event-top">
              <el-avatar
                :size="24"
                :src="evt.user.avatar ?? undefined"
                class="event-avatar"
              >
                {{ initialOf(evt.user.name) }}
              </el-avatar>
              <span class="event-user">{{ evt.user.name }}</span>
              <span class="event-time">{{ formatRelativeTime(evt.createdAt) }}</span>
            </div>
            <div class="event-body">
              <component
                :is="iconComp(evt.eventType)"
                v-if="iconComp(evt.eventType)"
                class="event-inline-icon"
                :style="{ color: colorOfEventType(evt.eventType) }"
              />
              <span class="event-reason">{{ evt.reason }}</span>
              <span
                class="event-points"
                :class="{ 'points-value': evt.category === 'value' }"
              >
                +{{ evt.points }}
              </span>
            </div>
            <div class="event-tags">
              <el-tag
                size="small"
                effect="plain"
                :style="{
                  color: colorOfSourceType(evt.sourceType),
                  borderColor: colorOfSourceType(evt.sourceType) + '66',
                  background: colorOfSourceType(evt.sourceType) + '10',
                }"
              >
                {{ labelOfSourceType(evt.sourceType) }}
              </el-tag>
              <el-tag
                size="small"
                effect="plain"
                class="event-type-tag"
              >
                {{ labelOfEventType(evt.eventType) }}
              </el-tag>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>

    <el-empty
      v-else-if="!loading"
      :image-size="60"
      description="还没有动态"
    />
  </el-card>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import {
  EditPen,
  StarFilled,
  DocumentCopy,
  Check,
  Promotion,
  Aim,
  ChatLineRound,
} from '@element-plus/icons-vue'
import type { RecentEventWithUser } from '@/api/contribution'
import {
  labelOfSourceType,
  colorOfSourceType,
  labelOfEventType,
  colorOfEventType,
  formatRelativeTime,
} from '../contribution-meta'

defineProps<{
  events: RecentEventWithUser[]
  loading?: boolean
}>()

const ICON_MAP: Record<string, Component> = {
  create: EditPen,
  star_milestone: StarFilled,
  fork_milestone: DocumentCopy,
  used_milestone: Aim,
  pr_merged: Check,
  first_used_in_workbench: Promotion,
  first_used_in_iteration: Promotion,
}

function iconComp(eventType: string): Component | null {
  return ICON_MAP[eventType] ?? EditPen
}

function initialOf(name: string): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}
</script>

<style scoped>
.events-card {
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.25s ease;
  display: flex;
  flex-direction: column;
  max-height: 700px;
}

.events-card:hover {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.06);
}

.events-card :deep(.el-card__header) {
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
}

.events-card :deep(.el-card__body) {
  padding: 14px 18px 16px;
  overflow-y: auto;
  flex: 1;
}

/* ========== Header ========== */

.events-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #409eff;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.header-sub {
  font-size: 12px;
  color: #94a3b8;
}

/* ========== Timeline tweaks ========== */

.events-timeline {
  padding-left: 4px;
  margin: 0;
}

.events-timeline :deep(.el-timeline-item__tail) {
  border-left-color: #e5e7eb;
}

.events-timeline :deep(.el-timeline-item) {
  padding-bottom: 16px;
}

.events-timeline :deep(.el-timeline-item__wrapper) {
  padding-left: 22px;
}

/* ========== Event item ========== */

.event-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid transparent;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.event-item:hover {
  background: #f1f5f9;
  border-color: #e2e8f0;
}

.event-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-avatar {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  background: #fff;
  color: #475569;
}

.event-user {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-time {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

.event-body {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12.5px;
  color: #475569;
  line-height: 1.6;
}

.event-inline-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 3px;
}

.event-reason {
  flex: 1;
  word-break: break-word;
}

.event-points {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #409eff;
  background: #eff6ff;
  padding: 2px 8px;
  border-radius: 10px;
  font-variant-numeric: tabular-nums;
}

.event-points.points-value {
  color: #d97706;
  background: #fef3c7;
}

.event-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.event-type-tag {
  background: #f1f5f9;
  color: #64748b;
  border-color: #e2e8f0;
}
</style>
