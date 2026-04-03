# Quick Task 260403-lbf: 更新 Mermaid 流程图对齐文字描述

**Gathered:** 2026-04-03
**Status:** Complete

## Task
更新 `.adocs/research/architect.md` 中 `### 3. 凭证流转闭环 (Mermaid)` 流程图，使其与"Dashboard 凭证体系"章节的文字描述保持一致。

## Changes
- 重写整个 Mermaid graph TD
- 新增：静默刷新、Cookie 探测、双模式登录、频率限制(429)、紧急解锁、内存绑定、登出流程
- 修正：ADMIN_API_KEY → API_SECRET_KEY, 移除不存在的"首次绑定"分支
- 对齐：与 Section 1, 1.1, 2 的文字描述完全一致
