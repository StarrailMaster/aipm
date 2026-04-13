<template>
  <div v-loading="loading" class="tree-view">
    <el-empty v-if="!loading && !tree" :description="t('common.empty')" />
    <template v-else-if="tree">
      <div class="tree-stats">
        <span>{{ t('hypothesis.tree.depth') }}: {{ tree.depth }}</span>
        <span>{{ t('hypothesis.tree.totalNodes') }}: {{ tree.totalNodes }}</span>
        <el-tag v-if="tree.truncated" type="warning" size="small">{{ t('hypothesis.tree.truncated') }}</el-tag>
      </div>
      <div class="tree-container">
        <TreeNode :node="tree.root" :is-root="true" @select="goToNode" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TreeNode from './TreeNode.vue'
import { getHypothesisTreeApi, type HypothesisTreeResponse } from '@/api/hypothesis'

const { t } = useI18n()
const router = useRouter()

const props = defineProps<{ hypothesisId: string }>()

const tree = ref<HypothesisTreeResponse | null>(null)
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    const res = await getHypothesisTreeApi(props.hypothesisId)
    if (res.data.code === 0 && res.data.data) {
      tree.value = res.data.data
    }
  } finally {
    loading.value = false
  }
}

function goToNode(id: string) {
  if (id !== props.hypothesisId) {
    router.push(`/hypotheses/${id}`)
  }
}

onMounted(refresh)
watch(() => props.hypothesisId, refresh)
</script>

<style lang="scss" scoped>
.tree-view {
  padding: var(--aipm-spacing-md);
  min-height: 200px;
}

.tree-stats {
  display: flex;
  gap: var(--aipm-spacing-md);
  margin-bottom: var(--aipm-spacing-md);
  font-size: var(--aipm-font-size-base);
  color: var(--aipm-text-secondary);
}

.tree-container {
  overflow-x: auto;
}
</style>
