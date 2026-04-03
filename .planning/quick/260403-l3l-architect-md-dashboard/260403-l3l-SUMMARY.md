# Quick Task 260403-l3l Summary

**Completed:** 2026-04-03
**Description:** 在 architect.md Dashboard 凭证体系部分补充面板首次登录绑定后端流程描述

## 变更内容

在 `### 1. 双模式登录机制` 和 `### 2. UI Lock 启用与禁用` 之间新增 `### 1.1 面板首次登录绑定后端 (Initial Backend Binding)` 章节。

### 新增内容要点

1. **静默探测** — `AuthProvider` mount 时尝试 `/api/auth/refresh`，无 Cookie 必然失败
2. **门控展示** — `LoginGate` 渲染密码输入界面
3. **凭证输入** — 用户输入 `API_SECRET_KEY` 或 `UI_ACCESS_KEY`
4. **后端验证** — `POST /api/auth/login` 签发双 Token
5. **内存绑定** — Access Token 存入内存变量，Dashboard 渲染
6. **会话持久化** — 后续刷新通过 HttpOnly Cookie 无感恢复

### 关键设计说明

> "前端从不持久化任何凭证。Access Token 仅存内存（刷新页面即丢失），Refresh Token 由浏览器内核管理于 HttpOnly Cookie 中（前端 JS 不可读）。"绑定的本质是用户通过一次成功的登录交换，建立起前端内存状态与后端会话记录之间的信任链。"

## 文件修改
- `.adocs/research/architect.md` (symlink → `../Notes-sur-l-IA/Projects/uptimer/research/architect.md`)
