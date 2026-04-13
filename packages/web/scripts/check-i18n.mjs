#!/usr/bin/env node
/**
 * Fix 8: i18n raw-text guard for Vue templates.
 *
 * 作用：扫描 Learning Copilot 相关的 Vue 文件（views/hypotheses, views/dashboard,
 * views/learnings, views/hypothesis-templates, components/learning），禁止在
 * <template> 中出现裸露的中文文本。必须通过 t() 或 $t() 调用。
 *
 * 不依赖 ESLint — 避免把整个 lint 工具链引入项目。可以在 CI 或 pre-commit 跑。
 *
 * 用法：
 *   node scripts/check-i18n.mjs
 *   node scripts/check-i18n.mjs --fix-suggest   # 只报告，给出建议
 *
 * 退出码：发现违规返回 1，无违规返回 0。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

// Learning Copilot v2.0 新增 / 改动的目录
const TARGET_DIRS = [
  'src/views/hypotheses',
  'src/views/hypothesis-templates',
  'src/views/learnings',
  'src/views/dashboard/learning-dashboard.vue',
  'src/views/dashboard/cross-project.vue',
  'src/components/learning',
]

// 允许的中文：注释 + i18n key 值本身
// 禁止的中文：<template> 里的裸文本，script 里用户可见的字符串字面量（ElMessage/ElMessageBox）

const CHINESE_RE = /[\u4e00-\u9fff]/

/** 判断一行是否属于文件头的 import/注释/空行 */
function isIgnorableLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('//')) return true
  if (trimmed.startsWith('/*') || trimmed.startsWith('*')) return true
  if (trimmed.startsWith('*/')) return true
  // 单行 JSDoc/block comment 结尾
  if (trimmed.match(/^\s*\*/)) return true
  return false
}

/** 简化的 <template> 提取：返回 template 块的内容 + 起始行号 */
function extractTemplate(source) {
  const openIdx = source.indexOf('<template>')
  if (openIdx === -1) return null
  const closeIdx = source.lastIndexOf('</template>')
  if (closeIdx === -1) return null
  const before = source.substring(0, openIdx)
  const startLine = (before.match(/\n/g)?.length ?? 0) + 1
  return {
    content: source.substring(openIdx, closeIdx + '</template>'.length),
    startLine,
  }
}

/** 扫一个 Vue 文件，返回违规列表 */
async function scanFile(filepath) {
  const source = await readFile(filepath, 'utf8')
  const issues = []

  const template = extractTemplate(source)
  if (template) {
    const lines = template.content.split('\n')
    lines.forEach((line, idx) => {
      if (isIgnorableLine(line)) return
      if (!CHINESE_RE.test(line)) return
      // 允许：出现在 t('key'), $t('key'), t(`...`), :label="t(..."
      // 检测裸文本：去除所有 t(...) 调用后仍有中文则违规
      const stripped = line
        .replace(/t\(['"`][^'"`]*['"`](?:,\s*\{[^}]*\})?\)/g, '')
        .replace(/\$t\(['"`][^'"`]*['"`](?:,\s*\{[^}]*\})?\)/g, '')
      if (CHINESE_RE.test(stripped)) {
        // 跳过 HTML 注释
        if (stripped.trim().startsWith('<!--')) return
        issues.push({
          line: template.startLine + idx,
          col: line.search(CHINESE_RE) + 1,
          text: line.trim(),
          reason: 'raw Chinese text in <template>',
        })
      }
    })
  }

  // 扫 script 中的 ElMessage/ElMessageBox 字符串字面量（用户可见）
  const lines = source.split('\n')
  lines.forEach((line, idx) => {
    if (isIgnorableLine(line)) return
    if (!CHINESE_RE.test(line)) return
    // 仅关注 ElMessage.X / ElMessageBox.X / ElNotification.X 的调用
    if (!/ElMessage|ElMessageBox|ElNotification/.test(line)) return
    // 如果这一行已经使用了 t() 调用，放过
    const stripped = line
      .replace(/t\(['"`][^'"`]*['"`](?:,\s*\{[^}]*\})?\)/g, '')
      .replace(/\$t\(['"`][^'"`]*['"`](?:,\s*\{[^}]*\})?\)/g, '')
    if (CHINESE_RE.test(stripped)) {
      issues.push({
        line: idx + 1,
        col: line.search(CHINESE_RE) + 1,
        text: line.trim(),
        reason: 'raw Chinese in ElMessage/ElMessageBox string',
      })
    }
  })

  return issues
}

async function walkDir(dir, out) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        await walkDir(full, out)
      } else if (e.isFile() && e.name.endsWith('.vue')) {
        out.push(full)
      }
    }
  } catch {
    /* dir 不存在则跳过 */
  }
}

async function collectFiles() {
  const files = []
  for (const pattern of TARGET_DIRS) {
    const abs = join(ROOT, pattern)
    if (pattern.endsWith('.vue')) {
      files.push(abs)
    } else {
      await walkDir(abs, files)
    }
  }
  return files
}

async function main() {
  const files = await collectFiles()
  let totalIssues = 0
  const reports = []

  for (const f of files) {
    const issues = await scanFile(f)
    if (issues.length > 0) {
      totalIssues += issues.length
      reports.push({ file: relative(ROOT, f), issues })
    }
  }

  if (totalIssues === 0) {
    console.log(
      `[check-i18n] ✓ Scanned ${files.length} files. All user-facing text uses t()/$t().`,
    )
    process.exit(0)
  }

  console.error(`[check-i18n] ✗ Found ${totalIssues} i18n violations:`)
  for (const r of reports) {
    console.error(`\n  ${r.file}:`)
    for (const issue of r.issues) {
      console.error(
        `    ${issue.line}:${issue.col}  ${issue.reason}`,
      )
      console.error(`      > ${issue.text}`)
    }
  }
  console.error(
    `\n[check-i18n] Use t('key') or $t('key') instead. Add keys to src/i18n/locales/{zh,en}.json.`,
  )
  process.exit(1)
}

main().catch((err) => {
  console.error('[check-i18n] error:', err)
  process.exit(2)
})
