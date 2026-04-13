// Vue i18n 初始化
// 决策 D13 + D30: Day 1 就建好框架，所有新写的 UI 从第一行就用 $t()。
//
// 使用方式：
//   <template>{{ $t('hypothesis.create.title') }}</template>
//   <script setup>
//     import { useI18n } from 'vue-i18n'
//     const { t } = useI18n()
//   </script>
//
// 规约：
//   - 所有 locale key 按模块命名空间，如 hypothesis.* / dashboard.* / common.*
//   - 新功能必须同步更新 zh.json + en.json 两个文件
//   - 未翻译的 key 退回中文（fallback）
//   - 用户偏好保存在 localStorage + user.preferredLocale（登录后同步）

import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import en from './locales/en.json'

export type SupportedLocale = 'zh' | 'en'

const LOCALE_KEY = 'aipm_locale'

/** 读用户偏好的初始语言 */
function getInitialLocale(): SupportedLocale {
  const saved = localStorage.getItem(LOCALE_KEY)
  if (saved === 'zh' || saved === 'en') return saved
  // 浏览器语言优先匹配
  const browser = navigator.language.toLowerCase()
  if (browser.startsWith('en')) return 'en'
  return 'zh'
}

const i18n = createI18n({
  // Vue 3 Composition API mode
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'zh',
  messages: {
    zh,
    en,
  },
  // 缺少 translation key 时的行为
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
  silentTranslationWarn: !import.meta.env.DEV,
  silentFallbackWarn: true,
})

/** 切换语言 + 持久化 */
export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_KEY, locale)
  document.documentElement.lang = locale
}

/** 获取当前语言 */
export function getCurrentLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale
}

export default i18n
