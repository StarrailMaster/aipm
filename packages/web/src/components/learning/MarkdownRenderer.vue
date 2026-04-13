<template>
  <div class="markdown-renderer" v-html="rendered" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 极简 Markdown 渲染器（不引入 marked/dompurify 依赖）
 *
 * 支持：
 *   - **bold** → <strong>
 *   - *italic* → <em>
 *   - `code` → <code>
 *   - 换行 → <br>
 *   - - list item 前缀
 *   - HTML 转义（防 XSS）
 *
 * 仅用于 Copilot 输出的短文本（50-150 字）。如果需要完整 Markdown 可后续
 * 升级到 marked + DOMPurify，但要多加 ~60KB bundle。
 */

const props = defineProps<{
  content: string
}>()

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text)
  // Inline code first (避免被 bold/italic 吃掉)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // List items - line starting with "- " 或 "* "
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
  // Line breaks
  html = html.replace(/\n/g, '<br>')
  return html
}

const rendered = computed(() => renderMarkdown(props.content))
</script>

<style lang="scss" scoped>
.markdown-renderer {
  font-size: var(--aipm-font-size-base);
  line-height: 1.6;
  color: var(--aipm-text-regular);

  :deep(strong) {
    font-weight: var(--aipm-font-weight-semibold);
    color: var(--aipm-text-primary);
  }

  :deep(em) {
    font-style: italic;
  }

  :deep(code) {
    background: var(--aipm-bg-muted);
    padding: 2px 5px;
    border-radius: 3px;
    font-family: 'SF Mono', Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
  }

  :deep(ul) {
    margin: 4px 0;
    padding-left: 20px;
  }

  :deep(li) {
    margin: 2px 0;
  }
}
</style>
