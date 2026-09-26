# CodeMap 0.1 编写要点

完整必填字段和枚举以包内 JSON Schema 为准。地图只允许 Schema 字段，未知字段会拒绝。

| 表/字段 | 内容与不变量 |
| --- | --- |
| scope | question、audience、inScope、outOfScope、assumptions、entryEntityIds；可选 viewpoint 为 flow/architecture，新地图明确填写，旧地图可省略 |
| snapshot | snapshot 命令输出；git 保存完整 revision/dirty，content 不含 revision 且 dirty=false |
| nodes/rootNodeId | 单根无环树，parentId、kind、label、summary、entityIds、evidenceIds、claimStatus、order、importance、snippetIds 必填；最多 32 层 |
| entities | kind、label、canonicalNodeId、evidenceIds；规范节点必须引用实体本身；函数/类型/接口有源码证据 |
| ports | entityId、label、kind；可选 detailNodeId 必须在规范子树中 |
| relations | sourceEntityId/targetEntityId、type、label、role、claimStatus、evidenceIds；可附 condition 和各端 port |
| flows | ownerNodeId、fromNodeId/toNodeId、kind、label、evidenceIds；两端都是 owner 的后代 |
| evidence | snapshotId、相对 path、含首尾的 startLine/endLine、verification；自报 matched 不能替代 validate |
| snippets | evidenceId、label、language、segments、preservedSemantics；segments 连续完整划分证据范围 |
| primaryPath | 已存在节点的导读序列，不自动创建关系 |
| coverage | completePaths、partialPaths、excludedPaths、openQuestions 均为文本数组 |

Node claimStatus 可以是 source/inferred/unknown/editorial；Relation 不能使用 editorial。source 需证据，inferred/unknown 需 claimReason。标题里的实质断言也要人工语义审阅。

`scope.viewpoint` 记录主组织方式，不产生关系、不改变节点归属、不自动重排成另一棵树；省略时阅读器使用通用导读。架构视角复用 module、interface/type 实体及现有 relations，模块内可有局部 flows；同层 order 是摆放顺序，不能当作执行先后。`coverage` 在架构视角可列职责和模块协作，不限于调用路径。

源码 segment 使用 `kind: source`、startLine/endLine 和程序提取的 text；统一 LF，不附加范围结束后的换行。省略 segment 使用 `kind: omission` 和具体 reason，不含 text。原始文件指纹按字节计算。

关系方向：call/dispatch 为调用者→被调用者；read/write 为操作者→对象；produce/consume 为主体→数据；ownership 为所有者→资源；return 为返回方→接收方；dependency 为依赖方→被依赖方。同一调用点多个证据仍是一条关系。

ID 同表唯一，可跨表复用；语义 ID 优于行号 ID。预算：80 个取证文件、500 个节点、1,500 条实体关系、3,000 条流程、2MB 内嵌源码、5MB HTML。超限时按阅读问题拆图。
