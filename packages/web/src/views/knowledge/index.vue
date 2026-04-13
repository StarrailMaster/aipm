<template>
  <div class="knowledge-hub-page">
    <div class="hub-header">
      <div>
        <h2 class="page-title">知识中心</h2>
        <p class="page-subtitle">
          SOP 模板、提示词库、Skill 库 全部在这里
        </p>
      </div>
    </div>

    <el-tabs
      v-model="activeTab"
      type="border-card"
      class="hub-tabs"
      @tab-change="onTabChange"
    >
      <el-tab-pane name="sop">
        <template #label>
          <span class="hub-tab-label">
            <el-icon><Document /></el-icon>
            SOP 模板
          </span>
        </template>
        <div class="hub-tab-body">
          <KeepAlive>
            <SopIndex v-if="activeTab === 'sop'" />
          </KeepAlive>
        </div>
      </el-tab-pane>

      <el-tab-pane name="prompts">
        <template #label>
          <span class="hub-tab-label">
            <el-icon><ChatLineSquare /></el-icon>
            提示词库
          </span>
        </template>
        <div class="hub-tab-body">
          <KeepAlive>
            <PromptsIndex v-if="activeTab === 'prompts'" />
          </KeepAlive>
        </div>
      </el-tab-pane>

      <el-tab-pane name="skills">
        <template #label>
          <span class="hub-tab-label">
            <el-icon><MagicStick /></el-icon>
            Skill 库
          </span>
        </template>
        <div class="hub-tab-body">
          <KeepAlive>
            <SkillsIndex v-if="activeTab === 'skills'" />
          </KeepAlive>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Document, ChatLineSquare, MagicStick } from '@element-plus/icons-vue'
import SopIndex from '@/views/sop/index.vue'
import PromptsIndex from '@/views/prompts/index.vue'
import SkillsIndex from '@/views/skills/index.vue'

type TabKey = 'sop' | 'prompts' | 'skills'

const route = useRoute()
const router = useRouter()

const activeTab = ref<TabKey>('sop')

function parseTabFromQuery(): TabKey {
  const q = route.query.tab
  if (q === 'prompts' || q === 'skills' || q === 'sop') return q
  return 'sop'
}

onMounted(() => {
  activeTab.value = parseTabFromQuery()
})

watch(
  () => route.query.tab,
  () => {
    activeTab.value = parseTabFromQuery()
  },
)

function onTabChange(name: string | number) {
  const tab = String(name) as TabKey
  if (route.query.tab === tab) return
  router.replace({ path: '/knowledge', query: { tab } })
}
</script>

<style scoped>
.knowledge-hub-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hub-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  margin: 0;
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #909399;
}

.hub-tabs {
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.hub-tabs :deep(.el-tabs__header) {
  background: #fafbfc;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  padding: 0 8px;
  margin: 0;
}

.hub-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
}

.hub-tab-body {
  padding: 4px 0;
}

/* 去掉子页面自己的外边距，避免双重 padding */
.hub-tab-body :deep(.sop-page),
.hub-tab-body :deep(.prompts-page),
.hub-tab-body :deep(.skills-page) {
  padding: 0 !important;
}
</style>
