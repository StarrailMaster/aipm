/**
 * Fix 10 / PRD D19: `services/sop-split/` 模块
 *
 * 架构目标：ai.service.ts（900 行）里 SOP 分组 Agent 部分单独成模块。
 *
 * 当前阶段：新模块作为 **seam**（接缝层），对外暴露稳定 API，
 * 内部仍 re-export ai.service.ts 的实现。这样：
 *   - 调用方（iteration.service.ts）切到新路径，import 不变
 *   - SOP regression test 继续跑旧实现（零行为变化）
 *   - 未来一次物理搬家只需要移动 5 个符号 + 删除 re-export
 *
 * 迁移计划（未来）：
 *   Phase 1（now）：新增 seam，调用方迁移 import 路径
 *   Phase 2：把 runSopSplitAgent / buildRoundEntryMarkdown / 类型定义物理搬到这里
 *   Phase 3：删除 ai.service.ts 里的 SOP 相关符号（ai.service.ts 缩减到 <400 行）
 */

export {
  runSopSplitAgent,
  buildRoundEntryMarkdown,
  type SopDocumentInput,
  type AssignedRound,
  type SopSplitResult,
} from '../ai.service'
