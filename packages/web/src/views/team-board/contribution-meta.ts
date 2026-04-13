/**
 * 团队贡献看板共用的枚举 → 文案 / 颜色 / 图标映射表
 * 所有子组件都从这里取，避免写散。
 */

import type { ContributionSourceType } from '@/api/contribution'

// ========== Source type ==========

export const SOURCE_TYPE_LABELS: Record<ContributionSourceType, string> = {
  prompt: '提示词',
  skill: 'Skill',
  sop_project: 'SOP 模板',
  sop_document: 'SOP 文档',
  prompt_pr: '改进建议',
}

export const SOURCE_TYPE_COLORS: Record<ContributionSourceType, string> = {
  prompt: '#409eff', // blue
  skill: '#67c23a', // green
  sop_project: '#e6a23c', // amber
  sop_document: '#f78a3b', // orange
  prompt_pr: '#a855f7', // purple
}

// 展示顺序（用于 breakdown 进度条）
export const SOURCE_TYPE_ORDER: ContributionSourceType[] = [
  'prompt',
  'skill',
  'sop_project',
  'sop_document',
  'prompt_pr',
]

export function labelOfSourceType(t: ContributionSourceType): string {
  return SOURCE_TYPE_LABELS[t] ?? t
}

export function colorOfSourceType(t: ContributionSourceType): string {
  return SOURCE_TYPE_COLORS[t] ?? '#909399'
}

// ========== Event type ==========

export const EVENT_TYPE_LABELS: Record<string, string> = {
  create: '创建',
  star_milestone: '收藏里程碑',
  fork_milestone: 'Fork 里程碑',
  used_milestone: '使用里程碑',
  pr_merged: '改进被合并',
  first_used_in_workbench: '首次推进工作台',
  first_used_in_iteration: '首次被项目采用',
}

/** 事件类型 → Element Plus icon 组件名（驼峰，用于 dynamic :is）*/
export const EVENT_TYPE_ICONS: Record<string, string> = {
  create: 'EditPen',
  star_milestone: 'StarFilled',
  fork_milestone: 'DocumentCopy',
  used_milestone: 'Aim',
  pr_merged: 'Check',
  first_used_in_workbench: 'Promotion',
  first_used_in_iteration: 'Promotion',
}

/** 事件类型 → 左侧 timeline node 颜色 */
export const EVENT_TYPE_COLORS: Record<string, string> = {
  create: '#409eff', // blue
  star_milestone: '#f59e0b', // gold
  fork_milestone: '#a855f7', // purple
  used_milestone: '#0ea5e9', // cyan
  pr_merged: '#67c23a', // green
  first_used_in_workbench: '#14b8a6', // teal
  first_used_in_iteration: '#14b8a6', // teal
}

export function labelOfEventType(t: string): string {
  return EVENT_TYPE_LABELS[t] ?? t
}

export function colorOfEventType(t: string): string {
  return EVENT_TYPE_COLORS[t] ?? '#909399'
}

export function iconOfEventType(t: string): string {
  return EVENT_TYPE_ICONS[t] ?? 'EditPen'
}

// ========== Relative time ==========

export function formatRelativeTime(ts: number): string {
  if (!ts) return ''
  const now = Date.now()
  const diff = Math.max(0, now - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return '刚刚'
  if (sec < 60) return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day} 天前`
  if (day < 30) return `${Math.floor(day / 7)} 周前`
  // 超过 30 天直接显示日期
  const d = new Date(ts)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
