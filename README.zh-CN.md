# PDGO

**Project Development Governance Orchestrator（项目开发治理编排器）** 是面向 Codex 和其他工具型智能体的项目治理方法。它把场景路由、用户审批、阶段策划、隔离执行、证据化验收、对话记忆和外部 Agent 派发放进同一条可审计链路。

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

## 快速开始

PDGO 从项目任务开始就执行路由：先识别项目、操作、部门、阶段、具体场景、输入、输出、约束、风险、模式和审批状态，再选择活动 Skill。

仓库的 `skills/` 目录现在只有 10 个 PDGO 活动 Skill。完整 Superpowers 上游基线保存在 `integrations/external-skills/superpowers/upstream/`，不直接修改；`overlays/` 和活动 Skill 吸收治理规则。

```powershell
npm.cmd install
npm.cmd run test:node
npm.cmd run validate
```

## 工作方式

PDGO 不会把模糊请求直接变成代码。策划部先与用户共同确定项目目标、完成后的可观察结果、允许修改范围、明确排除范围、假设、依赖、验收标准、预期证据、风险、卡点、回滚和停止条件；没有用户请求时不主动深化实现细节。

过长方案会拆成明确的串流阶段和并行阶段。每个阶段声明需要的 Skill、Agency Agent 候选、依赖、隔离方式和验收门。用户批准精确的 `plan_id + plan_version` 后，执行部一次只接收一个不可变的派发任务。执行报告必须回到策划部，由独立验收决定是否接受。`accepted` 才能解锁后续任务；`revision-required` 只能生成批准范围内的修正派发；任何卡点都会暂停系列。

运行时可以在重启后恢复队列，也可以持续监听报告和验收。连续自动派发只有在真实 transport 返回真实 worker 会话时才可用。File Queue 是明确、可审计的人工交接方式，不能证明 Agent 已经启动。

## 基本流程

1. **路由**：用 `pdgo-route-work` 根据完整场景契约选择 Skill。没有可靠匹配时以 `skill-unresolved` 停止。
2. **记忆**：用 `pdgo-dialogue-memory` 保存指令、检查点、决定、引用和结束总结。读取历史前先查索引。
3. **策划**：用 `pdgo-plan-work` 澄清意图、编写版本化方案并拆分串行或隔离并行阶段。策划不等于执行。
4. **审批**：要求 `USER_PLAN_APPROVAL` 的 `plan_id`、`plan_version`、风险确认、卡点处置、范围和条件全部精确匹配。
5. **执行**：用 `pdgo-execute-work` 处理不可变派发、worktree 隔离、独立任务 Agent、范围内修正和证据回传。
6. **验收**：用 `pdgo-review-request` 和 `pdgo-review-receive`。执行者不能自验收，依赖任务在接受前保持锁定。
7. **调试与测试**：用 `pdgo-debug-work` 做受控根因调查，用 `pdgo-tdd-work` 在批准范围内执行红绿重构。
8. **完成**：用 `pdgo-completion-work` 运行声明的检查、记录剩余风险并准备分支交接，不暗中合并或推送。
9. **Skill 编写**：只有当具体场景没有可靠 Skill 时才用 `pdgo-skill-authoring`。Skill 从路由契约生成，不从名字猜能力。

## 10 个活动 Skill

| Skill | 融合能力 |
|---|---|
| `pdgo-route-work` | 天眼路由与启动引导 |
| `pdgo-dialogue-memory` | 对话记忆、索引和交接 |
| `pdgo-plan-work` | 策划、头脑风暴和方案编写 |
| `pdgo-execute-work` | 执行、并行派发、子 Agent 和 worktree |
| `pdgo-review-request` | 独立审查请求 |
| `pdgo-review-receive` | 证据化验收决定 |
| `pdgo-debug-work` | 系统化调试 |
| `pdgo-tdd-work` | 测试驱动开发 |
| `pdgo-completion-work` | 完成前验证与分支交接 |
| `pdgo-skill-authoring` | Skill 编写和验证 |

上游工作流正文完整进入活动 Skill；原始文件仍在锁定目录中保持字节级一致。`source-lock.json` 和 `integration-map.json` 记录提交、哈希和每个逻辑段落的去向。

## Agency Agent

仓库导入 `msitarzewski/agency-agents` 的 271 个 prompt，来源提交为 `c89557f78509868c6d4cc08e5cbc79bc8625fe1c`，保留上游 18 个分类。每个 Agent 在 `integrations/external-agents/agency-agents/metadata/` 下都有一份证据化 YAML 说明。

检索只能按场景、分类和原始说明缩小候选，不能只看名字。只有 `auto_route: true` 的高置信条目允许在精确场景查询下自动选择；其余条目为 `manual-only`，必须由获批任务明确填写 `external_agent_id`。Agent 不能审批方案、关闭卡点、扩大范围或替代独立验收。

策划部、执行部和验收部的分类候选以及启用条件见 `profiles/pdgo-agent-routing.json`；完整索引见 `integrations/external-agents/agency-agents/index.json`。

## 安装

### Codex 插件

在 Codex 应用中安装或链接本仓库。插件清单是 `.codex-plugin/plugin.json`，活动 Skill 位于 `skills/`。

### 其他宿主

仓库提供 Claude、Cursor、Kimi、OpenCode 和 Gemini 清单。如果宿主不共享 Codex 的 Skill 目录，需要分别安装。

### 运行时命令

```powershell
node scripts/flowstate-dispatcher.mjs --action create-plan --input plan.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action approve --input approval.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action dispatch --input dispatch.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action resume --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action watch --root .flowstate --project demo --interval-ms 1000
```

`dispatch` 是显式队列交接；`resume` 和 `watch` 经过连续派发门。没有真实 App Server transport 时，系统会记录 transport 卡点并等待，不会声称 Agent 已启动。

## 仓库内容

仓库围绕 `AGENTS.md`、10 个 `skills/pdgo-*`、`integrations/external-skills/superpowers/`、`integrations/external-agents/agency-agents/`、`profiles/pdgo-agent-routing.json`、`schemas/`、`scripts/` 和 `tests/` 组织。上游归档、旁车 metadata、哈希锁、段落映射和运行时证据都保留在对应目录中。

## 原则

- **证据先于断言**：必须运行声明的命令并检查实际输出后才能声称成功。
- **用户审批在边界上**：执行绑定不可变的方案 ID 和版本。
- **系统化而非猜测**：策划、测试、调试、审查和完成都遵循已路由流程。
- **最小必要修改**：修正只补齐已批准工作，不主动扩大或深化任务。
- **诚实的 transport**：队列文件、stub 或当前对话都不等于真实 Agent 会话。
- **可回滚交付**：记录停止条件、回滚、剩余风险和外部影响。

## 更新上游

Superpowers 只有在变更锁定提交、重新归档上游、重新生成 10 个活动 Skill 并审查融合映射后才能更新。Agency Agent 只有在完整导入上游树、检查 271 个 prompt 哈希、重新生成 271 份 metadata 并审查路由变化后才能更新。上游更新属于方案变更，需要新的用户审批。

## 验证

```powershell
npm.cmd run test:node
npm.cmd run validate
```

验证包括 10 个活动 Skill、旧壳目录不存在、Superpowers 锁定哈希、271 个 Agent 和 metadata 数量、prompt 完整性、契约以及运行时行为。

## 许可

PDGO 使用 MIT 许可。导入的 Superpowers 和 Agency Agents 材料保留各自上游许可及来源记录。
