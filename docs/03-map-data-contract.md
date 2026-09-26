# 03 · 地图数据契约

## 1. 版本与边界

规范源文件为 `map.codemap.json`，v0.1 使用 `schemaVersion: "0.1"`。对应[JSON Schema](../schemas/codemap.schema.json)定义结构约束；本章定义 JSON Schema 无法表达的跨对象与语义不变量。两者都通过才允许标准交付。

IR 不包含可执行代码、任意 HTML 或布局像素。`text` 和说明字段作为纯文本渲染。代码片段是数据，不能被执行。未在当前 Schema 声明的字段会被拒绝；使用新增可选字段的地图需配套更新后的工具包，不假设旧工具能理解新字段。

## 2. 顶层对象

| 字段 | 内容 | 约束 |
| --- | --- | --- |
| `schemaVersion`、`mapId` | 协议版本、地图逻辑 ID | mapId 不随单次布局变化 |
| `title`、`language` | 地图标题、讲解语言 | 标识符不翻译 |
| `scope` | question、audience、可选 viewpoint、inScope、outOfScope、assumptions、entryEntityIds | 问题与边界必填；viewpoint 为 flow/architecture |
| `snapshot` | 输入快照和文件指纹 | 同一地图只解释一个快照 |
| `rootNodeId` | 讲解树根 | 唯一根 |
| `entities` | 函数、类型、接口、状态、外部对象、概念 | 事实对象表 |
| `nodes` | 主题、模块、机制、函数、步骤、代码、边界 | 讲解出现位置表 |
| `ports` | 可定位的接口/调用点 | 可选细粒度端点表，空数组合法 |
| `relations` | 实体之间的原子关系 | 原始关系不保存聚合线 |
| `flows` | 某实现单元内部的步骤流 | 与跨实体关系分开计数 |
| `evidence` | 固定文件与行范围 | 证据索引 |
| `snippets` | 原始片段与显式省略 | 只从快照提取 |
| `primaryPath` | 建议首次阅读的节点序列 | 顺序代表讲解，不冒充运行轨迹 |
| `coverage` | completePaths、partialPaths、excludedPaths、openQuestions | 描述问题覆盖，不计算虚假全库百分比 |

完整、可解析的样例见 [MiniFS 流程数据](../examples/minifs/map.codemap.json) 与 [同源架构数据](../examples/minifs/architecture.codemap.json)。这是一份教学代码的协议演示，不是对 Linux VFS 的实现声明。

`scope.viewpoint` 为可选的主阅读视角：`flow` 围绕执行阶段和分支，`architecture` 围绕职责模块及联系。旧地图省略时保留通用导读。视角不改变实体事实、自动创建关系或重组讲解树；架构图的模块内部可以继续展开局部流程。`coverage` 的既有文本数组在架构视角下描述职责和协作覆盖，`order` 及 `primaryPath` 不表达执行时序。

## 3. Snapshot：固定解释对象

```ts
type Snapshot = {
  id: string;
  kind: 'git' | 'content';
  revision?: string;          // git 的完整提交 ID，禁止仅写 main
  dirty: boolean;
  repositoryUrl?: string;     // 可公开、已去除凭据的 https URL
  configuration: string[];    // 架构、构建选项及已知条件
  files: { path: string; sha256: string }[];
};
```

`files` 是本图已取证文件集合，不宣称覆盖整个仓库。sha256 对原始文件字节计算；行范围按解码后的物理行，行号从 1 开始、首尾包含。片段统一为 LF 且不带区间末尾换行，核验时采用同一规范化规则，文件指纹仍以原始字节为准。

Git dirty 地图同时记录基线提交、dirty=true 和实际读取文件指纹；不能生成声称包含未提交改动的远端提交行链接。对非 UTF-8 文件，首版要求先明确编码或将其标成无法核验，不静默替换字节。

路径相对输入根，不包含绝对路径、`..` 或越界符号链接。源码版本与编译器版本是两种信息，不能混为一谈。

## 4. Entity 与 Node：事实对象和讲解位置

`Entity` 具有 `id`、`kind`、`label`、可选 `symbol`、`canonicalNodeId` 和 `evidenceIds`。同一快照内，同一个符号实体只登记一次；不同作用域中的同名函数具有不同 ID。

`Node` 具有：

| 字段 | 含义 |
| --- | --- |
| `id`、`parentId` | 稳定节点 ID；根的 parentId 为 null |
| `kind` | topic/module/mechanism/function/step/code/boundary；不决定固定深度 |
| `label`、`summary` | 简短标题与该尺度的解释 |
| `entityIds` | 当前讲解位置涉及哪些实体，可为空 |
| `evidenceIds` | 说明依据，可引用多个文件 |
| `claimStatus` | source / inferred / unknown / editorial |
| `claimReason` | 推断、未知或编排说明；inferred/unknown 必填 |
| `order`、`importance` | 同层稳定排序；primary/supporting |
| `snippetIds` | 需要展示的代码片段 |
| `details` | 可选 inputs、outputs、invariants 文本列表 |

同一 Entity 可以出现在多个 Node，但其 `canonicalNodeId` 必须指向实际引用它的节点。默认跨模块连线只用规范位置，其他引用显示“同一实现”的跳转入口。不能因为同一函数在两处出现而把它的 3 条调用计算成 6 条。

ID 在地图首次生成时固定；使用可读的语义 ID 或持久化分配的 ID，禁止将行号直接当唯一 ID。首版保证单个产物内的稳定链接，跨重新生成的稳定性只作尽力保留；需要精确重现时分享版本化产物。

## 5. 关系与端口

`Relation` 是一个有依据的原子事实或明确标注的推断：

```ts
type Relation = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: 'call' | 'dispatch' | 'read' | 'write' | 'produce' |
        'consume' | 'control' | 'ownership' | 'return' | 'dependency';
  label: string;
  role: 'main' | 'branch' | 'failure' | 'supporting';
  claimStatus: 'source' | 'inferred' | 'unknown';
  claimReason?: string;
  evidenceIds: string[];
  condition?: string;
  sourcePortId?: string;
  targetPortId?: string;
};
```

原子粒度是**一个调用点或一个可独立说明的关系命题**。同一调用点有多个证据，仍是一条关系；同一对函数有两个不同调用点，可登记两条，但计数必须标为“调用点/关系条数”，不能称为运行次数。

方向统一定义：call/dispatch 是调用者→被调用者；read/write 是操作者→被操作对象；produce/consume 是主体→数据对象；ownership 是所有者→资源；return 是返回方→接收方；dependency 是依赖方→被依赖方。类型和方向必须同时可读，不能把 read 的箭头默认解释为数据流向。

`Port` 包含 `id`、`entityId`、`label`、`kind`（input/output/callsite/interface）和可选 `detailNodeId`。接口目标明确时，detailNodeId 指向该实体规范节点的子树中对应的步骤/代码位置；否则只画到实体边界。证据没有精确到哪一步，就不能为了美观捏造端口。

`Flow` 的 fromNodeId/toNodeId 直接指向讲解步骤，具有 ownerNodeId、kind（next/branch/loop/exception）、label 与 evidenceIds。Flow 表示作者根据源码提取的控制流程，其两个端点都必须是 ownerNodeId 的后代。局部流程的分支标签保留条件；未标出异常分支的流程必须说明范围。

## 6. Evidence 与 Snippet

`Evidence` 包含 id、snapshotId、path、startLine、endLine、verification（matched/unverified）及可选 note。`matched` 仅表示工具比对过快照与范围，不代表自动证明了引用它的自然语言结论。

证据状态与解释状态独立：

| claimStatus | 展示含义 | 最低要求 |
| --- | --- | --- |
| source | 有直接源码依据 | 至少一个有效证据；实现审阅确认其支持该表述 |
| inferred | 根据已知内容作出的解释/推断 | 明示原因；列出已有依据；不能画成已确认的具体调用 |
| unknown | 存在边界或无法确认 | 写出缺少什么；不伪装成完整路径 |
| editorial | 标题、分组或阅读建议 | 仅 Node 使用；不能用此状态绕开实现事实的取证要求 |

Snippet 对应一个 Evidence 的行范围，含 `segments` 与 `preservedSemantics`。segments 有两类：

```json
[
  { "kind": "source", "startLine": 10, "endLine": 12, "text": "实际原文" },
  { "kind": "omission", "startLine": 13, "endLine": 17, "reason": "与当前目标无关的统计记录" },
  { "kind": "source", "startLine": 18, "endLine": 24, "text": "实际原文" }
]
```

以上仅说明字段形状；真实 text 必须与相应行数和原文一致。segments 严格递增、不重叠，并**完整划分所引用 Evidence 的行范围**。省略行有专门视觉间隔，不把省略说明插成看似原文的代码行。

原文中的注释是源码数据；Agent 编写的解释放在独立注释栏。保留上下文所需的参数、类型、错误分支、所有权或同步条件；不能只剩调用语句而掩盖它受哪个条件控制。

## 7. 结构和语义不变量

校验器需要逐项实现：

1. 每种对象表 ID 唯一，全部引用存在；跨表 ID 的名字空间可以不同。
2. nodes 只有一个根，与 rootNodeId 一致；全部节点从根可达，parent 关系无环，深度在资源预算内。
3. entity 的规范节点包含该 entity；端口归属与关系对应端一致；detailNodeId 在规范节点子树内。
4. 非 external 的函数/类型/接口有源码证据；source 状态结论、关系和 Flow 有相应证据。
5. 每个证据属于唯一 snapshot；文件在 snapshot.files 中，行范围有效。
6. 代码原文、区间与省略分区一致；无法重新读取快照时不能新标 matched。
7. relations 可以成环；nodes 不可以。真实递归关系不能被误判为无效。
8. 不在可见层显示父、子两份同一原子边；聚合统计按唯一 relation ID 求集合大小。
9. primaryPath 只引用现有 Node，其顺序不自动创建关系。
10. 标题/summary 中的实质性实现断言不能仅靠 editorial 状态跳过审阅。

JSON Schema 通过只证明字段结构。需要源代码比对和以上不变量才能证明数据连贯；解释是否充分、核心代码是否裁错仍需要语义审阅。

## 8. 编译与演进

Scene 内的矩形、端口位置、祖先索引和搜索倒排表都是派生物，不回填成 Agent 必须维护的事实。聚合线也不进入 IR，以免粗线与细线互相矛盾。

不支持的主版本直接给出版本错误，保留输入。迁移通过显式工具输出新文件并保留旧文件。将来的用户编辑采用独立覆盖层，以稳定 Node/Entity ID 关联，并区分用户意见与源码事实；本期不实现编辑 UI。
