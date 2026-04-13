<template>
  <div class="workbench-page">
    <div class="page-header">
      <h2 class="page-title">工作台</h2>
      <p class="page-subtitle">生产实施平台 — 按任务分组的工作台包，每包 = 一轮独立 AI 交互</p>
    </div>

    <!-- Project tabs -->
    <el-tabs v-model="activeProjectId" @tab-change="handleProjectChange">
      <el-tab-pane
        v-for="p in projects"
        :key="p.id"
        :label="p.name"
        :name="p.id"
      />
    </el-tabs>

    <!-- Req 4.2: 状态过滤（待办/已完成/全部） + 责任人过滤 -->
    <div class="status-filter-bar">
      <el-radio-group v-model="statusFilter" size="default">
        <el-radio-button label="todo">
          待办
          <el-badge
            v-if="todoCount > 0"
            :value="todoCount"
            :max="99"
            class="filter-badge"
          />
        </el-radio-button>
        <el-radio-button label="done">
          已完成
          <el-badge
            v-if="doneCount > 0"
            :value="doneCount"
            :max="99"
            class="filter-badge"
          />
        </el-radio-button>
        <el-radio-button label="all">全部</el-radio-button>
      </el-radio-group>

      <el-radio-group v-model="ownershipFilter" size="default" class="ownership-filter">
        <el-radio-button label="mine">
          我的
          <el-badge
            v-if="myCount > 0"
            :value="myCount"
            :max="99"
            class="filter-badge"
          />
        </el-radio-button>
        <el-radio-button label="unclaimed">
          未领取
          <el-badge
            v-if="unclaimedCount > 0"
            :value="unclaimedCount"
            :max="99"
            class="filter-badge"
          />
        </el-radio-button>
        <el-radio-button label="all">全部</el-radio-button>
      </el-radio-group>
    </div>

    <!-- Task-grouped work packages -->
    <div v-loading="loading" class="pkg-groups">
      <el-empty v-if="!loading && filteredGroups.length === 0" description="当前筛选下暂无工作台包" />

      <div v-for="group in filteredGroups" :key="group.iterationId" class="task-group">
        <div class="group-header" @click="toggleGroup(group.iterationId)">
          <div class="group-left">
            <el-icon class="collapse-icon" :class="{ expanded: expandedGroups.has(group.iterationId) }">
              <ArrowRight />
            </el-icon>
            <h3 class="group-name">{{ group.iterationName }}</h3>
            <el-tag size="small" type="info" effect="plain">{{ group.iterationStatus }}</el-tag>
            <span class="group-count">{{ group.packages.length }} 个工作台包</span>
          </div>
        </div>

        <transition name="collapse">
          <div v-if="expandedGroups.has(group.iterationId)" class="group-body">
            <el-empty v-if="group.packages.length === 0" description="暂无工作台包" :image-size="40" />

            <div
              v-for="pkg in group.packages"
              :key="pkg.id"
              class="pkg-card"
              :class="{ 'is-rejected': isPkgRejected(pkg) }"
              @click="openDetail(pkg.id)"
            >
              <div class="round-badge">第 {{ pkg.round }} 轮</div>
              <div class="pkg-card-main">
                <div class="pkg-name">
                  {{ pkg.name }}
                  <el-tag
                    v-if="isPkgMine(pkg)"
                    type="primary"
                    size="small"
                    effect="dark"
                    class="mine-chip"
                  >我的</el-tag>
                </div>
                <div class="pkg-meta">
                  <el-tag :type="pkg.phase === 'DESIGN' ? 'warning' : ''" size="small" effect="plain">
                    {{ pkg.phase === 'DESIGN' ? '设计' : '实施' }}
                  </el-tag>
                  <el-tag
                    :type="combinedStatus(pkg).tagType"
                    size="small"
                    :effect="isPkgRejected(pkg) ? 'dark' : 'light'"
                  >
                    <el-icon v-if="isPkgRejected(pkg)" style="vertical-align: -2px; margin-right: 2px"><Warning /></el-icon>
                    {{ combinedStatus(pkg).label }}
                  </el-tag>
                  <span class="pkg-assignee">
                    <el-icon><User /></el-icon>
                    {{ pkg.assignee ? pkg.assignee.name : '未领取' }}
                  </span>
                  <span class="pkg-files">{{ pkg.fileCount }} 个文件</span>
                  <span class="pkg-time">{{ formatTime(pkg.createdAt) }}</span>
                </div>
              </div>
              <div class="pkg-card-actions" @click.stop>
                <el-button
                  size="small"
                  text
                  :type="'success'"
                  @click="handleRate(pkg.id, 'up')"
                >
                  <el-icon><Top /></el-icon>
                  {{ pkg.thumbsUp }}
                </el-button>
                <el-button
                  size="small"
                  text
                  :type="'danger'"
                  @click="handleRate(pkg.id, 'down')"
                >
                  <el-icon><Bottom /></el-icon>
                  {{ pkg.thumbsDown }}
                </el-button>
                <el-button size="small" type="primary" text @click="handleCopy(pkg.id)">
                  <el-icon><DocumentCopy /></el-icon>
                  复制
                </el-button>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Detail drawer -->
    <el-drawer
      v-model="showDetail"
      :title="currentPkg?.name ?? '工作台包详情'"
      size="680px"
      :destroy-on-close="true"
    >
      <div v-loading="detailLoading" class="detail-panel">
        <template v-if="currentPkg">
          <!-- Basic info -->
          <div class="detail-info">
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="阶段">
                <el-tag :type="currentPkg.phase === 'DESIGN' ? 'warning' : ''" size="small">
                  {{ currentPkg.phase === 'DESIGN' ? '设计' : '实施' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="combinedStatus(currentPkg).tagType" size="small">
                  {{ combinedStatus(currentPkg).label }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="负责人">
                <template v-if="currentPkg.assigneeId">
                  {{ currentPkg.assigneeId === currentUserId ? '我' : (currentPkg.createdBy?.name ?? currentPkg.assigneeId) }}
                </template>
                <el-tag v-else size="small" type="info">未领取</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="轮次">
                第 {{ currentPkg.sortOrder }} 轮
              </el-descriptions-item>
            </el-descriptions>
          </div>

          <!-- ============ 生产状态流转按钮区 ============ -->
          <!-- 简化后只保留一个主动作：「完成这一轮」。
               单击自动完成 领取（如需要）→ IN_PROGRESS → REVIEW → DONE 的完整推进。
               不再区分领取 / 开始 / 完成多步操作。 -->
          <div class="detail-section primary-actions">
            <el-button
              v-if="canMarkDone && currentPkg.designReviewStatus !== 'APPROVED'"
              type="success"
              size="large"
              :loading="statusLoading || claimLoading"
              @click="handleMarkDone"
            >
              <el-icon><Check /></el-icon>
              {{ currentPkg.assigneeId === currentUserId ? '完成这一轮' : '领取并完成这一轮' }}
            </el-button>
            <el-button
              v-if="canRelease"
              type="warning"
              :loading="releaseLoading"
              plain
              @click="handleRelease"
            >
              转交他人
            </el-button>
            <el-alert
              v-if="!canWriteFeed"
              type="info"
              :closable="false"
              show-icon
              title="你不属于这个任务的小组，只能查看"
              style="margin: 0"
            />
          </div>

          <!-- ============ 设计审核流转区 ============ -->
          <div class="detail-section review-section">
            <h4>
              <el-icon><PictureFilled /></el-icon>
              设计审核
              <el-tag
                v-if="currentPkg.designReviewStatus !== 'NOT_REQUIRED'"
                :type="reviewStatusTagType(currentPkg.designReviewStatus)"
                size="small"
                effect="light"
                style="margin-left: 8px"
              >
                {{ reviewStatusLabel(currentPkg.designReviewStatus) }}
              </el-tag>
            </h4>

            <!-- 设计图开关 -->
            <div class="review-toggle">
              <el-switch
                v-model="designOutputRequiredLocal"
                :disabled="!canToggleDesignOutput"
                :loading="toggleLoading"
                active-text="这一轮需要产出设计图"
                inactive-text="不需要产出设计图"
                @change="handleToggleDesignOutput"
              />
              <div v-if="!canToggleDesignOutput" class="toggle-hint">
                <el-icon><InfoFilled /></el-icon>
                已进入审核流程，不能再切换此开关
              </div>
            </div>

            <!-- 根据状态显示不同 UI -->
            <template v-if="currentPkg.designOutputRequired">
              <!-- 状态 A: NOT_REQUIRED（需要但未提交）→ 推给设计表单 -->
              <div
                v-if="currentPkg.designReviewStatus === 'NOT_REQUIRED'"
                class="review-form"
              >
                <el-alert
                  title="请填写 Figma 文件地址并选择设计师审核"
                  type="info"
                  :closable="false"
                  show-icon
                />
                <el-form label-position="top" :model="pushForm">
                  <el-form-item label="Figma 文件地址" required>
                    <el-input
                      v-model="pushForm.figmaUrl"
                      placeholder="https://figma.com/file/..."
                      clearable
                    >
                      <template #prefix>
                        <el-icon><Link /></el-icon>
                      </template>
                    </el-input>
                  </el-form-item>
                  <el-form-item label="指派设计师" required>
                    <el-select
                      v-model="pushForm.designerId"
                      placeholder="选择一位设计师"
                      style="width: 100%"
                      :loading="designersLoading"
                    >
                      <el-option
                        v-for="d in designers"
                        :key="d.id"
                        :label="d.name"
                        :value="d.id"
                      >
                        <span>{{ d.name }}</span>
                        <el-tag size="small" style="margin-left: 8px">{{ d.role }}</el-tag>
                      </el-option>
                    </el-select>
                  </el-form-item>
                  <el-form-item>
                    <el-button
                      type="primary"
                      :loading="pushLoading"
                      :disabled="!canSubmitPush"
                      @click="handlePushToDesign"
                    >
                      <el-icon><Promotion /></el-icon>
                      推给设计审核
                    </el-button>
                  </el-form-item>
                </el-form>
              </div>

              <!-- 状态 B: PENDING_REVIEW（等审核中）-->
              <div
                v-else-if="currentPkg.designReviewStatus === 'PENDING_REVIEW'"
                class="review-pending"
              >
                <el-alert
                  :title="isReviewer ? '你是本包的审核人，请进行审核' : `等待 ${currentPkg.designReviewer?.name ?? '设计师'} 审核中…`"
                  :type="isReviewer ? 'warning' : 'info'"
                  :closable="false"
                  show-icon
                />
                <div class="review-figma-box">
                  <div class="figma-label">Figma 文件</div>
                  <el-link
                    type="primary"
                    :href="currentPkg.figmaUrl ?? '#'"
                    target="_blank"
                    :underline="false"
                  >
                    <el-icon><Link /></el-icon>
                    {{ currentPkg.figmaUrl }}
                  </el-link>
                </div>
                <div v-if="isReviewer" class="review-actions">
                  <el-button
                    type="success"
                    :loading="approveLoading"
                    @click="handleApprove"
                  >
                    <el-icon><Check /></el-icon>
                    审核通过
                  </el-button>
                  <el-button
                    type="danger"
                    :loading="rejectLoading"
                    @click="openRejectDialog"
                  >
                    <el-icon><Close /></el-icon>
                    驳回
                  </el-button>
                </div>
              </div>

              <!-- 状态 C: APPROVED（已通过）-->
              <div
                v-else-if="currentPkg.designReviewStatus === 'APPROVED'"
                class="review-approved"
              >
                <el-alert
                  :title="`✅ 设计审核通过 by ${currentPkg.designReviewer?.name ?? '设计师'}`"
                  type="success"
                  :closable="false"
                  show-icon
                  description="你现在可以把这一轮标记为「已完成」"
                />
                <div class="review-figma-box">
                  <div class="figma-label">已审核的 Figma 文件</div>
                  <el-link
                    type="primary"
                    :href="currentPkg.figmaUrl ?? '#'"
                    target="_blank"
                    :underline="false"
                  >
                    <el-icon><Link /></el-icon>
                    {{ currentPkg.figmaUrl }}
                  </el-link>
                </div>
                <div v-if="canMarkDone" class="review-actions">
                  <el-button type="primary" :loading="statusLoading" @click="handleMarkDone">
                    <el-icon><Check /></el-icon>
                    标记已完成
                  </el-button>
                </div>
              </div>

              <!-- 状态 D: REJECTED（被驳回）-->
              <div
                v-else-if="currentPkg.designReviewStatus === 'REJECTED'"
                class="review-rejected"
              >
                <el-alert
                  title="⚠️ 设计被驳回，请修改后重新提交"
                  type="error"
                  :closable="false"
                  show-icon
                />
                <el-form label-position="top" :model="pushForm">
                  <el-form-item label="新的 Figma 文件地址" required>
                    <el-input
                      v-model="pushForm.figmaUrl"
                      :placeholder="currentPkg.figmaUrl ?? 'https://figma.com/file/...'"
                      clearable
                    >
                      <template #prefix>
                        <el-icon><Link /></el-icon>
                      </template>
                    </el-input>
                  </el-form-item>
                  <el-form-item label="审核人">
                    <el-select
                      v-model="pushForm.designerId"
                      placeholder="可换审核人"
                      style="width: 100%"
                      :loading="designersLoading"
                    >
                      <el-option
                        v-for="d in designers"
                        :key="d.id"
                        :label="d.name"
                        :value="d.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item>
                    <el-button
                      type="primary"
                      :loading="pushLoading"
                      :disabled="!canSubmitPush"
                      @click="handlePushToDesign"
                    >
                      <el-icon><Refresh /></el-icon>
                      重新提交审核
                    </el-button>
                  </el-form-item>
                </el-form>
              </div>
            </template>
          </div>

          <!-- Files -->
          <div class="detail-section">
            <h4>核心文件 ({{ currentPkg.coreFiles.length }})</h4>
            <div v-for="file in currentPkg.coreFiles" :key="file.id" class="file-block">
              <div class="file-name">{{ file.name }}</div>
              <pre class="file-content">{{ file.content }}</pre>
            </div>
            <el-empty v-if="currentPkg.coreFiles.length === 0" description="无核心文件" :image-size="40" />
          </div>

          <div class="detail-section">
            <h4>上下文文件 ({{ currentPkg.contextFiles.length }})</h4>
            <div v-for="file in currentPkg.contextFiles" :key="file.id" class="file-block">
              <div class="file-name">{{ file.name }}</div>
              <pre class="file-content">{{ file.content }}</pre>
            </div>
            <el-empty v-if="currentPkg.contextFiles.length === 0" description="无上下文文件" :image-size="40" />
          </div>

          <!-- Actions -->
          <div class="detail-actions">
            <el-button type="primary" @click="handleAssemble">
              <el-icon><DocumentCopy /></el-icon>
              组装 & 复制到剪贴板
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <!-- 驳回原因对话框 -->
    <el-dialog
      v-model="rejectDialogVisible"
      title="驳回设计"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="驳回原因" required>
          <el-input
            v-model="rejectReason"
            type="textarea"
            :rows="4"
            placeholder="请具体说明驳回原因，方便实施工程师修改..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="rejectLoading"
          :disabled="!rejectReason.trim()"
          @click="handleReject"
        >
          确认驳回
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowRight, Top, Bottom, DocumentCopy, PictureFilled,
  Link, Promotion, Check, Close, Refresh, InfoFilled, Warning, User,
} from '@element-plus/icons-vue'
import {
  listFeedsByProjectApi, rateFeedApi, assembleFeedApi, getFeedDetailApi,
  updateFeedApi, pushFeedToDesignApi, approveDesignApi, rejectDesignApi,
  releaseFeedApi, completeFeedApi,
  type ProjectFeedGroup, type FeedPackageDetail, type DesignReviewStatusType,
} from '@/api/feed'
import { listProjectsApi, listUsersApi } from '@/api/org'
import { useAuthStore } from '@/stores/auth'

// ========== State ==========
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const currentUserId = computed(() => authStore.user?.id ?? '')

const loading = ref(false)
const projects = ref<Array<{ id: string; name: string }>>([])
const activeProjectId = ref('')
const groups = ref<ProjectFeedGroup[]>([])
const expandedGroups = reactive(new Set<string>())

// Req 4.2: 状态过滤
type StatusFilter = 'todo' | 'done' | 'all'
const statusFilter = ref<StatusFilter>('todo')

/** 责任人过滤："我的 / 未领取 / 全部" */
type OwnershipFilter = 'mine' | 'unclaimed' | 'all'
const ownershipFilter = ref<OwnershipFilter>('mine')

/** 判断一个包是待办（还没 DONE） */
function isPkgTodo(pkg: ProjectFeedGroup['packages'][number]): boolean {
  return pkg.status !== 'DONE'
}

/** 判断一个包当前是否"属于我"（assignee = 我 或 reviewer = 我） */
function isPkgMine(pkg: ProjectFeedGroup['packages'][number]): boolean {
  const uid = currentUserId.value
  if (!uid) return false
  return pkg.assigneeId === uid || pkg.designReviewerId === uid
}

/** Req 4.2: 判断一个包是否被驳回（用于红色徽章） */
function isPkgRejected(pkg: { designReviewStatus?: DesignReviewStatusType }): boolean {
  return pkg.designReviewStatus === 'REJECTED'
}

const filteredGroups = computed<ProjectFeedGroup[]>(() => {
  return groups.value
    .map((g) => ({
      ...g,
      packages: g.packages.filter((p) => {
        // 状态过滤
        if (statusFilter.value === 'todo' && !isPkgTodo(p)) return false
        if (statusFilter.value === 'done' && isPkgTodo(p)) return false
        // 责任人过滤
        if (ownershipFilter.value === 'mine' && !isPkgMine(p)) return false
        if (ownershipFilter.value === 'unclaimed' && p.assigneeId !== null) return false
        return true
      }),
    }))
    .filter((g) => g.packages.length > 0)
})

const todoCount = computed(() =>
  groups.value.reduce((n, g) => n + g.packages.filter(isPkgTodo).length, 0),
)
const doneCount = computed(() =>
  groups.value.reduce((n, g) => n + g.packages.filter((p) => !isPkgTodo(p)).length, 0),
)
const myCount = computed(() =>
  groups.value.reduce(
    (n, g) => n + g.packages.filter((p) => isPkgMine(p) && isPkgTodo(p)).length,
    0,
  ),
)
const unclaimedCount = computed(() =>
  groups.value.reduce(
    (n, g) => n + g.packages.filter((p) => p.assigneeId === null && isPkgTodo(p)).length,
    0,
  ),
)

// Detail
const showDetail = ref(false)
const detailLoading = ref(false)
const currentPkg = ref<FeedPackageDetail | null>(null)
/** drawer 里当前打开的 feed 所属任务的 squadId（从 groups 列表里查出来）*/
const currentDrawerSquadId = ref<string | null>(null)

// Design review state
const designOutputRequiredLocal = ref(false)
const toggleLoading = ref(false)
const pushForm = reactive({
  figmaUrl: '',
  designerId: '',
})
const pushLoading = ref(false)
const designers = ref<Array<{ id: string; name: string; role: string }>>([])
const designersLoading = ref(false)

const approveLoading = ref(false)
const rejectLoading = ref(false)
const rejectDialogVisible = ref(false)
const rejectReason = ref('')
const statusLoading = ref(false)

// ========== Computed ==========

/** 当前用户是否是本包的审核人 */
const isReviewer = computed(() => {
  if (!currentPkg.value || !currentUserId.value) return false
  return currentPkg.value.designReviewerId === currentUserId.value ||
    authStore.user?.role === 'ADMIN'
})

/** 当前用户所在 squad 是否等于当前 drawer 里任务所在 squad（同组放行） */
const isSameSquad = computed(() => {
  if (authStore.user?.role === 'ADMIN') return true
  const mySquad = authStore.user?.squadId
  const pkgSquad = currentDrawerSquadId.value
  return !!mySquad && !!pkgSquad && mySquad === pkgSquad
})

/** 是否有权对这个包做"写操作"（领取 / 开始执行 / 标记完成 / 释放） */
const canWriteFeed = computed(() => {
  if (!currentPkg.value) return false
  if (authStore.user?.role === 'ADMIN') return true
  const isOwner =
    currentPkg.value.assigneeId === currentUserId.value ||
    currentPkg.value.createdBy?.id === currentUserId.value
  if (isOwner) return true
  return isSameSquad.value
})

/** 是否可以"转交他人"（assignee = 我 或 admin） */
const canRelease = computed(() => {
  if (!currentPkg.value) return false
  if (!currentPkg.value.assigneeId) return false
  if (authStore.user?.role === 'ADMIN') return true
  return currentPkg.value.assigneeId === currentUserId.value
})

/** 当前用户是否能把这个包一键推进到完成。
 *  未领取也允许——handleMarkDone 会先自动 claim。 */
const canMarkDone = computed(() => {
  if (!currentPkg.value) return false
  if (!canWriteFeed.value) return false
  if (currentPkg.value.status === 'DONE') return false
  // 如果需要设计图，必须审核通过
  if (currentPkg.value.designOutputRequired) {
    return currentPkg.value.designReviewStatus === 'APPROVED'
  }
  // 不需要设计图的：任何非 DONE 状态都能一键完成
  return ['PENDING', 'IN_PROGRESS', 'REVIEW', 'REWORK'].includes(currentPkg.value.status)
})

/** 是否可以切换"需要产出设计图"开关（已进入审核流程后就锁定）*/
const canToggleDesignOutput = computed(() => {
  if (!currentPkg.value) return false
  if (currentPkg.value.status === 'DONE') return false
  return currentPkg.value.designReviewStatus === 'NOT_REQUIRED'
})

/** push 表单是否有效 */
const canSubmitPush = computed(() => {
  return pushForm.figmaUrl.trim().length > 0 && pushForm.designerId.length > 0
})

// ========== Status helpers ==========

/**
 * 把 pkg.status + designReviewStatus 两个字段 fuse 成一个"综合进度"标签。
 * 这是整个工作台页面唯一的状态展示入口，避免"待验收"和"设计审核通过"两套语言互相打架。
 */
interface CombinedStatus {
  label: string
  tagType: 'danger' | 'info' | 'warning' | 'success' | ''
}

function combinedStatus(pkg: {
  status: string
  designReviewStatus?: DesignReviewStatusType
}): CombinedStatus {
  const { status, designReviewStatus } = pkg

  // 优先：终态
  if (status === 'DONE') return { label: '已完成', tagType: 'success' }
  if (status === 'BLOCKED') return { label: '已阻塞', tagType: 'danger' }
  if (status === 'REWORK') return { label: '需返工', tagType: 'danger' }

  // 驳回永远优先
  if (designReviewStatus === 'REJECTED') {
    return { label: '设计已驳回', tagType: 'danger' }
  }

  // REVIEW 阶段根据 designReviewStatus 细分
  if (status === 'REVIEW') {
    if (designReviewStatus === 'PENDING_REVIEW') {
      return { label: '设计审核中', tagType: 'warning' }
    }
    if (designReviewStatus === 'APPROVED') {
      return { label: '设计已通过·待完成', tagType: 'success' }
    }
    return { label: '待验收', tagType: 'warning' }
  }

  if (status === 'IN_PROGRESS') return { label: '执行中', tagType: '' }
  if (status === 'PENDING') return { label: '待执行', tagType: 'info' }

  return { label: status, tagType: 'info' }
}

function reviewStatusLabel(s: DesignReviewStatusType): string {
  const map: Record<DesignReviewStatusType, string> = {
    NOT_REQUIRED: '未开始',
    PENDING_REVIEW: '审核中',
    APPROVED: '已通过',
    REJECTED: '已驳回',
  }
  return map[s] ?? s
}

function reviewStatusTagType(s: DesignReviewStatusType): 'danger' | 'info' | 'warning' | 'success' | '' {
  const map: Record<DesignReviewStatusType, 'danger' | 'info' | 'warning' | 'success' | ''> = {
    NOT_REQUIRED: 'info',
    PENDING_REVIEW: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
  }
  return map[s] ?? ''
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN')
}

// ========== Data loading ==========

async function loadProjects() {
  try {
    // mine=true：只显示当前用户能看到的项目（owner 或同 squad）
    const res = await listProjectsApi({ pageSize: 100, mine: true })
    if (res.data.data) {
      projects.value = res.data.data.items.map((p: { id: string; name: string }) => ({
        id: p.id, name: p.name,
      }))
      // 如果之前的 activeProjectId 已经不在可见列表里，重置它
      if (
        activeProjectId.value &&
        !projects.value.some((p) => p.id === activeProjectId.value)
      ) {
        activeProjectId.value = ''
      }
      if (projects.value.length > 0 && !activeProjectId.value) {
        activeProjectId.value = projects.value[0].id
        loadPackages()
      }
    }
  } catch { /* ignore */ }
}

async function loadPackages() {
  if (!activeProjectId.value) return
  loading.value = true
  try {
    const res = await listFeedsByProjectApi(activeProjectId.value)
    if (res.data.code === 0 && res.data.data) {
      groups.value = res.data.data
      // Auto-expand all groups
      groups.value.forEach((g) => expandedGroups.add(g.iterationId))
    }
  } finally {
    loading.value = false
  }
}

async function loadDesigners() {
  if (designers.value.length > 0) return
  designersLoading.value = true
  try {
    // 拉所有 DESIGNER 和 ADMIN 角色
    const [designerRes, adminRes] = await Promise.all([
      listUsersApi({ role: 'DESIGNER', pageSize: 100 }),
      listUsersApi({ role: 'ADMIN', pageSize: 100 }),
    ])
    const list: Array<{ id: string; name: string; role: string }> = []
    if (designerRes.data.data) {
      list.push(...designerRes.data.data.items.map((u) => ({
        id: u.id, name: u.name, role: u.role,
      })))
    }
    if (adminRes.data.data) {
      list.push(...adminRes.data.data.items.map((u) => ({
        id: u.id, name: u.name, role: u.role,
      })))
    }
    designers.value = list
  } finally {
    designersLoading.value = false
  }
}

function handleProjectChange() {
  expandedGroups.clear()
  loadPackages()
}

function toggleGroup(id: string) {
  if (expandedGroups.has(id)) {
    expandedGroups.delete(id)
  } else {
    expandedGroups.add(id)
  }
}

// ========== Rating ==========

async function handleRate(pkgId: string, type: 'up' | 'down') {
  try {
    const res = await rateFeedApi(pkgId, type)
    if (res.data.code === 0 && res.data.data) {
      for (const group of groups.value) {
        const pkg = group.packages.find((p) => p.id === pkgId)
        if (pkg) {
          pkg.thumbsUp = res.data.data.thumbsUp
          pkg.thumbsDown = res.data.data.thumbsDown
          break
        }
      }
    }
  } catch { /* handled by interceptor */ }
}

// ========== Detail ==========

async function openDetail(pkgId: string) {
  showDetail.value = true
  detailLoading.value = true
  currentPkg.value = null
  // 定位 pkg 所属 group，记录 squadId 供 canWriteFeed 判断"同组放行"
  currentDrawerSquadId.value = null
  for (const g of groups.value) {
    if (g.packages.some((p) => p.id === pkgId)) {
      currentDrawerSquadId.value = g.squadId
      break
    }
  }
  try {
    const res = await getFeedDetailApi(pkgId)
    if (res.data.code === 0 && res.data.data) {
      currentPkg.value = res.data.data
      designOutputRequiredLocal.value = res.data.data.designOutputRequired
      // 预填 push 表单
      pushForm.figmaUrl = ''
      pushForm.designerId = res.data.data.designReviewerId ?? ''
      // 拉设计师列表（如果还没拉过）
      loadDesigners()
    }
  } finally {
    detailLoading.value = false
  }
}

async function refreshDetail() {
  if (!currentPkg.value) return
  const res = await getFeedDetailApi(currentPkg.value.id)
  if (res.data.code === 0 && res.data.data) {
    currentPkg.value = res.data.data
    designOutputRequiredLocal.value = res.data.data.designOutputRequired
  }
}

async function handleAssemble() {
  if (!currentPkg.value) return
  try {
    const res = await assembleFeedApi(currentPkg.value.id)
    if (res.data.code === 0 && res.data.data) {
      await navigator.clipboard.writeText(res.data.data.assembledContent)
      ElMessage.success('已组装并复制到剪贴板，可直接粘贴到 Claude / Codex')
    }
  } catch {
    ElMessage.error('组装失败')
  }
}

async function handleCopy(pkgId: string) {
  try {
    const res = await assembleFeedApi(pkgId)
    if (res.data.code === 0 && res.data.data) {
      await navigator.clipboard.writeText(res.data.data.assembledContent)
      ElMessage.success('已复制到剪贴板')
    }
  } catch {
    ElMessage.error('复制失败')
  }
}

// ========== 设计审核 actions ==========

async function handleToggleDesignOutput(val: boolean | string | number) {
  if (!currentPkg.value) return
  const boolVal = Boolean(val)
  toggleLoading.value = true
  try {
    const res = await updateFeedApi(currentPkg.value.id, { designOutputRequired: boolVal })
    if (res.data.code === 0) {
      ElMessage.success(boolVal ? '已标记为需要产出设计图' : '已关闭设计图要求')
      await refreshDetail()
    } else {
      designOutputRequiredLocal.value = currentPkg.value.designOutputRequired
    }
  } catch {
    designOutputRequiredLocal.value = currentPkg.value?.designOutputRequired ?? false
  } finally {
    toggleLoading.value = false
  }
}

async function handlePushToDesign() {
  if (!currentPkg.value || !canSubmitPush.value) return
  pushLoading.value = true
  try {
    const res = await pushFeedToDesignApi(currentPkg.value.id, {
      figmaUrl: pushForm.figmaUrl.trim(),
      designerId: pushForm.designerId,
    })
    if (res.data.code === 0) {
      ElMessage.success('已推给设计师审核')
      await refreshDetail()
      await loadPackages() // 刷新列表状态
    }
  } catch {
    /* handled by interceptor */
  } finally {
    pushLoading.value = false
  }
}

async function handleApprove() {
  if (!currentPkg.value) return
  try {
    await ElMessageBox.confirm('确认审核通过？', '确认', {
      type: 'success',
      confirmButtonText: '通过',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  approveLoading.value = true
  try {
    const res = await approveDesignApi(currentPkg.value.id)
    if (res.data.code === 0) {
      ElMessage.success('审核通过')
      await refreshDetail()
      await loadPackages()
    }
  } catch {
    /* handled by interceptor */
  } finally {
    approveLoading.value = false
  }
}

function openRejectDialog() {
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

async function handleReject() {
  if (!currentPkg.value || !rejectReason.value.trim()) return
  rejectLoading.value = true
  try {
    const res = await rejectDesignApi(currentPkg.value.id, {
      reason: rejectReason.value.trim(),
    })
    if (res.data.code === 0) {
      ElMessage.success('已驳回')
      rejectDialogVisible.value = false
      await refreshDetail()
      await loadPackages()
    }
  } catch {
    /* handled by interceptor */
  } finally {
    rejectLoading.value = false
  }
}

// ========== Release / MarkDone（一键完成） ==========

const claimLoading = ref(false)
const releaseLoading = ref(false)

async function handleRelease() {
  if (!currentPkg.value) return
  try {
    await ElMessageBox.confirm(
      '转交后这个包会变成"未领取"，其他组员可以接手。确认？',
      '转交',
      {
        type: 'warning',
        confirmButtonText: '转交',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  releaseLoading.value = true
  try {
    const res = await releaseFeedApi(currentPkg.value.id)
    if (res.data.code === 0) {
      ElMessage.success('已转交')
      await refreshDetail()
      await loadPackages()
    }
  } catch {
    /* handled by interceptor */
  } finally {
    releaseLoading.value = false
  }
}

/**
 * 一键完成：点一次直接推到 DONE。
 *
 * 调用 POST /feeds/:id/complete，后端负责：
 *   1. 如果未领取则自动把当前用户设为 assignee
 *   2. 跳过所有中间状态直接推到 DONE
 *   3. 解锁下游依赖 + 触发 iteration 自动流转
 *
 * 前端只发一次请求，不会弹多条错误消息。
 */
async function handleMarkDone() {
  if (!currentPkg.value) return
  const pkgId = currentPkg.value.id
  const needClaim = !currentPkg.value.assigneeId

  try {
    await ElMessageBox.confirm(
      needClaim
        ? '这个包还没有人领取。确认后会把它指派给你，并直接标记完成。'
        : '确认把这一轮标记为「已完成」？',
      needClaim ? '领取并完成' : '确认完成',
      {
        type: 'info',
        confirmButtonText: '确认',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  statusLoading.value = true
  try {
    const res = await completeFeedApi(pkgId)
    if (res.data.code === 0) {
      ElMessage.success(res.data.data?.alreadyDone ? '已是完成状态' : '已完成')
      await refreshDetail()
      await loadPackages()
    }
  } catch {
    /* handled by interceptor */
  } finally {
    statusLoading.value = false
  }
}

// ========== Init ==========

onMounted(async () => {
  await loadProjects()
  // Req 4.2: 支持 ?openPkg=xxx URL 参数自动打开 drawer（从 my-tasks 跳转过来审核）
  const openPkgId = route.query.openPkg as string | undefined
  if (openPkgId) {
    openDetail(openPkgId)
    // 清除 query 避免刷新重复触发
    router.replace({ query: {} })
  }
})

// 如果 URL 参数变化也触发
watch(() => route.query.openPkg, (val) => {
  if (val && typeof val === 'string') {
    openDetail(val)
    router.replace({ query: {} })
  }
})
</script>

<style scoped>
.workbench-page {
  padding: 0;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.page-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 4px 0 0;
}

/* ========== Task Groups ========== */

.pkg-groups {
  min-height: 200px;
}

.task-group {
  margin-bottom: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fafafa;
  cursor: pointer;
  user-select: none;
}

.group-header:hover {
  background: #f0f2f5;
}

.group-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collapse-icon {
  transition: transform 0.2s;
  font-size: 14px;
  color: #909399;
}

.collapse-icon.expanded {
  transform: rotate(90deg);
}

.group-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.group-count {
  font-size: 12px;
  color: #909399;
}

.group-body {
  padding: 8px 16px 12px;
}

/* ========== Package Card ========== */

.pkg-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.pkg-card:hover {
  border-color: #409eff;
  background: #f0f7ff;
}

/* Req 4.2: 被驳回的卡片 — 用左边框把这张卡从列表里突出出来 */
.pkg-card.is-rejected {
  border-left: 4px solid #f56c6c;
  background: #fef6f6;
}

.pkg-card.is-rejected:hover {
  background: #fde8e8;
  border-color: #f56c6c;
}

/* Req 4.2: 状态过滤条 */
.status-filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0 12px;
  flex-wrap: wrap;

  :deep(.el-radio-button) {
    position: relative;
  }

  :deep(.el-radio-button__inner) {
    min-width: 72px;
    text-align: center;
  }
}

.ownership-filter {
  margin-left: auto;
}

.filter-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: 1;
}

.mine-chip {
  margin-left: 8px;
}

.pkg-assignee {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #606266;
}

.primary-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 12px 0;
}

.pkg-card:last-child {
  margin-bottom: 0;
}

.round-badge {
  flex-shrink: 0;
  min-width: 54px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #409eff, #337ecc);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.25);
}

.pkg-card-main {
  flex: 1;
  min-width: 0;
}

.pkg-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pkg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pkg-files, .pkg-time {
  font-size: 12px;
  color: #909399;
}

.pkg-card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* ========== Detail ========== */

.detail-panel {
  min-height: 200px;
}

.detail-info {
  margin-bottom: 20px;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ========== Design Review Section ========== */

.review-section {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
}

.review-section h4 {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 12px;
}

.review-toggle {
  margin-bottom: 12px;
}

.toggle-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}

.review-form,
.review-pending,
.review-approved,
.review-rejected {
  margin-top: 12px;
}

.review-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.review-figma-box {
  margin: 12px 0;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.figma-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.review-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

/* ========== Files ========== */

.file-block {
  margin-bottom: 12px;
}

.file-name {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 4px;
}

.file-content {
  background: #1e1e2e;
  color: #cdd6f4;
  border-radius: 6px;
  padding: 14px;
  font-size: 12px;
  line-height: 1.5;
  font-family: 'Menlo', 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow: auto;
}

.detail-actions {
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

/* ========== Collapse animation ========== */

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
