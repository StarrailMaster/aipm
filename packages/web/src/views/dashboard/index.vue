<template>
  <div class="dashboard-shell">
    <!-- 直接渲染子路由的 my-tasks 视图，不再显示 tab 切换 -->
    <router-view />
  </div>
</template>

<script setup lang="ts">
// 我的待办页：原来这里有"我的待办 / 效能看板"两个 tab；
// 效能看板已经挪到「团队看板 → 效能看板」tab，所以这里直接作为 my-tasks 的 shell。
</script>

<style scoped>
.dashboard-shell {
  padding: 0;
}
</style>
