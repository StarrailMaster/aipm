<template>
  <div class="settings-page">
    <div class="settings-header">
      <h2>设置</h2>
    </div>
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="项目管理" name="projects" />
      <el-tab-pane label="小组管理" name="squads" />
      <el-tab-pane label="用户管理" name="users" />
      <el-tab-pane label="AI 配置" name="ai-config" />
    </el-tabs>
    <div class="settings-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

function getTabFromPath(path: string): string {
  if (path.includes('/settings/squads')) return 'squads'
  if (path.includes('/settings/users')) return 'users'
  if (path.includes('/settings/ai-config')) return 'ai-config'
  return 'projects'
}

const activeTab = ref(getTabFromPath(route.path))

watch(
  () => route.path,
  (path) => {
    activeTab.value = getTabFromPath(path)
  },
)

function handleTabChange(tab: string | number) {
  const tabName = String(tab)
  router.push(`/settings/${tabName}`)
}
</script>

<style scoped>
.settings-page {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  min-height: calc(100vh - 160px);
}

.settings-header {
  margin-bottom: 16px;
}

.settings-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.settings-content {
  margin-top: 16px;
}
</style>
