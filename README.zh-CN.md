# PDGO / FlowState

**语言：** [English（默认）](README.md) | 简体中文

PDGO 是 Project Development Governance Orchestrator（项目开发治理编排器）。它是 FlowState 的参考实现：一套面向 Codex 和其他工具型智能体的人类审批、证据驱动的项目方法论。

FlowState 把用户请求转换成可追踪的策划、执行、验收、记忆和审计记录。它不绑定框架、语言、仓库或产品；具体项目通过项目配置、项目规则、Skill、路径、工具和测试定义本地行为。

## PDGO 提供什么

PDGO 适合需要跨长对话、重启、交接或失败恢复仍然可理解的工作：

- 按使用场景、边界、输入、输出和前置条件检索 Skill，而不是只看 Skill 名字。
- 策划部记录范围、非目标、工作项、依赖、风险、卡点、证据、回滚和剩余不确定性。
- 执行部每次只接收一个精确、版本锁定的工作项。
- 验收部独立检查证据，并控制依赖任务是否解锁。
- 用户审批绑定到精确的 plan_id + plan_version。
- 以对话为根的记忆，配套方案、会话和知识索引。
- 同系列方案保持控制会话连续，真正并行的方案使用独立系列。
- 派发、报告、验收、重试、卡点和失败都写入可审计事件。
- 支持本地文件队列和注入式 Codex App Server 传输层。
- 支持重启恢复和可选的持续监听运行时。

## 核心流程

~~~text
项目接入
  -> 识别操作、部门、阶段、场景、风险和模式
  -> 加载项目规则并检索记忆索引
  -> 按场景、边界、输入、输出和前置条件选择 Skill
  -> 编写有描述性的方案系列和版本
  -> 检查风险、卡点、依赖、证据和回滚
  -> 请求用户明确批准精确方案版本
  -> 向执行部派发一个就绪工作项
  -> 收集执行报告
  -> 将报告返回策划部独立验收
  -> 接受、修订、阻塞或判定失败
  -> 所有闸门通过后解锁并派发下一个依赖工作项
  -> 写入检查点、总结、索引和审计记录
~~~

策划部验收不等于用户审批。执行部报告不等于完成批准。只有验收通过的报告才能解锁依赖项，只有有效的用户审批才能授权派发。

## 部门与角色

| 部门 | 责任 | 不得做什么 |
| --- | --- | --- |
| 策划部 | 研究上下文、分类场景、编写方案、登记风险/卡点、请求审批 | 审批前修改产品文件或暗中扩大范围 |
| 执行部 | 执行一个精确的已批准工作项、测试并返回证据 | 自行验收或改变已批准契约 |
| 验收部 | 按验收标准检查报告和证据 | 暗中改写范围或清除未解决卡点 |
| 协调部 | 路由 Skill、维护状态、持久化记忆、派发消息、审计状态转换 | 推断用户审批、伪造证据或假装不可用的适配器已经完成工作 |

同一方案系列拥有持久的策划控制会话和执行控制会话；具体工作项的执行者和验收者仍然是任务级会话。同系列扩展复用控制会话，真正并行的分支创建新系列并记录 parallel_of。

没有仓库或项目时，编排器仍会在当前 Codex 窗口中完成策划、执行推理和验收。它使用明确的未绑定项目身份，在状态记录中保留策划/执行/验收的逻辑角色；没有具体范围和审批时，不修改未知产品文件，也不向外部智能体派发工作。

## 策划部职责

策划部负责从明确目标到最终验收的完整闭环，并与用户共同确定：项目目标、完成后的可观察结果、允许修改范围、明确排除范围、验收标准、证据、回滚、风险、卡点、假设和停止条件。除非用户提出或批准版本明确要求，策划部不主动深化实现细节。

长方案必须拆成明确阶段，并标记为串流或并行。每个阶段和工作项都声明所需 Skill，以及需要时的智能体选择器。串流阶段必须验收通过后才能激活后续阶段；并行阶段只允许互相独立、无共享写入且使用隔离工作区的工作项，并在汇合验收后才能继续。

每个执行报告都要返回策划部独立验收：

~~~text
accepted          -> 记录证据 -> 解锁下一阶段/工作项
revision-required -> 生成范围内修正 -> 重新执行并验收
blocked/failed    -> 等待、按策略重试，或返回重新策划
~~~

普通修正仅限于原方案已经要求的工作：补做执行部遗漏的项目、修复缺陷，或在保持批准契约不变的前提下换一种实现方法。只要没有新增风险、卡点、权限、验收、架构、回滚或范围变化，且未超过修正次数，系统可以在原批准版本内自动重新派发。出现上述任何变化，或明确要求重新审批时，旧审批失效，系列暂停，必须形成新版本并取得用户审批。策划部会持续修正和验收，直到通过或触发停止条件，不能静默跳过失败修正。

全部工作项验收通过、没有开放卡点、没有待处置的新风险且当前方案状态为 `completed` 后，策划部才可以按方案声明准备同系列的下一版本。新版本仍为 `awaiting-user-approval`，不得自动执行。头脑风暴只用于策划发现、比较候选方案和暴露风险，不修改产品、不产生审批，也不能绕过卡点。

## 连续自动派发

连续自动派发表示：在一个已经获得批准的方案系列中，任务报告通过策划部验收后，运行时自动推进下一个任务，不要求用户每项都重新发送“继续”：

~~~text
已批准方案
  -> 派发就绪任务 A
  -> 接收执行报告
  -> 策划部验收报告 A
  -> 派发依赖已满足的任务 B
  -> 接收报告 B
  -> 直到方案完成或某个闸门暂停
~~~

只有以下条件全部满足，才能派发下一项：

~~~text
planning_review == accepted
user_approval.plan_id == 当前方案 plan_id
user_approval.plan_version == 当前方案 plan_version
未解决 blocker == 0
任务依赖 == accepted
执行适配器/会话 == available
任务状态 == ready 且尚未派发
~~~

阶段调度使用 `stages[].stage_id`、`order`、`kind`、`required_skills` 和 `agent_selectors`；工作项携带
`stage_id`、`stage_order` 和 `stage_kind`。只有最早的未完成阶段处于激活状态。并行阶段受 `max_parallel`
限制，必须是相互独立的工作项，并在汇合验收后才能激活下一阶段。

上述 `accepted` 条件用于解锁不同的依赖工作项。同一工作项的普通修正可以使用单独闸门：
`decision == revision-required`，修正仅限补做已批准工作、修复缺陷或更换实现方法，未解决 blocker 为 0，
没有新风险或实质变化，原审批仍精确匹配，且未超过修正次数。

发现新风险、未解决卡点、超出批准范围的修订、超过重试次数、会话不可用或方案发生实质变化时，运行时会停止并返回策划部和用户。仅补做遗漏或在原契约内更换实现方式的普通修正可以在原版本内自动重新派发。新版本必须重新审批。“执行部说已完成”不能绕过这些闸门。

PDGO 提供以下入口：

- resume / run-once：重启后处理队列中的报告和验收结果，并恢复可派发任务；
- watch：作为显式的常驻进程重复运行同一轮调度；
- FlowStateRuntime.runOnce() 和 FlowStateRuntime.watch()：嵌入其他宿主服务。

文件队列默认保持显式和可审计。若要实现无人值守的跨会话执行，还需要可访问的 App Server 传输层或真实的队列消费者。

## 审批、风险和卡点

每个方案在审批前必须公开：

- 项目目标和完成后的可观察结果；
- 允许修改范围和明确排除范围；
- 防止未经用户请求或批准版本变更而主动深化细节的策略；
- 范围和非目标；
- 假设和依赖；
- 验收标准和预期证据；
- 允许路径和禁止操作；
- 回滚和停止条件；
- 所有已知风险及处理方式；
- 所有卡点、负责人和解决方式；
- 剩余不确定性和外部影响；
- 自动派发的启用条件。

用户审批绑定到：

~~~text
plan_id + plan_version + 已批准范围 + 已确认风险 + 卡点处置
~~~

范围、架构、依赖、风险、验收、权限或回滚发生实质变化时，必须创建不可变的新版本，旧审批失效。任何新风险或卡点都会阻止自动修正、依赖解锁、方案完成和下一版本准备；高风险或关键风险还会立即清除当前审批并要求重新审查。卡点只有在有明确解决记录和证据后才能关闭。

## 方案身份和系列连续性

使用稳定的方案系列 ID 和可读的方案标题。建议的方案命名格式：

~~~text
PROJECT-YYYYMMDD-NNN-readable-topic-vN
~~~

保持目标、负责人、目标系统和验收链路不变的扩展复用 plan_series_id，创建新的不可变版本，并复用策划/执行控制会话。并行目标创建新的系列和新的控制会话，记录 parallel_of，验收后的结果再同步回父系列。

## 对话记忆和索引

记忆以对话为根。每个会话都记录指令、上下文、检查点、派发、结果、总结、决定、未解决事项和跨会话引用。

读取历史内容前先检索索引：

~~~text
conversations/<session_id>/
plans/<plan_series_id>/<plan_version>/
knowledge/<domain>/
indexes/plan-index.json
indexes/session-index.json
indexes/knowledge-index.json
~~~

调度器会在状态文件旁生成 plan-index.json 和 session-index.json。索引只用于发现；方案、会话、报告和总结等源记录才是证据来源。每次跨会话读取都要记录在当前会话中。

## 按场景路由 Skill

启动时至少识别：

~~~text
project, operation, department, stage, scenario,
inputs, outputs, constraints, risk, mode, approval state
~~~

路由器根据正向场景、反向场景、边界、输入、输出、前置条件、副作用和风险筛选 Skill。Skill 名称或关键词本身不能成为调用依据。没有可靠匹配时，操作以 skill-unresolved 停止，而不是猜测。

仓库包含协调、策划、实现、验证、调试、发布、记忆和适配器 Skill。可检索目录由 Skill 场景元数据生成。

## 活动 PDGO Skill 与专业 Agent

当前活动路由固定为 10 个 Skill。14 份完整工作流基线保存在只读集成档案中，生成活动 Skill 时与 PDGO 治理规则合并。

| Skill | 融合能力 |
| --- | --- |
| `pdgo-route-work` | 启动路由与能力选择 |
| `pdgo-dialogue-memory` | 对话记忆、索引与交接 |
| `pdgo-plan-work` | 策划、头脑风暴与方案编写 |
| `pdgo-execute-work` | 执行、并行派发、子 Agent 与 worktree |
| `pdgo-review-request` | 独立验收请求 |
| `pdgo-review-receive` | 证据化验收决策 |
| `pdgo-debug-work` | 系统化调试 |
| `pdgo-tdd-work` | 测试驱动开发 |
| `pdgo-completion-work` | 完成前验证与分支交接 |
| `pdgo-skill-authoring` | Skill 编写与验证 |

机器审计记录工作流基线的 SHA-256、Git blob 哈希和逻辑段落融合去向，活动路由不显示外部来源名称。

锁定目录按 18 个分类保存 271 个专业 Agent，每个 Agent 都有基于原始提示证据生成的 YAML 说明。只有高置信度且具备结构化输入、输出证据的条目允许自动选择，其余均为 `manual-only`，需要在获批任务中显式填写 `external_agent_id`。Agent 不能批准方案、关闭卡点、改变范围或替代独立验收；部门候选分类和 Skill 要求见 `profiles/pdgo-agent-routing.json`。

## 运行时和适配器

FlowStateDispatcher 负责状态机；FlowStateStore 持久化方案、任务、派发、报告、验收、卡点、事件和派生索引。

| 适配器 | 用途 | 限制 |
| --- | --- | --- |
| FileQueueAdapter | 本地、CI、人工交接和审计复核 | 需要队列消费者，不声称远程会话已经存在 |
| CodexAppServerAdapter | 对接真实 thread/start 和 turn/start | 必须注入可访问的传输层 |
| AgencyAgentsAdapter | 在基础适配器上按场景选择外部角色 | 外部角色只能提供建议，不能审批、扩大范围或清除卡点 |

适配器必须返回真实会话 ID，或者明确返回 adapter-unavailable。不得伪造完成。

## 快速开始

安装或复制项目方法 Skill：

~~~powershell
Copy-Item -Recurse -Force .\skills\pdgo-route-work `
  "$env:USERPROFILE\.codex\skills\pdgo-route-work"
~~~

创建并批准方案，再通过确定性 CLI 派发：

~~~powershell
node scripts/flowstate-dispatcher.mjs --action create-plan --input plan.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action approve --input approval.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action dispatch --input dispatch.json --root .flowstate --project demo
~~~

重启后恢复，或运行持续的本地队列消费者：

~~~powershell
node scripts/flowstate-dispatcher.mjs --action resume --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action watch --root .flowstate --project demo --interval-ms 1000
~~~

watch 是显式选择的常驻模式；需要无人值守时，建议交给服务管理器或 CI 监督。

## 仓库结构

~~~text
AGENTS.md                         仓库贡献和安全规则
docs/                             规范、架构和运行时说明
schemas/                          方案、派发、报告、验收和会话契约
templates/                        方案、总结和报告模板
profiles/                         项目配置和 Skill 目录
skills/                           可安装的场景 Skill 和索引
scripts/lib/flowstate-dispatcher  状态存储、适配器、调度器和运行时
scripts/                          CLI、目录生成、导入和验证工具
integrations/                     外部角色目录和来源元数据
tests/                            契约、调度器、适配器和 Skill 测试
~~~

## 兼容性和扩展

除非契约明确要求，新字段必须以可选方式新增。现有 ID 和状态保持兼容。新增部门、角色、Skill、适配器或语言文件时，应声明场景、边界、输入、输出、副作用、权限和验证证据。

## 语言

README.md 是 GitHub 默认的英文入口。翻译文件使用 README.<locale>.md 命名；每个入口顶部只链接仓库中实际存在的语言文件。当前参考翻译是本文件。新增西班牙语、日语、法语等常用语言时，无需改变 PDGO 的契约或运行时。

## 验证

~~~powershell
npm.cmd run test:node
npm.cmd run validate
~~~

测试覆盖 Skill 目录、审批绑定、系列连续性、派发契约、队列幂等、重启恢复、卡点处理、外部角色边界和生成索引。

## 状态和许可

PDGO 是 FlowState 方法的 MIT 许可参考实现。仓库保持平台中立；任何文件系统无法提供的会话或后台能力，都必须通过平台适配器接入。
