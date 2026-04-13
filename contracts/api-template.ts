// 模板库 接口契约
// agent-sop 负责实现（和 SOP 同一个 agent）
// 类型定义参见 api-sop.ts 中的 Template 相关类型

// 此文件作为独立入口，重新导出 SOP 中的模板类型
export type {
  Template,
  CreateTemplateRequest,
  SearchTemplateQuery,
} from './api-sop'
