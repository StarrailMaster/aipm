import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { getToken } from '@/api/request'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/components/DashboardLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      // Learning Dashboard (D3 决策: 原 /dashboard/my-tasks 被删除)
      {
        path: 'dashboard',
        name: 'LearningDashboard',
        component: () => import('@/views/dashboard/learning-dashboard.vue'),
        meta: { title: 'dashboard.title' },
      },
      // 原 my-tasks / efficiency 路由已废弃
      // - my-tasks 直接 redirect 到 /dashboard（D3 强制心智转换）
      // - efficiency 早已迁到 /team-board
      {
        path: 'dashboard/my-tasks',
        redirect: '/dashboard',
      },
      {
        path: 'dashboard/efficiency',
        redirect: '/team-board',
      },
      // Hypothesis management (Learning Copilot v2.0)
      {
        path: 'hypotheses',
        name: 'HypothesisList',
        component: () => import('@/views/hypotheses/index.vue'),
        meta: { title: 'nav.hypotheses' },
      },
      {
        path: 'hypotheses/:id',
        name: 'HypothesisDetail',
        component: () => import('@/views/hypotheses/detail.vue'),
        meta: { title: 'hypothesis.title' },
      },
      {
        path: 'hypothesis-templates',
        name: 'HypothesisTemplates',
        component: () => import('@/views/hypothesis-templates/index.vue'),
        meta: { title: 'nav.hypothesisTemplates', requiresAdmin: false },
      },
      // Phase E.2: KR detail page
      {
        path: 'dashboard/kr/:id',
        name: 'KRDetail',
        component: () => import('@/views/okr/kr-detail.vue'),
        meta: { title: 'KR' },
      },
      {
        path: 'dashboard/cross-project',
        name: 'CrossProjectDashboard',
        component: () => import('@/views/dashboard/cross-project.vue'),
        meta: { title: 'nav.crossProject', requiresAdmin: true },
      },
      {
        path: 'learnings',
        name: 'LearningLibrary',
        component: () => import('@/views/learnings/index.vue'),
        meta: { title: 'nav.learnings' },
      },
      // Old experience route redirects to /learnings
      {
        path: 'experience',
        redirect: '/learnings',
      },
      {
        path: 'tasks',
        name: 'Tasks',
        component: () => import('@/views/tasks/index.vue'),
        meta: { title: '任务管理' },
      },
      {
        path: 'tasks/:id',
        name: 'TaskBoard',
        component: () => import('@/views/board/index.vue'),
        meta: { title: '任务工作台' },
      },
      {
        path: 'knowledge',
        name: 'KnowledgeHub',
        component: () => import('@/views/knowledge/index.vue'),
        meta: { title: '知识中心' },
      },
      // Req 2: 旧路由重定向到知识中心对应 tab（保留 detail 路由以便直接访问）
      {
        path: 'sop',
        redirect: '/knowledge?tab=sop',
      },
      {
        path: 'sop/:id',
        name: 'SOPDetail',
        component: () => import('@/views/sop/detail.vue'),
        meta: { title: 'SOP 详情' },
      },
      {
        path: 'prompts',
        redirect: '/knowledge?tab=prompts',
      },
      {
        path: 'prompts/create',
        name: 'PromptCreate',
        component: () => import('@/views/prompts/create.vue'),
        meta: { title: '新建提示词' },
      },
      {
        path: 'prompts/:id',
        name: 'PromptDetail',
        component: () => import('@/views/prompts/detail.vue'),
        meta: { title: '提示词详情' },
      },
      {
        path: 'prompts/:id/pr/:prId',
        name: 'PromptPrDetail',
        component: () => import('@/views/prompts/pr-detail.vue'),
        meta: { title: 'PR 详情' },
      },
      {
        path: 'skills',
        redirect: '/knowledge?tab=skills',
      },
      {
        path: 'skills/:id',
        name: 'SkillDetail',
        component: () => import('@/views/skills/detail.vue'),
        meta: { title: 'Skill 详情' },
      },
      {
        path: 'workbench',
        name: 'Workbench',
        component: () => import('@/views/workbench/index.vue'),
        meta: { title: '工作台' },
      },
      // 兼容旧链接：/feeds → /workbench
      {
        path: 'feeds',
        redirect: '/workbench',
      },
      // Req 4.1 已删除 /designs 路由 — 设计审核流程统一在 workbench 里操作
      {
        path: 'team-board',
        name: 'TeamBoard',
        component: () => import('@/views/team-board/index.vue'),
        meta: { title: '团队看板' },
      },
      // 保留旧 OKR 路由作为重定向（菜单改成"团队看板"后不再直接指向 /okr）
      {
        path: 'okr',
        redirect: '/team-board',
      },
      // 旧的 OKR 看板页面仍保留，便于 /okr-legacy 直接访问
      {
        path: 'okr-legacy',
        name: 'OKRLegacy',
        component: () => import('@/views/okr/index.vue'),
        meta: { title: 'OKR 看板' },
      },
      {
        path: 'experience',
        name: 'Experience',
        component: () => import('@/views/experience/index.vue'),
        meta: { title: '经验沉淀' },
      },
      {
        path: 'settings',
        component: () => import('@/views/settings/index.vue'),
        meta: { title: '设置', requiresAdmin: true },
        children: [
          {
            path: '',
            redirect: '/settings/projects',
          },
          {
            path: 'projects',
            name: 'SettingsProjects',
            component: () => import('@/views/settings/projects.vue'),
            meta: { title: '项目管理' },
          },
          {
            path: 'squads',
            name: 'SettingsSquads',
            component: () => import('@/views/settings/squads.vue'),
            meta: { title: '小组管理' },
          },
          // U-4: SettingsIterations 是孤儿路由——settings/index.vue 的 tabs
          // 里没有对应条目，访问 /settings/iterations 会错误高亮"项目管理"。
          // 迭代管理的入口应该从"任务管理" (/tasks) 进入，这里删掉避免混淆。
          {
            path: 'iterations',
            redirect: '/tasks',
          },
          {
            path: 'users',
            name: 'SettingsUsers',
            component: () => import('@/views/settings/users.vue'),
            meta: { title: '用户管理' },
          },
          {
            path: 'ai-config',
            name: 'SettingsAiConfig',
            component: () => import('@/views/settings/ai-config.vue'),
            meta: { title: 'AI 配置' },
          },
        ],
      },
      // A-5: catch-all 404，避免 Vue Router 遇到未知 child route 时渲染空白 DashboardLayout
      {
        path: ':pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('@/views/error/NotFound.vue'),
        meta: { title: '404 页面不存在' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Route guard:
//   1. 未登录的受保护页 → 跳 /login
//   2. 已登录但 authStore.user 未 hydration（例如刷新页面）→ 补拉一次 /auth/me
//      这样所有依赖 currentUserId 的权限判断（isReviewer、canMarkDone 等）才能在
//      第一次渲染时就拿到正确的用户 id。拉失败则视为 token 无效，踢回登录页。
router.beforeEach(async (to, _from, next) => {
  const token = getToken()

  // Public pages
  if (to.meta.public) {
    if (token && (to.path === '/login' || to.path === '/register')) {
      return next('/dashboard')
    }
    return next()
  }

  // Protected pages: 必须有 token
  if (!token) {
    return next('/login')
  }

  // Lazy-import 避免循环依赖（router ↔ stores ↔ api）
  const { useAuthStore } = await import('@/stores/auth')
  const authStore = useAuthStore()

  // 小 helper：从 authStore 读 role。
  // Pinia setup-store 有时 ref 自动展开的类型会退化到 never，用显式 cast 规避
  const getRole = (): string | undefined => {
    const u = authStore.user as { role?: string } | null
    return u?.role
  }

  // 已经 hydrate 过 → 直接做权限判断
  if (authStore.user) {
    if (to.meta.requiresAdmin && getRole() !== 'ADMIN') {
      return next('/dashboard')
    }
    return next()
  }

  // 第一次进入受保护页 → 拉一次 /auth/me
  try {
    await authStore.fetchUser()
    if (to.meta.requiresAdmin && getRole() !== 'ADMIN') {
      return next('/dashboard')
    }
    next()
  } catch {
    // Token 无效（被删号 / 过期 / 签名不匹配）
    authStore.logout()
    next('/login')
  }
})

export default router
