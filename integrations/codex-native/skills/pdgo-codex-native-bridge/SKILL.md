---
name: pdgo-codex-native-bridge
description: 用 Codex 内置子 Agent 驱动 PDGO 的真实策划、执行和独立审核，并把真实 Agent ID、报告、修正与停止原因写回 PDGO。用户要求用 PDGO、内置子 Agent、策划—执行—审核闭环或可恢复的长程派工时使用；不能把本机 Codex CLI、Gemini CLI 或虚构会话 ID 当作替代。
---

# PDGO Codex Native Bridge

## 目的

把 PDGO 的治理状态机连接到 Codex 当前任务可用的内置协作工具。PDGO 负责计划版本、批准、状态、身份约束、修正和恢复；本 Skill 负责真正调用 `spawn_agent`、`followup_task`、`wait_agent` 并登记真实返回 ID。

每次正式使用前完整读取 [integration.md](references/integration.md)。

## 必要条件

- 当前环境真实提供内置子 Agent 工具；
- 用户已经批准精确实施批次与子 Agent；
- 项目规则允许相应读写；
- 正式修改任务能够访问用户现有的唯一任务系统；
- PDGO 仓库和状态目录可用。

缺一项就记录阻塞，不得改用 Codex CLI、Gemini CLI、手工转交其他模型或假 ID。

## 固定角色

- 主 Agent：秘书和宿主驱动者；只汇报、调用工具、搬运结构化消息和维护状态。
- planning Agent：只输出版本化计划、风险、依赖和验收口。
- execution Agent：只执行一个获准的 `PLAN_DISPATCH`。
- review Agent：只读审核报告、产物和证据；不得编辑候选文件。

四者 ID 必须可区分。主 Agent、planning、execution 或 worker 的输出不能作为独立通过决定。

## 真实派工流程

1. 主 Agent 调用 planning 子 Agent，要求返回五项执行基准和 PDGO plan。
2. 将 plan 持久化，取得 `plan_id + plan_version`，立即用 `bind-host-session` 把 planning 子 Agent 的真实 ID 绑定为 `planning` 角色，再展示精确批次并取得一次用户批准。
3. 预先创建独立 review 子 Agent，保存 `spawn_agent` 返回的真实 ID，并用 `bind-host-session` 绑定 `review` 角色。
4. PDGO 生成 `PLAN_DISPATCH` 后，调用 execution 子 Agent；把完整 dispatch 原样交给它。
5. 捕获真实 execution Agent ID，调用 `bind-host-worker` 绑定到精确 `dispatch_id`。缺少真实 ID 就写 transport blocker。
6. 等待执行返回；结构化为 `EXECUTION_REPORT`，其中 `worker_session_id` 必须是已绑定的 execution Agent ID；`session_id` 保留为兼容字段，再交给 PDGO。
7. 将 PDGO 生成的 `REVIEW_REQUEST` 和只读候选交给已绑定 review Agent；等待其 `REVIEW_DECISION`。
8. 把宿主观察到的 review Agent ID 作为 `observed_session_id` 写入 review 动作。消息正文自报的 ID 不算证据。
9. `accepted` 才解锁依赖；`revision-required` 生成原范围内修正；`blocked` 或 `failed` 停下。
10. 结束时由秘书核对执行基准、实际改动、审核结果和持久状态。

## 修正与停止

- 新证据、部分进展或问题变化可以继续；
- 第一次失败建立问题基线；
- 后续连续两个完成的修正轮仍是同一 `issue_id`、`progress: none` 且没有新证据时，PDGO 设为 `repeated-no-progress` 并停止；
- 新风险、权限变化、完成标准变化、架构变化或范围变化必须重新请用户批准；
- 绝不通过增加重试次数掩盖无进展。

## 真实性边界

- 只有内置子 Agent 工具的真实返回值可以绑定为 host session；
- FileQueue 的逻辑 ID 只用于手工队列和测试，不能声称是真实独立 Agent；
- Node 脚本不能直接调用 Codex 内置工具；
- 单元测试、mock 和同一上下文自查不能代替真实三角色前向测试；
- 不启动常驻进程；使用单次命令和持久状态实现断点续跑。

## 面向用户

用户只看秘书的大白话结论、真正需要判断的冲突和一个当前动作。不要让用户运行 CLI、复制派工 JSON 或在多个 Agent 之间手工搬运内容。
