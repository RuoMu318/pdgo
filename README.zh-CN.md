# PDGO - Project Development Governance Orchestrator（项目开发治理编排器）

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

执行部异常停止不等于正常结束。进程崩溃、意外终止或明确的异常停止信号发生后，执行部必须立刻向固定策划部对话发送正式 `BLOCKER_REPORT`，逐项列明卡点原因、影响、解决建议和是否需要用户处理。策划部必须记录报告并向执行部发送 `PLANNING_BLOCKER_OPINION`：如果所有卡点都能在已批准契约内解决，策划部记录解决结果并重新派发停止的原任务；如果不能解决，则在策划部对话发送 `USER_ACTION_REQUIRED` 通知用户，并保持执行暂停。禁止静默重试或静默修改卡点状态。

普通修正仅限于原方案已经要求的工作：补做执行部遗漏的项目、修复缺陷，或在保持批准契约不变的前提下换一种实现方法。新增风险或卡点必须先暂停并由策划部处置；只有解决方式改变权限、验收、架构、回滚、范围或其他已批准契约内容时，旧审批才失效并要求形成新版本和用户审批。策划部能在原契约内解决的卡点，记录解决意见后可以重新派发原任务。策划部会持续修正和验收，直到通过或触发停止条件，不能静默跳过失败修正。

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

能力经验只有同时满足“本轮有证据证明有效”和“可跨任务复用”才持久化。优先更新既有知识笔记；不新建空目录或静态能力目录。

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

当前可验证目录保存专业 Agent 及其基于原始提示证据生成的说明。只有高置信度且具备结构化输入、输出证据的条目允许自动选择，其余均为 `manual-only`，需要在获批任务中显式填写 `external_agent_id`。Agent 不能批准方案、关闭卡点、改变范围或替代独立验收；部门候选分类和 Skill 要求见 `profiles/pdgo-agent-routing.json`。

用户问“能力图”或“为什么选它”时，BossCoding 先查询当时实时可验证的目录；查询和选择顺序固定为：先查宿主当前实际可用的角色，再查当前已安装且可用的 Persona／人物 Skill，最后查经当前 manifest 哈希校验的外部 Agent；先查询相关来源，再回答。不硬编码角色或 Persona 的数量与完整名单，也不向用户倾倒内部 ID。README、缓存、记忆和静态摘录只能作线索，不能作为实时来源。

## 运行时和适配器

FlowStateDispatcher 负责状态机；FlowStateStore 持久化方案、任务、派发、报告、验收、卡点、事件和派生索引。

| 适配器 | 用途 | 限制 |
| --- | --- | --- |
| FileQueueAdapter | 本地、CI、人工交接和审计复核 | 需要队列消费者，不声称远程会话已经存在 |
| CodexAppServerAdapter | 对接真实 thread/start 和 turn/start | 必须注入可访问的传输层 |
| AgencyAgentsAdapter | 在基础适配器上按场景选择外部角色 | 外部角色只能提供建议，不能审批、扩大范围或清除卡点 |

适配器必须返回真实会话 ID，或者明确返回 adapter-unavailable。不得伪造完成。

## 三模式启动分流

Codex-native 源码现在会先分流，再加载各模式的副作用。轻量模式由当前 Agent 直接完成，额外模型调用、
子 Agent、PDGO 状态写入、新增 PDGO 批准、正式计划、治理提示和角色流程均为零；标准模式由当前 Agent
执行并做相称自检，不加载治理提示，也不新增 PDGO 批准。高保障模式加载秘书规则，但默认仍由当前 Agent
完成；只有外部、破坏性、难撤销或明确要求独立审核时才增加最多一个只读审核者。完整 PDGO 三角色必须在
说明额外 Token 和流程成本后由用户明确启用。

可执行风险门先于工作量判断。轻量和标准都要求结构化 `current_request_boundary`，包含来源、动作、目标和获准的本地绝对根；
动作必须属于普通模式封闭集并与待执行动作一致，文件目标必须规范化、与请求一致且位于该根内。路径遍历、根外路径、宽泛目标、
发布／删除／格式化动作、字段矛盾、字段缺失或命中风险都会进入高保障或停止。两种模式都输出
`authorization_source=explicit-current-user-request` 和 `pdgo_new_approval_rounds=0`，只区别工作深度。这个源码级结构化契约不构成实时宿主证明。一次真实的有界本地写入已经验证当前 Agent 的文件行为，但当前 Codex 宿主没有提供可信的路由／遥测回执，因此仍不能证明宿主自动选择了普通模式。
高保障计划还可启用授权包络：由注入的可信宿主适配器证明不可变批准边界的 SHA-256 摘要，并让同一包络
贯穿派工、报告和审核；自报验证或普通 FileQueue 消息不算宿主证明。一个获批批次的计划、绑定、派工、报告和审核记录复用同一次授权；
只有目标、对象、动作、风险、第三方影响、授权边界或验收发生实质变化时才重新批准。

当前版本已经安装到本机 Codex，schema 1.1 描述符和完整运行时树哈希均通过；未 push、未发布。宿主没有提供本次运行的账单 Token，公平配对的耗时／质量基准也未完成，因此不宣称真实节省，`savings_proven` 仍为 `false`。

## BossCoding 冷启动

进入高保障模式或用户显式调用秘书／BossCoding 后，秘书先由当前 Agent 在内存中形成批次；只有用户明确启用完整 PDGO 三角色时，才读取 `<CodexHome>/runtime/bosscoding/runtime.json` 这一份 schema 1.1 描述符。描述符先锁定 manifest；已校验 manifest 再给出完整 `runtime_tree.paths`，覆盖 dispatcher、实际导入库、冷启动 resolver，以及专业角色的索引、元数据索引和提示词树。缺失、越界、路径经过链接或哈希漂移都会停止，不会搜索磁盘猜路径。

陌生项目先只读检查，不创建项目状态。秘书在内存中起草完整批次并取得一次精确批准后，才在 `<CodexHome>/state/bosscoding/projects/<name>-<hash16>` 创建隔离状态。之后每个 BossCoding 状态动作都通过已安装 resolver 的 verified invoke 入口：它重新校验运行时、按项目规范路径重算状态根，并拒绝任意 `--root` 或外部目录覆盖。普通 PDGO 的直接 CLI 仍是单独选择的旧接口，不是老板需要手工操作的流程。

只有明确启用的完整 PDGO 计划才使用 `bosscoding-v2` 三角色契约。`host_agent_type` 由主 Agent 从真实 `spawn_agent.agent_type` 参数记录；`selection_source` 只是获批的选角来源记录，不是 spawn 参数或密码学证明。`permission_mode` 也是治理边界，不等于操作系统沙箱。当前保护目标是防止误配置、普通并发和本地漂移，不声称能隔离已经以同一 Windows 用户身份运行的恶意进程。

dispatcher 明确分开“只能由已安装 resolver 发起的受控调用”和“直接旧 CLI”：直接 CLI 不接受调用者冒充受控入口，也拒绝 BossCoding v2 状态；受控入口则拒绝新建 legacy 计划。状态和队列写入会拒绝隔离目录内部的链接或非规范路径。安装器先原子发布完整锁，再记录每个原目标的类型和摘要；安装期间目标或源码变化就停止，提交后逐项复核，回滚时若发现外部新修改会保留现场而不是静默覆盖。对于已存在的 CodexHome，安装器会在创建目录或安装锁前先剥离受管 overlay 并检查未受管文本中的已知旧版“任何文件写入都重新批准”绝对规则；无冲突后取得锁，并在锁内再次检查，再允许修改目标。它兼容普通空白与换行差异，但不声称理解任意自然语言政策。

### 可选的人物 Skill

PDGO 可独立使用，不安装[女娲](https://github.com/alchaincyf/nuwa-skill)也不影响正常任务和 Agency Agents 专业角色选择。Agency Agents 负责提供功能专家，但不替代特定人物视角。

需要创建、更新或审核人物 Skill 时，再从女娲官方仓库单独安装女娲；需要使用某位人物视角时，请单独安装对应的人物 Skill。

## BossCoding 快速开始

在 Codex 里直接说 `秘书：<任务>`、`秘书，按 BossCoding 做：<任务>`，或调用
`$bosscoding-secretary <任务>`。秘书会起草一个精确批次，默认由当前 Agent 完成；只有风险确实需要时
才加一个只读审核者。只有你明确说“完整 PDGO 三角色”，才启用三角色流程。老板不需要运行 dispatcher CLI，也不需要在 Agent 之间搬运 JSON。

## 旧版 PDGO 直接 CLI

直接 CLI 只用于开发者兼容明确声明 `role_contract.version: legacy-v1` 且
`migration: role-assignments-not-recorded` 的旧计划；它不能创建或操作 BossCoding v2 状态。输入文件必须是
legacy 专用计划，不能直接使用默认 v2 的 `schemas/plan.yaml`：

~~~powershell
node scripts/flowstate-dispatcher.mjs --action create-plan --input legacy-plan.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action approve --input legacy-approval.json --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action dispatch --input legacy-dispatch.json --root .flowstate --project demo
~~~

旧版恢复仍需显式调用；`watch` 是选择性的常驻模式，BossCoding 不会启动它：

~~~powershell
node scripts/flowstate-dispatcher.mjs --action resume --root .flowstate --project demo
node scripts/flowstate-dispatcher.mjs --action watch --root .flowstate --project demo --interval-ms 1000
~~~

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

### BossCoding 来源与署名

本仓库中的 BossCoding 相关集成，是 PDGO 基于 Khazix 的 BossCoding 0.5.1
所做的独立适配，原项目采用 MIT 许可证。本适配不代表 BossCoding 官方发布、
合作或背书。完整来源与许可见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 状态和许可

三模式分流已完成本地源码验证并安装到本机 Codex，运行时树校验通过。可信的自动分流宿主证明和账单 Token 仍不可用，因此真实配对的 Token、耗时和质量基准仍待具备宿主接口后执行。

PDGO 是 FlowState 方法的 MIT 许可参考实现。仓库保持平台中立；任何文件系统无法提供的会话或后台能力，都必须通过平台适配器接入。
