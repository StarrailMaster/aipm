<template>
  <div class="podium">
    <!-- 银牌（左）-->
    <div class="podium-slot silver-slot">
      <div v-if="silver" class="podium-card rank-silver">
        <div class="podium-crown">
          <span class="podium-medal">🥈</span>
          <span class="podium-rank-label">银牌</span>
        </div>
        <el-avatar
          :size="72"
          :src="silver.user.avatar ?? undefined"
          class="podium-avatar"
        >
          {{ initialOf(silver.user.name) }}
        </el-avatar>
        <div class="podium-name" :title="silver.user.name">{{ silver.user.name }}</div>
        <div class="podium-total">
          <span class="podium-total-num">{{ silver.totalPoints }}</span>
          <span class="podium-total-unit">分</span>
        </div>
        <div class="podium-meta">创建 {{ silver.basePoints }} 分 · 价值 {{ silver.valuePoints }} 分</div>
      </div>
      <div v-else class="podium-card podium-card-empty rank-silver">
        <div class="podium-crown">
          <span class="podium-medal">🥈</span>
          <span class="podium-rank-label">银牌</span>
        </div>
        <el-empty description="虚位以待" :image-size="56" />
      </div>
    </div>

    <!-- 金牌（中，最高）-->
    <div class="podium-slot gold-slot">
      <div v-if="gold" class="podium-card rank-gold">
        <div class="podium-crown">
          <el-icon :size="22"><Trophy /></el-icon>
          <span class="podium-medal">🥇</span>
          <span class="podium-rank-label">金牌</span>
        </div>
        <el-avatar
          :size="84"
          :src="gold.user.avatar ?? undefined"
          class="podium-avatar podium-avatar-gold"
        >
          {{ initialOf(gold.user.name) }}
        </el-avatar>
        <div class="podium-name" :title="gold.user.name">{{ gold.user.name }}</div>
        <div class="podium-total">
          <span class="podium-total-num">{{ gold.totalPoints }}</span>
          <span class="podium-total-unit">分</span>
        </div>
        <div class="podium-meta">创建 {{ gold.basePoints }} 分 · 价值 {{ gold.valuePoints }} 分</div>
      </div>
      <div v-else class="podium-card podium-card-empty rank-gold">
        <div class="podium-crown">
          <span class="podium-medal">🥇</span>
          <span class="podium-rank-label">金牌</span>
        </div>
        <el-empty description="虚位以待" :image-size="64" />
      </div>
    </div>

    <!-- 铜牌（右）-->
    <div class="podium-slot bronze-slot">
      <div v-if="bronze" class="podium-card rank-bronze">
        <div class="podium-crown">
          <span class="podium-medal">🥉</span>
          <span class="podium-rank-label">铜牌</span>
        </div>
        <el-avatar
          :size="72"
          :src="bronze.user.avatar ?? undefined"
          class="podium-avatar"
        >
          {{ initialOf(bronze.user.name) }}
        </el-avatar>
        <div class="podium-name" :title="bronze.user.name">{{ bronze.user.name }}</div>
        <div class="podium-total">
          <span class="podium-total-num">{{ bronze.totalPoints }}</span>
          <span class="podium-total-unit">分</span>
        </div>
        <div class="podium-meta">创建 {{ bronze.basePoints }} 分 · 价值 {{ bronze.valuePoints }} 分</div>
      </div>
      <div v-else class="podium-card podium-card-empty rank-bronze">
        <div class="podium-crown">
          <span class="podium-medal">🥉</span>
          <span class="podium-rank-label">铜牌</span>
        </div>
        <el-empty description="虚位以待" :image-size="56" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Trophy } from '@element-plus/icons-vue'
import type { LeaderboardItem } from '@/api/contribution'

const props = defineProps<{
  items: LeaderboardItem[]
}>()

const gold = computed<LeaderboardItem | null>(() => props.items[0] ?? null)
const silver = computed<LeaderboardItem | null>(() => props.items[1] ?? null)
const bronze = computed<LeaderboardItem | null>(() => props.items[2] ?? null)

function initialOf(name: string): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}
</script>

<style scoped>
.podium {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr;
  gap: 16px;
  align-items: end;
  padding: 8px 0 4px;
}

.podium-slot {
  display: flex;
  justify-content: center;
}

.silver-slot {
  transform: translateY(22px);
}
.bronze-slot {
  transform: translateY(30px);
}

/* ========== Card base ========== */

.podium-card {
  width: 100%;
  border-radius: 16px;
  padding: 20px 18px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  position: relative;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease;
}

.podium-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.12);
}

.rank-gold {
  background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%);
  color: #78350f;
  border: 1px solid rgba(251, 191, 36, 0.6);
}
.rank-silver {
  background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%);
  color: #334155;
  border: 1px solid rgba(148, 163, 184, 0.5);
}
.rank-bronze {
  background: linear-gradient(135deg, #fed7aa 0%, #f97316 100%);
  color: #7c2d12;
  border: 1px solid rgba(249, 115, 22, 0.5);
}

/* ========== Card inner ========== */

.podium-crown {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  opacity: 0.9;
}

.podium-medal {
  font-size: 18px;
  line-height: 1;
}

.podium-rank-label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.podium-avatar {
  border: 3px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  font-weight: 600;
  font-size: 20px;
  background-color: rgba(255, 255, 255, 0.85);
  color: #334155;
}
.podium-avatar-gold {
  font-size: 26px;
}

.podium-name {
  font-size: 16px;
  font-weight: 600;
  color: inherit;
  max-width: 100%;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.podium-total {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.podium-total-num {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
  color: inherit;
}
.rank-gold .podium-total-num {
  font-size: 38px;
}

.podium-total-unit {
  font-size: 14px;
  font-weight: 500;
  color: inherit;
  opacity: 0.85;
}

.podium-meta {
  font-size: 12px;
  font-weight: 500;
  color: inherit;
  opacity: 0.85;
  text-align: center;
}

/* Empty slot */
.podium-card-empty {
  background: #f8fafc !important;
  color: #94a3b8 !important;
  border: 1px dashed #cbd5e1 !important;
  box-shadow: none;
  min-height: 220px;
}
.podium-card-empty:hover {
  transform: none;
  box-shadow: none;
}
.podium-card-empty .podium-rank-label {
  opacity: 0.7;
}

@media (max-width: 900px) {
  .podium {
    grid-template-columns: 1fr;
  }
  .silver-slot,
  .bronze-slot {
    transform: none;
  }
}
</style>
