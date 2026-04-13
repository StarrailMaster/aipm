<template>
  <el-container class="layout-container">
    <!-- Header -->
    <el-header class="layout-header">
      <div class="header-left">
        <span class="logo">AIPM</span>
      </div>
      <div class="header-right">
        <el-tooltip
          :content="todoCount > 0 ? `你有 ${todoCount} 条待办` : '暂无待办'"
          placement="bottom"
        >
          <el-badge
            :value="todoCount"
            :max="99"
            :hidden="todoCount === 0"
            class="notification-badge"
          >
            <el-button
              :icon="Bell"
              circle
              size="small"
              @click="goToMyTasks"
            />
          </el-badge>
        </el-tooltip>
        <el-dropdown trigger="click" @command="handleUserCommand">
          <span class="user-info">
            <el-avatar :size="28">{{ userName.charAt(0) }}</el-avatar>
            <span class="user-name">{{ userName }}</span>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人设置</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>

    <el-container class="layout-body">
      <!-- Sidebar -->
      <el-aside :width="isCollapsed ? '64px' : '200px'" class="layout-aside">
        <el-menu
          :default-active="activeMenu"
          :collapse="isCollapsed"
          :router="true"
          class="sidebar-menu"
        >
          <!-- 洞察与决策 -->
          <div v-if="!isCollapsed" class="menu-group-label">{{ $t('navGroup.insights') }}</div>
          <el-menu-item index="/dashboard">
            <el-icon><Odometer /></el-icon>
            <template #title>{{ $t('nav.dashboard') }}</template>
          </el-menu-item>
          <el-menu-item v-if="isAdmin" index="/dashboard/cross-project">
            <el-icon><DataLine /></el-icon>
            <template #title>{{ $t('nav.crossProject') }}</template>
          </el-menu-item>

          <!-- 目标与实验 -->
          <div v-if="!isCollapsed" class="menu-group-label">{{ $t('navGroup.goals') }}</div>
          <el-menu-item index="/hypotheses">
            <el-icon><Aim /></el-icon>
            <template #title>{{ $t('nav.hypotheses') }}</template>
          </el-menu-item>
          <!-- 假设模板库已移除：团队直接写假设，不需要模板辅助 -->
          <el-menu-item index="/learnings">
            <el-icon><Notebook /></el-icon>
            <template #title>{{ $t('nav.learnings') }}</template>
          </el-menu-item>

          <!-- 执行与协作 -->
          <div v-if="!isCollapsed" class="menu-group-label">{{ $t('navGroup.execution') }}</div>
          <el-menu-item index="/tasks">
            <el-icon><List /></el-icon>
            <template #title>{{ $t('nav.tasks') }}</template>
          </el-menu-item>
          <el-menu-item index="/workbench">
            <el-icon><Box /></el-icon>
            <template #title>{{ $t('nav.workbench') }}</template>
          </el-menu-item>
          <el-menu-item index="/team-board">
            <el-icon><Trophy /></el-icon>
            <template #title>{{ $t('nav.teamBoard') }}</template>
          </el-menu-item>
          <el-menu-item index="/knowledge">
            <el-icon><Collection /></el-icon>
            <template #title>{{ $t('nav.knowledge') }}</template>
          </el-menu-item>

          <!-- 设置 -->
          <div class="menu-divider" />
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <template #title>{{ $t('nav.settings') }}</template>
          </el-menu-item>
        </el-menu>

        <div class="collapse-btn" @click="isCollapsed = !isCollapsed">
          <el-icon v-if="isCollapsed"><Expand /></el-icon>
          <el-icon v-else><Fold /></el-icon>
        </div>
      </el-aside>

      <!-- Main content -->
      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getMyTasksApi } from '@/api/dashboard'
import {
  Odometer,
  List,
  Collection,
  Box,
  Trophy,
  Notebook,
  Setting,
  Bell,
  Expand,
  Fold,
  Aim,
  DataLine,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isCollapsed = ref(false)

const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

// ========== 待办数量（用于右上角 Bell 徽章） ==========
const todoCount = ref(0)

async function refreshTodoCount() {
  // 未登录时不拉
  if (!authStore.user) return
  try {
    const res = await getMyTasksApi()
    if (res.data.code === 0 && res.data.data) {
      todoCount.value = res.data.data.summary.total
    }
  } catch {
    // 失败静默，Bell 仍显示 0
  }
}

function goToMyTasks() {
  router.push('/dashboard')
  // 点击后也刷一次，从待办页回来时徽章保持最新
  refreshTodoCount()
}

onMounted(() => {
  refreshTodoCount()
})

// 路由切换时自动刷新一次（这样在工作台/白板改完待办状态再切页面，徽章会更新）
watch(
  () => route.fullPath,
  () => {
    refreshTodoCount()
  },
)

const activeMenu = computed(() => {
  // dashboard 子路由（my-tasks / efficiency）都激活 /dashboard 菜单项
  if (route.path.startsWith('/dashboard')) return '/dashboard'
  // Req 2: /knowledge 及其旧路由都激活知识中心菜单
  if (
    route.path.startsWith('/knowledge') ||
    route.path.startsWith('/sop') ||
    route.path.startsWith('/prompts') ||
    route.path.startsWith('/skills')
  )
    return '/knowledge'
  // 团队看板：/team-board 及旧的 /okr / okr-legacy 都保持团队看板菜单高亮
  if (
    route.path.startsWith('/team-board') ||
    route.path.startsWith('/okr') // covers /okr and /okr-legacy
  )
    return '/team-board'
  return route.path
})
const userName = computed(() => authStore.user?.name || '用户')

function handleUserCommand(command: string) {
  if (command === 'logout') {
    authStore.logout()
    router.push('/login')
  } else if (command === 'profile') {
    router.push('/settings')
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  height: 56px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo {
  font-size: 20px;
  font-weight: 700;
  color: #409eff;
  letter-spacing: 1px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.notification-badge {
  cursor: pointer;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.user-name {
  font-size: 14px;
  color: #303133;
}

.layout-body {
  flex: 1;
  overflow: hidden;
}

.layout-aside {
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  transition: width 0.3s;
  overflow: hidden;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
  overflow-y: auto;
}

.menu-divider {
  height: 1px;
  background: #e4e7ed;
  margin: 8px 16px;
}

.menu-group-label {
  font-size: 11px;
  font-weight: 600;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 12px 20px 6px;
  user-select: none;
}

.menu-group-label + .menu-group-label {
  margin-top: 4px;
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  cursor: pointer;
  border-top: 1px solid #e4e7ed;
  color: #909399;
  transition: color 0.3s;
}

.collapse-btn:hover {
  color: #409eff;
}

.layout-main {
  background: #f5f7fa;
  overflow-y: auto;
  padding: 20px;
}
</style>
