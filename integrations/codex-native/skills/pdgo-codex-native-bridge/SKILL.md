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

所有新 BossCoding 计划使用 `role_contract.version: bosscoding-v2`，并完整记录 planning、execution、review 三项 `role_assignments`。旧计划只有在显式标记 `legacy-v1` 与 `migration: role-assignments-not-recorded` 时才保留兼容。`role_assignments` 中的 `host_agent_type` 记录 Codex 宿主的 `agent_type`；既有 `external_agent_id` 仍只属于外部 Agent 目录。两者不得按显示名静默互转。`method_lenses` 只传递获批的方法镜头：authority 必须是 `advisory`，不得应用到 review，也不得成为身份、权限或验收来源。

## 真实派工流程

1. 用已安装解析器只读校验运行时描述符、manifest 和完整运行时树；这一步不得创建项目状态目录。
2. 主 Agent 根据项目状态和 `acy` 方法在内存中起草五项执行基准、精确 `plan_id + plan_version`、项目状态目录、三个角色、文件和验证批次；`acy` 的角色建议本身不是批准。
3. 秘书展示完整批次。用户一次批准覆盖创建状态目录、写入精确计划与批准、planning/execution/review 子 Agent、实施和验证。
4. 获批后才确保状态目录存在，持久化刚才展示的 plan，并记录精确匹配的批准；任何实质变化都必须升版并重新批准。
   若 plan 启用 authorization envelope（授权包络），只有注入的可信宿主 transport／adapter 能返回证明；父 Agent 文本、消息 JSON 或自报 `verified` 不能充当证明。稳定 JSON + SHA-256 只摘要不可变批准边界。
5. 获批后调用 planning 子 Agent 验证或细化已批准计划，再用 `bind-host-session` 绑定 planning 的真实 ID。`host_agent_type` 由主 Agent 从实际 `spawn_agent.agent_type` 参数记录；`selection_source` 原样来自获批计划中的角色选择记录，不是 spawn 参数。没有实质变化时继续；目标、范围、权限、验收者、外部动作、重大风险、角色或 Persona 模式实质变化时升版并重新批准。
6. 创建独立 review 子 Agent，保存真实 ID，并用同样的宿主观察字段绑定 `review` 角色。
7. PDGO 生成 `PLAN_DISPATCH` 后，按获批的 execution `host_agent_type` 调用 execution 子 Agent；把完整 dispatch 原样交给它。
8. 捕获真实 execution Agent ID，调用 `bind-host-worker` 绑定到精确 `dispatch_id`：`host_agent_type` 来自实际调用的 `agent_type`，`selection_source` 来自获批角色选择记录。不得从子 Agent 自述获取；旧 session 不能被重标为另一类型。缺少真实 ID 或任一绑定字段就写 transport blocker。
9. 等待执行返回；结构化为 `EXECUTION_REPORT`，其中 `worker_session_id` 必须是已绑定的 execution Agent ID；`session_id` 保留为兼容字段，再交给 PDGO。
10. 将 PDGO 生成的 `REVIEW_REQUEST` 和只读候选交给已绑定 review Agent；等待其 `REVIEW_DECISION`。人物 Lens、Voice 或 Rehearsal 不能充当这一审核身份。
11. 把宿主观察到的 review Agent ID 作为 `observed_session_id` 写入 review 动作。消息正文自报的 ID 不算证据。
12. `accepted` 才解锁依赖；`revision-required` 生成原范围内修正；`blocked` 或 `failed` 停下。结束时由秘书核对执行基准、实际改动、审核结果和持久状态。

启用包络时，plan、approval、每个 dispatch、execution report 和 review decision 必须保留同一摘要；执行和审核只回传收到的原包络。缺失、不匹配、过期以及 plan/version、范围或角色漂移一律 fail closed。原批准批次内的后续派工和原范围修正复用该包络，不新增 PDGO 批准；宿主或操作系统自己的权限提示不在此复用范围内。FileQueue 无认证证明能力，不能用于启用该策略的批准。

以上所有 BossCoding 状态动作都通过已安装解析器的 `invoke` 入口执行。该入口必须重新校验运行时、按真实项目路径重算状态根，并拒绝调用方传入 `--root`、旧 cwd 默认值或外部角色目录覆盖。直接调用 dispatcher CLI 只属于明确选择的旧版 PDGO 接口，不能作为 BossCoding 的省事旁路。

`permission_mode` 只表达治理和派工边界，不能代替 Codex 与项目权限的真实约束。执行前必须确认实际工具权限与获批模式相符。

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
