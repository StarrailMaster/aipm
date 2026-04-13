<template>
  <div class="variants-panel">
    <div v-if="variants.length === 0" class="empty">
      <el-empty :description="t('hypothesis.variants.empty')">
        <el-button type="primary" @click="openCreateDialog">{{ t('hypothesis.variants.addControl') }}</el-button>
      </el-empty>
    </div>

    <template v-else>
      <div class="toolbar">
        <el-button v-if="canAddTreatment" type="primary" size="small" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          {{ t('hypothesis.variants.addVariant') }}
        </el-button>
      </div>

      <el-table :data="variants" stripe>
        <el-table-column :label="t('common.name')" min-width="160">
          <template #default="{ row }">
            <el-tag v-if="row.type === 'CONTROL'" size="small" type="info">
              {{ t('hypothesis.variants.control') }}
            </el-tag>
            <el-tag v-else size="small" type="warning">
              {{ t('hypothesis.variants.treatment') }}
            </el-tag>
            {{ row.name }}
            <el-tag v-if="row.isWinner" type="success" size="small" effect="dark">WINNER</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('hypothesis.variants.sampleSize')" width="120">
          <template #default="{ row }">
            {{ row.sampleSize ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('hypothesis.variants.conversionCount')" width="100">
          <template #default="{ row }">
            {{ row.conversionCount ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('hypothesis.variants.conversionRate')" width="120">
          <template #default="{ row }">
            <span v-if="row.conversionRate !== null">
              {{ (row.conversionRate * 100).toFixed(2) }}%
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('hypothesis.variants.pValue')" width="120">
          <template #default="{ row }">
            <template v-if="row.pValue !== null">
              {{ row.pValue.toFixed(4) }}
              <el-tag v-if="row.isSignificant" type="success" size="small" effect="light">
                {{ t('hypothesis.variants.significant') }}
              </el-tag>
              <el-tag v-else type="info" size="small">
                {{ t('hypothesis.variants.notSignificant') }}
              </el-tag>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="openResultDialog(row)">{{ t('hypothesis.variants.enterData') }}</el-button>
            <el-button
              v-if="row.type === 'TREATMENT' && !row.isWinner && row.isSignificant"
              size="small"
              type="success"
              @click="markWinner(row)"
            >
              {{ t('hypothesis.variants.markWinner') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Create variant dialog -->
    <el-dialog v-model="showCreate" :title="t('hypothesis.variants.addVariant')" width="480px">
      <el-form :model="createForm" label-position="top">
        <el-form-item :label="t('common.name')" required>
          <el-input
            v-model="createForm.name"
            :placeholder="needsControl ? t('hypothesis.variants.namePlaceholderControl') : t('hypothesis.variants.namePlaceholderTreatment')"
          />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <div class="tip">
          {{ needsControl ? t('hypothesis.variants.controlHint') : t('hypothesis.variants.treatmentHint') }}
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">{{ t('common.create') }}</el-button>
      </template>
    </el-dialog>

    <!-- Result input dialog -->
    <el-dialog
      v-model="showResult"
      :title="t('hypothesis.variants.enterDataTitle', { name: editVariant?.name ?? '' })"
      width="480px"
    >
      <el-form :model="resultForm" label-position="top">
        <el-form-item :label="t('hypothesis.variants.sampleSize')" required>
          <el-input-number v-model="resultForm.sampleSize" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('hypothesis.variants.conversionCount')" required>
          <el-input-number
            v-model="resultForm.conversionCount"
            :min="0"
            :max="resultForm.sampleSize"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showResult = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="savingResult" @click="handleSaveResult">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useHypothesisStore } from '@/stores/hypothesis'
import type { HypothesisVariant } from '@/api/hypothesis'

const { t } = useI18n()
const store = useHypothesisStore()

const props = defineProps<{
  hypothesisId: string
  variants: HypothesisVariant[]
}>()

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const needsControl = computed(() => props.variants.length === 0)
const canAddTreatment = computed(() => props.variants.some((v) => v.type === 'CONTROL'))

// ============ Create ============
const showCreate = ref(false)
const creating = ref(false)
const createForm = reactive({
  name: '',
  description: '',
})

function openCreateDialog() {
  createForm.name = ''
  createForm.description = ''
  showCreate.value = true
}

async function handleCreate() {
  if (!createForm.name.trim()) return
  creating.value = true
  try {
    const result = await store.createVariant(props.hypothesisId, {
      name: createForm.name,
      description: createForm.description || undefined,
      type: needsControl.value ? 'CONTROL' : 'TREATMENT',
    })
    if (result) {
      ElMessage.success(t('hypothesis.variants.created'))
      showCreate.value = false
      emit('changed')
    }
  } finally {
    creating.value = false
  }
}

// ============ Result input ============
const showResult = ref(false)
const savingResult = ref(false)
const editVariant = ref<HypothesisVariant | null>(null)
const resultForm = reactive({
  sampleSize: 0,
  conversionCount: 0,
})

function openResultDialog(variant: HypothesisVariant) {
  editVariant.value = variant
  resultForm.sampleSize = variant.sampleSize ?? 0
  resultForm.conversionCount = variant.conversionCount ?? 0
  showResult.value = true
}

async function handleSaveResult() {
  if (!editVariant.value) return
  savingResult.value = true
  try {
    const variants = await store.updateVariantResults(
      props.hypothesisId,
      editVariant.value.id,
      {
        sampleSize: resultForm.sampleSize,
        conversionCount: resultForm.conversionCount,
      },
    )
    if (variants.length > 0) {
      ElMessage.success(t('hypothesis.variants.updated'))
      showResult.value = false
      emit('changed')
    }
  } finally {
    savingResult.value = false
  }
}

// ============ Mark winner ============
async function markWinner(variant: HypothesisVariant) {
  try {
    await ElMessageBox.confirm(
      t('hypothesis.variants.confirmMarkWinner', { name: variant.name }),
      t('common.confirm'),
      { type: 'success' },
    )
    const ok = await store.markWinner(props.hypothesisId, variant.id, false)
    if (ok) {
      ElMessage.success(t('hypothesis.variants.winnerMarked'))
      emit('changed')
    }
  } catch {
    /* cancelled */
  }
}
</script>

<style lang="scss" scoped>
.variants-panel {
  .empty {
    padding: var(--aipm-spacing-lg);
  }
}

.toolbar {
  margin-bottom: var(--aipm-spacing-md);
}

.tip {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
  margin-top: var(--aipm-spacing-sm);
}
</style>
