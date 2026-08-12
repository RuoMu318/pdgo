# PDGO 三模式分流需求

> 状态：v1 提示词／配置纵切已通过本地验证；v3 有界本地动作路由仍是未安装的源码候选，只有完整验证与独立审核后才能称为已接受。
>
> 原则：先按任务的风险、可逆性和验收需要分流，再加载完成任务所需的最小流程。未实测阈值只能称为“拟议门槛”，不得宣称已经省钱或通过验证。

## 1. 目标与边界

本需求把任务分为轻量模式、标准模式和高保障模式，使治理成本与任务风险相称，同时保留可核查的路由、成本和结果记录。

本轮源码候选把 v2 的权限例外推广为所有低风险工作的有界本地动作门，并为安装器增加已知旧规则冲突拒绝；不修改 CLI wrapper、manifest、schema、依赖、全局安装或生产配置，也不授权外部动作。

## 2. 三种模式

| 模式 | 定义 | 典型例子 |
| --- | --- | --- |
| 轻量模式 | 当前主 Agent 在一次连续任务内直接完成明确、局部、低风险、可撤销的工作，不产生 PDGO 治理开销 | 简单问答、翻译、短改写、指定材料的只读解释、用户明确要求的本地小改 |
| 标准模式 | 任务仍可在当前工作区内完成和回滚，但复杂度、文件数量或验证范围已超过轻量边界；采用有界执行和相称自检 | 普通功能修改、边界固定且可测试的多文件机械修改、局部故障修复 |
| 高保障模式 | 任务因外部影响、风险、难撤销性、持续时间或验收要求，需要精确计划和更强边界；默认仍由当前 Agent 完成 | 对外发送或发布、生产变更、敏感数据操作、破坏性或难撤销操作、跨会话任务、要求独立验收的任务 |

使用多少 Agent 不是判定高保障模式的条件。模式先由任务本身决定，再配置资源：默认单 Agent；只有外部动作、破坏性或难撤销操作、用户明确要求独立审核时，才增加最多一个只读审核者；完整 PDGO 三角色必须由用户在看见额外 Token／流程成本后明确要求。只要启动子 Agent，该次运行就不再满足轻量模式硬约束。

## 3. 客观分流规则

### 3.1 轻量模式

只有同时满足以下条件才进入轻量模式：

1. 目标、对象、动作和完成标准明确，当前上下文足以执行。
2. 工作仅发生在本地，不改变第三方可见状态。
3. 风险低，改动局部且可直接撤销，不涉及受保护对象。
4. 一次连续任务即可完成，不需要跨会话恢复或独立验收。
5. 只需读取指定材料，不需要完整目录、历史、Vault、能力目录或角色树。
6. 不需要依赖安装、升级、锁文件更新或联网下载。
7. 能用轻量、确定性的局部检查验证结果。

用户原始请求如果已明确指定本地对象和动作，就是轻量模式对该对象和动作的授权，不再增加 PDGO 批准轮次。上级安全规则、受保护文件规则和外部动作确认仍然有效。

### 3.2 标准模式

满足以下全部条件，但超过轻量规模时，进入标准模式。标准模式不加载治理提示，也不新增 PDGO 批准：

- 目标、范围和完成标准明确；
- 改动仍在一个明确工作区内，风险低或中等并可回滚；
- 不触发第 3.3 节的高保障条件；
- 验证可由确定性检查或当前执行上下文的相称自检覆盖。

多文件机械修改只有在文件集合、变换规则、停止条件和测试方法都有限且预先明确时，才可进入标准模式。范围无法枚举、变换无法确定或验证不能覆盖时，必须升级。

依赖安装、依赖升级、锁文件变更和联网下载必须作为单独动作重新评估其权限、来源、影响和回滚方式，不能随其他修改搭便车进入轻量模式。

轻量和标准共用同一个有界本地动作门：必须提供结构化 `current_request_boundary`，其 `source` 为 `current-user-request`，`action` 属于普通模式动作封闭集并与 `local_action.action` 一致，`targets` 与待执行目标逐项一致，`approved_local_root` 是非文件系统根的本地绝对路径。文件目标必须先规范化再验证仍位于该根内；路径遍历、根外绝对路径、宽泛目标、`publish`／`delete`／`format` 等封闭集外动作以及字段矛盾全部拒绝。仅有 `explicit_current_request: true` 的布尔自报不能绑定请求。动作仍须仅本地、可撤销，并且 `wildcard`、`administrator`、`account`、`global`、`network`、`secrets`、`production`、`third_party`、`destructive`、`irreversible`、`sensitive_data` 十一项风险全部显式为 `false`。任一字段缺失、范围扩大或任一风险为真，都在工作量判断前进入高保障模式或停止。两种模式都输出 `authorization_source: explicit-current-user-request` 和 `pdgo_new_approval_rounds: 0`，只按工作深度选择直接执行或相称自检。这个源码级结构化边界不构成实时宿主证明；普通模式的 live host attestation 仍未实现，也不取消宿主或操作系统仍要求的权限提示。

### 3.3 高保障模式

出现任一条件即进入或升级高保障模式：

- 对外发送、提交、发布、部署、购买、支付，或不满足第 3.2 节有界本地动作条件的权限变更；
- 生产配置、账号、密钥、身份认证、敏感或高影响隐私数据；
- 删除、覆盖、大范围迁移等破坏性或难撤销动作；
- 错误后果高、难以及时发现，或需要执行者之外的独立验收；
- 任务需要跨会话恢复、持久状态或多个相互依赖阶段；
- 目标、范围、授权或完成标准存在会改变执行方向的歧义；
- 执行中出现新的高风险事实、范围失控或关键证据缺口。

进入高保障不等于自动启动三角色。当前 Agent 默认负责计划、执行、验证和汇报；只有外部动作、破坏性或难撤销操作，或用户明确要求独立审核时，才增加最多一个只读审核者。明确要求 full PDGO 三角色才会显式启用：必须先说明额外 Token／流程成本。

### 3.4 升级与降级

- 路由必须发生在模型扩展调用、子 Agent、PDGO 状态写入和目标修改之前。
- 命中更高模式条件时，先停止尚未获准的动作，再升级并记录事件；已经发生的调用、耗时和写入不得删除或改标签。
- 降级只允许在更高模式的专属副作用尚未发生时进行，并必须重新满足低一级全部条件。
- 一个高保障计划中的独立子任务可以在新任务边界重新分流，但不得用追溯降级取消既有治理或验收要求。

可执行分类器必须先检查高保障风险和有界本地动作完整性，再读取 `workload`。风险证明、授权字段或工作量值缺失时一律 fail closed（停止并进入高保障），不能用默认 standard 掩盖未知。

## 4. 可选授权包络

显式 full PDGO 计划可启用 `authorization_policy.required: true`。dispatcher 用稳定 JSON 排序和 SHA-256 对不可变批准边界生成 `boundary_digest`；边界包含精确 plan/version、范围、禁止动作、完成条件、任务范围和三角色分配，不包含运行状态、报告内容或其他可变字段。默认单 Agent 路径不为此创建 PDGO 状态。

宿主证明只能由注入的可信 transport／adapter 返回。批准 JSON、父 Agent 文本或消息中自报的 `verified: true` 都不是证明。启用策略后，同一 `authorization_envelope` 必须贯穿 plan、approval、dispatch、execution report 和 review decision；既定批次的计划持久化、绑定、派工、报告和审核记录复用同一次批准，不逐项追问。只有目标、对象、动作、风险、第三方影响、授权边界或验收发生实质变化时才重新确认。缺失、不一致、过期、plan/version 漂移、范围漂移或角色漂移都 fail closed。未启用策略的旧计划保持兼容。

### 4.1 安装前旧规则冲突

对于已存在的临时或未来获批 CodexHome，安装器必须在创建任何目录或安装锁前只读剥离受管 overlay，并检查剩余未受管 `AGENTS.md` 文本是否包含已知旧版“任何文件写入都重新批准”绝对规则。无冲突后才取得安装锁，并在锁内重新读取和复检，之后才能写入目标。检测允许普通空白和换行差异；命中时整批拒绝，且安装锁从未出现。该检测只匹配已知规则，不声称理解任意自然语言政策。当前真实 CodexHome 和全局规则不在本轮修改范围。

## 5. 轻量模式硬约束

每次轻量运行必须同时满足：

- `extra_model_calls = 0`：相对宿主直接完成同一任务，PDGO 额外模型调用为零；
- `subagents = 0`；
- `state_writes = 0`：PDGO 计划、派工、恢复或审核状态写入为零，用户请求的目标文件修改不计入该字段；
- `pdgo_new_approval_rounds = 0`；
- `formal_plan_generations = 0`；
- `governance_prompt_loads = 0`；
- `role_process_loads = 0`；
- 不生成或加载正式计划、治理提示、部门或角色流程；
- 不扫描完整目录、完整历史、整个 Vault、完整能力目录或角色提示词树；
- 不重复加载或注入同一请求、规则、材料、计划或证据。

任一硬约束失败时，`actual_mode` 不得记录为轻量模式，即使 Token 或耗时更低也不例外。

## 6. 最小观测

观测优先复用宿主现有遥测，不得为了轻量模式创建持久状态。每次运行至少记录：

```yaml
run_id: string
task_id: string
selected_mode: lightweight | standard | high_assurance
actual_mode: lightweight | standard | high_assurance
routing_events:
  - type: hit | upgrade | downgrade
    rule: string
    from: mode | null
    to: mode
resource_policy: clean-context, medium user-approved-or-host-default reasoning, planning 0/0, execution 0/0, review 1/0, compact evidence, stop-and-report, host_enforced false, savings_proven false
processing_token_note: "宿主没有可信计量时记为 unavailable；源码策略和处理计数不等于账单 Token，也不证明已经节省。"
total_billable_tokens: number | unavailable
total_billable_tokens_source: provider | host | unavailable
extra_model_calls: integer
subagents: integer
state_writes: integer
pdgo_new_approval_rounds: integer
formal_plan_generations: integer
governance_prompt_loads: integer
role_process_loads: integer
agent_requested_user_turns: integer
user_interruptions: integer
interruption_reason: [string] | unavailable
user_wait_ms: integer | unavailable
elapsed_ms: integer
success: true | false
context_sources:
  - source: string
    read_scope: string
    load_count: integer
duplicate_context_loads: integer | unavailable
measurement_source: measured | provider_reported | derived | proxy | unavailable
telemetry_gaps: [string]
```

`context_sources` 必须穷尽本次运行实际读取的全部来源及范围，而不是只列预期材料；无法取得完整读取记录时必须在 `telemetry_gaps` 标明。`formal_plan_generations`、`governance_prompt_loads` 和 `role_process_loads` 分别记录正式计划生成、治理提示加载和部门或角色流程加载次数，用于直接核验轻量模式的三个零值。

`agent_requested_user_turns` 只计 Agent 主动要求用户再回复的次数；`pdgo_new_approval_rounds` 是其中由 PDGO 新增批准造成的子集，两者不得相加。`user_interruptions` 只计用户在 Agent 未请求回复时主动打断或改变当前运行的次数，`interruption_reason` 按发生顺序对应记录；`user_wait_ms` 只累计 Agent 请求回复后等待用户的时间，并已包含在 `elapsed_ms` 中，不得再次相加。宿主无法可靠区分或计时时，相应字段写 `unavailable` 并列入 `telemetry_gaps`。

`measurement_source` 可以作为记录级统一声明；来源不同或属于代理值的字段必须单独覆盖来源，不能把代理值写成实测值。

PDGO 边际 Token 只在相同任务、版本、启动类型和重复序号的配对运行中计算：

```text
pdgo_marginal_tokens_abs
  = total_billable_tokens(pdgo_routed_pair)
  - total_billable_tokens(native_codex_pair)

pdgo_marginal_tokens_ratio
  = pdgo_marginal_tokens_abs
  / total_billable_tokens(native_codex_pair)
```

`pdgo_marginal_tokens_abs` 是允许为负的 Token 差值，不取绝对值。任一配对值不可测、配对不成立或分母不大于零时，相应结果必须为 `unavailable`。失败、超时、返工和用户打断发生前后的全部调用、Token 和耗时都计入本次尝试。

## 7. 四方公平基准

基准比较以下四个冻结条件：

1. 原生 Codex；
2. 固定版本的外部同类方案；
3. 当前完整 PDGO；
4. 实现三模式分流后的 PDGO。

精确外部对照由机器可读 consumer profile 冻结；公开需求只使用中性名称，不改变四方比较对象。

每次基准必须保存足以复现和解释差异的最低信息：

- 四方各自的精确版本，以及宿主版本或可复现的环境标识；
- 相同模型及版本、推理强度、权限、工具、冻结任务输入和成功标准；
- 统一超时与停止条件；
- 随机或平衡的运行顺序，并记录区组和重复序号；
- 明确的缓存准备步骤，冷启动和热启动分开运行、分开报告；
- 无法控制的缓存、队列、网络、seed 等变量及其实际状态；
- 从首次调用到停止的失败、澄清、返工、重试、打断和全部成本。

成功必须由四方共用的预先冻结标准判定。需要人工判断时，应隐藏方案标识并使用同一评审规则；被测方案自报完成不构成成功证据。

## 8. 拟议门槛与报告限制

在真实配对基准完成前，所有 Token、费用、耗时、成功率和百分比阈值都只能标为“拟议门槛”。报告不得作节省或通过结论。

轻量模式的全部零值和禁止加载规则属于行为硬约束，不因成本结果而放宽。其他发布阈值必须在运行前冻结；报告同时给出样本数、原始数值、冷热启动、失败与返工，以及不可测字段。

缺少 `total_billable_tokens` 时必须报告 `unavailable`，不得用字符数、消息数或 tokenizer 估算冒充账单 Token；此时两个 PDGO 边际指标也必须为 `unavailable`。

## 9. 关键验收场景

### AC-01：轻量本地小改

- **Given** 用户明确指定一个本地对象和低风险、可撤销的小改；
- **When** 当前主 Agent 在一次连续任务内修改并做局部检查；
- **Then** 不增加 PDGO 批准，七项轻量硬约束计数均为零；未生成正式计划，未加载治理提示、部门或角色流程，且只读取目标和必要规则。

### AC-02：有界多文件修改

- **Given** 多文件机械修改的文件集合、规则和测试边界均已冻结；
- **When** 路由器分类；
- **Then** 进入标准模式；若范围变得不可枚举、测试不能覆盖或出现依赖变更，则在继续前重新评估并升级或单独授权。

### AC-03：高保障触发

- **Given** 任务涉及生产、外部状态、敏感数据、难撤销动作、跨会话恢复或独立验收；
- **When** 首次命中任一条件；
- **Then** 在对应动作前进入高保障模式，并应用该模式的计划、授权和验收边界；默认由当前 Agent 完成，只有外部、破坏性、难撤销或明确独立审核才增加一个只读审核者。

### AC-03A：完整 PDGO 只显式启用

- **Given** 高保障任务没有明确要求完整 PDGO 三角色；
- **When** 形成资源配置；
- **Then** 不启动策划或执行子 Agent、不创建 PDGO 状态；只有用户看见额外成本并明确要求后，才启用完整三角色。

### AC-04：实际模式与成本不回写

- **Given** 任务最初选择轻量模式；
- **When** 运行中启动子 Agent、写入 PDGO 状态、生成正式计划、加载治理提示或角色流程，或命中更高风险条件；
- **Then** 记录升级事件，`actual_mode` 改为实际模式，并保留此前全部调用、写入、耗时和失败。

### AC-05：不可测不冒充结果

- **Given** 宿主不提供某一配对运行的总账单 Token；
- **When** 生成基准报告；
- **Then** 相关总账单与边际指标均为 `unavailable`，报告只陈述已观测事实，不宣称节省。

## 10. 实施完成条件

完整落地仍必须：

1. 在任何模式专属副作用前完成路由并记录命中规则；
2. 用确定性测试覆盖三种模式、升级、降级、轻量全部零值、未生成正式计划和未加载治理提示或角色流程；
3. 证明本地小改不新增 PDGO 批准，多文件超限和依赖动作不会搭便车；
4. 通过第 7 节四方基准后，才把任何拟议成本或质量门槛改为实测结论；
5. 明确区分自检、独立验收、真实宿主结果和不可测证据。
6. 启用授权策略时，证明同一包络贯穿派工、报告和审核，并对缺证明、伪造自报、不匹配、过期、版本／范围／角色漂移执行 fail closed。
7. 证明标准模式复用用户当次明确请求而不新增批准，并证明一个高保障批次的内部记录复用同一包络，只有实质变化才重新批准。
8. 证明安装器遇到未受管的已知旧绝对规则时，在任何目标写入前原子拒绝；受管 overlay 中的旧文本不参与冲突判断。
