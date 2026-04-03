# Quick Task 260403-ktu Summary

**Completed:** 2026-04-03
**Description:** 同步系统状态至 architect.md Dashboard 凭证体系章节，审阅后修订不一致描述

## 审阅发现的不一致项

| # | 文档原描述 | 代码实际实现 | 修订动作 |
|---|---|---|---|
| 1 | `ADMIN_API_KEY` 作为绑定密钥 | 实际使用 `API_SECRET_KEY` 环境变量 | ✅ 已修正 |
| 2 | 独立"首次绑定流程"签发双 Token | `/setup` 仅启用 UI Lock，不签发 Token | ✅ 重写为双模式登录机制 |
| 3 | `POST /api/settings/ui-lock` 端点 | 实际端点 `POST /api/auth/setup` (带 `new_ui_password` 参数) | ✅ 已修正 |
| 4 | "Axios 拦截器" 处理 401 | 实际使用自定义 `apiFetch` (fetch-based)，非 Axios | ✅ 已新增前端实现细节章节 |
| 5 | `replaced_by` 字段追踪轮换链 | 代码通过 `id` 级联旋转，无 `replaced_by` 字段 | ✅ 已修正 |
| 6 | 灾难恢复用 `ADMIN_API_KEY` | 代码用 `EMERGENCY_UNLOCK_KEY` 环境变量 | ✅ 已修正 |
| 7 | 登录后请求 `/api/monitors` 和 `/api/settings` | 实际端点是 `/nodes` 和 `/stats/overview` | ✅ 已移除过时端点引用 |
| 8 | 无 D1 登录频率限制描述 | 实际有 `login_attempts` 表，5次/15分钟/IP | ✅ 已补充 |
| 9 | 无前端静默恢复描述 | `AuthProvider` mount 时尝试 refresh | ✅ 已补充 |
| 10 | 无 `dashboardAuthMiddleware` 描述 | 登出需经中间件验证 JWT+会话状态 | ✅ 已补充 |

## 修订内容

### 重写部分
- **Section 1:** 从"首次绑定流程"重写为"双模式登录机制"（UI Lock 未启用 vs 已启用）
- **Section 2:** 从"密钥安全功能设计"重写为"UI Lock 启用与禁用"，补充 `/setup` 和 `/unlock` 端点
- **新增:** "核心业务流程 (Login Lifecycle)" — 登录验证、无感刷新、登出的完整代码级描述
- **新增:** "前端实现细节" — apiFetch、内存 Token、coalesced refresh、静默恢复

### 保留不变
- "是否需要 Dashboard 实例 ID" — 与代码实现一致，无需修改
- "凭证流转闭环 (Mermaid)" — 流程图逻辑与实际代码一致，无需修改

## 文件修改
- `.adocs/research/architect.md` (symlink → `../Notes-sur-l-IA/Projects/uptimer/research/architect.md`)
