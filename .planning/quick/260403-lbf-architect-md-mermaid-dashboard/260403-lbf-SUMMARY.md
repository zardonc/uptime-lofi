# Quick Task 260403-lbf Summary

**Completed:** 2026-04-03
**Description:** 更新 architect.md 凭证流转闭环 Mermaid 流程图，使其与 Dashboard 凭证体系文字描述保持一致

## 变更内容

重写 `### 3. 凭证流转闭环 (Mermaid)` 流程图，对齐更新后的文字描述。

### 旧图问题
- 起点为"用户请求凭证"，无静默刷新环节
- 使用"首次绑定 or 日常登录"分支，与双模式登录机制不符
- 使用 `ADMIN_API_KEY` 而非 `API_SECRET_KEY`
- 缺少频率限制（429）、紧急解锁、登出流程
- 缺少 LoginGate、ModeCheck、MemoryBind 等前端组件节点

### 新图改进
1. **起点变更：** 从"用户打开 Dashboard"开始，包含静默刷新环节
2. **Cookie 探测：** 浏览器有/无 Refresh Cookie 分支
3. **双模式登录：** UI Lock 启用/未启用分支，使用正确密钥名
4. **频率限制：** 429 Too Many Requests 节点（5次/15min/IP）
5. **紧急解锁：** EMERGENCY_UNLOCK_KEY 匹配路径（含审计日志）
6. **Token 签发：** 明确 JWT payload 字段（session_id, role, aud, iss, exp）
7. **内存绑定：** access_token 存入内存变量节点
8. **登出流程：** 完整的登出链路（Logout → Middleware → Revoke → ClearCookie → ClearMem → LoginGate）
9. **429 等待：** retry_after 倒计时后重试

## 文件修改
- `.adocs/research/architect.md` (symlink → `../Notes-sur-l-IA/Projects/uptimer/research/architect.md`)
