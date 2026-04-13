# AIPM 设计规范

> 所有视觉决策（颜色、字号、间距、圆角、阴影）必须走 CSS 变量，
> 禁止在组件里写 hex 字面量或魔法 px 值。
> 变量定义源头：`packages/web/src/styles/global.scss`

## 1. 设计哲学

- **信息层级优先**：颜色和字号服务于「重要 vs 次要」的区分，不是装饰。
- **语义先于表现**：用 `--aipm-text-primary` 而不是 `#303133`。换 token 值时整站同步变。
- **少即是多**：一个 token 只有一个含义，不复用。
- **对齐 Element Plus**：基础色阶参考 EP，避免跟组件库打架。

## 2. 间距（8-point grid）

| Token | Value | 用途 |
|-------|-------|------|
| `--aipm-spacing-xs` | `4px` | 图标与文字之间、小 tag 内边距 |
| `--aipm-spacing-sm` | `8px` | 紧密的元素间距、inline gap |
| `--aipm-spacing-md` | `16px` | 常规段落间距、card padding |
| `--aipm-spacing-lg` | `24px` | section 之间、page padding |
| `--aipm-spacing-xl` | `32px` | 大 section 之间 |
| `--aipm-spacing-2xl` | `48px` | hero 区块、page divider |

**规则**：不要写 `padding: 12px`，选 `sm` 或 `md`。想要 12px 说明你在错的层级，去找 sm 或 md。

## 3. 圆角

| Token | Value | 用途 |
|-------|-------|------|
| `--aipm-radius-sm` | `4px` | 输入框、小 tag、inline button |
| `--aipm-radius-md` | `8px` | card、dialog、常规 button |
| `--aipm-radius-lg` | `12px` | 大 card、section container |
| `--aipm-radius-pill` | `100px` | progress bar、status pill |

## 4. 阴影

| Token | 用途 |
|-------|------|
| `--aipm-shadow-sm` | card 静态 |
| `--aipm-shadow-md` | card hover、popover |
| `--aipm-shadow-lg` | dialog、dropdown |

## 5. 字号

| Token | Value | 用途 |
|-------|-------|------|
| `--aipm-font-size-xs` | `11px` | timestamp、watermark |
| `--aipm-font-size-sm` | `12px` | caption、meta、tag |
| `--aipm-font-size-base` | `13px` | body text |
| `--aipm-font-size-md` | `14px` | form label、button |
| `--aipm-font-size-lg` | `15px` | card title |
| `--aipm-font-size-xl` | `16px` | section heading |
| `--aipm-font-size-2xl` | `20px` | page subheading |
| `--aipm-font-size-3xl` | `22px` | page heading |
| `--aipm-font-size-4xl` | `24px` | H1（Dashboard 主标题） |

## 6. 字重

| Token | Value | 用途 |
|-------|-------|------|
| `--aipm-font-weight-normal` | `400` | body |
| `--aipm-font-weight-medium` | `500` | 次级强调 |
| `--aipm-font-weight-semibold` | `600` | 所有标题、button label、重要 meta |
| `--aipm-font-weight-bold` | `700` | page title（H1）|

**规则**：不要用 `font-weight: bold`（等价 700），直接用 token。

## 7. 行高

| Token | Value | 用途 |
|-------|-------|------|
| `--aipm-line-height-tight` | `1.3` | 标题 |
| `--aipm-line-height-base` | `1.5` | body |
| `--aipm-line-height-loose` | `1.7` | 长文本、Markdown 正文 |

## 8. 语义色（brand + feedback）

| Token | Hex | 用途 |
|-------|-----|------|
| `--aipm-color-primary` | `#409eff` | 品牌主色、active link、primary button |
| `--aipm-color-success` | `#67c23a` | 胜出、正向进度、verified |
| `--aipm-color-warning` | `#e6a23c` | 进度落后、提示 |
| `--aipm-color-danger` | `#f56c6c` | 失败、错误、critical alert |
| `--aipm-color-info` | `#909399` | 中性信息、辅助说明 |

## 9. 文字色（层级严格）

| Token | Hex | 用途 |
|-------|-----|------|
| `--aipm-text-primary` | `#303133` | H1/H2/标题、primary body |
| `--aipm-text-regular` | `#606266` | body 次要文本 |
| `--aipm-text-secondary` | `#909399` | caption、meta、label |
| `--aipm-text-placeholder` | `#c0c4cc` | disabled、timestamp、watermark |

**规则**：绝大多数文字只用 `primary` / `regular` / `secondary` 三个层级。不要用 4 层以上，视觉会碎。

## 10. 边框色

| Token | Hex | 用途 |
|-------|-----|------|
| `--aipm-border-base` | `#dcdfe6` | 输入框、dashed suggestion card |
| `--aipm-border-light` | `#ebeef5` | card、表格行分隔 |
| `--aipm-border-lighter` | `#f0f2f5` | 浅分隔线、divider |

## 11. 背景/表面色

| Token | Hex | 用途 |
|-------|-----|------|
| `--aipm-bg-base` | `#ffffff` | 页面根背景 |
| `--aipm-bg-surface` | `#ffffff` | card、dialog 表面 |
| `--aipm-bg-subtle` | `#fafafa` | 嵌套 card、sidebar 背景 |
| `--aipm-bg-muted` | `#f5f7fa` | input、次级表面、code block |
| `--aipm-bg-page` | `#f0f2f5` | 页面 fallback |

## 12. 语义 tint 背景

两种用法：
- **`*-soft`（半透明）** — 用于 bucket 列头、stat pill 等小色块，能叠加
- **`*-tint`（实色）** — 用于 alert card、pattern card 等整块填充

### soft (rgba)
| Token | 用途 |
|-------|------|
| `--aipm-bg-primary-soft` | 跑中 bucket、running pill |
| `--aipm-bg-success-soft` | 胜出 bucket、winner pill |
| `--aipm-bg-warning-soft` | 提示 bucket |
| `--aipm-bg-danger-soft` | 失败 bucket、critical pill |
| `--aipm-bg-info-soft` | 待开始 bucket、neutral pill |

### tint (实色)
| Token | 用途 |
|-------|------|
| `--aipm-surface-warning-tint` | alert card 常规警告 |
| `--aipm-surface-danger-tint` | alert card 严重告警 |
| `--aipm-surface-info-tint` | alert card 信息级 |
| `--aipm-surface-primary-tint` | pattern card（killer feature 背景） |
| `--aipm-surface-success-tint` | learning card |

## 13. Hypothesis 状态色（单独命名）

| Token | Hex | 状态 |
|-------|-----|------|
| `--aipm-hypothesis-backlog` | `#909399` | BACKLOG |
| `--aipm-hypothesis-running` | `#409eff` | RUNNING |
| `--aipm-hypothesis-won` | `#67c23a` | CLOSED_WIN |
| `--aipm-hypothesis-lost` | `#f56c6c` | CLOSED_LOSS |
| `--aipm-hypothesis-flat` | `#909399` | CLOSED_FLAT |
| `--aipm-hypothesis-abandoned` | `#c0c4cc` | ABANDONED |

**为什么和 feedback 色同值还要单独命名**：未来 status 语义可能独立演化（比如 RUNNING 想加 orange），留伸缩空间。

## 14. 响应式断点

见 `packages/web/src/styles/breakpoints.scss`：
- **mobile**: `< 768px`
- **tablet**: `768px–1279px`
- **desktop**: `≥ 1280px`

Mixin：`@include mobile { ... }` / `@include tablet { ... }` / `@include mobile-tablet { ... }` / `@include tablet-up { ... }`

## 15. 守护

- `pnpm --filter @aipm/web check:i18n` — 禁止 Vue 模板里出现裸中文（必须走 `t()`）
- 新增颜色/字号前：先去 `global.scss` 加 token，不要临时在组件里写 hex

## 16. 取名规则

- 新 token 命名：`--aipm-<category>-<semantic>[-<variant>]`
  - `<category>`: `color` / `text` / `border` / `bg` / `surface` / `spacing` / `radius` / `shadow` / `font-size` / `font-weight`
  - `<semantic>`: `primary` / `success` / `danger` / `warning` / `info` / `regular` / `placeholder` / `subtle` / `muted`
  - `<variant>` (可选): `soft` / `tint` / `sm` / `md` / `lg`
- 避免发明缩写：`--aipm-bg-success-soft` 比 `--aipm-bgsucc` 清晰
