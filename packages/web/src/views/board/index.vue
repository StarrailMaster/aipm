<template>
  <div class="board-page">
    <!-- Top toolbar -->
    <div class="board-toolbar">
      <div class="toolbar-left">
        <el-button text :icon="ArrowLeft" @click="router.push('/tasks')">返回任务列表</el-button>
        <el-divider direction="vertical" />
        <h3 v-if="boardStore.currentBoard" class="board-title">{{ boardStore.currentBoard.name }}</h3>

        <template v-if="boardStore.currentBoard">
          <el-divider direction="vertical" />
          <el-button :icon="EditPen" @click="addTextItem">文本</el-button>
          <el-button :icon="Memo" @click="addStickyItem">便利贴</el-button>
          <el-button
            type="primary"
            :icon="Plus"
            plain
            @click="showNewPromptDialog = true"
          >
            新提示词
          </el-button>
          <el-divider direction="vertical" />

          <!-- 推进按钮带前置检查。
               U-1 修复：
               1. disabled button 不触发 mouse events → tooltip 不显示；外包 span 让 tooltip 能触发
               2. 按钮名称改为"重新拆解工作台包"，更贴近实际语义（会清空已有包） -->
          <el-tooltip
            :content="advanceBlockReason ?? '清空现有工作台包并按白板 SOP 重新 agent 拆解'"
            placement="bottom"
            effect="dark"
          >
            <span class="advance-btn-wrapper">
              <el-button
                type="primary"
                :icon="MagicStick"
                :loading="advancing"
                :disabled="!!advanceBlockReason"
                @click="handleAdvance"
              >
                {{ advancing ? '拆解中…' : '重新拆解工作台包' }}
              </el-button>
            </span>
          </el-tooltip>
        </template>
      </div>

      <div class="toolbar-right">
        <el-tooltip
          v-if="boardStore.wsConnected && presenceTooltip"
          :content="presenceTooltip"
          placement="bottom"
          effect="dark"
        >
          <div class="presence-indicator">
            <span class="ws-dot connected" />
            <span class="presence-text">协同中</span>
            <span class="presence-count">{{ presenceCount }} 人</span>
          </div>
        </el-tooltip>
        <div v-else-if="boardStore.wsConnected" class="presence-indicator">
          <span class="ws-dot connected" />
          <span class="presence-text">协同中</span>
          <span class="presence-count">{{ presenceCount }} 人</span>
        </div>
        <div v-else-if="boardStore.currentBoard" class="presence-indicator">
          <span class="ws-dot disconnected" />
          <span class="presence-text">离线</span>
        </div>
      </div>
    </div>

    <!-- Layer tabs -->
    <div v-if="boardStore.currentBoard" class="layer-tabs-bar">
      <el-tabs v-model="activeLayer" type="card" class="layer-tabs">
        <el-tab-pane
          v-for="layer in LAYER_ORDER"
          :key="layer"
          :name="layer"
        >
          <template #label>
            <div class="layer-tab-label" :class="{ 'has-incomplete': layerStats[layer].incomplete > 0 }">
              <span class="layer-name">{{ LAYER_LABELS[layer] }}</span>
              <el-tooltip
                :content="layerAssigneeText(layer)"
                placement="top"
              >
                <span class="layer-owner-avatar" :class="{ 'no-owner': !getLayerOwner(layer) }">
                  <el-icon v-if="!getLayerOwner(layer)" :size="12"><User /></el-icon>
                  <template v-else>{{ getLayerOwner(layer)?.name.charAt(0) }}</template>
                </span>
              </el-tooltip>
              <el-tag
                v-if="layerStats[layer].total > 0"
                :type="layerStats[layer].incomplete > 0 ? 'warning' : 'success'"
                size="small"
                effect="plain"
              >
                {{ layerStats[layer].completed }} / {{ layerStats[layer].total }}
              </el-tag>
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>

      <!-- Layer header actions (right side) -->
      <div class="layer-header-actions">
        <el-tooltip content="指派该类型的负责人" placement="top">
          <el-button
            :disabled="!canManageLayerOwner"
            :icon="UserFilled"
            size="small"
            @click="openLayerOwnerPicker"
          >
            {{ activeLayerOwner?.name ?? '指派负责人' }}
          </el-button>
        </el-tooltip>
        <el-button
          :icon="Refresh"
          size="small"
          text
          @click="reloadBoard"
        />
      </div>
    </div>

    <!-- Board content -->
    <div
      v-if="boardStore.currentBoard"
      v-loading="boardStore.detailLoading"
      class="board-content"
    >
      <BoardCanvas
        :selections="activeLayerSelections"
        :remote-cursors="boardStore.cursors"
        @remove-selection="handleRemoveSelection"
        @move-selection="handleMoveSelection"
        @update-content="handleUpdateContent"
        @update-color="handleUpdateColor"
        @cursor-move="handleCursorMove"
        @open-card-detail="openCardDetail"
      />
      <div class="board-sidebar">
        <PromptSelector
          @select-prompt="handlePromptSelect"
          @select-sop-doc="handleSopDocSelect"
        />
      </div>
    </div>

    <div v-else class="board-empty">
      <el-empty description="加载中..." />
    </div>

    <!-- ========== Layer owner picker ========== -->
    <el-dialog
      v-model="layerOwnerPickerVisible"
      title="指派 layer 负责人"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item :label="`${LAYER_LABELS[activeLayer]} 的负责人`">
          <el-select
            v-model="layerOwnerPickerUserId"
            placeholder="选择一位团队成员（清空 = 撤销指派）"
            filterable
            clearable
            style="width: 100%"
            :loading="candidatesLoading"
          >
            <el-option
              v-for="u in candidatePool"
              :key="u.id"
              :label="u.name"
              :value="u.id"
            >
              <span>{{ u.name }}</span>
              <el-tag size="small" style="margin-left: 8px" :type="roleTagType(u.role)">
                {{ u.role }}
              </el-tag>
            </el-option>
          </el-select>
          <div class="form-hint">
            <el-icon><InfoFilled /></el-icon>
            改后所有"继承模式"的卡片会自动更新为新负责人，完成状态会被重置
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="layerOwnerPickerVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="assigningLayer"
          @click="handleLayerOwnerSave"
        >
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- ========== Card detail drawer ========== -->
    <el-drawer
      v-model="cardDetailVisible"
      :title="cardDetailTitle"
      size="560px"
      direction="rtl"
      :destroy-on-close="true"
    >
      <template v-if="currentCard">
        <el-tabs v-model="cardDrawerTab" class="card-drawer-tabs">
          <!-- Tab 1: 基本信息 -->
          <el-tab-pane name="info">
            <template #label>
              <span class="drawer-tab-label">
                <el-icon><InfoFilled /></el-icon>
                基本信息
              </span>
            </template>
            <div class="card-detail-section">
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="类型">
                  {{ cardTypeLabel(currentCard.type) }}
                </el-descriptions-item>
                <el-descriptions-item label="所属 tab">
                  {{ currentCard.layer ? LAYER_LABELS[currentCard.layer] : '（未分类）' }}
                </el-descriptions-item>
                <el-descriptions-item label="指派人">
                  <span v-if="currentCard.assignee">{{ currentCard.assignee.name }}</span>
                  <span v-else class="text-muted">未指派</span>
                  <el-tag
                    v-if="currentCard.assigneeInherit"
                    type="info"
                    size="small"
                    effect="plain"
                    style="margin-left: 6px"
                  >
                    继承自 layer
                  </el-tag>
                  <el-tag
                    v-else
                    type="warning"
                    size="small"
                    effect="plain"
                    style="margin-left: 6px"
                  >
                    手动指派
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="完成状态">
                  <el-tag
                    v-if="currentCard.completedAt"
                    type="success"
                    size="small"
                  >
                    <el-icon><Check /></el-icon>
                    已完成
                  </el-tag>
                  <el-tag
                    v-else
                    type="info"
                    size="small"
                    effect="plain"
                  >
                    未完成
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item
                  v-if="currentCard.type === 'prompt'"
                  label="提示词来源"
                >
                  <template v-if="currentCard.promptId && currentCard.prompt">
                    <el-link
                      type="primary"
                      @click="router.push(`/prompts/${currentCard.promptId}`)"
                    >
                      {{ currentCard.prompt.name }}
                    </el-link>
                    <el-tag
                      v-if="currentCard.hasOverride"
                      type="warning"
                      size="small"
                      effect="plain"
                      style="margin-left: 6px"
                    >
                      已在本白板本地修改
                    </el-tag>
                  </template>
                  <template v-else>
                    <el-tag type="info" size="small" effect="plain">
                      本地自建（未进入公共库）
                    </el-tag>
                  </template>
                </el-descriptions-item>
              </el-descriptions>
            </div>

            <!-- Complete / Reopen -->
            <div class="card-detail-section">
              <h4>完成状态</h4>
              <el-button
                v-if="!currentCard.completedAt && canOperateCard"
                type="success"
                :loading="completingCard"
                @click="handleCompleteCard"
              >
                <el-icon><Check /></el-icon>
                标记完成
              </el-button>
              <el-button
                v-else-if="currentCard.completedAt && canOperateCard"
                type="warning"
                :loading="completingCard"
                @click="handleReopenCard"
              >
                <el-icon><RefreshLeft /></el-icon>
                撤回完成
              </el-button>
              <div v-else-if="!currentCard.assigneeId" class="hint">
                这张卡片尚未指派，无法标记完成
              </div>
              <div v-else class="hint">
                只有指派人（{{ currentCard.assignee?.name }}）才能操作完成状态
              </div>
            </div>

            <!-- 手动改指派人 -->
            <div class="card-detail-section">
              <h4>改指派人</h4>
              <el-select
                v-model="cardAssigneePickerValue"
                placeholder="选择新的指派人"
                filterable
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="u in candidatePool"
                  :key="u.id"
                  :label="u.name"
                  :value="u.id"
                />
              </el-select>
              <div class="detail-actions">
                <el-button
                  type="primary"
                  size="small"
                  :loading="updatingCard"
                  :disabled="cardAssigneePickerValue === currentCard.assigneeId"
                  @click="handleCardAssigneeSave"
                >
                  保存手动指派
                </el-button>
                <el-button
                  v-if="!currentCard.assigneeInherit"
                  size="small"
                  :loading="updatingCard"
                  @click="handleRestoreInherit"
                >
                  <el-icon><RefreshLeft /></el-icon>
                  恢复继承
                </el-button>
              </div>
            </div>

            <!-- 跨 tab 移动 -->
            <div class="card-detail-section" v-if="currentCard.type !== 'sop_doc'">
              <h4>移动到其他 tab</h4>
              <el-select
                v-model="cardLayerPickerValue"
                style="width: 100%"
              >
                <el-option
                  v-for="layer in LAYER_ORDER"
                  :key="layer"
                  :label="LAYER_LABELS[layer]"
                  :value="layer"
                />
              </el-select>
              <div class="detail-actions">
                <el-button
                  type="primary"
                  size="small"
                  :loading="updatingCard"
                  :disabled="cardLayerPickerValue === currentCard.layer"
                  @click="handleCardLayerSave"
                >
                  移动
                </el-button>
              </div>
            </div>
            <div class="card-detail-section" v-else>
              <div class="hint">
                <el-icon><InfoFilled /></el-icon>
                SOP 文档卡片的 tab 由文档本身的 layer 决定，不可手动修改
              </div>
            </div>
          </el-tab-pane>

          <!-- Tab 2: 编辑提示词（Req 1，仅 type=prompt 显示） -->
          <el-tab-pane v-if="currentCard.type === 'prompt'" name="edit">
            <template #label>
              <span class="drawer-tab-label">
                <el-icon><EditPen /></el-icon>
                编辑提示词
                <el-badge
                  v-if="currentCard.hasOverride"
                  is-dot
                  class="override-dot"
                />
              </span>
            </template>
            <div class="card-detail-section">
              <div class="override-tip">
                <el-icon><InfoFilled /></el-icon>
                <span>
                  {{ currentCard.promptId ? '修改仅对当前白板这张卡片生效，不会影响公共提示词库。完成后可以一键"保存到公共库"。' : '本地自建提示词卡片。完成后可以一键"保存到公共库"。' }}
                </span>
              </div>
            </div>

            <div class="card-detail-section">
              <h4>标题</h4>
              <el-input
                v-model="editForm.title"
                placeholder="请输入提示词标题"
                maxlength="120"
                show-word-limit
              />
            </div>

            <div class="card-detail-section">
              <h4>内容</h4>
              <el-input
                v-model="editForm.content"
                type="textarea"
                :rows="12"
                placeholder="请输入提示词内容（Markdown 支持）"
              />
            </div>

            <div class="card-detail-section">
              <h4>标签</h4>
              <div class="tag-editor">
                <el-tag
                  v-for="(tag, idx) in editForm.tags"
                  :key="`${tag}-${idx}`"
                  closable
                  size="small"
                  style="margin: 0 6px 6px 0"
                  @close="removeEditTag(idx)"
                >
                  {{ tag }}
                </el-tag>
                <el-input
                  v-if="editTagInputVisible"
                  ref="editTagInputRef"
                  v-model="editTagInputValue"
                  size="small"
                  style="width: 100px"
                  @keyup.enter="confirmEditTag"
                  @blur="confirmEditTag"
                />
                <el-button
                  v-else
                  size="small"
                  @click="showEditTagInput"
                >
                  + 添加标签
                </el-button>
              </div>
            </div>

            <div class="card-detail-section">
              <el-button
                type="primary"
                :loading="savingOverride"
                :disabled="!editFormDirty"
                @click="handleSaveOverride"
              >
                <el-icon><Check /></el-icon>
                保存本地修改
              </el-button>
              <el-button
                v-if="currentCard.hasOverride && currentCard.promptId"
                :loading="savingOverride"
                @click="handleResetOverride"
              >
                <el-icon><RefreshLeft /></el-icon>
                恢复公共库版本
              </el-button>
              <el-button
                type="success"
                :disabled="!canFork"
                @click="openForkDialog"
              >
                <el-icon><DocumentCopy /></el-icon>
                保存到公共库
              </el-button>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <!-- ========== Req 1: 新建提示词卡对话框 ========== -->
    <el-dialog
      v-model="showNewPromptDialog"
      title="新建提示词卡（本地）"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-alert
        :closable="false"
        type="info"
        show-icon
        style="margin-bottom: 16px"
      >
        新建卡片只会保存在当前白板。完成后可以随时点卡片里的"保存到公共库"推送到公共提示词库。
      </el-alert>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="标题" required>
          <el-input
            v-model="newPromptForm.title"
            placeholder="请输入卡片标题"
            maxlength="120"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input
            v-model="newPromptForm.content"
            type="textarea"
            :rows="10"
            placeholder="请输入提示词内容"
          />
        </el-form-item>
        <el-form-item label="标签">
          <div class="tag-editor">
            <el-tag
              v-for="(tag, idx) in newPromptForm.tags"
              :key="`${tag}-${idx}`"
              closable
              size="small"
              style="margin: 0 6px 6px 0"
              @close="newPromptForm.tags.splice(idx, 1)"
            >
              {{ tag }}
            </el-tag>
            <el-input
              v-if="newPromptTagInputVisible"
              ref="newPromptTagInputRef"
              v-model="newPromptTagInputValue"
              size="small"
              style="width: 100px"
              @keyup.enter="confirmNewPromptTag"
              @blur="confirmNewPromptTag"
            />
            <el-button
              v-else
              size="small"
              @click="showNewPromptTagInput"
            >
              + 添加标签
            </el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNewPromptDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creatingNewPrompt"
          :disabled="!newPromptForm.title.trim() || !newPromptForm.content.trim()"
          @click="handleCreateNewPromptCard"
        >
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- ========== Req 1: Fork 到公共库对话框 ========== -->
    <el-dialog
      v-model="showForkDialog"
      title="保存到公共提示词库"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-alert
        :closable="false"
        type="warning"
        show-icon
        style="margin-bottom: 16px"
      >
        保存后会在公共提示词库创建一条新记录，并把本卡片关联到新记录。后续本卡片的修改不再视为"本地 override"。
      </el-alert>
      <el-form label-position="top">
        <el-form-item label="名称" required>
          <el-input
            v-model="forkForm.name"
            placeholder="提示词名称"
            maxlength="120"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="可见性">
          <el-radio-group v-model="forkForm.visibility">
            <el-radio value="private">私有</el-radio>
            <el-radio value="team">团队可见</el-radio>
            <el-radio value="public">全员可见</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="forkForm.category" placeholder="选择分类">
            <el-option label="设计" value="DESIGN" />
            <el-option label="前端" value="FRONTEND" />
            <el-option label="后端" value="BACKEND" />
            <el-option label="测试" value="TESTING" />
            <el-option label="集成" value="INTEGRATION" />
            <el-option label="优化" value="OPTIMIZATION" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForkDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="forking"
          :disabled="!forkForm.name.trim()"
          @click="handleForkSubmit"
        >
          保存到公共库
        </el-button>
      </template>
    </el-dialog>

    <!-- Advancing overlay -->
    <el-dialog
      v-model="advancing"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      title="正在推进"
      width="480px"
      align-center
    >
      <div class="advancing-panel">
        <el-icon class="spinner" :size="40" color="#409eff"><Loading /></el-icon>
        <p class="advancing-title">Agent 正在分析白板 SOP 文档，决定每一轮用哪几份…</p>
        <p class="advancing-sub">
          每一轮会生成一个文件夹，里面放原始 SOP 文件（内容不变）+ 一个入口 Prompt。
          复制整个文件夹给 Claude/Codex 即可执行一轮。
        </p>
        <p class="advancing-hint">预计 30 秒～1 分钟，请勿关闭页面。</p>
      </div>
    </el-dialog>

    <!-- Advance result dialog -->
    <el-dialog v-model="showAdvanceResult" title="推进完成" width="640px">
      <div v-if="advanceData?.agentResult" class="advance-info">
        <el-alert
          type="success"
          :closable="false"
          show-icon
          :title="`已生成 ${advanceData.agentResult.generatedCount} 轮工作台包（共分配 ${advanceData.agentResult.totalDocuments - advanceData.agentResult.unassignedDocumentCount}/${advanceData.agentResult.totalDocuments} 份 SOP 文档）`"
        />

        <div
          v-if="advanceData.agentResult.resetDeletedCount > 0"
          class="reset-info"
        >
          <el-icon color="#e6a23c"><Delete /></el-icon>
          已覆盖：清空了 {{ advanceData.agentResult.resetDeletedCount }} 个旧工作台包，本次从第 1 轮开始重新生成
        </div>

        <div v-if="advanceData.agentResult.reasoning" class="reasoning-block">
          <div class="section-title">Agent 的分组思路</div>
          <p class="reasoning-text">{{ advanceData.agentResult.reasoning }}</p>
        </div>

        <div class="rounds-block">
          <div class="section-title">推进出的执行轮次</div>
          <div
            v-for="r in advanceData.agentResult.rounds"
            :key="r.id"
            class="round-row"
          >
            <div class="round-num">第 {{ r.sortOrder }} 轮</div>
            <div class="round-title-col">
              <div class="round-title">{{ r.title }}</div>
              <el-tag :type="r.phase === 'DESIGN' ? 'warning' : ''" size="small" effect="plain">
                {{ r.phase === 'DESIGN' ? '设计' : '实施' }}
              </el-tag>
            </div>
          </div>
        </div>

        <div v-if="advanceData.agentResult.failures.length > 0" class="failures-block">
          <div class="section-title error">部分轮次失败（{{ advanceData.agentResult.failedCount }}）</div>
          <div
            v-for="f in advanceData.agentResult.failures"
            :key="f.roundNumber"
            class="failure-row"
          >
            <span class="failure-num">第 {{ f.roundNumber }} 轮</span>
            <span class="failure-title">{{ f.title }}</span>
            <span class="failure-error">{{ f.error }}</span>
          </div>
        </div>
      </div>
      <div v-else class="advance-info">
        <p style="color: #909399">未返回推进结果</p>
      </div>
      <template #footer>
        <el-button @click="showAdvanceResult = false">留在白板</el-button>
        <el-button type="primary" @click="goToWorkbench">
          <el-icon><DocumentCopy /></el-icon>
          前往工作台页面，一轮一轮复制
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, EditPen, Memo, MagicStick, Loading, DocumentCopy, Delete, Plus,
  User, UserFilled, Refresh, InfoFilled, Check, RefreshLeft,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type InputInstance } from 'element-plus'
import { useBoardStore } from '@/stores/board'
import { useAuthStore } from '@/stores/auth'
import { advanceIterationApi, getIterationApi } from '@/api/iteration'
import type { AdvanceResult } from '@/api/iteration'
import BoardCanvas from '@/components/board/BoardCanvas.vue'
import PromptSelector from '@/components/board/PromptSelector.vue'
import type { PromptItem } from '@/api/prompt'
import type { SopDocumentItem } from '@/api/sop'
import {
  LAYER_ORDER, LAYER_LABELS,
  type SopLayerType, type BoardSelection, type LayerAssignmentRow,
} from '@/api/board'
import { listUsersApi } from '@/api/org'
import { listSquadsApi } from '@/api/squad'

const route = useRoute()
const router = useRouter()
const boardStore = useBoardStore()
const authStore = useAuthStore()

// ========== State ==========
const advancing = ref(false)
const showAdvanceResult = ref(false)
const advanceData = ref<AdvanceResult | null>(null)
const iterationId = ref('')
const squadId = ref('')

let nextPlacementX = 40
let nextPlacementY = 40

/**
 * 在线协同人数 —— 基于后端 board_presence 广播的 presenceMembers
 * 兜底：如果还没收到首次 presence（极少发生），至少显示自己（1 人）
 */
const presenceCount = computed(() => {
  const n = boardStore.presenceMembers.length
  return n > 0 ? n : 1
})

const presenceTooltip = computed(() => {
  const members = boardStore.presenceMembers
  if (members.length === 0) return ''
  return members.map((m) => m.name).join('、')
})

// ========== Active layer tab ==========
const activeLayer = ref<SopLayerType>('PRODUCT_REQ')

// ========== Layer 统计（每个 layer 的完成度）==========
interface LayerStat {
  total: number       // 该 layer 下的卡片总数
  completed: number   // 已完成卡片数
  incomplete: number  // 未完成且有指派人的卡片数（gate 检查口径）
  unassigned: number  // 无指派人
}

const layerStats = computed<Record<SopLayerType, LayerStat>>(() => {
  const result = {} as Record<SopLayerType, LayerStat>
  for (const l of LAYER_ORDER) {
    result[l] = { total: 0, completed: 0, incomplete: 0, unassigned: 0 }
  }
  const sels = boardStore.currentBoard?.selections ?? []
  for (const sel of sels) {
    if (!sel.layer) continue
    const stat = result[sel.layer]
    if (!stat) continue
    stat.total++
    if (sel.completedAt) stat.completed++
    else if (sel.assigneeId) stat.incomplete++
    else stat.unassigned++
  }
  return result
})

/** 仅显示当前 activeLayer 的 selections */
const activeLayerSelections = computed<BoardSelection[]>(() => {
  const sels = boardStore.currentBoard?.selections ?? []
  return sels.filter((s) => s.layer === activeLayer.value)
})

// ========== Layer 负责人相关 ==========

function getLayerAssignment(layer: SopLayerType): LayerAssignmentRow | undefined {
  return boardStore.currentBoard?.layerAssignments.find((la) => la.layer === layer)
}

function getLayerOwner(layer: SopLayerType) {
  return getLayerAssignment(layer)?.assignee ?? null
}

const activeLayerOwner = computed(() => getLayerOwner(activeLayer.value))

function layerAssigneeText(layer: SopLayerType): string {
  const owner = getLayerOwner(layer)
  if (!owner) return '尚未指派负责人'
  return `${LAYER_LABELS[layer]} 负责人：${owner.name}`
}

function roleTagType(role: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    ADMIN: 'danger',
    ARCHITECT: 'warning',
    ENGINEER: '',
    DESIGNER: 'success',
  }
  return map[role] ?? 'info'
}

function cardTypeLabel(type: string): string {
  const map: Record<string, string> = {
    prompt: '提示词卡片',
    sop_doc: 'SOP 卡片',
    text: '文本卡片',
    sticky: '便利贴',
  }
  return map[type] ?? type
}

// ========== Permissions ==========

/** 当前用户是否是组长（可管理 layer 负责人） */
const canManageLayerOwner = computed(() => {
  const role = authStore.user?.role
  return role === 'ARCHITECT' || role === 'ADMIN'
})

/** 当前打开的卡片，当前用户是否能操作 */
const canOperateCard = computed(() => {
  if (!currentCard.value) return false
  if (authStore.user?.role === 'ADMIN') return true
  return currentCard.value.assigneeId === authStore.user?.id
})

// ========== Advance gate 前置检查 ==========

/**
 * 推进按钮前置检查：扫描所有 8 个 layer，找出有未完成的指派卡片。
 * 返回 null 表示可以推进；返回字符串表示被 gate 拦截，内容是提示语。
 */
const advanceBlockReason = computed<string | null>(() => {
  const problems: string[] = []
  for (const layer of LAYER_ORDER) {
    const stat = layerStats.value[layer]
    if (stat.incomplete > 0) {
      problems.push(`${LAYER_LABELS[layer]}（${stat.incomplete} 张未完成）`)
    }
  }
  if (problems.length === 0) {
    // 再检查是否至少有一份 SOP 文档（后端 gate 也会查，这里给个前端提示）
    const hasSop = (boardStore.currentBoard?.selections ?? []).some((s) => s.type === 'sop_doc')
    if (!hasSop) return '白板上还没有 SOP 文档，请先在右侧添加'
    return null
  }
  return `有未完成的卡片：${problems.join('；')}`
})

// ========== Layer owner picker state ==========

const layerOwnerPickerVisible = ref(false)
const layerOwnerPickerUserId = ref<string>('')
const assigningLayer = ref(false)

interface Candidate {
  id: string
  name: string
  role: string
}

const candidatePool = ref<Candidate[]>([])
const candidatesLoading = ref(false)

async function loadCandidates() {
  if (candidatePool.value.length > 0) return
  candidatesLoading.value = true
  try {
    // 候选池 = (任务所在 squad 的所有成员) + 所有 DESIGNER + 所有 ADMIN
    const queries: Array<Promise<{ data: { data: { items: Candidate[] } | null } }>> = [
      listUsersApi({ role: 'DESIGNER', pageSize: 100 }) as unknown as Promise<{ data: { data: { items: Candidate[] } | null } }>,
      listUsersApi({ role: 'ADMIN', pageSize: 100 }) as unknown as Promise<{ data: { data: { items: Candidate[] } | null } }>,
    ]
    if (squadId.value) {
      queries.push(listUsersApi({ squadId: squadId.value, pageSize: 100 }) as unknown as Promise<{ data: { data: { items: Candidate[] } | null } }>)
    }
    const results = await Promise.all(queries)

    const seen = new Set<string>()
    const list: Candidate[] = []
    for (const res of results) {
      const items = res.data?.data?.items ?? []
      for (const u of items) {
        if (!seen.has(u.id)) {
          seen.add(u.id)
          list.push({ id: u.id, name: u.name, role: u.role })
        }
      }
    }
    candidatePool.value = list
  } catch {
    // ignore
  } finally {
    candidatesLoading.value = false
  }
}

function openLayerOwnerPicker() {
  if (!canManageLayerOwner.value) {
    ElMessage.warning('只有需求架构师 / 管理员可以指派 layer 负责人')
    return
  }
  layerOwnerPickerUserId.value = activeLayerOwner.value?.id ?? ''
  layerOwnerPickerVisible.value = true
  loadCandidates()
}

async function handleLayerOwnerSave() {
  assigningLayer.value = true
  try {
    await boardStore.upsertLayerAssignment(
      activeLayer.value,
      layerOwnerPickerUserId.value || null,
    )
    ElMessage.success('已更新负责人')
    layerOwnerPickerVisible.value = false
  } catch {
    /* handled by interceptor */
  } finally {
    assigningLayer.value = false
  }
}

// ========== Card detail drawer ==========

const cardDetailVisible = ref(false)
const currentCard = ref<BoardSelection | null>(null)
const cardAssigneePickerValue = ref<string | null>(null)
const cardLayerPickerValue = ref<SopLayerType>('PRODUCT_REQ')
const updatingCard = ref(false)
const completingCard = ref(false)
const cardDrawerTab = ref<'info' | 'edit'>('info')

const cardDetailTitle = computed(() => {
  if (!currentCard.value) return '卡片详情'
  return cardTypeLabel(currentCard.value.type)
})

// ========== Req 1: 编辑提示词 override ==========

interface EditForm {
  title: string
  content: string
  tags: string[]
}

const editForm = ref<EditForm>({ title: '', content: '', tags: [] })
const savingOverride = ref(false)
const editTagInputVisible = ref(false)
const editTagInputValue = ref('')
const editTagInputRef = ref<InputInstance | null>(null)

/** 用当前卡片状态初始化编辑表单 */
function initEditForm(card: BoardSelection) {
  editForm.value = {
    title: card.effectiveTitle ?? '',
    content: card.effectiveContent ?? '',
    tags: [...(card.effectiveTags ?? [])],
  }
}

/** 表单是否有改动（相对于当前生效值） */
const editFormDirty = computed(() => {
  if (!currentCard.value) return false
  const card = currentCard.value
  if (editForm.value.title !== (card.effectiveTitle ?? '')) return true
  if (editForm.value.content !== (card.effectiveContent ?? '')) return true
  const a = editForm.value.tags
  const b = card.effectiveTags ?? []
  if (a.length !== b.length) return true
  return a.some((t, i) => t !== b[i])
})

const canFork = computed(() => {
  if (!currentCard.value) return false
  const card = currentCard.value
  if (card.type !== 'prompt') return false
  // 有 override 或者是自建卡（无 promptId）都可以 fork
  return card.hasOverride || (!card.promptId && !!card.promptOverrideContent)
})

function showEditTagInput() {
  editTagInputVisible.value = true
  nextTick(() => {
    editTagInputRef.value?.focus()
  })
}

function confirmEditTag() {
  const v = editTagInputValue.value.trim()
  if (v && !editForm.value.tags.includes(v)) {
    editForm.value.tags.push(v)
  }
  editTagInputValue.value = ''
  editTagInputVisible.value = false
}

function removeEditTag(idx: number) {
  editForm.value.tags.splice(idx, 1)
}

async function handleSaveOverride() {
  if (!currentCard.value) return
  savingOverride.value = true
  try {
    // 和公共库版本一致的字段改为 null（清除 override）
    const card = currentCard.value
    const pubTitle = card.prompt?.name ?? ''
    const pubContent = card.prompt?.content ?? ''
    const pubTags = card.prompt?.tags ?? []

    const payload: {
      promptOverrideTitle?: string | null
      promptOverrideContent?: string | null
      promptOverrideTags?: string[]
    } = {}

    if (!card.promptId) {
      // 自建卡：直接都存 override
      payload.promptOverrideTitle = editForm.value.title
      payload.promptOverrideContent = editForm.value.content
      payload.promptOverrideTags = editForm.value.tags
    } else {
      payload.promptOverrideTitle = editForm.value.title === pubTitle ? null : editForm.value.title
      payload.promptOverrideContent =
        editForm.value.content === pubContent ? null : editForm.value.content
      // 标签总是写，空数组也会清
      const tagsEqual =
        editForm.value.tags.length === pubTags.length &&
        editForm.value.tags.every((t, i) => t === pubTags[i])
      payload.promptOverrideTags = tagsEqual ? [] : editForm.value.tags
    }

    const updated = await boardStore.updateSelection(currentCard.value.id, payload)
    if (updated) {
      currentCard.value = updated
      initEditForm(updated)
      ElMessage.success('本地修改已保存（仅在本白板生效）')
    }
  } catch {
    /* handled */
  } finally {
    savingOverride.value = false
  }
}

async function handleResetOverride() {
  if (!currentCard.value) return
  try {
    await ElMessageBox.confirm(
      '恢复后将丢弃本卡片的所有本地修改，使用公共库最新版本。继续吗？',
      '恢复公共库版本',
      {
        type: 'warning',
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  savingOverride.value = true
  try {
    const updated = await boardStore.updateSelection(currentCard.value.id, {
      promptOverrideTitle: null,
      promptOverrideContent: null,
      promptOverrideTags: [],
    })
    if (updated) {
      currentCard.value = updated
      initEditForm(updated)
      ElMessage.success('已恢复为公共库版本')
    }
  } catch {
    /* handled */
  } finally {
    savingOverride.value = false
  }
}

// ========== Req 1: Fork 到公共库 ==========

const showForkDialog = ref(false)
const forking = ref(false)
const forkForm = ref<{
  name: string
  visibility: 'private' | 'team' | 'public'
  category: string
}>({
  name: '',
  visibility: 'private',
  category: 'FRONTEND',
})

function openForkDialog() {
  if (!currentCard.value) return
  forkForm.value = {
    name: editForm.value.title || currentCard.value.effectiveTitle || '',
    visibility: 'private',
    category: currentCard.value.prompt?.category ?? 'FRONTEND',
  }
  showForkDialog.value = true
}

async function handleForkSubmit() {
  if (!currentCard.value) return
  forking.value = true
  try {
    const result = await boardStore.forkSelectionToLibrary(currentCard.value.id, {
      name: forkForm.value.name.trim(),
      visibility: forkForm.value.visibility,
      category: forkForm.value.category,
    })
    if (result) {
      currentCard.value = result.selection
      initEditForm(result.selection)
      showForkDialog.value = false
      ElMessage.success('已保存到公共提示词库')
    }
  } catch {
    /* handled */
  } finally {
    forking.value = false
  }
}

// ========== Req 1: 新建提示词卡 ==========

const showNewPromptDialog = ref(false)
const creatingNewPrompt = ref(false)
const newPromptForm = ref<EditForm>({ title: '', content: '', tags: [] })
const newPromptTagInputVisible = ref(false)
const newPromptTagInputValue = ref('')
const newPromptTagInputRef = ref<InputInstance | null>(null)

function resetNewPromptForm() {
  newPromptForm.value = { title: '', content: '', tags: [] }
  newPromptTagInputVisible.value = false
  newPromptTagInputValue.value = ''
}

function showNewPromptTagInput() {
  newPromptTagInputVisible.value = true
  nextTick(() => {
    newPromptTagInputRef.value?.focus()
  })
}

function confirmNewPromptTag() {
  const v = newPromptTagInputValue.value.trim()
  if (v && !newPromptForm.value.tags.includes(v)) {
    newPromptForm.value.tags.push(v)
  }
  newPromptTagInputValue.value = ''
  newPromptTagInputVisible.value = false
}

async function handleCreateNewPromptCard() {
  if (!boardStore.currentBoard) return
  const title = newPromptForm.value.title.trim()
  const content = newPromptForm.value.content.trim()
  if (!title || !content) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  creatingNewPrompt.value = true
  try {
    const sel = await boardStore.addSelection({
      type: 'prompt',
      position: getNextPosition(),
      layer: activeLayer.value,
      promptOverrideTitle: title,
      promptOverrideContent: content,
      promptOverrideTags: newPromptForm.value.tags,
    })
    if (sel) {
      ElMessage.success('已创建本地提示词卡')
      showNewPromptDialog.value = false
      resetNewPromptForm()
    }
  } catch {
    /* handled */
  } finally {
    creatingNewPrompt.value = false
  }
}

watch(showNewPromptDialog, (v) => {
  if (!v) resetNewPromptForm()
})

function openCardDetail(cardId: string) {
  const card = boardStore.currentBoard?.selections.find((s) => s.id === cardId)
  if (!card) return
  currentCard.value = card
  cardAssigneePickerValue.value = card.assigneeId
  cardLayerPickerValue.value = card.layer ?? 'PRODUCT_REQ'
  cardDetailVisible.value = true
  // Req 1: 初始化编辑表单 + 默认 tab
  initEditForm(card)
  cardDrawerTab.value = card.type === 'prompt' ? 'info' : 'info'
  loadCandidates()
}

async function handleCompleteCard() {
  if (!currentCard.value) return
  completingCard.value = true
  try {
    const updated = await boardStore.completeSelection(currentCard.value.id)
    if (updated) {
      currentCard.value = updated
      ElMessage.success('已标记完成')
    }
  } catch {
    /* handled */
  } finally {
    completingCard.value = false
  }
}

async function handleReopenCard() {
  if (!currentCard.value) return
  completingCard.value = true
  try {
    const updated = await boardStore.reopenSelection(currentCard.value.id)
    if (updated) {
      currentCard.value = updated
      ElMessage.success('已撤回完成状态')
    }
  } catch {
    /* handled */
  } finally {
    completingCard.value = false
  }
}

async function handleCardAssigneeSave() {
  if (!currentCard.value) return
  updatingCard.value = true
  try {
    const updated = await boardStore.updateSelection(currentCard.value.id, {
      assigneeId: cardAssigneePickerValue.value || null,
    })
    if (updated) {
      currentCard.value = updated
      ElMessage.success('已更新指派人')
    }
  } catch {
    /* handled */
  } finally {
    updatingCard.value = false
  }
}

async function handleRestoreInherit() {
  if (!currentCard.value) return
  updatingCard.value = true
  try {
    const updated = await boardStore.updateSelection(currentCard.value.id, {
      assigneeId: null, // 后端逻辑：null = 清空手动指派 + 恢复继承
    })
    if (updated) {
      currentCard.value = updated
      cardAssigneePickerValue.value = updated.assigneeId
      ElMessage.success('已恢复继承')
    }
  } catch {
    /* handled */
  } finally {
    updatingCard.value = false
  }
}

async function handleCardLayerSave() {
  if (!currentCard.value) return
  if (cardLayerPickerValue.value === currentCard.value.layer) return
  updatingCard.value = true
  try {
    const updated = await boardStore.updateSelection(currentCard.value.id, {
      layer: cardLayerPickerValue.value,
    })
    if (updated) {
      currentCard.value = updated
      ElMessage.success(`已移动到「${LAYER_LABELS[cardLayerPickerValue.value]}」`)
      // 切换到目标 tab 方便用户看到
      activeLayer.value = cardLayerPickerValue.value
    }
  } catch {
    /* handled */
  } finally {
    updatingCard.value = false
  }
}

// ========== Lifecycle ==========

onMounted(async () => {
  const boardId = route.params.id as string
  if (!boardId) return

  await boardStore.fetchBoardDetail(boardId)
  boardStore.connectWs(boardId)

  // Find the iteration linked to this board (拿 squadId 用于候选池)
  try {
    const res = await import('@/api/request').then((m) =>
      m.default.get(`/iterations`, { params: { pageSize: 100 } }),
    )
    const data = (res.data as {
      code: number
      data: { items: Array<{ id: string; boardId: string | null; squadId: string }> } | null
    }).data
    if (data) {
      const iter = data.items.find((i) => i.boardId === boardId)
      if (iter) {
        iterationId.value = iter.id
        squadId.value = iter.squadId
      }
    }
  } catch {
    /* ignore */
  }

  if (!authStore.user) {
    await authStore.fetchUser()
  }
})

onUnmounted(() => {
  boardStore.disconnectWs()
})

// ========== Placement ==========

function getNextPosition() {
  const pos = { x: nextPlacementX, y: nextPlacementY }
  nextPlacementX += 240
  if (nextPlacementX > 900) {
    nextPlacementX = 40
    nextPlacementY += 180
  }
  return pos
}

// ========== Selection Actions ==========

async function handlePromptSelect(prompt: PromptItem) {
  if (!boardStore.currentBoard) return
  await boardStore.addSelection({
    type: 'prompt',
    promptId: prompt.id,
    position: getNextPosition(),
    layer: activeLayer.value, // 自动归入当前激活 tab
  })
}

async function handleSopDocSelect(doc: SopDocumentItem) {
  if (!boardStore.currentBoard) return
  // SOP 文档自带 layer，后端会自动从 sopDocument.layer 推断，覆盖我传的 layer
  await boardStore.addSelection({
    type: 'sop_doc',
    sopDocumentId: doc.id,
    position: getNextPosition(),
  })
  // SOP 卡片会自动跳到它所属的 tab（用户视觉可能会看到卡片进入别的 tab）
  // 如果 SOP 文档的 layer 不是当前 activeLayer，提示用户
  const docLayer = (doc as { layer?: SopLayerType }).layer
  if (docLayer && docLayer !== activeLayer.value) {
    ElMessage.info(
      `SOP 文档根据其类型自动加入「${LAYER_LABELS[docLayer]}」tab`,
    )
  }
}

async function addTextItem() {
  if (!boardStore.currentBoard) return
  await boardStore.addSelection({
    type: 'text',
    content: '',
    size: { width: 240, height: 60 },
    position: getNextPosition(),
    layer: activeLayer.value,
  })
}

async function addStickyItem() {
  if (!boardStore.currentBoard) return
  await boardStore.addSelection({
    type: 'sticky',
    content: '',
    color: '#fef3cd',
    size: { width: 200, height: 160 },
    position: getNextPosition(),
    layer: activeLayer.value,
  })
}

async function handleMoveSelection(id: string, position: { x: number; y: number }) {
  await boardStore.updateSelection(id, { position })
}

async function handleUpdateContent(id: string, content: string) {
  await boardStore.updateSelection(id, { content })
}

async function handleUpdateColor(id: string, color: string) {
  await boardStore.updateSelection(id, { color })
}

async function handleRemoveSelection(id: string) {
  try {
    await ElMessageBox.confirm('确定要从白板中移除该元素吗？', '移除', {
      type: 'warning',
      confirmButtonText: '移除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await boardStore.removeSelection(id)
}

function handleCursorMove(x: number, y: number) {
  if (!boardStore.currentBoard) return
  boardStore.sendCursorMove(boardStore.currentBoard.id, x, y)
}

async function reloadBoard() {
  if (!boardStore.currentBoard) return
  await boardStore.fetchBoardDetail(boardStore.currentBoard.id)
  ElMessage.success('已刷新')
}

// 监听 activeLayer 变化，重置下一个卡片位置
watch(activeLayer, () => {
  nextPlacementX = 40
  nextPlacementY = 40
})

// ========== Advance（推进） ==========

async function handleAdvance() {
  if (!iterationId.value) {
    ElMessage.warning('未找到关联任务，无法推进')
    return
  }
  if (advanceBlockReason.value) {
    ElMessage.warning(advanceBlockReason.value)
    return
  }

  try {
    await ElMessageBox.confirm(
      'Agent 会读取白板上所有类型的 SOP 文档清单，自动把它们分配到多轮工作台包里。\n\n注意：每次推进会先清空该任务下所有已有工作台包，再从第 1 轮开始重新生成（不保留旧的）。\n\n预计耗时 30 秒～1 分钟。',
      '推进',
      {
        type: 'warning',
        confirmButtonText: '清空并开始推进',
        cancelButtonText: '再想想',
      },
    )
  } catch {
    return
  }

  advancing.value = true
  try {
    const res = await advanceIterationApi(iterationId.value)
    if (res.data.code === 0 && res.data.data) {
      advanceData.value = res.data.data
      advancing.value = false
      showAdvanceResult.value = true
      return
    }
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '推进失败'
    ElMessage.error(msg)
  } finally {
    advancing.value = false
  }
}

function goToWorkbench() {
  showAdvanceResult.value = false
  router.push('/workbench')
}

// 避免未用警告
void getIterationApi
void listSquadsApi
</script>

<style scoped>
.board-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
}

.board-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* U-1: disabled button 不触发 mouse events → tooltip 不显示。外包 span 解决 */
.advance-btn-wrapper {
  display: inline-flex;
}

.board-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.presence-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}

.ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.ws-dot.connected {
  background: #67c23a;
}

.ws-dot.disconnected {
  background: #f56c6c;
}

.presence-count {
  color: #606266;
}

/* ========== Layer tabs ========== */

.layer-tabs-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px 0;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.layer-tabs {
  flex: 1;
  min-width: 0;
}

.layer-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.layer-tabs :deep(.el-tabs__nav-wrap) {
  padding: 0;
}

.layer-tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.layer-tab-label.has-incomplete {
  font-weight: 600;
}

.layer-name {
  font-size: 13px;
}

.layer-owner-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.layer-owner-avatar.no-owner {
  background: #f0f2f5;
  color: #c0c4cc;
  border: 1px dashed #dcdfe6;
}

.layer-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 6px;
}

/* ========== Board content ========== */

.board-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.board-sidebar {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid #ebeef5;
  overflow-y: auto;
}

.board-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ========== Advance overlay ========== */

.advance-info {
  line-height: 1.6;
}

.advance-info p {
  margin: 0;
}

.reset-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
  border-radius: 4px;
  font-size: 13px;
  color: #b88230;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin: 18px 0 8px;
}

.section-title.error {
  color: #f56c6c;
}

.reasoning-block {
  background: #f5f7fa;
  border-left: 3px solid #409eff;
  padding: 10px 14px;
  border-radius: 4px;
  margin-top: 16px;
}

.reasoning-text {
  font-size: 13px;
  color: #606266;
  margin: 4px 0 0;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.rounds-block {
  margin-top: 4px;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.round-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f2f5;
}

.round-row:last-child {
  border-bottom: none;
}

.round-num {
  flex-shrink: 0;
  min-width: 54px;
  padding: 4px 8px;
  background: linear-gradient(135deg, #409eff, #337ecc);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  text-align: center;
}

.round-title-col {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.round-title {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.failures-block {
  margin-top: 12px;
  background: #fef0f0;
  border-radius: 6px;
  padding: 10px 14px;
}

.failure-row {
  font-size: 12px;
  color: #606266;
  margin-top: 4px;
}

.failure-num {
  display: inline-block;
  min-width: 48px;
  color: #f56c6c;
  font-weight: 600;
  margin-right: 6px;
}

.failure-title {
  color: #303133;
  margin-right: 6px;
}

.failure-error {
  color: #909399;
}

.advancing-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px 16px 8px;
}

.advancing-panel .spinner {
  animation: spin 1.2s linear infinite;
  margin-bottom: 14px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.advancing-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
}

.advancing-sub {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  margin: 0 0 10px;
}

.advancing-hint {
  font-size: 12px;
  color: #909399;
  margin: 0;
}

/* ========== Card detail drawer ========== */

.card-detail-section {
  margin-bottom: 24px;
  padding: 0 4px;
}

.card-detail-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.detail-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.hint {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-left: 3px solid #909399;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
}

.text-muted {
  color: #c0c4cc;
}

.form-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

/* ========== Req 1: Card drawer tabs ========== */

.card-drawer-tabs :deep(.el-tabs__header) {
  margin: 0 0 12px;
  padding: 0 4px;
}

.drawer-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.override-dot {
  margin-left: 2px;
}

.override-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  background: #ecf5ff;
  border-left: 3px solid #409eff;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}

.tag-editor {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
}
</style>
